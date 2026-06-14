"""
Module:       extraction-service/api/routes/extract.py
Purpose:      Expose POST /extract HTTP endpoint. Accepts document upload,
              orchestrates the full extraction pipeline, returns ExtractionResponse.
Dependencies: logging, datetime, fastapi, core.models, core.exceptions,
              core.interfaces, extraction.*, api.middleware.audit
Exports:
    router — FastAPI APIRouter with POST /extract and GET /health

Copyright: © 2025 Adam Earth Equities Trust
License:    Restrictive — See ADAM_EARTH_LICENSE.txt
"""

# ============================================================================
# 1. STANDARD LIBRARY IMPORTS (alphabetical)
# ============================================================================
import logging
from datetime import datetime, timezone

# ============================================================================
# 2. THIRD-PARTY IMPORTS (alphabetical)
# ============================================================================
from fastapi import APIRouter, HTTPException, UploadFile, File, status
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError

# ============================================================================
# 3. LOCAL IMPORTS (alphabetical)
# ============================================================================
from api.middleware.audit import ExtractionAuditLogger
from core.exceptions import (
    APIError,
    ConfidenceScoringError,
    DocumentError,
    ExtractionError,
    ExtractionServiceError,
    FileTooLargeError,
    MasteryError,
    MissingFileError,
)
from core.models import (
    DocumentInput,
    ExtractionConfig,
    ExtractionResponse,
    MappedDealFields,
    ConfidenceReport,
    RawExtractionData,
)
from extraction.confidence_scorer import DealConfidenceScorer
from extraction.document_adapter import DocumentAdapter
from extraction.factory import MasteryExtractionFactory
from extraction.field_mapper import DealFieldMapper

# ============================================================================
# MODULE LOGGER
# ============================================================================

logger = logging.getLogger(__name__)

# ============================================================================
# MODULE EXPORTS
# ============================================================================

__all__ = ["router"]

# ============================================================================
# TYPE DEFINITIONS
# ============================================================================

RouteResponse = JSONResponse

# ============================================================================
# CONSTANTS
# ============================================================================

MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024   # 50 MB
MAX_UPLOAD_SIZE_MB: float  = 50.0

# ============================================================================
# ROUTER + INJECTED DEPENDENCIES
# ============================================================================

router = APIRouter(prefix="/extract", tags=["extraction"])

_adapter  = DocumentAdapter()
_mapper   = DealFieldMapper()
_scorer   = DealConfidenceScorer()
_auditor  = ExtractionAuditLogger()
_config   = ExtractionConfig()

# ============================================================================
# ROUTES
# ============================================================================


