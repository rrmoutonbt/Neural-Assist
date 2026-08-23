"""
Neural Assistant FastAPI Server - Production Ready
RESTful API with WebSocket support, JWT authentication, SSE streaming,
rate limiting, and real-time chat.

Patterns inspired by claude-code architecture:
- Request ID tracing (x-client-request-id)
- Heartbeat / keep-alive for WebSocket
- Structured diagnostics logging (no PII)
- Graceful startup validation
"""

import os
import time
import json
import uuid
import hmac
import hashlib
import base64
import logging
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
import collections
from collections import defaultdict

from fastapi import (
    FastAPI, HTTPException, WebSocket, WebSocketDisconnect,
    Depends, UploadFile, File, Request, Query,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from neural_assistant import (
    NeuralAssistant, NeuralAssistantAPI, NeuralAssistantExtensions,
    ModelProvider,
)
from neural_assistant_config import NeuralAssistantConfigFactory, Environment

logger = logging.getLogger(__name__)

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=32000, description="User message")
    session_id: Optional[str] = Field(None, description="Session ID")
    provider: Optional[str] = Field(None, description="Model provider")
    temperature: Optional[float] = Field(0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(1000, ge=1, le=32000)
    stream: Optional[bool] = Field(False, description="Enable SSE streaming")


class ChatResponse(BaseModel):
    success: bool
    session_id: str
    response: str
    metadata: Dict[str, Any]
    timestamp: datetime


class SystemStatusResponse(BaseModel):
    status: str
    uptime_seconds: float
    active_sessions: int
    available_providers: List[str]
    active_provider: str
    performance_metrics: Dict[str, Any]
    provider_health: Dict[str, Any]


class ProviderSwitchRequest(BaseModel):
    provider: str = Field(..., description="Target provider name")


class FileUploadResponse(BaseModel):
    success: bool
    file_id: str
    filename: str
    size: int
    type: str
    analysis: Optional[Dict[str, Any]] = None


class ProjectFileEntry(BaseModel):
    file_id: str
    name: str
    source: str  # upload, github, gdrive, text
    size: int = 0
    badge: str = "FILE"
    status: str = "ready"  # uploading, indexing, ready, error
    indexed_chunks: int = 0
    meta: Dict[str, Any] = {}
    created_at: str = ""


class GitHubConnectRequest(BaseModel):
    repo: str = Field(..., min_length=1, description="owner/repo")
    branch: str = Field("main")
    token: Optional[str] = Field(None, description="GitHub PAT for private repos")
    scan_all: bool = True
    include_docs: bool = False


class TextContentRequest(BaseModel):
    title: str = Field("Untitled", max_length=200)
    content: str = Field(..., min_length=1, max_length=500000)


class GDriveConnectRequest(BaseModel):
    url: str = Field(..., min_length=1)
    recursive: bool = True


class TokenRequest(BaseModel):
    """Request body for token generation."""
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ============================================================================
# JWT AUTHENTICATION
# ============================================================================

class JWTAuth:
    """Simple HMAC-SHA256 JWT implementation.
    In production, use python-jose or PyJWT with RS256 + key rotation."""

    def __init__(self, secret: str, expiry_seconds: int = 3600):
        self._secret = secret.encode()
        self._expiry = expiry_seconds

    def create_token(self, user_id: str, permissions: List[str]) -> str:
        header = self._b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
        payload_data = {
            "sub": user_id,
            "permissions": permissions,
            "iat": int(time.time()),
            "exp": int(time.time()) + self._expiry,
            "jti": str(uuid.uuid4()),
        }
        payload = self._b64url_encode(json.dumps(payload_data).encode())
        signature = self._sign(f"{header}.{payload}")
        return f"{header}.{payload}.{signature}"

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            header, payload, signature = parts
            expected_sig = self._sign(f"{header}.{payload}")
            if not hmac.compare_digest(signature, expected_sig):
                return None
            payload_data = json.loads(self._b64url_decode(payload))
            if payload_data.get('exp', 0) < time.time():
                return None
            return payload_data
        except Exception:
            return None

    def _sign(self, data: str) -> str:
        sig = hmac.HMAC(self._secret, data.encode(), hashlib.sha256).digest()
        return self._b64url_encode(sig)

    @staticmethod
    def _b64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

    @staticmethod
    def _b64url_decode(data: str) -> bytes:
        padding = (4 - len(data) % 4) % 4
        data += '=' * padding
        return base64.urlsafe_b64decode(data)


# ============================================================================
# RATE LIMITER
# ============================================================================

class RateLimiter:
    """Per-user sliding window rate limiter with async safety."""

    _CLEANUP_INTERVAL = 300  # Purge idle users every 5 minutes

    def __init__(self, requests_per_minute: int = 60):
        self._limit = requests_per_minute
        self._windows: Dict[str, List[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()

    async def check(self, user_id: str) -> bool:
        async with self._lock:
            now = time.time()
            # Periodic cleanup of idle users
            if now - self._last_cleanup > self._CLEANUP_INTERVAL:
                self._cleanup(now)
                self._last_cleanup = now

            window = self._windows[user_id]
            self._windows[user_id] = [t for t in window if now - t < 60]
            if len(self._windows[user_id]) >= self._limit:
                return False
            self._windows[user_id].append(now)
            return True

    def _cleanup(self, now: float):
        """Remove entries for users with no recent activity."""
        to_remove = [uid for uid, times in self._windows.items()
                     if not times or (now - times[-1]) > 120]
        for uid in to_remove:
            del self._windows[uid]

    async def remaining(self, user_id: str) -> int:
        async with self._lock:
            now = time.time()
            window = [t for t in self._windows.get(user_id, []) if now - t < 60]
            return max(0, self._limit - len(window))


# ============================================================================
# WEBSOCKET CONNECTION MANAGER
# ============================================================================

class ConnectionManager:
    """WebSocket connection manager with heartbeat support."""

    HEARTBEAT_INTERVAL = 30  # seconds

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_connections: Dict[str, str] = {}
        self._connection_metadata: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str,
                      user: Optional[Dict] = None) -> str:
        await websocket.accept()
        # If session already has a connection, disconnect the old one first
        if session_id in self.session_connections:
            old_connection_id = self.session_connections[session_id]
            old_ws = self.active_connections.get(old_connection_id)
            if old_ws:
                try:
                    await old_ws.close(code=4000, reason="Replaced by new connection")
                except Exception:
                    pass
            self.disconnect(old_connection_id)
            logger.info(f"Replaced existing connection {old_connection_id} for session {session_id}")
        connection_id = str(uuid.uuid4())
        self.active_connections[connection_id] = websocket
        self.session_connections[session_id] = connection_id
        self._connection_metadata[connection_id] = {
            'session_id': session_id,
            'user': user,
            'connected_at': time.time(),
            'last_activity': time.time(),
        }
        logger.info(f"WebSocket connected: {connection_id} for session {session_id}")
        return connection_id

    def disconnect(self, connection_id: str):
        self.active_connections.pop(connection_id, None)
        self._connection_metadata.pop(connection_id, None)
        session_to_remove = None
        for sid, cid in self.session_connections.items():
            if cid == connection_id:
                session_to_remove = sid
                break
        if session_to_remove:
            del self.session_connections[session_to_remove]
        logger.info(f"WebSocket disconnected: {connection_id}")

    async def send_personal_message(self, message: Dict[str, Any], session_id: str):
        connection_id = self.session_connections.get(session_id)
        if connection_id and connection_id in self.active_connections:
            ws = self.active_connections[connection_id]
            try:
                await ws.send_text(json.dumps(message))
                if connection_id in self._connection_metadata:
                    self._connection_metadata[connection_id]['last_activity'] = time.time()
            except Exception as e:
                logger.error(f"WebSocket send error: {e}")
                self.disconnect(connection_id)

    async def broadcast(self, message: Dict[str, Any]):
        disconnected = []
        for cid, ws in self.active_connections.items():
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                disconnected.append(cid)
        for cid in disconnected:
            self.disconnect(cid)

    @property
    def stats(self) -> Dict[str, int]:
        return {
            'active_websockets': len(self.active_connections),
            'session_mappings': len(self.session_connections),
        }


# ============================================================================
# APPLICATION SETUP
# ============================================================================

# Configuration
config_factory = NeuralAssistantConfigFactory()
config = config_factory.create_from_environment()

# JWT setup
_jwt_secret = os.environ.get('JWT_SECRET', os.environ.get('NEURAL_ASSISTANT_JWT_SECRET', 'change-me-in-production'))
if _jwt_secret == 'change-me-in-production' and config.environment == Environment.PRODUCTION:
    raise RuntimeError("JWT_SECRET must be set in production. Set the JWT_SECRET environment variable.")
jwt_auth = JWTAuth(_jwt_secret, expiry_seconds=config.security.token_expiry)

# Rate limiter
rate_limiter = RateLimiter(
    requests_per_minute=config.security.rate_limit_per_minute
)

# Neural Assistant
neural_assistant = NeuralAssistant(config.__dict__)
neural_api = NeuralAssistantAPI(neural_assistant)
neural_extensions = NeuralAssistantExtensions(neural_assistant)

# Connection manager
connection_manager = ConnectionManager()

# Allowed CORS origins — locked down for production
_cors_origins = config.security.cors_origins
if config.environment == Environment.PRODUCTION and "*" in _cors_origins:
    logger.warning("CORS allows '*' in production — restricting to localhost only. Set cors_origins in config.")
    _cors_origins = ["http://localhost:3000", "http://localhost:8000"]

@asynccontextmanager
async def lifespan(app):
    # --- Startup ---
    app.state.start_time = time.time()
    logger.info("Neural Assistant API server starting...")

    # Validate required environment in production
    if config.environment == Environment.PRODUCTION:
        missing = []
        if not os.environ.get('JWT_SECRET'):
            missing.append('JWT_SECRET')
        if missing:
            raise RuntimeError(f"Missing required env vars for production: {', '.join(missing)}")

    # Initialize subsystems
    await neural_assistant.cognitive_core.initialize()
    await neural_assistant.math_core.initialize()
    await neural_assistant.embedding_service.initialize()
    await neural_assistant.capabilities.initialize()

    # Initialize MCP servers if configured
    mcp_cfg = getattr(config, 'mcp', None)
    if mcp_cfg and getattr(mcp_cfg, 'enabled', False):
        try:
            servers = getattr(mcp_cfg, 'servers', [])
            await neural_assistant.mcp_manager.initialize(servers)
            logger.info(f"MCP: {len(neural_assistant.mcp_manager.connections)} servers connected")
        except Exception as e:
            logger.error(f"MCP initialization failed: {e}")

    # Log startup info
    try:
        status = await neural_assistant.get_system_status()
        providers = status['available_providers']
        logger.info(f"Providers available: {providers or ['cognitive_core (fallback)']}")
        logger.info(f"Active provider: {status['active_provider']}")
        if status.get('provider_init_errors'):
            for prov, err in status['provider_init_errors'].items():
                logger.warning(f"Provider {prov} init error: {err}")
    except Exception as e:
        logger.error(f"Startup status check failed: {e}")

    logger.info(f"Server ready — env={config.environment.value} auth={config.security.auth_required}")

    yield

    # --- Shutdown ---
    logger.info("Neural Assistant API server shutting down...")
    for cid in list(connection_manager.active_connections.keys()):
        connection_manager.disconnect(cid)
    try:
        await neural_assistant.mcp_manager.shutdown()
    except Exception as e:
        logger.error(f"MCP shutdown error: {e}")
    try:
        await neural_assistant.cognitive_core.shutdown()
        await neural_assistant.math_core.shutdown()
    except Exception as e:
        logger.error(f"Shutdown error: {e}")
    logger.info("Neural Assistant API server stopped")


# FastAPI app
app = FastAPI(
    title="Neural Assistant API",
    description="Intelligent AI Chat System with multi-provider support",
    version="2.0.0",
    docs_url="/docs" if config.debug else None,
    redoc_url="/redoc" if config.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

security = HTTPBearer(auto_error=False)


# ============================================================================
# AUTH DEPENDENCY
# ============================================================================

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    """Authenticate via JWT token."""
    if not config.security.auth_required:
        return {"user_id": "anonymous", "permissions": ["read", "write"]}

    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")

    payload = jwt_auth.verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {
        "user_id": payload["sub"],
        "permissions": payload.get("permissions", ["read"]),
    }


async def require_admin(user: Dict = Depends(get_current_user)) -> Dict:
    if "admin" not in user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def check_rate_limit(user: Dict = Depends(get_current_user)):
    if not await rate_limiter.check(user["user_id"]):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={"Retry-After": "60"},
        )
    return user


# ============================================================================
# MIDDLEWARE
# ============================================================================

@app.middleware("http")
async def add_headers_middleware(request: Request, call_next):
    """Add request tracing and timing headers (claude-code pattern: x-client-request-id)."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    start_time = time.time()

    response = await call_next(request)

    response.headers["X-Process-Time"] = f"{time.time() - start_time:.4f}"
    response.headers["X-Request-ID"] = request_id
    return response


# ============================================================================
# AUTH ENDPOINTS
# ============================================================================

@app.post("/api/v1/auth/token", response_model=TokenResponse)
async def create_token(body: TokenRequest):
    """Generate a JWT access token.
    In production, validate against a user database."""
    # For local dev, accept any credentials. In production, verify against DB.
    valid_users = json.loads(os.environ.get('NEURAL_ASSISTANT_USERS', '{}'))

    if valid_users:
        stored_password = valid_users.get(body.username)
        if not stored_password or not hmac.compare_digest(stored_password.encode(), body.password.encode()):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        permissions = ["read", "write"]
        if body.username in json.loads(os.environ.get('NEURAL_ASSISTANT_ADMINS', '[]')):
            permissions.append("admin")
    else:
        if config.environment == Environment.PRODUCTION:
            raise HTTPException(status_code=503, detail="Authentication not configured")
        logger.warning("No users configured — dev mode allows default user only")
        if body.username == "dev" and body.password == "dev":
            permissions = ["read", "write"]  # not admin
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    token = jwt_auth.create_token(body.username, permissions)
    return TokenResponse(
        access_token=token,
        expires_in=config.security.token_expiry,
    )


# ============================================================================
# REST API ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root — serves the web chat UI if the HTML file exists, otherwise returns API info."""
    html_path = os.path.join(os.path.dirname(__file__), "neural_assistant_web_interface.html")
    if os.path.exists(html_path):
        return FileResponse(html_path, media_type="text/html")
    return {
        "name": "Neural Assistant API",
        "version": "2.0.0",
        "status": "active",
        "endpoints": {
            "auth": "/api/v1/auth/token",
            "chat": "/api/v1/chat",
            "chat_stream": "/api/v1/chat (with stream=true)",
            "websocket": "/ws/{session_id}",
            "status": "/api/v1/status",
            "providers": "/api/v1/providers",
            "docs": "/docs",
        },
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api")
async def api_info():
    """API info endpoint (JSON)."""
    return {
        "name": "Neural Assistant API",
        "version": "2.0.0",
        "status": "active",
        "docs": "/docs",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/health")
async def health_check():
    try:
        status = await neural_assistant.get_system_status()
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "providers_available": len(status['available_providers']),
            "active_provider": status['active_provider'],
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e), "timestamp": datetime.now().isoformat()},
        )


@app.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest, user=Depends(check_rate_limit)):
    """Main chat endpoint with optional SSE streaming."""
    try:
        # SSE streaming path
        if request.stream:
            return await _stream_chat(request, user)

        start_time = time.time()
        result = await neural_api.chat(
            user_id=user["user_id"],
            message=request.message,
            session_id=request.session_id,
            provider=request.provider,
        )

        if not result['success']:
            raise HTTPException(status_code=400, detail=result.get('error', 'Request failed'))

        # WebSocket notification
        if result['session_id'] in connection_manager.session_connections:
            await connection_manager.send_personal_message(
                {"type": "chat_response", "data": result},
                result['session_id'],
            )

        return ChatResponse(
            success=True,
            session_id=result['session_id'],
            response=result['response'],
            metadata=result['metadata'],
            timestamp=datetime.now(),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


async def _stream_chat(request: ChatRequest, user: Dict):
    """SSE streaming response — modeled on claude-code SSE transport."""
    session_id = request.session_id
    if not session_id:
        session_id = await neural_assistant.start_conversation(user["user_id"])

    provider = None
    if request.provider and request.provider != 'cognitive_core':
        try:
            provider = ModelProvider(request.provider)
        except ValueError:
            pass

    async def event_generator():
        yield f"data: {json.dumps({'type': 'stream_start', 'session_id': session_id})}\n\n"

        try:
            async for token in neural_assistant.process_message_stream(
                session_id, request.message, provider
            ):
                yield f"data: {json.dumps({'type': 'content_delta', 'text': token})}\n\n"

            yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
        except Exception as e:
            logger.error(f"SSE stream error for session {session_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'An internal error occurred'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/v1/status", response_model=SystemStatusResponse)
async def get_status(user=Depends(get_current_user)):
    try:
        status = await neural_assistant.get_system_status()
        return SystemStatusResponse(
            status="active",
            uptime_seconds=time.time() - app.state.start_time,
            active_sessions=status['active_sessions'],
            available_providers=status['available_providers'],
            active_provider=status['active_provider'],
            performance_metrics=status['performance_metrics'],
            provider_health=status.get('provider_health', {}),
        )
    except Exception as e:
        logger.error(f"Status endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")


@app.get("/api/v1/providers")
async def get_providers(user=Depends(get_current_user)):
    try:
        return await neural_api.get_providers()
    except Exception as e:
        logger.error(f"Providers endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/providers/switch")
async def switch_provider(request: ProviderSwitchRequest, session_id: str = Query(...),
                           user=Depends(get_current_user)):
    try:
        result = await neural_api.switch_provider(session_id, request.provider)
        if session_id in connection_manager.session_connections:
            await connection_manager.send_personal_message(
                {"type": "provider_switched", "data": result}, session_id
            )
        return result
    except Exception as e:
        logger.error(f"Provider switch error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/v1/conversations/{session_id}/history")
async def get_conversation_history(session_id: str, limit: int = 50,
                                    user=Depends(get_current_user)):
    try:
        return await neural_api.get_history(session_id, limit)
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/conversations/{session_id}/export")
async def export_conversation(session_id: str, format: str = "json",
                               user=Depends(get_current_user)):
    try:
        result = await neural_extensions.export_conversation(session_id, format)
        if 'error' in result:
            raise HTTPException(status_code=404, detail=result['error'])
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/conversations/{session_id}/compact")
async def compact_conversation(session_id: str, user: dict = Depends(get_current_user)):
    """Compress conversation context to save tokens."""
    try:
        if session_id not in neural_assistant.conversations:
            raise HTTPException(status_code=404, detail="Session not found")
        context = neural_assistant.conversations[session_id]
        compressed_msgs, stats = await neural_assistant.context_compressor.handle_compact_command(
            context.messages, neural_assistant.context_window
        )
        async with neural_assistant._conversations_lock:
            context.messages = compressed_msgs
        return {"success": True, "stats": stats}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Compact error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/upload", response_model=FileUploadResponse)
async def upload_file(request: Request, file: UploadFile = File(...), user=Depends(check_rate_limit)):
    try:
        # Enforce max file size (50MB default)
        max_size = config.multimodal.max_file_size if hasattr(config, 'multimodal') else 50 * 1024 * 1024

        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > max_size:
            raise HTTPException(status_code=413, detail=f"File too large. Max: {max_size} bytes")

        file_content = await file.read()
        if len(file_content) > max_size:
            raise HTTPException(status_code=413, detail=f"File too large. Max: {max_size} bytes")

        result = await neural_extensions.multimodal.process_file(file.filename or "unknown", file_content)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Processing failed'))

        analysis = result.get('analysis') or {}

        # For image files, also run AI vision analysis if available
        if result.get('type') == 'image' and neural_assistant.capabilities.vision_analyzer.available:
            try:
                vision_result = await neural_assistant.capabilities.analyze_image(file_content)
                if vision_result.get('success'):
                    analysis['ai_description'] = vision_result['description']
                    analysis['vision_provider'] = vision_result.get('provider', '')
            except Exception as e:
                logger.warning(f"Vision analysis failed for upload: {e}")

        return FileUploadResponse(
            success=True,
            file_id=str(uuid.uuid4()),
            filename=file.filename or "unknown",
            size=len(file_content),
            type=result.get('type', 'unknown'),
            analysis=analysis,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail="File processing failed")


@app.post("/api/v1/tools/{tool_name}")
async def execute_tool(tool_name: str, parameters: Dict[str, Any],
                        user=Depends(check_rate_limit)):
    try:
        result = await neural_extensions.tools.execute_tool(tool_name, parameters, user=user)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Tool execution failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/v1/conversations/{session_id}/analysis")
async def analyze_conversation(session_id: str, user=Depends(get_current_user)):
    try:
        result = await neural_extensions.analyze_conversation_patterns(session_id)
        if 'error' in result:
            raise HTTPException(status_code=404, detail=result['error'])
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# MCP MANAGEMENT ENDPOINTS
# ============================================================================


@app.get("/api/v1/mcp/servers")
async def list_mcp_servers(user: dict = Depends(get_current_user)):
    """List connected MCP servers and their status."""
    return {"servers": neural_assistant.mcp_manager.get_server_status()}


@app.get("/api/v1/mcp/tools")
async def list_mcp_tools(user: dict = Depends(get_current_user)):
    """List all tools available from MCP servers."""
    schemas = neural_assistant.mcp_manager.get_tool_schemas()
    return {"tools": schemas, "count": len(schemas)}


@app.post("/api/v1/mcp/servers")
async def add_mcp_server(body: dict, user: dict = Depends(get_current_user)):
    """Connect a new MCP server at runtime."""
    try:
        success = await neural_assistant.mcp_manager.add_server(body)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to connect MCP server")
        return {"success": True, "servers": neural_assistant.mcp_manager.get_server_status()}
    except Exception as e:
        logger.error(f"MCP add server error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/v1/mcp/servers/{server_name}")
async def remove_mcp_server(server_name: str, user: dict = Depends(get_current_user)):
    """Disconnect and remove an MCP server."""
    success = await neural_assistant.mcp_manager.remove_server(server_name)
    if not success:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return {"success": True}


# ============================================================================
# TOOL AUDIT ENDPOINTS
# ============================================================================


@app.get("/api/v1/tools/audit")
async def get_tool_audit(limit: int = 100, user: dict = Depends(get_current_user)):
    """Get recent tool execution audit entries."""
    if not hasattr(neural_extensions, 'permission_manager'):
        return {"entries": [], "count": 0}
    entries = await neural_extensions.permission_manager.audit_logger.get_recent_entries(limit)
    return {"entries": entries, "count": len(entries)}


@app.get("/api/v1/tools/policies")
async def get_tool_policies(user: dict = Depends(get_current_user)):
    """Get current tool permission policies."""
    if not hasattr(neural_extensions, 'permission_manager'):
        return {"policies": []}
    return {"policies": neural_extensions.permission_manager.get_policies()}


# ============================================================================
# IMAGE GENERATION & VISION ENDPOINTS
# ============================================================================

class ImageGenRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    size: str = Field("1024x1024")
    style: str = Field("vivid")
    provider: str = Field("auto")


@app.post("/api/v1/generate-image")
async def generate_image(request: ImageGenRequest, user=Depends(check_rate_limit)):
    """Generate an image from a text prompt."""
    try:
        result = await neural_assistant.capabilities.image_generator.generate(
            prompt=request.prompt,
            size=request.size,
            style=request.style,
            provider=request.provider,
        )
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Generation failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/vision/analyze")
async def analyze_image_vision(
    request: Request,
    file: UploadFile = File(...),
    prompt: str = "Describe this image in detail.",
    user=Depends(check_rate_limit),
):
    """Analyze an uploaded image using AI vision."""
    try:
        max_size = 20 * 1024 * 1024  # 20MB for images

        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > max_size:
            raise HTTPException(status_code=413, detail="Image too large. Max 20MB.")

        image_bytes = await file.read()
        if len(image_bytes) > max_size:
            raise HTTPException(status_code=413, detail="Image too large. Max 20MB.")

        result = await neural_assistant.capabilities.analyze_image(image_bytes, prompt)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Analysis failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


class CodeExecRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50000)
    language: str = Field("python")


