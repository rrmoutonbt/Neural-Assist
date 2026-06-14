"""
Module:       extraction-service/extraction/factory.py
Purpose:      Factory function to create and activate a configured MasteryEngine
              instance for deal document extraction.
Dependencies: logging, typing, core.interfaces, core.models, core.exceptions,
              mastery.mastery_universal_system
Exports:
    MasteryExtractionFactory — Concrete IMasteryFactory implementation

Copyright: © 2025 Adam Earth Equities Trust
License:    Restrictive — See ADAM_EARTH_LICENSE.txt
"""

# ============================================================================
# 1. STANDARD LIBRARY IMPORTS (alphabetical)
# ============================================================================
import logging
from typing import Any, Optional

# ============================================================================
# 2. LOCAL IMPORTS (alphabetical)
# ============================================================================
from core.exceptions import (
    MasteryActivationError,
    MasteryConfigError,
    MasteryImportError,
)
from core.interfaces import IMasteryFactory
from core.models import ExtractionConfig

# ============================================================================
# MODULE LOGGER
# ============================================================================

logger = logging.getLogger(__name__)

# ============================================================================
# MODULE EXPORTS
# ============================================================================

__all__ = ["MasteryExtractionFactory"]

# ============================================================================
# TYPE DEFINITIONS
# ============================================================================

# Typed as Any intentionally — real types imported dynamically in _import_mastery()
# to avoid hard import coupling (mastery module may be unavailable at import time)
MasteryEngine = Any
MasteryConfig = Any
MasteryMode = Any

# ============================================================================
# INTERFACE IMPLEMENTATION
# ============================================================================


class MasteryExtractionFactory(IMasteryFactory):
    """
    Concrete factory that creates and activates MasteryEngine instances.

    Implements IMasteryFactory. Responsible ONLY for constructing
    a ready-to-use MasteryEngine from an ExtractionConfig.

    Attributes:
        _engine:     Most recently created MasteryEngine instance.
        _session_id: Session ID from the most recent activation.

    Example:
        >>> factory = MasteryExtractionFactory()
        >>> engine = factory.create_engine(ExtractionConfig())
        >>> session_id = factory.get_session_id()
    """

    def __init__(self) -> None:
        """
        Initialize factory with no active engine.
        Engine is created on demand via create_engine().
        """
        self._engine: Optional[MasteryEngine] = None
        self._session_id: str = ""
        logger.debug("MasteryExtractionFactory initialized.")

    def create_engine(self, config: ExtractionConfig) -> MasteryEngine:
        """
        Import, configure, and activate a MasteryEngine instance.

        Imports mastery_universal_system at call time (not at module load)
        to allow the service to start even if Mastery is temporarily
        unavailable — fail-fast at extraction time, not at startup.

        Args:
            config: Validated ExtractionConfig with Mastery parameters.

        Returns:
            Fully activated MasteryEngine ready to process documents.

        Raises:
            MasteryImportError:     If mastery_universal_system cannot be imported.
            MasteryConfigError:     If Mastery rejects the given configuration.
            MasteryActivationError: If mastery.activate() returns failure.
            SystemError:            On unexpected failure during engine creation.

        Example:
            >>> engine = factory.create_engine(ExtractionConfig(swarm_nodes=100))
            >>> assert engine is not None
        """
        try:
            logger.info("Importing Mastery Universal System...")
            mastery_module = self._import_mastery()

            logger.info(f"Building MasteryConfig (mode={config.mastery_mode}, nodes={config.swarm_nodes})...")
            mastery_config = self._build_mastery_config(mastery_module, config)

            logger.info("Instantiating MasteryEngine...")
            engine = mastery_module["MasteryEngine"](mastery_config)

            logger.info("Activating MasteryEngine...")
            activation = engine.activate()

            if not isinstance(activation, dict) or not activation.get("success", False):
                raise MasteryActivationError(
                    message="Mastery engine activation returned non-success result.",
                    detail=str(activation),
                )

            self._engine = engine
            self._session_id = activation.get("session_id", "unknown")

            logger.info(
                f"MasteryEngine activated successfully. "
                f"Session: {self._session_id} | Mode: {config.mastery_mode}"
            )
            return engine

        except (MasteryImportError, MasteryConfigError, MasteryActivationError):
            raise  # Let typed Mastery exceptions propagate unchanged
        except Exception as exc:  # Catch-all for unexpected failures
            logger.critical(f"Unexpected error creating MasteryEngine: {exc}")
            raise SystemError(
                f"System error in MasteryExtractionFactory.create_engine: {exc}"
            ) from exc

    def get_session_id(self) -> str:
        """
        Return the session ID of the most recently created engine.

        Returns:
            Mastery session ID string for audit trail linkage.

        Raises:
            MasteryActivationError: If no engine has been created yet.

        Example:
            >>> factory.create_engine(config)
            >>> session_id = factory.get_session_id()
            >>> assert len(session_id) > 0
        """
        if not self._session_id:
            raise MasteryActivationError(
                message="No Mastery session available. Call create_engine() first.",
                detail="_session_id is empty — engine was not yet activated.",
            )
        return self._session_id

    def _import_mastery(self) -> dict:
        """
        Dynamically import the Mastery Universal System module.

        Returns:
            Dict of exported names from mastery_universal_system.

        Raises:
            MasteryImportError: If the module cannot be imported.
        """
        try:
            from mastery import mastery_universal_system as mastery_mod
            return {
                "MasteryEngine": mastery_mod.MasteryEngine,
                "MasteryConfig": mastery_mod.MasteryConfig,
                "MasteryMode":   mastery_mod.MasteryMode,
            }
        except ImportError as exc:
            logger.critical(f"Failed to import mastery_universal_system: {exc}")
            raise MasteryImportError(
                message="Mastery Universal System module could not be imported.",
                detail=str(exc),
            ) from exc
        except AttributeError as exc:
            logger.critical(f"Mastery module missing expected attributes: {exc}")
            raise MasteryImportError(
                message="Mastery module is present but missing required exports.",
                detail=str(exc),
            ) from exc

    def _build_mastery_config(
        self,
        mastery_module: dict,
        config: ExtractionConfig,
    ) -> Any:
        """
        Build a MasteryConfig object from ExtractionConfig parameters.

        Args:
            mastery_module: Dict of Mastery exports from _import_mastery().
            config:         Validated ExtractionConfig.

        Returns:
            MasteryConfig instance ready for MasteryEngine initialization.

        Raises:
            MasteryConfigError: If Mastery rejects the given parameters.
        """
        try:
            MasteryConfig = mastery_module["MasteryConfig"]
            MasteryMode   = mastery_module["MasteryMode"]

            mode = getattr(MasteryMode, config.mastery_mode, None)
            if mode is None:
                raise MasteryConfigError(
                    message=f"Invalid Mastery mode: '{config.mastery_mode}'.",
                    detail=f"Valid modes: {[m.name for m in MasteryMode]}",
                )

            return MasteryConfig(
                mode=mode,
                enable_cognitive_network=config.enable_cognitive_network,
                enable_swarm_processing=True,
                swarm_nodes=config.swarm_nodes,
                enable_claas=True,
                enable_license_validation=True,
                max_parallel_operations=config.max_parallel_ops,
                cache_enabled=True,
                audit_logging=config.audit_logging,
            )
        except Exception as exc:
            logger.error(f"Failed to build MasteryConfig: {exc}")
            raise MasteryConfigError(
                message="Failed to construct MasteryConfig from ExtractionConfig.",
                detail=str(exc),
            ) from exc