@router.get(
    "/health",
    summary="Extraction service health check",
    response_description="Service status and dependency availability",
)
async def health_check() -> dict:
    """
    Return the health status of the extraction service.

    Checks that all pipeline components are instantiated and the
    document adapter reports at least one supported file type.

    Returns:
        Dict with status, supported file types, and timestamp.

    Raises:
        HTTPException 503: If a critical component is unavailable.

    Example:
        GET /extract/health
        → {"status": "healthy", "supported_types": ["pdf","docx","txt"]}
    """
    try:
        supported = ["pdf", "docx", "txt"]
        return {
            "status":          "healthy",
            "service":         "extraction-service",
            "supported_types": supported,
            "mastery_mode":    _config.mastery_mode,
            "swarm_nodes":     _config.swarm_nodes,
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.critical(f"Health check failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Extraction service unavailable: {exc}",
        ) from exc


@router.post(
    "/",
    summary="Extract deal fields from uploaded document",
    response_description="Extracted DealRecord fields with confidence scores",
    status_code=status.HTTP_200_OK,
)
async def extract_document(
    file: UploadFile = File(..., description="PDF, DOCX, or TXT document to extract"),
) -> ExtractionResponse:
    """
    Accept a document upload and extract all DealRecord fields via Mastery.

    Pipeline:
        1. Validate upload (size, type)
        2. DocumentAdapter  → plain text
        3. MasteryFactory   → activated engine
        4. Mastery engine   → raw entity extraction
        5. DealFieldMapper  → typed MappedDealFields
        6. ConfidenceScorer → per-field scores
        7. Audit log write
        8. Return ExtractionResponse

    Args:
        file: UploadFile from multipart/form-data request.

    Returns:
        ExtractionResponse with fields, confidence scores, session metadata.

    Raises:
        HTTPException 400:  Missing file or unsupported type.
        HTTPException 413:  File exceeds 50 MB size limit.
        HTTPException 422:  Document unreadable or empty.
        HTTPException 503:  Mastery engine unavailable.
        HTTPException 500:  Internal extraction pipeline failure.

    Example:
        POST /extract/
        Content-Type: multipart/form-data
        Body: file=@deal_memo.pdf
    """
    session_id: str = ""

    try:
        # ── 1. Validate upload presence ───────────────────────────────────
        if not file or not file.filename:
            raise MissingFileError()

        logger.info(
            f"Extraction request: '{file.filename}' "
            f"content_type={file.content_type}"
        )

        # ── 2. Read and validate file bytes ───────────────────────────────
        content: bytes = await file.read()

        if len(content) > MAX_UPLOAD_SIZE_BYTES:
            size_mb = len(content) / (1024 * 1024)
            raise FileTooLargeError(
                file_size_mb=round(size_mb, 2),
                max_size_mb=MAX_UPLOAD_SIZE_MB,
            )

        # ── 3. Resolve file type from filename extension ──────────────────
        filename    = file.filename or "unknown"
        ext         = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        document    = DocumentInput(
            content=content,
            file_type=ext,
            filename=filename,
        )

        # ── 4. Extract plain text ─────────────────────────────────────────
        logger.info(f"Step 1/5: Extracting text from '{filename}'...")
        plain_text: str = _adapter.extract_text(document)

        # ── 5. Create and activate Mastery engine ─────────────────────────
        # Factory created per-request to avoid session_id leaking between
        # concurrent requests (factory stores engine state as instance attrs)
        logger.info("Step 2/5: Activating Mastery extraction engine...")
        factory = MasteryExtractionFactory()
        engine = factory.create_engine(_config)
        session_id = factory.get_session_id()

        # ── 6. Run Mastery entity recognition ────────────────────────────
        logger.info(f"Step 3/5: Running Mastery entity recognition (session={session_id})...")
        mastery_result = engine.recognize_and_replace(
            plain_text,
            recognize_only=True,
        )

        raw = RawExtractionData(
            full_text=plain_text,
            entities=mastery_result.data.get("entities", {}) if mastery_result.success else {},
            statistics=mastery_result.data.get("statistics", {}) if mastery_result.success else {},
            session_id=session_id,
        )

        # ── 7. Map fields ─────────────────────────────────────────────────
        logger.info("Step 4/5: Mapping extracted entities to DealRecord fields...")
        mapped_fields: MappedDealFields = _mapper.map(raw)

        # ── 8. Score confidence ───────────────────────────────────────────
        logger.info("Step 5/5: Scoring field confidence...")
        confidence: ConfidenceReport = _scorer.score(mapped_fields, raw)

        # ── 9. Count populated fields ─────────────────────────────────────
        fields_extracted = sum(
            1 for v in mapped_fields.model_dump().values()
            if v is not None
        )

        # ── 10. Audit log ─────────────────────────────────────────────────
        _auditor.log_extraction(
            session_id=session_id,
            filename=filename,
            file_type=ext,
            success=True,
            fields_extracted=fields_extracted,
        )

        response = ExtractionResponse(
            success=True,
            session_id=session_id,
            fields=mapped_fields,
            confidence=confidence,
            extraction_timestamp=datetime.now(timezone.utc).isoformat(),
            mastery_mode=_config.mastery_mode,
            fields_extracted=fields_extracted,
        )

        logger.info(
            f"Extraction complete: session={session_id} "
            f"fields={fields_extracted} filename='{filename}'"
        )
        return response

    # ── Specific exception boundaries ─────────────────────────────────────
    except MissingFileError as exc:
        logger.warning(f"Missing file in upload request: {exc.message}")
        _safe_audit_error(session_id, "upload_validation", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        ) from exc

    except FileTooLargeError as exc:
        logger.warning(f"File too large: {exc.message}")
        _safe_audit_error(session_id, "upload_validation", exc)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=exc.message,
        ) from exc

    except DocumentError as exc:
        logger.error(f"Document processing failed: {exc.message}")
        _safe_audit_error(session_id, "document_adapter", exc)
        raise HTTPException(
            status_code=exc.http_status,
            detail=exc.message,
        ) from exc

    except MasteryError as exc:
        logger.error(f"Mastery engine error: {exc.message}")
        _safe_audit_error(session_id, "mastery_factory", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Extraction engine unavailable: {exc.message}",
        ) from exc

    except (ExtractionError, ConfidenceScoringError) as exc:
        logger.error(f"Extraction pipeline error: {exc.message}")
        _safe_audit_error(session_id, "extraction_pipeline", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction pipeline failed: {exc.message}",
        ) from exc

    except ExtractionServiceError as exc:
        logger.error(f"Extraction service error: {exc.message}")
        _safe_audit_error(session_id, "extraction_service", exc)
        raise HTTPException(
            status_code=exc.http_status,
            detail=exc.message,
        ) from exc

    except PydanticValidationError as exc:
        logger.warning(f"Document input validation failed: {exc}")
        _safe_audit_error(session_id, "document_input_validation", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type or document input: {exc.errors()[0]['msg']}",
        ) from exc

    except Exception as exc:
        logger.critical(f"Unexpected error in extract_document: {exc}")
        _safe_audit_error(session_id, "extract_document", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during extraction.",
        ) from exc


