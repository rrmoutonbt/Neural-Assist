"""
Neural Assistant — Shared base classes and utilities.

Extracted to avoid circular imports between neural_assistant.py and
neural_assistant_local_provider.py.
"""

import asyncio
import logging
import random
import time
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ============================================================================
# PRODUCTION RESILIENCE PATTERNS (from claude-code architecture)
# ============================================================================

class CircuitBreaker:
    """Circuit breaker pattern for provider failover.
    Inspired by claude-code's consecutive-failure tracking."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self._failure_count = 0
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._last_failure_time: Optional[float] = None
        self._state = "closed"  # closed = healthy, open = failing, half_open = testing

    @property
    def is_open(self) -> bool:
        if self._state == "open":
            if self._last_failure_time and (time.time() - self._last_failure_time) > self._recovery_timeout:
                self._state = "half_open"
                return False
            return True
        return False

    def record_success(self):
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self):
        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self._failure_threshold:
            self._state = "open"
            logger.warning(f"Circuit breaker opened after {self._failure_count} failures")

    @property
    def state(self) -> str:
        # Re-check on access
        if self._state == "open" and self._last_failure_time:
            if (time.time() - self._last_failure_time) > self._recovery_timeout:
                self._state = "half_open"
        return self._state


async def retry_with_backoff(func, max_retries: int = 3, base_delay: float = 1.0,
                              max_delay: float = 30.0, jitter: float = 0.5):
    """Exponential backoff with jitter, modeled on claude-code's
    SerialBatchEventUploader retry logic."""
    last_exception = None
    for attempt in range(max_retries + 1):
        try:
            return await func()
        except Exception as e:
            last_exception = e
            if attempt == max_retries:
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            delay += random.uniform(0, jitter)
            logger.warning(f"Retry {attempt + 1}/{max_retries} after {delay:.1f}s: {e}")
            await asyncio.sleep(delay)
    raise last_exception


# ============================================================================
# LANGUAGE MODEL API INTERFACE
# ============================================================================

class LanguageModelAPI(ABC):
    """Abstract base class for language model APIs."""

    @abstractmethod
    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        pass

    @abstractmethod
    async def get_embeddings(self, text: str) -> np.ndarray:
        pass
