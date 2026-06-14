"""
Module:       extraction-service/core/models.py
Purpose:      All typed I/O contracts for the Mastery extraction service.
              Defines every request, response, and intermediate data structure
              used across the extraction pipeline.
Dependencies: pydantic, typing, datetime
Exports:
    DocumentInput        — Uploaded file data passed to DocumentAdapter
    ExtractionConfig     — MasteryEngine initialization parameters
    RawExtractionData    — Direct output from Mastery engine
    MappedDealFields     — All 15 DealRecord fields (Optional — AI may miss some)
    ConfidenceReport     — Per-field confidence score (0.0–1.0)
    ExtractionResponse   — Final HTTP response returned to frontend

Copyright: © 2025 Adam Earth Equities Trust
License:    Restrictive — See ADAM_EARTH_LICENSE.txt
"""

# ============================================================================
# STANDARD LIBRARY IMPORTS
import logging
# ============================================================================
from datetime import date
from typing import Dict, List, Literal, Optional

# ============================================================================
# THIRD-PARTY IMPORTS
# ============================================================================
from pydantic import BaseModel, Field, field_validator, model_validator

# ============================================================================
# ============================================================================
# MODULE LOGGER
# ============================================================================

logger = logging.getLogger(__name__)


# ============================================================================
# MODULE EXPORTS
# ============================================================================

__all__ = [
    "DocumentInput",
    "ExtractionConfig",
    "RawExtractionData",
    "MappedDealFields",
    "ConfidenceReport",
    "ExtractionResponse",
    "SUPPORTED_FILE_TYPES",
    "KNOWN_ENTITY_OWNERS",
    "KNOWN_FACILITATORS",
    "KNOWN_MODELS",
    "CONFIDENCE_EXACT_MATCH",
    "CONFIDENCE_PATTERN_HIGH",
    "CONFIDENCE_PATTERN_AMBIGUOUS",
    "CONFIDENCE_INFERRED",
    "CONFIDENCE_NOT_FOUND",
]

# MODULE CONSTANTS
# ============================================================================

SUPPORTED_FILE_TYPES: List[str] = ["pdf", "docx", "txt"]

KNOWN_ENTITY_OWNERS: List[str] = [
    "Banc Of El",
    "Divinus Arbor Capital",
    "Adam Earth Equities",
    "OneMind",
]

KNOWN_FACILITATORS: List[str] = ["Ishmael", "Melvin", "Ray El"]

KNOWN_MODELS: List[str] = ["Private", "JV", "Commercial"]

CONFIDENCE_EXACT_MATCH: float = 1.0
CONFIDENCE_PATTERN_HIGH: float = 0.8
CONFIDENCE_PATTERN_AMBIGUOUS: float = 0.5
CONFIDENCE_INFERRED: float = 0.2
CONFIDENCE_NOT_FOUND: float = 0.0

# ============================================================================
# INPUT MODELS
# ============================================================================



# ============================================================================
# TYPE DEFINITIONS
# ============================================================================

# Type aliases for improved readability
FieldName = str
ConfidenceScore = float
SessionId = str