@app.post("/api/v1/execute-code")
async def execute_code(request: CodeExecRequest, user=Depends(check_rate_limit)):
    """Execute code in a sandboxed environment."""
    try:
        result = await neural_assistant.capabilities.code_executor.execute(
            code=request.code,
            language=request.language,
        )
        return result
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/transcribe")
async def transcribe_file(
    request: Request,
    file: UploadFile = File(...),
    language: Optional[str] = None,
    model_size: Optional[str] = None,
    output_format: str = "txt",
    user=Depends(check_rate_limit),
):
    """Transcribe audio or video file using local Whisper model."""
    try:
        max_size = 500 * 1024 * 1024  # 500MB for audio/video

        content_length = request.headers.get('content-length')
        if content_length and int(content_length) > max_size:
            raise HTTPException(status_code=413, detail="File too large. Max 500MB.")

        file_bytes = await file.read()
        if len(file_bytes) > max_size:
            raise HTTPException(status_code=413, detail="File too large. Max 500MB.")

        result = await neural_assistant.capabilities.transcribe_file(
            file_bytes=file_bytes,
            filename=file.filename or "audio.wav",
            language=language,
            model_size=model_size,
            output_format=output_format,
        )
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Transcription failed'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/v1/capabilities")
async def get_capabilities(user=Depends(get_current_user)):
    """Get available advanced capabilities (image gen, vision, code exec, transcription)."""
    return neural_assistant.capabilities.get_status()


