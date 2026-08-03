"""Tiny HTTP transport with an injection seam.

The broker code only needs GET/POST/DELETE with JSON payloads and a
bearer token. Rather than pin `requests` at import time, we let the
caller inject a transport — production uses `RequestsTransport`, tests
use a `FakeTransport` that returns pre-scripted responses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Protocol


class HttpError(Exception):
    def __init__(self, status: int, body: Any, message: Optional[str] = None):
        super().__init__(message or f"HTTP {status}")
        self.status = status
        self.body = body


@dataclass
class HttpResponse:
    status: int
    body: Any                # decoded JSON, or raw bytes when not JSON
    headers: Dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def raise_for_status(self) -> None:
        if not self.ok:
            raise HttpError(self.status, self.body)


class HttpTransport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse: ...


@dataclass
class RequestsTransport:
    """Production transport backed by the `requests` library.

    Imported lazily inside .request() so callers using FakeTransport
    (tests, dev without `requests` installed) don't need `requests` on
    their Python path just to import this module.
    """

    session: Any = None      # requests.Session; created on first call

    def request(
        self, method, url, *, params=None, json=None,
        headers=None, timeout=10.0,
    ) -> HttpResponse:
        if self.session is None:
            import requests
            self.session = requests.Session()
        resp = self.session.request(
            method=method, url=url, params=params, json=json,
            headers=headers or {}, timeout=timeout,
        )
        try:
            body = resp.json()
        except ValueError:
            body = resp.content
        return HttpResponse(
            status=resp.status_code, body=body, headers=dict(resp.headers),
        )