class DocumentInput(BaseModel):
    """
    Uploaded document passed into the DocumentAdapter for text extraction.

    Attributes:
        content:   Raw bytes of the uploaded file.
        file_type: Lowercase file extension (pdf | docx | txt).
        filename:  Original filename for audit logging.

    Raises:
        ValueError: If file_type is not in SUPPORTED_FILE_TYPES.
        ValueError: If content is empty.
        ValueError: If filename is empty.

    Example:
        >>> doc = DocumentInput(
        ...     content=b"...",
        ...     file_type="pdf",
        ...     filename="deal_summary.pdf"
        ... )
    """

    content: bytes = Field(..., description="Raw file bytes from upload")
    file_type: str = Field(..., description="Lowercase file extension")
    filename: str = Field(..., min_length=1, description="Original filename")

    @field_validator("file_type")
    @classmethod
    def validate_file_type(cls, value: str) -> str:
        """
        Ensure file_type is a supported extraction format.

        Args:
            value: The file_type string to validate.

        Returns:
            Lowercased, stripped file_type if valid.

        Raises:
            ValueError: If file_type is not supported.
        """
        try:
            normalized = value.lower().strip().lstrip(".")
            if normalized not in SUPPORTED_FILE_TYPES:
                raise ValueError(
                    f"Unsupported file type '{normalized}'. "
                    f"Supported types: {SUPPORTED_FILE_TYPES}"
                )
            return normalized
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_file_type: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_file_type: {exc}")
            raise SystemError(f"System error in validate_file_type: {exc}") from exc

    @field_validator("content")
    @classmethod
    def validate_content_not_empty(cls, value: bytes) -> bytes:
        """
        Ensure uploaded file has non-zero content.

        Args:
            value: The raw file bytes.

        Returns:
            The original bytes if non-empty.

        Raises:
            ValueError: If content is empty.
        """
        try:
            if not value:
                raise ValueError("Document content cannot be empty.")
            return value
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_content_not_empty: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_content_not_empty: {exc}")
            raise SystemError(f"System error in validate_content_not_empty: {exc}") from exc


class ExtractionConfig(BaseModel):
    """
    Configuration for MasteryEngine initialization inside the factory.

    Attributes:
        mastery_mode:       Mastery operational mode string (default: ANALYZE).
        swarm_nodes:        Number of cognitive swarm nodes (70–130).
        enable_cognitive_network: Activates distributed processing.
        audit_logging:      Mandated True — required for Adam Earth compliance.
        max_parallel_ops:   Maximum concurrent extraction operations.

    Example:
        >>> config = ExtractionConfig()  # All defaults are production-ready
    """

    mastery_mode: str = Field(
        default="ANALYZE",
        description="Mastery operational mode"
    )
    swarm_nodes: int = Field(
        default=100,
        ge=70,
        le=130,
        description="Cognitive swarm node count (70–130)"
    )
    enable_cognitive_network: bool = Field(
        default=True,
        description="Enable distributed cognitive processing"
    )
    audit_logging: bool = Field(
        default=True,
        description="Mandatory audit logging for Adam Earth compliance"
    )
    max_parallel_ops: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum concurrent extraction operations"
    )

    @field_validator("audit_logging")
    @classmethod
    def audit_logging_must_be_true(cls, value: bool) -> bool:
        """
        Enforce that audit logging is always enabled.
        Required for Adam Earth Equities Trust license compliance.

        Args:
            value: The audit_logging boolean.

        Returns:
            True always.

        Raises:
            ValueError: If caller attempts to disable audit logging.
        """
        try:
            if not value:
                raise ValueError(
                    "audit_logging cannot be disabled. "
                    "Required for Adam Earth Equities Trust license compliance."
                )
            return value
        except ValueError as exc:
            logger.warning(f"Validation failed in audit_logging_must_be_true: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in audit_logging_must_be_true: {exc}")
            raise SystemError(f"System error in audit_logging_must_be_true: {exc}") from exc


# ============================================================================
# INTERMEDIATE MODELS
# ============================================================================


class RawExtractionData(BaseModel):
    """
    Direct output from the Mastery engine after document processing.
    This is the uninterpreted extraction — FieldMapper translates it
    into MappedDealFields.

    Attributes:
        full_text:    Complete extracted plain text from document.
        entities:     Dictionary of entity lists (dates, percentages, names, etc.)
        statistics:   Replacement/extraction operation counts from Mastery.
        session_id:   Mastery session ID for audit trail linkage.

    Example:
        >>> raw = RawExtractionData(
        ...     full_text="Deal initiated January 5, 2025...",
        ...     entities={"dates": ["January 5, 2025"], "percentages": ["15%"]},
        ...     statistics={"total_replacements": 3},
        ...     session_id="abc-123"
        ... )
    """

    full_text: str = Field(..., description="Complete plain text from document")
    entities: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Extracted entities keyed by type"
    )
    statistics: Dict[str, object] = Field(
        default_factory=dict,
        description="Mastery extraction operation statistics"
    )
    session_id: str = Field(..., description="Mastery session ID for audit linkage")