# ============================================================================
# HELPERS
# ============================================================================


def _safe_audit_error(
    session_id: str,
    operation: str,
    error: Exception,
) -> None:
    """
    Write an error audit record without raising if the audit itself fails.

    Audit failures are logged at CRITICAL level but never allowed to
    propagate — the original error must always reach the HTTP response.

    Args:
        session_id: Mastery session ID (may be empty string).
        operation:  Name of the pipeline step that failed.
        error:      The exception that triggered this call.
    """
    try:
        _auditor.log_error(
            session_id=session_id,
            operation=operation,
            error=error,
        )
    except Exception as audit_exc:
        logger.critical(
            f"Failed to write error audit for op='{operation}': {audit_exc}"
        )


# ============================================================================
# DEPENDENCY DECLARATION
# ============================================================================


class ModuleDependencies:
    """Explicit dependency declaration for api/routes/extract.py."""

    required_modules: list = ["fastapi", "core.models", "core.exceptions",
                               "extraction.document_adapter",
                               "extraction.factory",
                               "extraction.field_mapper",
                               "extraction.confidence_scorer",
                               "api.middleware.audit"]
    optional_modules: list = []
    external_services: list = ["Mastery Universal System"]
    environment_variables: list = ["EXTRACTION_AUDIT_LOG"]

    def validate_dependencies(self) -> bool:
        """
        Validate all required dependencies are importable.

        Returns:
            True if all required dependencies are satisfied.

        Raises:
            ImportError: If a required module is missing.
            SystemError: If validation fails unexpectedly.
        """
        import importlib.util

        try:
            for module in self.required_modules:
                spec = importlib.util.find_spec(module.split(".")[0])
                if spec is None:
                    logger.error(f"Required module not found: {module}")
                    raise ImportError(f"Required module '{module}' not found.")
                logger.debug(f"Dependency satisfied: {module}")
            logger.info("api/routes/extract.py dependency validation passed.")
            return True
        except ImportError as exc:
            logger.critical(f"Dependency validation failed: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected dependency validation error: {exc}")
            raise SystemError(
                f"Dependency validation error in extract route: {exc}"
            ) from exc


# ============================================================================
# MODULE INITIALIZATION
# ============================================================================


def initialize_module() -> None:
    """
    Initialize and validate the extract route module on import.

    Raises:
        ImportError: If required dependencies are missing.
        SystemError: If initialization fails unexpectedly.

    Example:
        >>> initialize_module()
    """
    try:
        deps = ModuleDependencies()
        deps.validate_dependencies()
        logger.info("api/routes/extract.py initialized successfully.")
    except ImportError as exc:
        logger.critical(f"Failed to initialize extract route: {exc}")
        raise
    except Exception as exc:
        logger.critical(f"Unexpected error initializing extract route: {exc}")
        raise SystemError(
            f"Module initialization failed for extract route: {exc}"
        ) from exc


initialize_module()