# ============================================================================
# DEPENDENCY DECLARATION
# ============================================================================


class ModuleDependencies:
    """Explicit dependency declaration for extraction/factory.py."""

    required_modules: list = ["core.exceptions", "core.interfaces", "core.models"]
    optional_modules: list = ["mastery.mastery_universal_system"]
    external_services: list = []
    environment_variables: list = []

    def validate_dependencies(self) -> bool:
        """
        Validate all required dependencies are available.

        Returns:
            True if all dependencies are satisfied.

        Raises:
            ImportError: If a required module is missing.
            SystemError: If validation fails unexpectedly.
        """
        import importlib.util

        try:
            for module in self.required_modules:
                parts = module.split(".")
                if not importlib.util.find_spec(parts[0]):
                    logger.error(f"Required module not found: {module}")
                    raise ImportError(f"Required module '{module}' is not installed.")
                logger.debug(f"Dependency satisfied: {module}")
            logger.info("extraction/factory.py dependency validation passed.")
            return True
        except ImportError as exc:
            logger.critical(f"Dependency validation failed: {exc}")
            raise
        except Exception as exc:
            logger.critical(f"Unexpected error during dependency validation: {exc}")
            raise SystemError(
                f"Dependency validation error in factory: {exc}"
            ) from exc


# ============================================================================
# MODULE INITIALIZATION
# ============================================================================


def initialize_module() -> None:
    """
    Initialize and validate the factory module on import.

    Raises:
        ImportError: If required dependencies are missing.
        SystemError: If initialization fails unexpectedly.

    Example:
        >>> initialize_module()
    """
    try:
        deps = ModuleDependencies()
        deps.validate_dependencies()
        logger.info("extraction/factory.py initialized successfully.")
    except ImportError as exc:
        logger.critical(f"Failed to initialize factory: {exc}")
        raise
    except Exception as exc:
        logger.critical(f"Unexpected error initializing factory: {exc}")
        raise SystemError(
            f"Module initialization failed for factory: {exc}"
        ) from exc


initialize_module()