# ============================================================================
# OUTPUT MODELS
# ============================================================================


class MappedDealFields(BaseModel):
    """
    All 14 DealRecord fields populated by FieldMapper from Mastery output.
    Every field is Optional — AI extraction may not find all values.
    Missing fields are left None for manual entry in the frontend.

    Attributes:
        entity_owner:             Matched to KNOWN_ENTITY_OWNERS list.
        jurisdiction:             Free-text geographic/legal jurisdiction.
        relationship_to_banc_of_el: Free-text relationship description.
        deal_initiation_date:     ISO date string (YYYY-MM-DD).
        deal_facilitator:         Matched to KNOWN_FACILITATORS list.
        deal_partner_entity:      Free-text deal partner name.
        model:                    One of Private | JV | Commercial.
        equity_banc_of_el:        Float 0.0–100.0 (percentage).
        equity_ishmael:           Float 5.0–85.0 in 5% increments.
        equity_melvin:            Float 5.0–85.0 in 5% increments.
        equity_ray_el:            Float 5.0–85.0 in 5% increments.
        summary_of_deal:          Free-text deal summary.
        voting_outliers:          Free-text voting outlier notes.
        partner_notes:            Free-text partner notes.

    Example:
        >>> fields = MappedDealFields(
        ...     entity_owner="Banc Of El",
        ...     deal_facilitator="Ishmael",
        ...     equity_ishmael=25.0
        ... )
    """

    entity_owner: Optional[str] = Field(None, description="Matched entity owner")
    jurisdiction: Optional[str] = Field(None, description="Legal jurisdiction")
    relationship_to_banc_of_el: Optional[str] = Field(
        None, description="Relationship description"
    )
    deal_initiation_date: Optional[str] = Field(
        None, description="ISO date string YYYY-MM-DD"
    )
    deal_facilitator: Optional[str] = Field(
        None, description="Matched deal facilitator name"
    )
    deal_partner_entity: Optional[str] = Field(
        None, description="Deal partner entity name"
    )
    model: Optional[Literal["Private", "JV", "Commercial"]] = Field(
        None, description="Deal model type"
    )
    equity_banc_of_el: Optional[float] = Field(
        None, ge=0.0, le=100.0,
        description="Banc Of El equity 0%–100%"
    )
    equity_ishmael: Optional[float] = Field(
        None, ge=5.0, le=85.0,
        description="Ishmael equity 5%–85%"
    )
    equity_melvin: Optional[float] = Field(
        None, ge=5.0, le=85.0,
        description="Melvin equity 5%–85%"
    )
    equity_ray_el: Optional[float] = Field(
        None, ge=5.0, le=85.0,
        description="Ray El equity 5%–85%"
    )
    summary_of_deal: Optional[str] = Field(
        None, description="Deal summary paragraph"
    )
    voting_outliers: Optional[str] = Field(
        None, description="Voting outlier notes"
    )
    partner_notes: Optional[str] = Field(
        None, description="Partner notes"
    )

    @field_validator("deal_initiation_date")
    @classmethod
    def validate_date_format(cls, value: Optional[str]) -> Optional[str]:
        """
        Validate extracted date is a parseable ISO format (YYYY-MM-DD).

        Args:
            value: Date string from Mastery extraction (may be None).

        Returns:
            Valid ISO date string, or None if not provided.

        Raises:
            ValueError: If string is present but not a valid ISO date.
        """
        if value is None:
            return None
        try:
            date.fromisoformat(value)
            return value
        except ValueError as exc:
            raise ValueError(
                f"deal_initiation_date '{value}' is not a valid ISO date "
                f"(expected YYYY-MM-DD)."
            ) from exc

    @field_validator("entity_owner")
    @classmethod
    def validate_entity_owner(cls, value: Optional[str]) -> Optional[str]:
        """
        Validate extracted entity owner against known list.

        Args:
            value: Extracted entity owner string (may be None).

        Returns:
            Valid entity owner string, or None.

        Raises:
            ValueError: If value is present but not in KNOWN_ENTITY_OWNERS.
        """
        try:
            if value is None:
                return None
            if value not in KNOWN_ENTITY_OWNERS:
                raise ValueError(
                    f"entity_owner '{value}' not in known list: {KNOWN_ENTITY_OWNERS}"
                )
            return value
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_entity_owner: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_entity_owner: {exc}")
            raise SystemError(f"System error in validate_entity_owner: {exc}") from exc

    @field_validator("deal_facilitator")
    @classmethod
    def validate_facilitator(cls, value: Optional[str]) -> Optional[str]:
        """
        Validate extracted facilitator against known names.

        Args:
            value: Extracted facilitator name (may be None).

        Returns:
            Valid facilitator name, or None.

        Raises:
            ValueError: If value is present but not in KNOWN_FACILITATORS.
        """
        try:
            if value is None:
                return None
            if value not in KNOWN_FACILITATORS:
                raise ValueError(
                    f"deal_facilitator '{value}' not in known list: {KNOWN_FACILITATORS}"
                )
            return value
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_facilitator: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_facilitator: {exc}")
            raise SystemError(f"System error in validate_facilitator: {exc}") from exc