@app.post("/api/v1/optimize")
async def optimize_system(user=Depends(require_admin)):
    try:
        result = await neural_assistant.optimize_performance()
        return {"success": True, "optimization_results": result, "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# WEBSOCKET ENDPOINT
# ============================================================================

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint with optional token auth and heartbeat."""
    # Token authentication for WebSocket
    user = {"user_id": "anonymous", "permissions": ["read", "write"]}
    if config.security.auth_required:
        token = websocket.query_params.get("token")
        if not token:
            await websocket.close(code=4001, reason="Token required")
            return
        payload = jwt_auth.verify_token(token)
        if not payload:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user = {"user_id": payload["sub"], "permissions": payload.get("permissions", [])}

    connection_id = await connection_manager.connect(websocket, session_id, user)

    try:
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "session_id": session_id,
            "connection_id": connection_id,
            "timestamp": datetime.now().isoformat(),
        }))

        while True:
            # Wait for message with timeout for heartbeat
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=ConnectionManager.HEARTBEAT_INTERVAL,
                )
            except asyncio.TimeoutError:
                # Send heartbeat (keep-alive frame from claude-code pattern)
                try:
                    await websocket.send_text(json.dumps({"type": "keep_alive"}))
                except Exception:
                    break
                continue

            try:
                message_data = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                await websocket.send_text(json.dumps(
                    {"type": "error", "message": "Invalid JSON"}
                ))
                continue

            # Simple rate limiting for WebSocket
            ws_msg_count = getattr(websocket.state, '_msg_count', 0) + 1
            ws_last_reset = getattr(websocket.state, '_msg_reset', time.time())
            if time.time() - ws_last_reset > 60:
                ws_msg_count = 1
                ws_last_reset = time.time()
            websocket.state._msg_count = ws_msg_count
            websocket.state._msg_reset = ws_last_reset
            if ws_msg_count > 60:  # 60 msgs/min limit
                await websocket.send_json({"type": "error", "message": "Rate limit exceeded"})
                continue

            msg_type = message_data.get('type', '')

            if msg_type == 'chat_message':
                msg_text = message_data.get('message')
                if not msg_text:
                    await websocket.send_text(json.dumps(
                        {"type": "error", "message": "Missing 'message' field"}
                    ))
                    continue
                result = await neural_api.chat(
                    user_id=user["user_id"],
                    message=msg_text,
                    session_id=session_id,
                    provider=message_data.get('provider'),
                )
                await websocket.send_text(json.dumps({
                    "type": "chat_response",
                    "data": result,
                    "timestamp": datetime.now().isoformat(),
                }))

            elif msg_type == 'chat_stream':
                msg_text = message_data.get('message')
                if not msg_text:
                    await websocket.send_text(json.dumps(
                        {"type": "error", "message": "Missing 'message' field"}
                    ))
                    continue
                provider = None
                if message_data.get('provider') and message_data['provider'] != 'cognitive_core':
                    try:
                        provider = ModelProvider(message_data['provider'])
                    except ValueError:
                        pass

                await websocket.send_text(json.dumps({"type": "stream_start"}))
                try:
                    async for token in neural_assistant.process_message_stream(
                        session_id, msg_text, provider
                    ):
                        await websocket.send_text(json.dumps({
                            "type": "content_delta", "text": token,
                        }))
                    await websocket.send_text(json.dumps({"type": "stream_end"}))
                except Exception as stream_err:
                    logger.error(f"WebSocket stream error for session {session_id}: {stream_err}")
                    await websocket.send_text(json.dumps({
                        "type": "error", "message": "An error occurred during streaming",
                    }))

            elif msg_type == 'switch_provider':
                prov_name = message_data.get('provider')
                if not prov_name:
                    await websocket.send_text(json.dumps(
                        {"type": "error", "message": "Missing 'provider' field"}
                    ))
                    continue
                result = await neural_api.switch_provider(session_id, prov_name)
                await websocket.send_text(json.dumps({
                    "type": "provider_switched", "data": result,
                    "timestamp": datetime.now().isoformat(),
                }))

            elif msg_type == 'get_status':
                status = await neural_assistant.get_system_status()
                await websocket.send_text(json.dumps({
                    "type": "system_status", "data": status,
                    "timestamp": datetime.now().isoformat(),
                }))

            elif msg_type == 'pong':
                # Client heartbeat response
                pass

    except WebSocketDisconnect:
        connection_manager.disconnect(connection_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(connection_id)


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@app.get("/api/v1/admin/metrics")
async def get_detailed_metrics(user=Depends(require_admin)):
    try:
        status = await neural_assistant.get_system_status()
        return {
            "system_status": status,
            "connection_metrics": connection_manager.stats,
            "performance_metrics": {
                "uptime_seconds": time.time() - app.state.start_time,
                "total_requests": status['performance_metrics']['total_requests'],
                "failed_requests": status['performance_metrics']['failed_requests'],
                "avg_response_time": status['performance_metrics']['avg_processing_time'],
            },
            "provider_health": status.get('provider_health', {}),
            "provider_init_errors": status.get('provider_init_errors', {}),
            "configuration": {
                "environment": config.environment.value,
                "auth_required": config.security.auth_required,
                "safety_level": config.safety.safety_level,
            },
        }
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/admin/config/reload")
async def reload_configuration(user=Depends(require_admin)):
    try:
        global config, rate_limiter, jwt_auth, _cors_origins
        new_config = config_factory.create_from_environment()
        config = new_config
        neural_assistant.config = new_config.__dict__

        # Re-initialize module-level references from new config
        rate_limiter = RateLimiter(
            requests_per_minute=new_config.security.rate_limit_per_minute
        )
        _jwt_secret = os.environ.get('JWT_SECRET', os.environ.get('NEURAL_ASSISTANT_JWT_SECRET', 'change-me-in-production'))
        jwt_auth = JWTAuth(_jwt_secret, expiry_seconds=new_config.security.token_expiry)
        # Note: CORS middleware origins cannot be updated after registration; requires server restart
        _cors_origins = new_config.security.cors_origins

        return {"success": True, "message": "Configuration reloaded (CORS changes require restart)", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/admin/sessions/cleanup")
async def cleanup_sessions(user=Depends(require_admin)):
    try:
        result = await neural_assistant.optimize_performance()
        return {"success": True, "cleanup_results": result, "timestamp": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"Endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/v1/admin/logs")
async def get_logs(level: str = "INFO", limit: int = 100, user=Depends(require_admin)):
    """Read actual log entries from the log file."""
    limit = min(limit, 1000)
    log_file = getattr(config, 'log_file', 'neural_assistant.log')
    entries = []
    try:
        if os.path.exists(log_file):
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = list(collections.deque(f, maxlen=1000))
            level_priority = {'DEBUG': 0, 'INFO': 1, 'WARNING': 2, 'ERROR': 3, 'CRITICAL': 4}
            min_level = level_priority.get(level.upper(), 1)
            for line in lines[-limit * 3:]:
                for lvl, pri in level_priority.items():
                    if lvl in line and pri >= min_level:
                        entries.append(line.strip())
                        break
            entries = entries[-limit:]
    except Exception as e:
        logger.error(f"Log read error: {e}")

    return {"success": True, "logs": entries, "total_entries": len(entries)}


@app.get("/api/v1/performance/benchmark")
async def performance_benchmark(user=Depends(require_admin)):
    benchmark_start = time.time()
    test_messages = [
        "What is artificial intelligence?",
        "Solve this equation: 2x + 5 = 15",
        "Analyze this code: def hello(): print('world')",
        "Explain the transformer architecture",
        "What are the ethical implications of AI?",
    ]
    results = []
    for i, message in enumerate(test_messages):
        start = time.time()
        result = await neural_api.chat(user_id="benchmark_user", message=message)
        elapsed = time.time() - start
        results.append({
            "scenario": f"Test {i+1}",
            "message": message,
            "response_time_ms": elapsed * 1000,
            "tokens_used": result.get('metadata', {}).get('tokens_used', 0) if result['success'] else 0,
            "success": result['success'],
            "provider": result['metadata'].get('provider', 'unknown') if result['success'] else 'failed',
        })

    total = time.time() - benchmark_start
    avg = sum(r['response_time_ms'] for r in results) / len(results)
    return {
        "success": True,
        "benchmark_results": results,
        "summary": {
            "total_time_ms": total * 1000,
            "average_response_time_ms": avg,
            "total_tests": len(test_messages),
            "successful_tests": sum(1 for r in results if r['success']),
            "timestamp": datetime.now().isoformat(),
        },
    }


# ============================================================================
# PROJECT FILES — file attachment, GitHub, Google Drive, text content
# ============================================================================

# Per-session project file storage
_project_files: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
_project_indexing: Dict[str, bool] = {}  # session_id -> currently indexing?

MAX_PROJECT_CAPACITY_MB = 50


def _get_session_key(session_id: Optional[str]) -> str:
    return session_id or "default"


def _compute_capacity(session_key: str) -> dict:
    files = _project_files.get(session_key, [])
    total = sum(f.get("size", 0) for f in files)
    pct = min(100.0, (total / (MAX_PROJECT_CAPACITY_MB * 1024 * 1024)) * 100)
    return {"total_bytes": total, "percent": round(pct, 1), "max_mb": MAX_PROJECT_CAPACITY_MB}


@app.get("/api/v1/project/files")
async def list_project_files(session_id: Optional[str] = Query(None)):
    """List all project files for the session."""
    key = _get_session_key(session_id)
    files = _project_files.get(key, [])
    indexing = _project_indexing.get(key, False)
    return {
        "success": True,
        "files": files,
        "capacity": _compute_capacity(key),
        "indexing": indexing,
    }


@app.post("/api/v1/project/files/upload")
async def upload_project_file(
    file: UploadFile = File(...),
    session_id: Optional[str] = Query(None),
):
    """Upload a file and add it to the project."""
    key = _get_session_key(session_id)
    content = await file.read()
    file_id = f"file_{uuid.uuid4().hex[:12]}"

    entry = {
        "file_id": file_id,
        "name": file.filename,
        "source": "upload",
        "size": len(content),
        "badge": (file.filename.split(".")[-1].upper() if "." in file.filename else "FILE"),
        "status": "indexing",
        "indexed_chunks": 0,
        "meta": {"content_type": file.content_type},
        "created_at": datetime.now().isoformat(),
    }
    _project_files[key].append(entry)
    _project_indexing[key] = True

    # Index in background — extract text content for context
    async def _index():
        try:
            text = ""
            if file.content_type and file.content_type.startswith("text/") or \
               file.filename.endswith(('.txt', '.md', '.py', '.js', '.ts', '.html', '.css',
                                       '.json', '.xml', '.yaml', '.yml', '.csv', '.sh')):
                text = content.decode("utf-8", errors="replace")[:50000]
            elif file.filename.endswith('.pdf'):
                try:
                    import io
                    from PyPDF2 import PdfReader
                    reader = PdfReader(io.BytesIO(content))
                    text = "\n".join(p.extract_text() or "" for p in reader.pages[:20])[:50000]
                except Exception:
                    pass

            chunks = [text[i:i+2000] for i in range(0, len(text), 2000)] if text else []
            for f in _project_files.get(key, []):
                if f["file_id"] == file_id:
                    f["status"] = "ready"
                    f["indexed_chunks"] = len(chunks)
                    f["meta"]["preview"] = text[:500] if text else ""
                    break
        except Exception as e:
            for f in _project_files.get(key, []):
                if f["file_id"] == file_id:
                    f["status"] = "error"
                    f["meta"]["error"] = str(e)
                    break
        finally:
            # Check if any files still indexing
            still_indexing = any(f["status"] == "indexing" for f in _project_files.get(key, []))
            _project_indexing[key] = still_indexing

    asyncio.create_task(_index())

    return {
        "success": True,
        "file": entry,
        "capacity": _compute_capacity(key),
    }


@app.post("/api/v1/project/github/connect")
async def connect_github_repo(req: GitHubConnectRequest, session_id: Optional[str] = Query(None)):
    """Connect a GitHub repository — fetch tree, scan key files, index content."""
    import httpx

    key = _get_session_key(session_id)
    repo = req.repo.strip()
    # Normalize URL to owner/repo
    import re
    m = re.search(r'github\.com/([^/]+/[^/\s]+)', repo)
    if m:
        repo = m.group(1).rstrip('.git')

    file_id = f"gh_{uuid.uuid4().hex[:12]}"
    entry = {
        "file_id": file_id,
        "name": repo.split("/")[-1],
        "source": "github",
        "size": 0,
        "badge": "GITHUB",
        "status": "indexing",
        "indexed_chunks": 0,
        "meta": {"repo": repo, "branch": req.branch},
        "created_at": datetime.now().isoformat(),
    }
    _project_files[key].append(entry)
    _project_indexing[key] = True

    async def _scan():
        try:
            headers = {"Accept": "application/vnd.github.v3+json"}
            if req.token:
                headers["Authorization"] = f"token {req.token}"

            async with httpx.AsyncClient(timeout=30) as client:
                # Repo info
                r = await client.get(f"https://api.github.com/repos/{repo}", headers=headers)
                if r.status_code != 200:
                    raise Exception(f"Repository not found ({r.status_code})")
                repo_data = r.json()

                # File tree
                r = await client.get(
                    f"https://api.github.com/repos/{repo}/git/trees/{req.branch}?recursive=1",
                    headers=headers,
                )
                if r.status_code != 200:
                    raise Exception(f"Branch '{req.branch}' not found")
                tree = r.json()

                files = [f for f in tree.get("tree", []) if f["type"] == "blob"]
                total_size = sum(f.get("size", 0) for f in files)

                # Pick files to scan
                code_exts = {'.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java',
                             '.rb', '.php', '.c', '.cpp', '.h', '.cs', '.swift', '.kt',
                             '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.cfg',
                             '.html', '.css', '.sh', '.sql', '.dockerfile'}
                scannable = [f for f in files if any(f["path"].lower().endswith(e) for e in code_exts)]
                if req.include_docs:
                    scannable = [f for f in files if any(f["path"].lower().endswith(e) for e in code_exts | {'.rst', '.adoc'})]
                if not req.scan_all:
                    scannable = [f for f in scannable if f.get("size", 0) < 50000]

                # Fetch up to 25 files
                scanned = []
                for sf in scannable[:25]:
                    try:
                        cr = await client.get(
                            f"https://api.github.com/repos/{repo}/contents/{sf['path']}?ref={req.branch}",
                            headers=headers,
                        )
                        if cr.status_code == 200:
                            data = cr.json()
                            if data.get("content"):
                                decoded = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
                                scanned.append({"path": sf["path"], "content": decoded[:8000], "size": sf.get("size", 0)})
                    except Exception:
                        continue

                # Update entry
                for f in _project_files.get(key, []):
                    if f["file_id"] == file_id:
                        f["size"] = total_size
                        f["status"] = "ready"
                        f["indexed_chunks"] = len(scanned)
                        f["meta"].update({
                            "repo": repo,
                            "branch": req.branch,
                            "file_count": len(files),
                            "scanned_files": len(scanned),
                            "language": repo_data.get("language"),
                            "description": repo_data.get("description"),
                            "stars": repo_data.get("stargazers_count", 0),
                        })
                        break

                # Feed context into session
                if scanned and session_id:
                    context = "\n\n".join(f"--- {s['path']} ---\n{s['content']}" for s in scanned)
                    try:
                        await neural_api.chat(
                            user_id="system",
                            message=f"[SYSTEM CONTEXT] GitHub repo '{repo}' ({req.branch}) attached. "
                                    f"{len(files)} files, {len(scanned)} scanned.\n\n{context[:30000]}",
                            session_id=session_id,
                        )
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"GitHub connect failed for {repo}: {e}")
            for f in _project_files.get(key, []):
                if f["file_id"] == file_id:
                    f["status"] = "error"
                    f["meta"]["error"] = str(e)
                    break
        finally:
            still = any(f["status"] == "indexing" for f in _project_files.get(key, []))
            _project_indexing[key] = still

    asyncio.create_task(_scan())

    return {
        "success": True,
        "file_id": file_id,
        "message": f"Connecting to {repo}...",
        "capacity": _compute_capacity(key),
    }


@app.post("/api/v1/project/text/add")
async def add_text_content(req: TextContentRequest, session_id: Optional[str] = Query(None)):
    """Add text content as a project file."""
    key = _get_session_key(session_id)
    file_id = f"txt_{uuid.uuid4().hex[:12]}"
    size = len(req.content.encode("utf-8"))
    chunks = [req.content[i:i+2000] for i in range(0, len(req.content), 2000)]

    entry = {
        "file_id": file_id,
        "name": req.title,
        "source": "text",
        "size": size,
        "badge": "TEXT",
        "status": "ready",
        "indexed_chunks": len(chunks),
        "meta": {"preview": req.content[:500]},
        "created_at": datetime.now().isoformat(),
    }
    _project_files[key].append(entry)

    # Feed into session context
    if session_id:
        try:
            await neural_api.chat(
                user_id="system",
                message=f'[SYSTEM CONTEXT] Text file "{req.title}" attached:\n\n{req.content[:30000]}',
                session_id=session_id,
            )
        except Exception:
            pass

    return {"success": True, "file": entry, "capacity": _compute_capacity(key)}


@app.post("/api/v1/project/gdrive/connect")
async def connect_gdrive(req: GDriveConnectRequest, session_id: Optional[str] = Query(None)):
    """Link a Google Drive file/folder (metadata only — full access requires OAuth)."""
    key = _get_session_key(session_id)
    file_id = f"gd_{uuid.uuid4().hex[:12]}"

    import re
    id_match = re.search(r'/d/([a-zA-Z0-9_-]+)', req.url) or re.search(r'folders/([a-zA-Z0-9_-]+)', req.url)
    drive_id = id_match.group(1) if id_match else "unknown"
    is_folder = "folders/" in req.url

    entry = {
        "file_id": file_id,
        "name": f"Drive {'Folder' if is_folder else 'File'} ({drive_id[:8]}...)",
        "source": "gdrive",
        "size": 0,
        "badge": "DRIVE",
        "status": "ready",
        "indexed_chunks": 0,
        "meta": {"url": req.url, "drive_id": drive_id, "is_folder": is_folder},
        "created_at": datetime.now().isoformat(),
    }
    _project_files[key].append(entry)

    return {
        "success": True,
        "file": entry,
        "capacity": _compute_capacity(key),
        "note": "Google Drive linked. Full file access requires OAuth configuration.",
    }


@app.delete("/api/v1/project/files/{file_id}")
async def remove_project_file(file_id: str, session_id: Optional[str] = Query(None)):
    """Remove a file from the project."""
    key = _get_session_key(session_id)
    files = _project_files.get(key, [])
    original_len = len(files)
    _project_files[key] = [f for f in files if f["file_id"] != file_id]

    if len(_project_files[key]) == original_len:
        raise HTTPException(status_code=404, detail="File not found")

    return {"success": True, "capacity": _compute_capacity(key)}


@app.get("/api/v1/project/files/{file_id}/content")
async def get_file_content(file_id: str, session_id: Optional[str] = Query(None)):
    """Get the indexed content preview of a project file."""
    key = _get_session_key(session_id)
    for f in _project_files.get(key, []):
        if f["file_id"] == file_id:
            return {
                "success": True,
                "file_id": file_id,
                "name": f["name"],
                "preview": f.get("meta", {}).get("preview", ""),
                "indexed_chunks": f.get("indexed_chunks", 0),
                "status": f["status"],
            }
    raise HTTPException(status_code=404, detail="File not found")


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "timestamp": datetime.now().isoformat(), "path": str(request.url.path)},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "timestamp": datetime.now().isoformat()},
    )


# ============================================================================
# STARTUP & SHUTDOWN — handled by lifespan() context manager above
# ============================================================================


# ============================================================================
# SERVER RUNNER
# ============================================================================

def create_app() -> FastAPI:
    return app


def run_server():
    import uvicorn

    log_level_str = config.log_level.value.lower() if hasattr(config, 'log_level') else 'info'
    logging.basicConfig(
        level=getattr(logging, log_level_str.upper(), logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(config.log_file),
            logging.StreamHandler(),
        ],
    )

    logger.info(f"Starting server — env={config.environment.value} host={config.api_host}:{config.api_port}")

    uvicorn.run(
        "neural_assistant_api_server:app",
        host=config.api_host,
        port=config.api_port,
        reload=config.debug,
        log_level=log_level_str,
        workers=1 if config.debug else 4,
    )


if __name__ == "__main__":
    run_server()
