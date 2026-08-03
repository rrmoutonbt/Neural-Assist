"""WebSocket transport abstraction for the Schwab streamer.

Design mirrors http.py: a small Protocol so tests inject a fake
transport, plus a production implementation that wraps the
`websockets` library and exposes a synchronous send/recv/close
surface via a background thread + queue.

Why sync-over-async: SchwabStreamer's callers (LadderLiveRunner tick
loop, cron) are sync. Threading the queue keeps their code shape
unchanged while an event loop chews on the socket in the background.
"""

from __future__ import annotations

import json
import queue
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Protocol


class WSError(Exception):
    pass


class WSTransport(Protocol):
    def connect(self) -> None: ...
    def send(self, message: Dict[str, Any]) -> None: ...
    def recv(self, timeout: float = 0.1) -> Optional[Dict[str, Any]]: ...
    def close(self) -> None: ...
    @property
    def connected(self) -> bool: ...


# ---------------------------------------------------------------------------
# In-memory fake — used for tests + local dev without a real Schwab account.
# ---------------------------------------------------------------------------

@dataclass
class FakeWSTransport:
    """Test double. Callers push server-side messages via `push_server()`;
    messages sent by the streamer are appended to `sent`."""

    sent: list = field(default_factory=list)
    _incoming: "queue.Queue[Dict[str, Any]]" = field(
        default_factory=lambda: queue.Queue(),
    )
    _connected: bool = False
    _closed: bool = False

    def connect(self) -> None:
        if self._closed:
            raise WSError("transport already closed")
        self._connected = True

    def send(self, message: Dict[str, Any]) -> None:
        if not self._connected or self._closed:
            raise WSError("send on unconnected transport")
        self.sent.append(message)

    def recv(self, timeout: float = 0.1) -> Optional[Dict[str, Any]]:
        try:
            return self._incoming.get(timeout=timeout)
        except queue.Empty:
            return None

    def close(self) -> None:
        self._connected = False
        self._closed = True

    @property
    def connected(self) -> bool:
        return self._connected and not self._closed

    # ---- test helpers ---------------------------------------------------

    def push_server(self, message: Dict[str, Any]) -> None:
        """Simulate a message arriving from the server."""
        self._incoming.put(message)

    def last_sent(self) -> Optional[Dict[str, Any]]:
        return self.sent[-1] if self.sent else None


# ---------------------------------------------------------------------------
# Production transport — wraps `websockets` in a background asyncio thread.
# ---------------------------------------------------------------------------

@dataclass
class WebsocketsTransport:
    """websockets-lib-backed transport.

    Runs a background thread that owns an asyncio loop + the socket;
    `send()` schedules a coroutine, `recv()` pops from a thread-safe
    queue. Import of `websockets` is deferred to `connect()` so this
    module is importable without the library installed (tests never
    touch this class).
    """
    url: str
    ping_interval_seconds: float = 20.0
    ping_timeout_seconds: float = 20.0
    open_timeout_seconds: float = 10.0

    # populated by connect()
    _thread: Optional[threading.Thread] = None
    _loop: Optional[Any] = None
    _ws: Optional[Any] = None
    _inbox: "queue.Queue[Optional[Dict[str, Any]]]" = field(
        default_factory=lambda: queue.Queue(),
    )
    _stop_event: Optional[threading.Event] = None
    _ready_event: Optional[threading.Event] = None
    _error: Optional[BaseException] = None

    def connect(self) -> None:
        import asyncio
        import websockets

        self._stop_event = threading.Event()
        self._ready_event = threading.Event()

        def runner():
            loop = asyncio.new_event_loop()
            self._loop = loop
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self._main(websockets))
            except BaseException as e:
                self._error = e
                self._ready_event.set()
            finally:
                loop.close()

        self._thread = threading.Thread(target=runner, name="schwab-ws",
                                        daemon=True)
        self._thread.start()
        if not self._ready_event.wait(timeout=self.open_timeout_seconds + 2):
            raise WSError("WS connect timed out")
        if self._error is not None:
            raise WSError(f"WS connect failed: {self._error}") from self._error

    async def _main(self, websockets_mod) -> None:
        import asyncio
        try:
            self._ws = await websockets_mod.connect(
                self.url,
                ping_interval=self.ping_interval_seconds,
                ping_timeout=self.ping_timeout_seconds,
                open_timeout=self.open_timeout_seconds,
            )
        except BaseException as e:
            self._error = e
            self._ready_event.set()
            return
        self._ready_event.set()

        try:
            while not self._stop_event.is_set():
                try:
                    msg = await asyncio.wait_for(self._ws.recv(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                except Exception:
                    break
                try:
                    self._inbox.put(json.loads(msg))
                except (ValueError, TypeError):
                    self._inbox.put({"_raw": str(msg)})
        finally:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._inbox.put(None)   # sentinel — recv() returns None afterwards

    def send(self, message: Dict[str, Any]) -> None:
        if self._loop is None or self._ws is None:
            raise WSError("send on unconnected transport")
        import asyncio
        payload = json.dumps(message)
        fut = asyncio.run_coroutine_threadsafe(self._ws.send(payload),
                                               self._loop)
        try:
            fut.result(timeout=5.0)
        except Exception as e:
            raise WSError(f"send failed: {e}") from e

    def recv(self, timeout: float = 0.1) -> Optional[Dict[str, Any]]:
        try:
            item = self._inbox.get(timeout=timeout)
        except queue.Empty:
            return None
        return item  # may be None (sentinel — closed)

    def close(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)

    @property
    def connected(self) -> bool:
        return (self._thread is not None
                and self._thread.is_alive()
                and self._error is None)