class ConfidenceReport(BaseModel):
    """
    Per-field confidence score assigned by ConfidenceScorer.
    Score range: 0.0 (not found) → 1.0 (exact controlled-list match).

    Score thresholds:
        1.0 — Exact match to known controlled value
        0.8 — Pattern match with high certainty
        0.5 — Pattern match with ambiguity
        0.2 — Inferred / low-evidence extraction
        0.0 — Field not found — blank for manual entry

    Attributes:
        scores: Dict mapping each DealRecord field name to its confidence float.

    Example:
        >>> report = ConfidenceReport(scores={
        ...     "entity_owner": 1.0,
        ...     "deal_initiation_date": 0.8,
        ...     "equity_ishmael": 0.5,
        ...     "summary_of_deal": 0.0
        ... })
    """

    scores: Dict[str, float] = Field(
        default_factory=dict,
        description="Field name to confidence score (0.0–1.0)"
    )

    @field_validator("scores")
    @classmethod
    def validate_score_range(cls, value: Dict[str, float]) -> Dict[str, float]:
        """
        Ensure all confidence scores are within valid range.

        Args:
            value: Dictionary of field → confidence score mappings.

        Returns:
            Validated scores dictionary.

        Raises:
            ValueError: If any score is outside 0.0–1.0.
        """
        try:
            for field_name, score in value.items():
                if not (0.0 <= score <= 1.0):
                    raise ValueError(
                        f"Confidence score for '{field_name}' must be 0.0–1.0, "
                        f"got {score}."
                    )
            return value
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_score_range: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_score_range: {exc}")
            raise SystemError(f"System error in validate_score_range: {exc}") from exc


class ExtractionResponse(BaseModel):
    """
    Final HTTP response returned from POST /extract to the frontend.
    Contains the mapped deal fields, confidence scores, and session metadata.

    Attributes:
        success:              True if extraction completed without fatal error.
        session_id:           Mastery session ID — links to audit log.
        fields:               AI-populated DealRecord fields (all Optional).
        confidence:           Per-field confidence scores for UI badges.
        extraction_timestamp: UTC ISO timestamp of when extraction ran.
        mastery_mode:         Active Mastery mode used (e.g., "ANALYZE").
        fields_extracted:     Count of non-None fields successfully populated.
        error_message:        Populated only if success is False.

    Example:
        >>> response = ExtractionResponse(
        ...     success=True,
        ...     session_id="abc-123",
        ...     fields=MappedDealFields(entity_owner="Banc Of El"),
        ...     confidence=ConfidenceReport(scores={"entity_owner": 1.0}),
        ...     extraction_timestamp="2025-04-05T12:00:00Z",
        ...     mastery_mode="ANALYZE",
        ...     fields_extracted=3
        ... )
    """

    success: bool = Field(..., description="True if extraction succeeded")
    session_id: str = Field(..., description="Mastery session ID")
    fields: MappedDealFields = Field(
        ..., description="AI-populated deal fields"
    )
    confidence: ConfidenceReport = Field(
        ..., description="Per-field confidence scores"
    )
    extraction_timestamp: str = Field(
        ..., description="UTC ISO timestamp of extraction"
    )
    mastery_mode: str = Field(
        ..., description="Mastery mode used during extraction"
    )
    fields_extracted: int = Field(
        default=0,
        ge=0,
        description="Count of non-None fields populated"
    )
    error_message: Optional[str] = Field(
        None,
        description="Error detail — populated only if success is False"
    )

    @model_validator(mode="after")
    def validate_error_on_failure(self) -> "ExtractionResponse":
        """
        Ensure error_message is present when success is False.

        Returns:
            Validated ExtractionResponse instance.

        Raises:
            ValueError: If success is False but error_message is None.
        """
        try:
            if not self.success and self.error_message is None:
                raise ValueError(
                    "error_message must be provided when success is False."
                )
            return self
        except ValueError as exc:
            logger.warning(f"Validation failed in validate_error_on_failure: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error in validate_error_on_failure: {exc}")
            raise SystemError(f"System error in validate_error_on_failure: {exc}") from exc

# ============================================================================
# DEPENDENCY DECLARATION (MANDATORY — A.I. Instructions)
# ============================================================================


class ModuleDependencies:
    """
    Explicit dependency declaration for extraction-service/core/models.
    Required by A.I. Instructions: Dependency Management (STRICT).

    Attributes:
        required_modules:  Python modules that must be importable.
        optional_modules:  Python modules that enhance functionality if present.
        external_services: External services this module integrates with.
        environment_variables: Environment variables this module reads.
    """

    required_modules: list = ["pydantic"]
    optional_modules: list = []
    external_services: list = []
    environment_variables: list = []

    def validate_dependencies(self) -> bool:
        """
        Validate all required dependencies are importable and available.

        Returns:
            True if all required dependencies are satisfied.

        Raises:
            ImportError: If any required module cannot be imported.
            EnvironmentError: If any required environment variable is missing.
        """
        import importlib
        import os

        try:
            for module in self.required_modules:
                if not importlib.util.find_spec(module):
                    logger.error(f"Required module not found: {module}")
                    raise ImportError(f"Required module '{module}' is not installed.")
                logger.debug(f"Dependency satisfied: {module}")

            for var in self.environment_variables:
                if not os.environ.get(var):
                    logger.warning(f"Environment variable not set: {var}")

            logger.info(f"extraction-service/core/models dependency validation passed.")
            return True

        except ImportError as exc:
            logger.critical(f"Dependency validation failed: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error during dependency validation: {exc}")
            raise SystemError(f"Dependency validation error in extraction-service/core/models: {exc}") from exc


# ============================================================================
# MODULE INITIALIZATION
# ============================================================================


def initialize_module() -> None:
    """
    Initialize and validate the extraction-service/core/models module on import.
    Validates all dependencies are available and logs module activation.

    Raises:
        ImportError: If required dependencies are missing.
        SystemError: If module initialization fails unexpectedly.

    Example:
        >>> initialize_module()  # Called automatically on import
    """
    try:
        deps = ModuleDependencies()
        deps.validate_dependencies()
        logger.info(f"extraction-service/core/models initialized successfully.")
    except ImportError as exc:
        logger.critical(f"Failed to initialize extraction-service/core/models: {exc}")
        raise
    except Exception as exc:
        logger.critical(f"Unexpected error initializing extraction-service/core/models: {exc}")
        raise SystemError(f"Module initialization failed for extraction-service/core/models: {exc}") from exc


initialize_module()

