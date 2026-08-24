"""
Neural Assistant - Intelligent AI Chat System
Claude-like architecture with multi-language model API integration
Built on CognitiveBeeBot framework with mathematical optimization

Production-ready implementation with:
- Real LLM API calls via official SDKs (OpenAI, Anthropic, Google, Ollama)
- Exponential backoff with jitter (inspired by claude-code patterns)
- Circuit breaker for provider failover
- Real sentence-transformer embeddings
- Real multimodal file processing (PIL, PyPDF2, python-docx)
- Safe tool execution
- Streaming support
"""

import asyncio
import json
import time
import logging
import os
import io
import random
import re
import numpy as np
from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, List, Optional, Any, Tuple, Union, AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from bee_bot_cognitive_framework import CognitiveBeeBot, MemoryType, ReasoningType
from mathematical_core import MathematicalCore
from neural_assistant_base import CircuitBreaker, LanguageModelAPI, retry_with_backoff
from neural_assistant_capabilities import CapabilityManager
from neural_assistant_context_compressor import ContextCompressor
from neural_assistant_tool_permissions import ToolPermissionManager
from neural_assistant_mcp import MCPManager
from neural_assistant_local_provider import LocalLLMProvider, LocalModelManager
from neural_assistant_session_store import SessionStore

logger = logging.getLogger(__name__)


# ============================================================================
# NEURAL ASSISTANT CORE ARCHITECTURE
# ============================================================================

class ModelProvider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    HUGGINGFACE = "huggingface"
    OLLAMA = "ollama"
    LOCAL = "local"


class AttentionType(Enum):
    FULL = "full"
    SPARSE = "sparse"
    LOCAL = "local"
    GLOBAL = "global"


class SafetyLevel(Enum):
    PERMISSIVE = "permissive"
    STANDARD = "standard"
    STRICT = "strict"
    MAXIMUM = "maximum"


@dataclass
class TokenMetrics:
    input_tokens: int = 0
    output_tokens: int = 0
    attention_computation: float = 0.0
    memory_usage: float = 0.0
    processing_time: float = 0.0
    total_requests: int = 0
    failed_requests: int = 0


@dataclass
class ConversationContext:
    session_id: str
    messages: List[Dict[str, Any]] = field(default_factory=list)
    context_window: int = 8192
    token_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)


# CircuitBreaker, LanguageModelAPI, retry_with_backoff imported from neural_assistant_base


# ============================================================================
# TRANSFORMER ARCHITECTURE COMPONENTS
# ============================================================================

class AttentionMechanism:
    """Mathematical attention computation with optimization."""

    def __init__(self, d_model: int = 512, n_heads: int = 8,
                 attention_type: AttentionType = AttentionType.FULL):
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        self.attention_type = attention_type

    def scaled_dot_product_attention(self, Q: np.ndarray, K: np.ndarray, V: np.ndarray,
                                     mask: Optional[np.ndarray] = None) -> Tuple[np.ndarray, np.ndarray]:
        scores = np.matmul(Q, np.swapaxes(K, -2, -1)) / np.sqrt(self.d_k)

        if mask is not None:
            scores = np.where(mask == 0, -1e9, scores)

        if self.attention_type == AttentionType.SPARSE:
            scores = self._apply_sparse_pattern(scores)

        attention_weights = self._softmax(scores)
        output = np.matmul(attention_weights, V)
        return output, attention_weights

    def _softmax(self, x: np.ndarray) -> np.ndarray:
        x_max = np.max(x, axis=-1, keepdims=True)
        exp_x = np.exp(x - x_max)
        return exp_x / np.sum(exp_x, axis=-1, keepdims=True)

    def _apply_sparse_pattern(self, scores: np.ndarray) -> np.ndarray:
        seq_len = scores.shape[-1]
        mask = np.zeros_like(scores)
        window_size = min(64, max(1, seq_len // 4))
        for i in range(seq_len):
            start = max(0, i - window_size)
            end = min(seq_len, i + window_size + 1)
            mask[..., i, start:end] = 1
        return np.where(mask == 0, -1e9, scores)


class TransformerBlock:
    """Single transformer decoder block with persistent (Xavier-initialized) weights."""

    def __init__(self, d_model: int = 512, n_heads: int = 8, d_ff: int = 2048):
        self.d_model = d_model
        self.attention = AttentionMechanism(d_model, n_heads)
        self.d_ff = d_ff

        # Persistent Xavier-initialized weights instead of random-per-call
        scale1 = np.sqrt(2.0 / (d_model + d_ff))
        self.W1 = np.random.randn(d_model, d_ff) * scale1
        self.b1 = np.zeros(d_ff)
        scale2 = np.sqrt(2.0 / (d_ff + d_model))
        self.W2 = np.random.randn(d_ff, d_model) * scale2
        self.b2 = np.zeros(d_model)

        self.ln1_weight = np.ones(d_model)
        self.ln1_bias = np.zeros(d_model)
        self.ln2_weight = np.ones(d_model)
        self.ln2_bias = np.zeros(d_model)

    def forward(self, x: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
        attn_output, _ = self.attention.scaled_dot_product_attention(x, x, x, mask)
        x = self.layer_norm(x + attn_output, self.ln1_weight, self.ln1_bias)
        ff_output = self.feed_forward(x)
        x = self.layer_norm(x + ff_output, self.ln2_weight, self.ln2_bias)
        return x

    def feed_forward(self, x: np.ndarray) -> np.ndarray:
        """Feed-forward with persistent weights and GELU activation."""
        hidden = np.dot(x, self.W1) + self.b1
        # GELU approximation
        hidden = 0.5 * hidden * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (hidden + 0.044715 * hidden ** 3)))
        output = np.dot(hidden, self.W2) + self.b2
        return output

    def layer_norm(self, x: np.ndarray, weight: np.ndarray, bias: np.ndarray) -> np.ndarray:
        mean = np.mean(x, axis=-1, keepdims=True)
        std = np.std(x, axis=-1, keepdims=True) + 1e-6
        return weight * (x - mean) / std + bias


# ============================================================================
# EMBEDDING SERVICE
# ============================================================================

class EmbeddingService:
    """Production embedding service. Uses sentence-transformers when available,
    falls back to TF-IDF-style bag-of-words embeddings."""

    def __init__(self):
        self._model = None
        self._model_name = "all-MiniLM-L6-v2"
        self._fallback_mode = False
        self._vocab: Dict[str, int] = {}
        self._embedding_dim = 384  # sentence-transformers default

    async def initialize(self):
        """Try to load sentence-transformers model."""
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._model_name)
            self._embedding_dim = self._model.get_sentence_embedding_dimension()
            logger.info(f"Loaded sentence-transformer: {self._model_name} (dim={self._embedding_dim})")
        except ImportError:
            self._fallback_mode = True
            self._embedding_dim = 512
            logger.warning("sentence-transformers not available; using TF-IDF fallback embeddings")
        except Exception as e:
            self._fallback_mode = True
            self._embedding_dim = 512
            logger.warning(f"Failed to load sentence-transformer: {e}; using fallback")

    def embed(self, text: str) -> np.ndarray:
        """Get embedding vector for text."""
        if self._model and not self._fallback_mode:
            return self._model.encode(text, normalize_embeddings=True)

        return self._fallback_embed(text)

    def embed_batch(self, texts: List[str]) -> np.ndarray:
        """Get embeddings for a batch of texts."""
        if self._model and not self._fallback_mode:
            return self._model.encode(texts, normalize_embeddings=True)

        return np.array([self._fallback_embed(t) for t in texts])

    def _fallback_embed(self, text: str) -> np.ndarray:
        """TF-IDF-style fallback embedding."""
        words = re.findall(r'\b\w+\b', text.lower())
        vec = np.zeros(self._embedding_dim)
        for word in words:
            if word not in self._vocab:
                if len(self._vocab) < self._embedding_dim:
                    self._vocab[word] = len(self._vocab)
            if word in self._vocab:
                vec[self._vocab[word]] += 1.0

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Cosine similarity between two embedding vectors."""
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))


# ============================================================================
# LANGUAGE MODEL API INTEGRATION — REAL SDK CALLS
# ============================================================================

class OpenAIProvider(LanguageModelAPI):
    """Real OpenAI API integration via the openai SDK."""

    def __init__(self, api_key: str, model: str = "gpt-4"):
        self.model = model
        self._circuit = CircuitBreaker()
        try:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=api_key)
        except ImportError:
            raise ImportError("openai package required: pip install openai")

    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        if self._circuit.is_open:
            raise ConnectionError(f"OpenAI circuit breaker open (state={self._circuit.state})")

        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]
        max_tokens = kwargs.get('max_tokens', 1000)
        temperature = kwargs.get('temperature', 0.7)

        async def _call():
            resp = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return resp

        try:
            resp = await retry_with_backoff(_call, max_retries=3)
            self._circuit.record_success()

            if not resp.choices:
                raise ValueError("OpenAI returned empty choices list")
            choice = resp.choices[0]
            usage = resp.usage

            return {
                'response': choice.message.content or '',
                'model': resp.model,
                'tokens_used': usage.total_tokens if usage else 0,
                'input_tokens': usage.prompt_tokens if usage else 0,
                'output_tokens': usage.completion_tokens if usage else 0,
                'finish_reason': choice.finish_reason,
            }
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"OpenAI API error: {e}")
            raise

    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]

        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=kwargs.get('max_tokens', 1000),
            temperature=kwargs.get('temperature', 0.7),
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content

    async def get_embeddings(self, text: str) -> np.ndarray:
        resp = await self._client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return np.array(resp.data[0].embedding)


class AnthropicProvider(LanguageModelAPI):
    """Real Anthropic Claude API integration via the anthropic SDK."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.model = model
        self._circuit = CircuitBreaker()
        try:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=api_key)
        except ImportError:
            raise ImportError("anthropic package required: pip install anthropic")

    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        if self._circuit.is_open:
            raise ConnectionError(f"Anthropic circuit breaker open (state={self._circuit.state})")

        conversation_history = kwargs.get('conversation_history', [])
        # Anthropic requires alternating user/assistant messages
        messages = []
        for msg in conversation_history:
            if msg.get('role') in ('user', 'assistant'):
                messages.append({"role": msg['role'], "content": msg['content']})
        messages.append({"role": "user", "content": prompt})

        max_tokens = kwargs.get('max_tokens', 1000)

        async def _call():
            resp = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=messages,
            )
            return resp

        try:
            resp = await retry_with_backoff(_call, max_retries=3)
            self._circuit.record_success()

            content = ""
            if resp.content:
                first_block = resp.content[0]
                content = getattr(first_block, 'text', '') or ''
            usage = resp.usage

            return {
                'response': content,
                'model': resp.model,
                'tokens_used': (usage.input_tokens + usage.output_tokens) if usage else 0,
                'input_tokens': usage.input_tokens if usage else 0,
                'output_tokens': usage.output_tokens if usage else 0,
                'finish_reason': resp.stop_reason,
            }
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"Anthropic API error: {e}")
            raise

    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        conversation_history = kwargs.get('conversation_history', [])
        messages = []
        for msg in conversation_history:
            if msg.get('role') in ('user', 'assistant'):
                messages.append({"role": msg['role'], "content": msg['content']})
        messages.append({"role": "user", "content": prompt})

        async with self._client.messages.stream(
            model=self.model,
            max_tokens=kwargs.get('max_tokens', 1000),
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def get_embeddings(self, text: str) -> np.ndarray:
        # Anthropic does not provide an embeddings API; use the shared EmbeddingService
        raise NotImplementedError("Use EmbeddingService for embeddings with Anthropic provider")


class GoogleProvider(LanguageModelAPI):
    """Real Google Generative AI (Gemini) integration."""

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        self.model_name = model
        self._circuit = CircuitBreaker()
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self._genai = genai
            self._model = genai.GenerativeModel(model)
        except ImportError:
            raise ImportError("google-generativeai package required: pip install google-generativeai")

    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        if self._circuit.is_open:
            raise ConnectionError(f"Google circuit breaker open (state={self._circuit.state})")

        async def _call():
            resp = await asyncio.to_thread(
                self._model.generate_content,
                prompt,
                generation_config=self._genai.types.GenerationConfig(
                    max_output_tokens=kwargs.get('max_tokens', 1000),
                    temperature=kwargs.get('temperature', 0.7),
                ),
            )
            return resp

        try:
            resp = await retry_with_backoff(_call, max_retries=3)
            self._circuit.record_success()

            try:
                text = resp.text if resp.text else ""
            except ValueError:
                text = ""
                logger.warning("Google response blocked by safety filters or empty; returning empty text")
            token_count = 0
            if hasattr(resp, 'usage_metadata') and resp.usage_metadata:
                token_count = getattr(resp.usage_metadata, 'total_token_count', 0)

            return {
                'response': text,
                'model': self.model_name,
                'tokens_used': token_count,
                'input_tokens': getattr(resp.usage_metadata, 'prompt_token_count', 0) if hasattr(resp, 'usage_metadata') and resp.usage_metadata else 0,
                'output_tokens': getattr(resp.usage_metadata, 'candidates_token_count', 0) if hasattr(resp, 'usage_metadata') and resp.usage_metadata else 0,
                'finish_reason': 'stop',
            }
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"Google API error: {e}")
            raise

    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        resp = await asyncio.to_thread(
            self._model.generate_content,
            prompt,
            generation_config=self._genai.types.GenerationConfig(
                max_output_tokens=kwargs.get('max_tokens', 1000),
                temperature=kwargs.get('temperature', 0.7),
            ),
            stream=True,
        )

        def _next_chunk(it):
            try:
                return next(it)
            except StopIteration:
                return None

        it = iter(resp)
        while True:
            chunk = await asyncio.to_thread(_next_chunk, it)
            if chunk is None:
                break
            if chunk.text:
                yield chunk.text

    async def get_embeddings(self, text: str) -> np.ndarray:
        result = await asyncio.to_thread(
            self._genai.embed_content,
            model="models/text-embedding-004",
            content=text,
        )
        return np.array(result['embedding'])


class OllamaProvider(LanguageModelAPI):
    """Real Ollama local model integration via HTTP API."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2"):
        self.base_url = base_url.rstrip('/')
        self.model = model
        self._circuit = CircuitBreaker(failure_threshold=1, recovery_timeout=60.0)

    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        if self._circuit.is_open:
            raise ConnectionError(f"Ollama circuit breaker open (state={self._circuit.state})")

        import httpx

        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]

        async def _call():
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)) as client:
                resp = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": kwargs.get('temperature', 0.7),
                            "num_predict": kwargs.get('max_tokens', 1000),
                        },
                    },
                )
                resp.raise_for_status()
                return resp.json()

        try:
            data = await retry_with_backoff(_call, max_retries=1, base_delay=1.0)
            self._circuit.record_success()

            return {
                'response': data.get('message', {}).get('content', ''),
                'model': data.get('model', self.model),
                'tokens_used': data.get('eval_count', 0) + data.get('prompt_eval_count', 0),
                'input_tokens': data.get('prompt_eval_count', 0),
                'output_tokens': data.get('eval_count', 0),
                'finish_reason': 'stop' if data.get('done') else 'length',
            }
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"Ollama API error: {e}")
            raise

    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        import httpx

        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]

        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": kwargs.get('temperature', 0.7),
                        "num_predict": kwargs.get('max_tokens', 1000),
                    },
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line:
                        data = json.loads(line)
                        content = data.get('message', {}).get('content', '')
                        if content:
                            yield content
                        if data.get('done'):
                            break

    async def get_embeddings(self, text: str) -> np.ndarray:
        import httpx

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
            )
            resp.raise_for_status()
            data = resp.json()
            return np.array(data.get('embedding', []))


# ============================================================================
# CONSTITUTIONAL AI & SAFETY LAYER
# ============================================================================

class ConstitutionalAI:
    """Constitutional AI implementation for safety and alignment."""

    def __init__(self, safety_level: SafetyLevel = SafetyLevel.STANDARD):
        self.safety_level = safety_level
        self.constitution = self._load_constitution()
        self.harmful_patterns = self._load_harmful_patterns()

    def _load_constitution(self) -> Dict[str, Any]:
        return {
            'helpful': {'description': 'Be maximally helpful while staying truthful', 'weight': 0.3},
            'harmless': {'description': 'Avoid harmful, dangerous, or illegal content', 'weight': 0.4},
            'honest': {'description': 'Be truthful and acknowledge uncertainty', 'weight': 0.3},
        }

    def _load_harmful_patterns(self) -> List[Dict[str, Any]]:
        return [
            {'pattern': r'how to (make|create|build) (bomb|weapon|explosive)', 'severity': 'critical'},
            {'pattern': r'illegal (drug|substance) (production|manufacturing)', 'severity': 'critical'},
            {'pattern': r'(hack|crack|break into) (system|account|password)', 'severity': 'high'},
            {'pattern': r'(personal|private) information about (real person|celebrity)', 'severity': 'medium'},
        ]

    async def evaluate_safety(self, prompt: str, response: str) -> Dict[str, Any]:
        safety_score = 1.0
        flags = []

        for pattern_info in self.harmful_patterns:
            if re.search(pattern_info['pattern'], prompt.lower()):
                flags.append({
                    'type': 'harmful_prompt',
                    'severity': pattern_info['severity'],
                    'pattern': pattern_info['pattern'],
                })
                severity = pattern_info['severity']
                if severity == 'critical':
                    safety_score *= 0.1
                elif severity == 'high':
                    safety_score *= 0.3
                elif severity == 'medium':
                    safety_score *= 0.5
                else:
                    safety_score *= 0.7

        constitutional_score = await self._evaluate_constitutional_alignment(response)
        safety_score *= constitutional_score

        # Stricter thresholds for higher safety levels
        threshold = {
            SafetyLevel.PERMISSIVE: 0.4,
            SafetyLevel.STANDARD: 0.7,
            SafetyLevel.STRICT: 0.85,
            SafetyLevel.MAXIMUM: 0.95,
        }.get(self.safety_level, 0.7)

        return {
            'safety_score': safety_score,
            'is_safe': safety_score > threshold,
            'flags': flags,
            'constitutional_score': constitutional_score,
            'threshold': threshold,
        }

    async def _evaluate_constitutional_alignment(self, response: str) -> float:
        scores = []
        helpful_score = 0.8 if len(response) > 50 else 0.4
        scores.append(helpful_score * self.constitution['helpful']['weight'])

        harmless_score = 1.0
        for pattern_info in self.harmful_patterns:
            if re.search(pattern_info['pattern'], response.lower()):
                harmless_score *= 0.3
        scores.append(harmless_score * self.constitution['harmless']['weight'])

        honest_indicators = ['unsure', 'uncertain', 'may be', 'could be', 'I think']
        honest_score = 0.9 if any(ind in response.lower() for ind in honest_indicators) else 0.7
        scores.append(honest_score * self.constitution['honest']['weight'])

        return sum(scores)


# ============================================================================
# NEURAL ASSISTANT MAIN SYSTEM
# ============================================================================

class NeuralAssistant:
    """Main Neural Assistant system with real provider integration."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._conversations_lock = asyncio.Lock()
        self.cognitive_core = CognitiveBeeBot()
        self.math_core = MathematicalCore()
        self.embedding_service = EmbeddingService()
        self.capabilities = CapabilityManager()

        # Read safety_level from flat or structured config
        safety_str = self._cfg('safety_level', structured=('safety', 'safety_level'), default='standard')
        try:
            safety_level = SafetyLevel(safety_str)
        except ValueError:
            logger.warning(f"Invalid safety_level '{safety_str}', defaulting to standard")
            safety_level = SafetyLevel.STANDARD
        self.constitutional_ai = ConstitutionalAI(safety_level)

        # Model providers
        self.model_providers: Dict[ModelProvider, LanguageModelAPI] = {}
        self._provider_errors: Dict[ModelProvider, str] = {}
        self._initialize_providers()
        self.active_provider = self._resolve_default_provider()

        # Architecture — read from flat keys or structured TransformerConfig
        self.transformer_layers = int(self._cfg('transformer_layers', structured=('transformer', 'layers'), default=24))
        self.d_model = int(self._cfg('d_model', structured=('transformer', 'd_model'), default=512))
        self.n_heads = int(self._cfg('n_heads', structured=('transformer', 'n_heads'), default=8))
        self.context_window = int(self._cfg('context_window', structured=('transformer', 'context_window'), default=8192))

        # State
        self.conversations: Dict[str, ConversationContext] = {}
        self.global_memory: Dict[str, Any] = {}
        self.metrics = TokenMetrics()

        # Session persistence
        self.session_store = SessionStore()

        # Context compression
        compression_cfg = config.get('compression', {})
        if hasattr(compression_cfg, '__dataclass_fields__'):
            from dataclasses import asdict
            compression_cfg = asdict(compression_cfg)
        elif not isinstance(compression_cfg, dict):
            compression_cfg = {}
        self.context_compressor = ContextCompressor(self, compression_cfg)

        # MCP integration
        mcp_cfg = config.get('mcp', {})
        if hasattr(mcp_cfg, '__dataclass_fields__'):
            from dataclasses import asdict
            mcp_cfg = asdict(mcp_cfg)
        elif not isinstance(mcp_cfg, dict):
            mcp_cfg = {}
        self.mcp_manager = MCPManager()
        self._mcp_config = mcp_cfg

        logger.info(
            f"Neural Assistant initialized with {self.transformer_layers} layers, "
            f"providers: {[p.value for p in self.model_providers]}"
        )

    def _cfg(self, flat_key: str, structured: Optional[Tuple[str, str]] = None,
             default: Any = None) -> Any:
        """Read a config value from flat dict OR structured NeuralAssistantConfig.__dict__.

        Handles both formats:
          - Flat: {'safety_level': 'standard', 'transformer_layers': 24, ...}
          - Structured: {'safety': SafetyConfig(safety_level='standard'),
                         'transformer': TransformerConfig(layers=24), ...}
        """
        # Try flat key first
        val = self.config.get(flat_key)
        if val is not None:
            return val

        # Try structured path
        if structured:
            section_key, attr_name = structured
            section = self.config.get(section_key)
            if section is not None:
                if hasattr(section, attr_name):
                    return getattr(section, attr_name)
                if isinstance(section, dict):
                    return section.get(attr_name, default)

        return default

    def _cfg_provider_key(self, provider_name: str, flat_key: str) -> Optional[str]:
        """Read a provider API key from flat dict, structured providers, or env vars."""
        # Flat config: config['openai_api_key']
        val = self.config.get(flat_key)
        if val:
            return val

        # Structured config: config['providers']['openai'].api_key
        providers = self.config.get('providers')
        if providers and isinstance(providers, dict):
            prov_cfg = providers.get(provider_name)
            if prov_cfg:
                key = getattr(prov_cfg, 'api_key', None) if hasattr(prov_cfg, 'api_key') else (
                    prov_cfg.get('api_key') if isinstance(prov_cfg, dict) else None
                )
                if key:
                    return key

        # Environment variable fallback
        env_map = {'openai': 'OPENAI_API_KEY', 'anthropic': 'ANTHROPIC_API_KEY',
                    'google': 'GOOGLE_API_KEY'}
        env_key = env_map.get(provider_name)
        if env_key:
            return os.environ.get(env_key)
        return None

    def _cfg_provider_model(self, provider_name: str, flat_key: str, default: str) -> str:
        """Read a provider model name from flat dict or structured providers."""
        val = self.config.get(flat_key)
        if val:
            return val

        providers = self.config.get('providers')
        if providers and isinstance(providers, dict):
            prov_cfg = providers.get(provider_name)
            if prov_cfg:
                model = getattr(prov_cfg, 'model_name', None) if hasattr(prov_cfg, 'model_name') else (
                    prov_cfg.get('model_name') if isinstance(prov_cfg, dict) else None
                )
                if model:
                    return model
        return default

    @staticmethod
    def _is_real_api_key(key: Optional[str]) -> bool:
        """Check if a key looks like a real API key (not a placeholder)."""
        if not key or len(key) < 10:
            return False
        placeholder_prefixes = ('your-', 'sk-placeholder', 'CHANGE_ME', 'xxx', 'test-key')
        return not any(key.lower().startswith(p.lower()) for p in placeholder_prefixes)

    def _initialize_providers(self):
        """Initialize all configured providers with real SDK clients."""
        # OpenAI
        openai_key = self._cfg_provider_key('openai', 'openai_api_key')
        if self._is_real_api_key(openai_key):
            try:
                self.model_providers[ModelProvider.OPENAI] = OpenAIProvider(
                    openai_key, self._cfg_provider_model('openai', 'openai_model', 'gpt-4')
                )
            except Exception as e:
                self._provider_errors[ModelProvider.OPENAI] = str(e)
                logger.warning(f"Failed to initialize OpenAI provider: {e}")

        # Anthropic
        anthropic_key = self._cfg_provider_key('anthropic', 'anthropic_api_key')
        if self._is_real_api_key(anthropic_key):
            try:
                self.model_providers[ModelProvider.ANTHROPIC] = AnthropicProvider(
                    anthropic_key, self._cfg_provider_model('anthropic', 'anthropic_model', 'claude-sonnet-4-20250514')
                )
            except Exception as e:
                self._provider_errors[ModelProvider.ANTHROPIC] = str(e)
                logger.warning(f"Failed to initialize Anthropic provider: {e}")

        # Google
        google_key = self._cfg_provider_key('google', 'google_api_key')
        if self._is_real_api_key(google_key):
            try:
                self.model_providers[ModelProvider.GOOGLE] = GoogleProvider(
                    google_key, self._cfg_provider_model('google', 'google_model', 'gemini-1.5-flash')
                )
            except Exception as e:
                self._provider_errors[ModelProvider.GOOGLE] = str(e)
                logger.warning(f"Failed to initialize Google provider: {e}")

        # Ollama — check flat key or structured providers
        ollama_enabled = self._cfg('ollama_enabled', default=None)
        if ollama_enabled is None:
            providers = self.config.get('providers', {})
            if isinstance(providers, dict) and 'ollama' in providers:
                prov = providers['ollama']
                ollama_enabled = getattr(prov, 'enabled', True) if hasattr(prov, 'enabled') else prov.get('enabled', True)
            else:
                ollama_enabled = True

        if ollama_enabled:
            ollama_url = self._cfg('ollama_url', default=None)
            if not ollama_url:
                providers = self.config.get('providers', {})
                if isinstance(providers, dict) and 'ollama' in providers:
                    prov = providers['ollama']
                    ollama_url = getattr(prov, 'base_url', None) if hasattr(prov, 'base_url') else prov.get('base_url')
            ollama_url = ollama_url or 'http://localhost:11434'

            ollama_model = self._cfg_provider_model('ollama', 'ollama_model', 'llama3.2')
            try:
                self.model_providers[ModelProvider.OLLAMA] = OllamaProvider(ollama_url, ollama_model)
            except Exception as e:
                self._provider_errors[ModelProvider.OLLAMA] = str(e)
                logger.warning(f"Failed to initialize Ollama provider: {e}")

        # Local LLM — direct in-process model loading
        local_enabled = self._cfg('local_enabled', default=None)
        if local_enabled is None:
            providers = self.config.get('providers', {})
            if isinstance(providers, dict) and 'local' in providers:
                prov = providers['local']
                local_enabled = getattr(prov, 'enabled', False) if hasattr(prov, 'enabled') else prov.get('enabled', False)
            else:
                local_enabled = False

        if local_enabled:
            local_model = self._cfg_provider_model('local', 'local_model', 'llama-3.2-3b')
            local_device = self._cfg('local_device', default='auto')
            local_cache_dir = self._cfg('local_cache_dir', default=None)
            local_n_ctx = int(self._cfg('local_n_ctx', default=4096))
            local_n_gpu_layers = int(self._cfg('local_n_gpu_layers', default=-1))
            try:
                self.model_providers[ModelProvider.LOCAL] = LocalLLMProvider(
                    model_name=local_model,
                    device=local_device,
                    cache_dir=local_cache_dir,
                    n_ctx=local_n_ctx,
                    n_gpu_layers=local_n_gpu_layers,
                )
            except Exception as e:
                self._provider_errors[ModelProvider.LOCAL] = str(e)
                logger.warning(f"Failed to initialize Local provider: {e}")

    def _resolve_default_provider(self) -> ModelProvider:
        """Pick the best available provider."""
        preferred = self._cfg('default_provider', default='local')
        try:
            pref = ModelProvider(preferred)
            if pref in self.model_providers:
                return pref
        except ValueError:
            pass

        # Fallback order
        for p in [ModelProvider.ANTHROPIC, ModelProvider.OPENAI, ModelProvider.GOOGLE,
                  ModelProvider.OLLAMA, ModelProvider.LOCAL]:
            if p in self.model_providers:
                return p
        return ModelProvider.LOCAL

    def _persist_session(self, session_id: str):
        """Write session to SQLite store."""
        ctx = self.conversations.get(session_id)
        if ctx:
            try:
                self.session_store.save_session(
                    session_id, ctx.messages, ctx.context_window,
                    ctx.token_count, ctx.created_at,
                )
            except Exception as e:
                logger.error(f"Failed to persist session {session_id}: {e}")

    def _restore_session(self, session_id: str) -> bool:
        """Load session from SQLite into memory. Returns True if found."""
        if session_id in self.conversations:
            return True
        try:
            data = self.session_store.load_session(session_id)
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
            return False
        if not data:
            return False
        self.conversations[session_id] = ConversationContext(
            session_id=session_id,
            messages=data['messages'],
            context_window=data['context_window'],
            token_count=data['token_count'],
        )
        return True

    async def start_conversation(self, user_id: str) -> str:
        session_id = f"session_{user_id}_{int(time.time())}"
        async with self._conversations_lock:
            self.conversations[session_id] = ConversationContext(
                session_id=session_id,
                context_window=self.context_window,
            )
        self._persist_session(session_id)
        logger.info(f"Started conversation session: {session_id}")
        return session_id

    async def process_message(self, session_id: str, message: str,
                              provider: Optional[ModelProvider] = None) -> Dict[str, Any]:
        start_time = time.time()
        self.metrics.total_requests += 1

        # Try to restore from persistent store if not in memory
        if session_id not in self.conversations:
            self._restore_session(session_id)

        if session_id not in self.conversations:
            user_id = session_id.split('_')[1] if '_' in session_id else session_id
            session_id = await self.start_conversation(user_id)

        context = self.conversations.get(session_id)
        if context is None:
            session_id = await self.start_conversation('recovered')
            context = self.conversations[session_id]
        async with self._conversations_lock:
            context.messages.append({
                'role': 'user',
                'content': message,
                'timestamp': datetime.now(),
            })

        # Safety evaluation
        safety_check = await self.constitutional_ai.evaluate_safety(message, "")
        if not safety_check['is_safe']:
            return self._create_safety_response(safety_check)

        # Handle /compact command
        if message.strip().lower() == '/compact':
            async with self._conversations_lock:
                messages_snapshot = list(context.messages)
            compressed_msgs, stats = await self.context_compressor.handle_compact_command(
                messages_snapshot, self.context_window
            )
            async with self._conversations_lock:
                context.messages = compressed_msgs
            return {
                'content': f"Context compressed: {stats['original_messages']} messages → {stats['compressed_messages']} messages. {stats['tokens_saved']} tokens saved.",
                'provider': 'system',
                'tokens_used': 0, 'input_tokens': 0, 'output_tokens': 0,
                'model': 'context_compressor',
                'safety_score': 1.0, 'finish_reason': 'stop',
                'processing_metadata': stats,
            }

        # Check for advanced capabilities (image gen, code exec)
        cap_result = await self.capabilities.process_message(message)
        if cap_result and cap_result.get('handled'):
            cap_response = {
                'content': cap_result.get('content', ''),
                'provider': cap_result.get('provider', 'capabilities'),
                'tokens_used': 0,
                'input_tokens': 0,
                'output_tokens': 0,
                'model': cap_result.get('provider', 'neural_assistant'),
                'safety_score': 1.0,
                'finish_reason': 'stop',
                'capability_type': cap_result.get('type'),
                'processing_metadata': {},
            }
            # Attach image data if present
            if cap_result.get('image_url'):
                cap_response['image_url'] = cap_result['image_url']
            if cap_result.get('image_base64'):
                cap_response['image_base64'] = cap_result['image_base64']
            # Attach code execution data if present
            if cap_result.get('type') == 'code_result':
                cap_response['code_output'] = cap_result.get('output', '')
                cap_response['code_error'] = cap_result.get('error', '')
                cap_response['execution_time'] = cap_result.get('execution_time', 0)
                cap_response['language'] = cap_result.get('language', '')

            processing_time = time.time() - start_time
            self.metrics.processing_time = 0.9 * self.metrics.processing_time + 0.1 * processing_time
            async with self._conversations_lock:
                context.messages.append({
                    'role': 'assistant',
                    'content': cap_response['content'],
                    'timestamp': datetime.now(),
                    'provider': cap_response['provider'],
                    'processing_time': processing_time,
                })
                context.last_activity = datetime.now()
            self._persist_session(session_id)
            return cap_response

        # Auto-compress context if threshold exceeded
        async with self._conversations_lock:
            should_compress = self.context_compressor.should_compress(context.messages, self.context_window)
            messages_snapshot = list(context.messages) if should_compress else None
        if should_compress:
            compressed_msgs, comp_meta = await self.context_compressor.compress(
                messages_snapshot, self.context_window
            )
            async with self._conversations_lock:
                context.messages = compressed_msgs
            logger.info(f"Auto-compressed context: {comp_meta.tokens_saved} tokens saved")

        # Cognitive processing
        cognitive_analysis = await self._cognitive_analysis(message, context)

        # Generate response with failover
        response_provider = provider or self.active_provider
        response_data = await self._generate_response_with_failover(
            message, context, response_provider, cognitive_analysis
        )

        # Post-process
        final_response = await self._post_process_response(response_data, context)

        processing_time = time.time() - start_time
        self.metrics.processing_time = 0.9 * self.metrics.processing_time + 0.1 * processing_time
        self.metrics.input_tokens += response_data.get('input_tokens', 0)
        self.metrics.output_tokens += response_data.get('output_tokens', 0)

        async with self._conversations_lock:
            context.messages.append({
                'role': 'assistant',
                'content': final_response['content'],
                'timestamp': datetime.now(),
                'provider': final_response['provider'],
                'processing_time': processing_time,
            })
            context.last_activity = datetime.now()

        self._persist_session(session_id)
        return final_response

    async def process_message_stream(self, session_id: str, message: str,
                                     provider: Optional[ModelProvider] = None) -> AsyncIterator[str]:
        """Stream a response token-by-token."""
        if session_id not in self.conversations:
            self._restore_session(session_id)
        if session_id not in self.conversations:
            user_id = session_id.split('_')[1] if '_' in session_id else session_id
            session_id = await self.start_conversation(user_id)

        context = self.conversations.get(session_id)
        if context is None:
            session_id = await self.start_conversation('recovered')
            context = self.conversations[session_id]
        async with self._conversations_lock:
            context.messages.append({'role': 'user', 'content': message, 'timestamp': datetime.now()})

        safety_check = await self.constitutional_ai.evaluate_safety(message, "")
        if not safety_check['is_safe']:
            yield "I cannot provide a response to that request as it may involve content that doesn't align with safety guidelines."
            return

        response_provider = provider or self.active_provider
        if response_provider not in self.model_providers:
            yield "No provider available for streaming. Please configure an API key."
            return

        api_provider = self.model_providers[response_provider]
        conversation_history = self._build_conversation_history(context)

        full_response = []
        async for token in api_provider.generate_stream(
            message,
            conversation_history=conversation_history,
            max_tokens=self._cfg('max_tokens', structured=('performance', 'max_tokens'), default=1000),
            temperature=self._cfg('temperature', default=0.7),
        ):
            full_response.append(token)
            yield token

        # Store complete response
        content = ''.join(full_response)
        async with self._conversations_lock:
            context.messages.append({
                'role': 'assistant',
                'content': content,
                'timestamp': datetime.now(),
                'provider': response_provider.value,
            })
            context.last_activity = datetime.now()
        self._persist_session(session_id)

    async def _cognitive_analysis(self, message: str, context: ConversationContext) -> Dict[str, Any]:
        analysis = await self.cognitive_core.process_input(
            input_data=message,
            context=context.messages[-5:],
            reasoning_type=ReasoningType.ANALYTICAL,
        )

        math_analysis = None
        if self._contains_mathematical_content(message):
            math_analysis = await self.math_core.analyze_mathematical_expression(message)

        return {
            'cognitive_analysis': analysis,
            'mathematical_analysis': math_analysis,
            'intent_classification': self._classify_intent(message),
            'context_relevance': self._calculate_context_relevance(message, context),
        }

    def _contains_mathematical_content(self, text: str) -> bool:
        math_patterns = [
            r'\d+\s*[+\-*/]\s*\d+',
            r'sqrt\(|sin\(|cos\(|tan\(',
            r'integral|derivative|limit',
            r'matrix|vector|equation',
        ]
        return any(re.search(pattern, text.lower()) for pattern in math_patterns)

    def _classify_intent(self, message: str) -> str:
        intent_patterns = {
            'question': r'^\s*(what|who|when|where|why|how|is|are|can|could|would)',
            'request': r'(please|can you|could you|would you|help me)',
            'command': r'(create|make|build|generate|write|code)',
            'conversation': r'(hello|hi|thanks|goodbye|bye)',
        }
        for intent, pattern in intent_patterns.items():
            if re.search(pattern, message.lower()):
                return intent
        return 'general'

    def _calculate_context_relevance(self, message: str, context: ConversationContext) -> float:
        if not context.messages:
            return 0.0
        message_words = set(message.lower().split())
        context_words = set()
        for msg in context.messages[-3:]:
            context_words.update(msg['content'].lower().split())
        if not context_words:
            return 0.0
        overlap = len(message_words & context_words)
        return min(1.0, overlap / max(1, len(message_words)))

    async def _generate_response_with_failover(
        self, message: str, context: ConversationContext,
        preferred_provider: ModelProvider, cognitive_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Try preferred provider, then failover to others."""
        providers_to_try = [preferred_provider]
        for p in self.model_providers:
            if p != preferred_provider:
                providers_to_try.append(p)

        last_error = None
        for provider in providers_to_try:
            if provider not in self.model_providers:
                continue
            try:
                return await self._generate_response(message, context, provider, cognitive_analysis)
            except Exception as e:
                last_error = e
                logger.warning(f"Provider {provider.value} failed, trying next: {e}")

        # All external providers failed; fall back to cognitive core
        logger.warning(f"All providers failed (last error: {last_error}); using cognitive fallback")
        return await self._generate_cognitive_response(message, cognitive_analysis)

    def _build_conversation_history(self, context: ConversationContext) -> List[Dict[str, str]]:
        """Build conversation history respecting compression and context window."""
        messages = context.messages[:-1]  # exclude the just-appended user message
        # If context was compressed, use all messages (they're already trimmed)
        # Otherwise, use last N as a safety cap
        max_history = max(20, self.context_compressor.config.get('recent_messages_to_keep', 10) * 2)
        history_slice = messages[-max_history:]
        return [{'role': msg['role'], 'content': msg['content']} for msg in history_slice]

    async def _generate_response(self, message: str, context: ConversationContext,
                                 provider: ModelProvider, cognitive_analysis: Dict[str, Any]) -> Dict[str, Any]:
        conversation_history = self._build_conversation_history(context)

        api_provider = self.model_providers[provider]
        response = await api_provider.generate_response(
            message,
            conversation_history=conversation_history,
            max_tokens=self._cfg('max_tokens', structured=('performance', 'max_tokens'), default=1000),
            temperature=self._cfg('temperature', default=0.7),
        )

        return {
            'content': response['response'],
            'provider': provider.value,
            'tokens_used': response.get('tokens_used', 0),
            'input_tokens': response.get('input_tokens', 0),
            'output_tokens': response.get('output_tokens', 0),
            'model': response.get('model', provider.value),
            'finish_reason': response.get('finish_reason', 'unknown'),
            'cognitive_enhancement': cognitive_analysis,
        }

    async def _generate_cognitive_response(self, message: str, analysis: Dict[str, Any]) -> Dict[str, Any]:
        cognitive_response = await self.cognitive_core.generate_response(
            input_text=message,
            analysis_data=analysis,
            reasoning_type=ReasoningType.CONVERSATIONAL,
        )
        return {
            'content': cognitive_response.get('response', 'I understand your message and am processing it.'),
            'provider': 'cognitive_core',
            'tokens_used': len(message.split()) + len(cognitive_response.get('response', '').split()),
            'input_tokens': len(message.split()),
            'output_tokens': len(cognitive_response.get('response', '').split()),
            'model': 'CognitiveBeeBot',
            'finish_reason': 'stop',
            'cognitive_enhancement': analysis,
        }

    async def _post_process_response(self, response_data: Dict[str, Any],
                                     context: ConversationContext) -> Dict[str, Any]:
        content = response_data['content']

        safety_check = await self.constitutional_ai.evaluate_safety("", content)
        if not safety_check['is_safe']:
            content = "I apologize, but I cannot provide that response as it may not align with safety guidelines."

        if response_data.get('cognitive_enhancement', {}).get('mathematical_analysis'):
            content = await self._verify_mathematical_content(content)

        return {
            'content': content,
            'provider': response_data['provider'],
            'tokens_used': response_data.get('tokens_used', 0),
            'input_tokens': response_data.get('input_tokens', 0),
            'output_tokens': response_data.get('output_tokens', 0),
            'model': response_data.get('model', ''),
            'safety_score': safety_check['safety_score'],
            'finish_reason': response_data.get('finish_reason', 'unknown'),
            'processing_metadata': {
                'cognitive_enhancement': response_data.get('cognitive_enhancement'),
                'safety_flags': safety_check.get('flags', []),
            },
        }

    async def _verify_mathematical_content(self, content: str) -> str:
        math_expressions = re.findall(r'\b\d+(?:\.\d+)?\s*[+\-*/]\s*\d+(?:\.\d+)?(?:\s*[+\-*/]\s*\d+(?:\.\d+)?)*\b', content)
        for expr in math_expressions:
            try:
                if len(expr) > 3:
                    result = await self.math_core.evaluate_expression(expr)
                    if result is not None:
                        content = content.replace(expr, f"{expr} = {result}", 1)
            except Exception:
                pass
        return content

    def _create_safety_response(self, safety_check: Dict[str, Any]) -> Dict[str, Any]:
        return {
            'content': "I cannot provide a response to that request as it may involve content that doesn't align with safety guidelines.",
            'provider': 'safety_filter',
            'tokens_used': 0,
            'input_tokens': 0,
            'output_tokens': 0,
            'model': 'constitutional_ai',
            'safety_score': safety_check['safety_score'],
            'finish_reason': 'safety_block',
            'processing_metadata': {
                'safety_flags': safety_check['flags'],
                'blocked_by_safety': True,
            },
        }

    async def switch_provider(self, session_id: str, provider: ModelProvider) -> bool:
        if provider in self.model_providers:
            async with self._conversations_lock:
                if session_id in self.conversations:
                    self.conversations[session_id].messages.append({
                        'role': 'system',
                        'content': f'Switched to {provider.value} provider',
                        'timestamp': datetime.now(),
                    })
                self.active_provider = provider
            logger.info(f"Switched to provider: {provider.value}")
            return True
        return False

    async def get_available_providers(self) -> List[str]:
        return [p.value for p in self.model_providers.keys()]

    async def get_conversation_history(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        if session_id not in self.conversations:
            self._restore_session(session_id)
        if session_id not in self.conversations:
            return []
        messages = self.conversations[session_id].messages[-limit:]
        return [
            {
                'role': msg['role'],
                'content': msg['content'],
                'timestamp': msg['timestamp'].isoformat() if isinstance(msg['timestamp'], datetime) else str(msg['timestamp']),
                'provider': msg.get('provider', 'unknown'),
            }
            for msg in messages
        ]

    async def optimize_performance(self) -> Dict[str, Any]:
        optimization_results = {}

        active_sessions = len(self.conversations)
        if active_sessions > 100:
            cutoff_time = datetime.now() - timedelta(hours=24)
            async with self._conversations_lock:
                old_sessions = [
                    sid for sid, conv in self.conversations.items()
                    if conv.last_activity < cutoff_time
                ]
                for sid in old_sessions:
                    del self.conversations[sid]
            optimization_results['cleaned_sessions'] = len(old_sessions)

        cognitive_optimization = await self.cognitive_core.optimize_performance()
        optimization_results['cognitive_optimization'] = cognitive_optimization

        math_optimization = await self.math_core.optimize_computational_efficiency()
        optimization_results['math_optimization'] = math_optimization

        return optimization_results

    async def get_system_status(self) -> Dict[str, Any]:
        provider_status = {}
        for p, api in self.model_providers.items():
            if hasattr(api, '_circuit'):
                provider_status[p.value] = {
                    'state': api._circuit.state,
                    'failures': api._circuit._failure_count,
                }
            else:
                provider_status[p.value] = {'state': 'unknown'}

        return {
            'active_sessions': len(self.conversations),
            'active_provider': self.active_provider.value,
            'available_providers': await self.get_available_providers(),
            'provider_health': provider_status,
            'provider_init_errors': {p.value: e for p, e in self._provider_errors.items()},
            'performance_metrics': {
                'avg_processing_time': self.metrics.processing_time,
                'total_tokens_processed': self.metrics.input_tokens + self.metrics.output_tokens,
                'total_requests': self.metrics.total_requests,
                'failed_requests': self.metrics.failed_requests,
                'memory_usage': self.metrics.memory_usage,
            },
            'cognitive_status': await self.cognitive_core.get_system_status(),
            'mathematical_status': await self.math_core.get_system_status(),
            'safety_level': self.constitutional_ai.safety_level.value,
            'capabilities': self.capabilities.get_status(),
        }


# ============================================================================
# NEURAL ASSISTANT API INTERFACE
# ============================================================================

class NeuralAssistantAPI:
    def __init__(self, neural_assistant: NeuralAssistant):
        self.assistant = neural_assistant

    async def chat(self, user_id: str, message: str,
                   session_id: Optional[str] = None,
                   provider: Optional[str] = None) -> Dict[str, Any]:
        try:
            if not session_id:
                session_id = await self.assistant.start_conversation(user_id)

            model_provider = None
            if provider and provider != 'cognitive_core':
                try:
                    model_provider = ModelProvider(provider)
                except ValueError:
                    pass

            response = await self.assistant.process_message(session_id, message, model_provider)

            result = {
                'success': True,
                'session_id': session_id,
                'response': response['content'],
                'metadata': {
                    'provider': response['provider'],
                    'model': response.get('model', ''),
                    'tokens_used': response.get('tokens_used', 0),
                    'input_tokens': response.get('input_tokens', 0),
                    'output_tokens': response.get('output_tokens', 0),
                    'safety_score': response.get('safety_score', 1.0),
                    'finish_reason': response.get('finish_reason', 'unknown'),
                    'processing_time': self.assistant.metrics.processing_time,
                },
            }
            # Pass through capability-specific fields
            if response.get('image_url'):
                result['image_url'] = response['image_url']
            if response.get('image_base64'):
                result['image_base64'] = response['image_base64']
            if response.get('capability_type'):
                result['capability_type'] = response['capability_type']
            if response.get('code_output') is not None:
                result['code_output'] = response['code_output']
            if response.get('code_error'):
                result['code_error'] = response['code_error']
            if response.get('execution_time'):
                result['execution_time'] = response['execution_time']
            if response.get('language'):
                result['language'] = response['language']
            return result
        except Exception as e:
            logger.error(f"Chat API error: {e}")
            self.assistant.metrics.failed_requests += 1
            return {'success': False, 'error': str(e), 'session_id': session_id}

    async def get_providers(self) -> Dict[str, Any]:
        providers = await self.assistant.get_available_providers()
        provider_details = {}
        for p_name in providers:
            try:
                p = ModelProvider(p_name)
                api = self.assistant.model_providers.get(p)
                if api and hasattr(api, '_circuit'):
                    provider_details[p_name] = {
                        'status': api._circuit.state,
                        'model': getattr(api, 'model', getattr(api, 'model_name', 'unknown')),
                    }
                else:
                    provider_details[p_name] = {'status': 'available'}
            except ValueError:
                provider_details[p_name] = {'status': 'available'}

        return {
            'success': True,
            'providers': providers,
            'provider_details': provider_details,
            'active_provider': self.assistant.active_provider.value,
        }

    async def switch_provider(self, session_id: str, provider: str) -> Dict[str, Any]:
        try:
            success = await self.assistant.switch_provider(session_id, ModelProvider(provider))
            return {
                'success': success,
                'provider': provider if success else self.assistant.active_provider.value,
                'message': f"Switched to {provider}" if success else f"Provider {provider} not available",
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def get_history(self, session_id: str, limit: int = 20) -> Dict[str, Any]:
        try:
            history = await self.assistant.get_conversation_history(session_id, limit)
            return {'success': True, 'history': history, 'session_id': session_id}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def system_status(self) -> Dict[str, Any]:
        try:
            status = await self.assistant.get_system_status()
            return {'success': True, 'status': status}
        except Exception as e:
            return {'success': False, 'error': str(e)}


# ============================================================================
# MULTIMODAL PROCESSING — REAL IMPLEMENTATIONS
# ============================================================================

class MultimodalProcessor:
    """Real file processing using PIL, PyPDF2, python-docx."""

    def __init__(self, neural_assistant: NeuralAssistant):
        self.assistant = neural_assistant
        self.supported_formats = {
            'text': ['.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.xml', '.yaml', '.yml',
                     '.ts', '.tsx', '.jsx', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.rb', '.php'],
            'image': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'],
            'document': ['.pdf', '.docx', '.xlsx', '.csv'],
            'audio': ['.wav', '.mp3', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
            'video': ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp'],
        }

    async def process_file(self, file_path: str, file_content: bytes) -> Dict[str, Any]:
        file_ext = '.' + file_path.lower().rsplit('.', 1)[-1] if '.' in file_path else ''

        for format_type, extensions in self.supported_formats.items():
            if file_ext in extensions:
                if format_type == 'text':
                    return await self._process_text_file(file_content)
                elif format_type in ('audio', 'video'):
                    return await self._process_audio_video_file(file_content, file_path, format_type)
                elif format_type == 'image':
                    return await self._process_image_file(file_content, file_ext)
                elif format_type == 'document':
                    return await self._process_document_file(file_content, file_ext)

        return {'success': False, 'error': f'Unsupported file format: {file_ext}', 'type': 'unknown'}

    async def _process_text_file(self, content: bytes) -> Dict[str, Any]:
        try:
            for encoding in ['utf-8', 'utf-16', 'latin-1', 'ascii']:
                try:
                    text_content = content.decode(encoding)
                    break
                except (UnicodeDecodeError, UnicodeError):
                    continue
            else:
                text_content = content.decode('utf-8', errors='replace')

            analysis = await self.assistant.cognitive_core.analyze_text_structure(text_content)
            return {
                'success': True,
                'type': 'text',
                'content': text_content,
                'analysis': analysis,
                'word_count': len(text_content.split()),
                'line_count': len(text_content.split('\n')),
                'char_count': len(text_content),
            }
        except Exception as e:
            return {'success': False, 'type': 'text', 'error': f'Text processing error: {e}'}

    async def _process_image_file(self, content: bytes, file_ext: str) -> Dict[str, Any]:
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(content))
            width, height = img.size
            mode = img.mode

            analysis = {
                'width': width,
                'height': height,
                'mode': mode,
                'format': img.format or file_ext.lstrip('.').upper(),
                'aspect_ratio': round(width / max(1, height), 2),
                'megapixels': round((width * height) / 1_000_000, 2),
            }

            # Extract EXIF data if available
            exif_data = {}
            if hasattr(img, '_getexif') and img._getexif():
                from PIL.ExifTags import TAGS
                raw_exif = img._getexif()
                for tag_id, value in raw_exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    if isinstance(value, (str, int, float)):
                        exif_data[str(tag)] = value
                analysis['exif'] = exif_data

            # OCR if pytesseract available
            try:
                import pytesseract
                text = pytesseract.image_to_string(img)
                if text.strip():
                    analysis['extracted_text'] = text.strip()
            except (ImportError, Exception):
                pass

            return {
                'success': True,
                'type': 'image',
                'size': len(content),
                'analysis': analysis,
            }
        except ImportError:
            return {
                'success': True,
                'type': 'image',
                'size': len(content),
                'analysis': {'note': 'PIL not installed; basic metadata only'},
            }
        except Exception as e:
            return {'success': False, 'type': 'image', 'error': f'Image processing error: {e}'}

    async def _process_document_file(self, content: bytes, file_ext: str) -> Dict[str, Any]:
        try:
            if file_ext == '.pdf':
                return await self._process_pdf(content)
            elif file_ext == '.docx':
                return await self._process_docx(content)
            elif file_ext == '.xlsx':
                return await self._process_xlsx(content)
            elif file_ext == '.csv':
                return await self._process_csv(content)
            return {'success': False, 'type': 'document', 'error': f'Unsupported document: {file_ext}'}
        except Exception as e:
            return {'success': False, 'type': 'document', 'error': f'Document processing error: {e}'}

    async def _process_pdf(self, content: bytes) -> Dict[str, Any]:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            pages = []
            full_text = []
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ''
                pages.append({'page': i + 1, 'text': text[:500], 'char_count': len(text)})
                full_text.append(text)

            combined = '\n'.join(full_text)
            return {
                'success': True,
                'type': 'document',
                'format': 'pdf',
                'page_count': len(reader.pages),
                'pages': pages[:20],
                'total_chars': len(combined),
                'word_count': len(combined.split()),
                'content_preview': combined[:2000],
            }
        except ImportError:
            return {'success': False, 'type': 'document', 'error': 'PyPDF2 not installed'}

    async def _process_docx(self, content: bytes) -> Dict[str, Any]:
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            combined = '\n'.join(paragraphs)
            return {
                'success': True,
                'type': 'document',
                'format': 'docx',
                'paragraph_count': len(paragraphs),
                'word_count': len(combined.split()),
                'content_preview': combined[:2000],
            }
        except ImportError:
            return {'success': False, 'type': 'document', 'error': 'python-docx not installed'}

    async def _process_xlsx(self, content: bytes) -> Dict[str, Any]:
        try:
            from openpyxl import load_workbook
            wb = load_workbook(io.BytesIO(content), read_only=True)
            sheets = {}
            for name in wb.sheetnames[:10]:
                ws = wb[name]
                rows = []
                for row in ws.iter_rows(max_row=50, values_only=True):
                    rows.append([str(c) if c is not None else '' for c in row])
                sheets[name] = {'row_count': ws.max_row, 'col_count': ws.max_column, 'preview': rows[:10]}
            return {
                'success': True,
                'type': 'document',
                'format': 'xlsx',
                'sheet_count': len(wb.sheetnames),
                'sheets': sheets,
            }
        except ImportError:
            return {'success': False, 'type': 'document', 'error': 'openpyxl not installed'}

    async def _process_csv(self, content: bytes) -> Dict[str, Any]:
        import csv
        text = content.decode('utf-8', errors='replace')
        reader = csv.reader(io.StringIO(text))
        rows = []
        for i, row in enumerate(reader):
            if i >= 100:
                break
            rows.append(row)
        return {
            'success': True,
            'type': 'document',
            'format': 'csv',
            'row_count': len(rows),
            'col_count': len(rows[0]) if rows else 0,
            'headers': rows[0] if rows else [],
            'preview': rows[:10],
        }

    async def _process_audio_video_file(self, content: bytes, filename: str,
                                         media_type: str) -> Dict[str, Any]:
        """Process audio/video files — extract metadata and auto-transcribe."""
        result = {
            'success': True,
            'type': media_type,
            'size': len(content),
            'filename': filename,
        }

        # Get media metadata via FFmpeg if available
        try:
            from neural_assistant_native_providers import NativeAudioProcessor
            processor = NativeAudioProcessor()
            if processor.ffmpeg_available:
                import tempfile
                tmp = tempfile.NamedTemporaryFile(
                    suffix=os.path.splitext(filename)[1] or '.tmp', delete=False
                )
                try:
                    tmp.write(content)
                    tmp.close()
                    from pathlib import Path
                    info = processor.get_media_info(Path(tmp.name))
                    if 'error' not in info:
                        result['analysis'] = info
                finally:
                    try:
                        os.unlink(tmp.name)
                    except OSError:
                        pass
        except ImportError:
            pass

        # Auto-transcribe if Whisper is available
        if hasattr(self.assistant, 'capabilities') and self.assistant.capabilities.transcription:
            trans = self.assistant.capabilities.transcription
            if trans.available:
                try:
                    transcription = await trans.transcribe(content, filename)
                    if transcription.get('success'):
                        result['transcription'] = {
                            'text': transcription['text'][:5000],
                            'language': transcription.get('language'),
                            'duration': transcription.get('duration'),
                            'word_count': transcription.get('word_count'),
                            'segment_count': transcription.get('segment_count'),
                            'model': transcription.get('model'),
                        }
                except Exception as e:
                    logger.warning(f"Auto-transcription failed: {e}")

        return result


# ============================================================================
# TOOL INTEGRATION LAYER — REAL IMPLEMENTATIONS
# ============================================================================

class ToolIntegration:
    """Real tool execution with safe sandboxing."""

    def __init__(self, neural_assistant: NeuralAssistant, permission_manager: ToolPermissionManager = None):
        self.assistant = neural_assistant
        self.permission_manager = permission_manager
        self.available_tools = {
            'code_analysis': {
                'description': 'Analyze code for syntax errors and patterns',
                'capabilities': ['syntax_check', 'pattern_detection', 'complexity_analysis'],
            },
            'file_management': {
                'description': 'Safe file reading operations',
                'capabilities': ['read'],
            },
            'mathematical_computation': {
                'description': 'Advanced mathematical calculations',
                'capabilities': ['expression_evaluation', 'equation_solving', 'statistics'],
            },
        }

    async def execute_tool(self, tool_name: str, parameters: Dict[str, Any], user: Optional[Dict] = None) -> Dict[str, Any]:
        # Permission check
        if self.permission_manager:
            perm = await self.permission_manager.pre_execute(tool_name, parameters, user)
            if not perm.allowed:
                return {'success': False, 'error': f'Permission denied: {perm.reason}'}

        if tool_name not in self.available_tools and not tool_name.startswith('mcp__'):
            return {'success': False, 'error': f'Tool {tool_name} not available'}

        try:
            # Route MCP tools to MCP manager
            if tool_name.startswith('mcp__') and hasattr(self.assistant, 'mcp_manager'):
                result = await self.assistant.mcp_manager.execute_tool(tool_name, parameters)
                mcp_result = {'success': True, 'result': result}
                if self.permission_manager:
                    await self.permission_manager.post_execute(tool_name, parameters, user, mcp_result)
                return mcp_result

            if tool_name == 'mathematical_computation':
                result = await self._execute_math_tool(parameters)
            elif tool_name == 'code_analysis':
                result = await self._execute_code_tool(parameters)
            elif tool_name == 'file_management':
                result = await self._execute_file_tool(parameters)
            else:
                result = {'success': False, 'error': f'Tool {tool_name} not implemented'}

            if self.permission_manager:
                await self.permission_manager.post_execute(tool_name, parameters, user, result)
            return result
        except Exception as e:
            result = {'success': False, 'error': f'Tool execution error: {e}'}
            if self.permission_manager:
                await self.permission_manager.post_execute(tool_name, parameters, user, result)
            return result

    async def _execute_math_tool(self, params: Dict[str, Any]) -> Dict[str, Any]:
        expression = params.get('expression', '')
        if not expression:
            return {'success': False, 'error': 'No expression provided'}

        operation = params.get('operation', 'evaluate')

        if operation == 'statistics' and 'data' in params:
            stats = await self.assistant.math_core.compute_statistics(params['data'])
            return {'success': True, 'result': stats, 'tool': 'mathematical_computation'}

        if operation == 'solve':
            result = await self.assistant.math_core.solve_equation(expression)
            return {'success': True, 'result': result, 'tool': 'mathematical_computation'}

        result = await self.assistant.math_core.evaluate_expression(expression)
        if result is not None:
            return {'success': True, 'result': result, 'expression': expression, 'tool': 'mathematical_computation'}
        return {'success': False, 'error': f'Could not evaluate: {expression}'}

    async def _execute_code_tool(self, params: Dict[str, Any]) -> Dict[str, Any]:
        code = params.get('code', '')
        language = params.get('language', 'python')

        if not code.strip():
            return {'success': False, 'error': 'No code provided'}

        analysis = {
            'language': language,
            'line_count': len(code.split('\n')),
            'char_count': len(code),
            'issues': [],
        }

        # Real Python syntax checking
        if language == 'python':
            try:
                import ast as ast_mod
                ast_mod.parse(code)
                analysis['syntax_valid'] = True
            except SyntaxError as e:
                analysis['syntax_valid'] = False
                analysis['issues'].append({
                    'type': 'syntax_error',
                    'line': e.lineno,
                    'offset': e.offset,
                    'message': str(e.msg),
                })

        # Basic pattern detection
        patterns_found = []
        if re.search(r'def\s+\w+', code):
            patterns_found.append('function_definitions')
        if re.search(r'class\s+\w+', code):
            patterns_found.append('class_definitions')
        if re.search(r'import\s+', code):
            patterns_found.append('imports')
        if re.search(r'(try|except|finally)', code):
            patterns_found.append('error_handling')
        if re.search(r'async\s+def', code):
            patterns_found.append('async_patterns')
        analysis['patterns'] = patterns_found

        # Complexity estimate
        branches = len(re.findall(r'\b(if|elif|else|for|while|try|except)\b', code))
        analysis['cyclomatic_complexity_estimate'] = branches + 1

        return {'success': True, 'analysis': analysis, 'tool': 'code_analysis'}

    async def _execute_file_tool(self, params: Dict[str, Any]) -> Dict[str, Any]:
        operation = params.get('operation', 'read')
        file_path = params.get('file_path', '')

        if not file_path:
            return {'success': False, 'error': 'No file path provided'}

        # Only allow read operations for safety
        if operation != 'read':
            return {'success': False, 'error': 'Only read operations are allowed'}

        # Prevent path traversal
        real_path = os.path.realpath(file_path)
        allowed_base = os.path.realpath(os.getcwd())
        if not (real_path == allowed_base or real_path.startswith(allowed_base + os.sep)):
            return {'success': False, 'error': 'Access denied: path outside allowed directory'}

        try:
            with open(real_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read(100_000)  # Max 100KB
            return {
                'success': True,
                'operation': 'read',
                'file_path': file_path,
                'content': content,
                'size': len(content),
                'tool': 'file_management',
            }
        except FileNotFoundError:
            return {'success': False, 'error': f'File not found: {file_path}'}
        except PermissionError:
            return {'success': False, 'error': f'Permission denied: {file_path}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}


# ============================================================================
# FACTORY & CONFIGURATION
# ============================================================================

class NeuralAssistantFactory:
    @staticmethod
    def create_default_config() -> Dict[str, Any]:
        return {
            'transformer_layers': 24,
            'd_model': 512,
            'n_heads': 8,
            'context_window': 8192,
            'max_tokens': 1000,
            'temperature': 0.7,
            'safety_level': 'standard',
            'default_provider': 'local',
            'ollama_enabled': True,
            'ollama_url': 'http://localhost:11434',
            'ollama_model': 'llama3.2',
        }

    @staticmethod
    def create_production_config() -> Dict[str, Any]:
        config = NeuralAssistantFactory.create_default_config()
        config.update({
            'transformer_layers': 32,
            'd_model': 768,
            'n_heads': 12,
            'context_window': 16384,
            'safety_level': 'strict',
        })
        return config

    @classmethod
    def create_neural_assistant(cls, config: Optional[Dict[str, Any]] = None) -> NeuralAssistant:
        if config is None:
            config = cls.create_default_config()
        return NeuralAssistant(config)


# ============================================================================
# EXTENSIONS
# ============================================================================

class NeuralAssistantExtensions:
    def __init__(self, neural_assistant: NeuralAssistant):
        self.assistant = neural_assistant
        self.multimodal = MultimodalProcessor(neural_assistant)
        # Tool permissions
        perm_cfg = neural_assistant.config.get('tool_permissions', {})
        if hasattr(perm_cfg, '__dataclass_fields__'):
            from dataclasses import asdict
            perm_cfg = asdict(perm_cfg)
        elif not isinstance(perm_cfg, dict):
            perm_cfg = {}
        self.permission_manager = ToolPermissionManager(perm_cfg)
        self.tools = ToolIntegration(neural_assistant, self.permission_manager)

    async def analyze_conversation_patterns(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.assistant.conversations:
            return {'error': 'Session not found'}

        context = self.assistant.conversations[session_id]
        messages = context.messages
        user_messages = [msg for msg in messages if msg['role'] == 'user']
        assistant_messages = [msg for msg in messages if msg['role'] == 'assistant']

        return {
            'total_messages': len(messages),
            'user_messages': len(user_messages),
            'assistant_messages': len(assistant_messages),
            'avg_user_length': float(np.mean([len(msg['content']) for msg in user_messages])) if user_messages else 0,
            'avg_assistant_length': float(np.mean([len(msg['content']) for msg in assistant_messages])) if assistant_messages else 0,
            'conversation_duration': (context.last_activity - context.created_at).total_seconds(),
            'topics_discussed': self._extract_conversation_topics(messages),
            'sentiment_trend': self._analyze_sentiment_trend(messages),
        }

    def _extract_conversation_topics(self, messages: List[Dict[str, Any]]) -> List[str]:
        all_text = ' '.join([msg['content'] for msg in messages])
        words = re.findall(r'\b[a-zA-Z]{4,}\b', all_text.lower())
        word_freq: Dict[str, int] = {}
        stop_words = {'that', 'this', 'with', 'from', 'your', 'have', 'will',
                       'been', 'about', 'would', 'could', 'should', 'they', 'them',
                       'their', 'there', 'were', 'what', 'when', 'where', 'which'}
        for word in words:
            if word not in stop_words:
                word_freq[word] = word_freq.get(word, 0) + 1

        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_words[:5] if freq > 1]

    def _analyze_sentiment_trend(self, messages: List[Dict[str, Any]]) -> str:
        positive_words = ['good', 'great', 'excellent', 'thank', 'perfect', 'amazing', 'helpful', 'awesome']
        negative_words = ['bad', 'terrible', 'awful', 'problem', 'error', 'wrong', 'broken', 'fail']
        sentiment_scores = []
        for msg in messages:
            if msg['role'] == 'user':
                content = msg['content'].lower()
                pos = sum(1 for w in positive_words if w in content)
                neg = sum(1 for w in negative_words if w in content)
                if pos + neg > 0:
                    sentiment_scores.append((pos - neg) / (pos + neg))
        if not sentiment_scores:
            return 'neutral'
        avg = float(np.mean(sentiment_scores))
        if avg > 0.2:
            return 'positive'
        elif avg < -0.2:
            return 'negative'
        return 'neutral'

    async def export_conversation(self, session_id: str, format: str = 'json') -> Dict[str, Any]:
        if session_id not in self.assistant.conversations:
            return {'error': 'Session not found'}

        context = self.assistant.conversations[session_id]

        if format == 'json':
            return {
                'session_id': session_id,
                'created_at': context.created_at.isoformat(),
                'last_activity': context.last_activity.isoformat(),
                'messages': [
                    {
                        'role': msg['role'],
                        'content': msg['content'],
                        'timestamp': msg['timestamp'].isoformat() if isinstance(msg['timestamp'], datetime) else str(msg['timestamp']),
                        'provider': msg.get('provider', 'unknown'),
                    }
                    for msg in context.messages
                ],
            }
        elif format == 'markdown':
            md = f"# Conversation Export\n\n**Session ID:** {session_id}\n**Created:** {context.created_at.isoformat()}\n\n"
            for msg in context.messages:
                role = "**User**" if msg['role'] == 'user' else "**Neural Assistant**"
                ts = msg['timestamp'].strftime("%H:%M:%S") if isinstance(msg['timestamp'], datetime) else str(msg['timestamp'])
                md += f"{role} ({ts}):\n{msg['content']}\n\n"
            return {'content': md, 'format': 'markdown'}
        return {'error': 'Unsupported format'}


# ============================================================================
# PERFORMANCE OPTIMIZATION
# ============================================================================

class PerformanceOptimizer:
    def __init__(self, neural_assistant: NeuralAssistant):
        self.assistant = neural_assistant

    async def optimize_attention_computation(self) -> Dict[str, Any]:
        return {
            'sparse_attention_enabled': self.assistant.context_window > 4096,
            'context_window': self.assistant.context_window,
            'status': 'optimized',
        }

    async def optimize_memory_usage(self) -> Dict[str, Any]:
        trimmed = 0
        async with self.assistant._conversations_lock:
            for session_id, context in self.assistant.conversations.items():
                if len(context.messages) > 100:
                    summary_text = await self._summarize_old_messages(context.messages[:-50])
                    context.messages = [
                        {'role': 'system', 'content': f'Previous conversation summary: {summary_text}',
                         'timestamp': context.created_at}
                    ] + context.messages[-50:]
                    trimmed += 1

        await self.assistant.cognitive_core.optimize_memory_usage()
        return {'sessions_trimmed': trimmed, 'status': 'optimized'}

    async def _summarize_old_messages(self, messages: List[Dict[str, Any]]) -> str:
        if not messages:
            return "No previous messages."
        topics = set()
        for msg in messages:
            if msg['role'] == 'user':
                words = msg['content'].split()
                topics.update(w for w in words if len(w) > 4 and w.isalpha())
        return f"Previous discussion covered: {', '.join(list(topics)[:10])}"


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

async def create_neural_assistant_deployment():
    """Create and initialize a fully ready Neural Assistant deployment.

    Returns a dict with the initialized neural_assistant, api, extensions,
    optimizer, and config.  All async initialization is performed before
    returning so the instance is ready for use.
    """
    config = NeuralAssistantFactory.create_production_config()
    neural_assistant = NeuralAssistant(config)
    await neural_assistant.cognitive_core.initialize()
    await neural_assistant.math_core.initialize()
    await neural_assistant.embedding_service.initialize()
    api = NeuralAssistantAPI(neural_assistant)
    extensions = NeuralAssistantExtensions(neural_assistant)
    optimizer = PerformanceOptimizer(neural_assistant)
    return {
        'neural_assistant': neural_assistant,
        'api': api,
        'extensions': extensions,
        'optimizer': optimizer,
        'config': config,
    }


async def main():
    config = NeuralAssistantFactory.create_default_config()
    neural_assistant = NeuralAssistantFactory.create_neural_assistant(config)
    await neural_assistant.cognitive_core.initialize()
    await neural_assistant.math_core.initialize()
    await neural_assistant.embedding_service.initialize()

    api = NeuralAssistantAPI(neural_assistant)

    session_id = await neural_assistant.start_conversation("user_001")

    print("Neural Assistant - Intelligent AI Chat System")
    print("=" * 50)
    print(f"Session ID: {session_id}")
    print(f"Active Provider: {neural_assistant.active_provider.value}")
    print(f"Available Providers: {', '.join(await neural_assistant.get_available_providers()) or 'cognitive_core (fallback)'}")
    print("Commands: /providers, /switch <provider>, /status, /help, /quit")
    print()

    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue

            if user_input.lower() in ['/quit', '/exit', '/bye']:
                print("Goodbye!")
                break
            elif user_input.lower() == '/providers':
                result = await api.get_providers()
                print(f"Providers: {result['providers'] or ['cognitive_core (fallback)']}")
                print(f"Active: {result['active_provider']}")
                if result.get('provider_details'):
                    for name, detail in result['provider_details'].items():
                        print(f"  {name}: {detail}")
                continue
            elif user_input.lower().startswith('/switch '):
                provider = user_input.split(' ', 1)[1]
                result = await api.switch_provider(session_id, provider)
                print(f"Result: {result['message']}")
                continue
            elif user_input.lower() == '/status':
                status = await api.system_status()
                if status['success']:
                    s = status['status']
                    print(f"Sessions: {s['active_sessions']}")
                    print(f"Provider: {s['active_provider']}")
                    print(f"Safety: {s['safety_level']}")
                    print(f"Requests: {s['performance_metrics']['total_requests']}")
                continue
            elif user_input.lower() == '/help':
                print("  /providers     - List providers")
                print("  /switch <name> - Switch provider")
                print("  /models        - Manage local models (list/pull/remove/info)")
                print("  /status        - System status")
                print("  /quit          - Exit")
                continue
            elif user_input.lower().startswith('/models'):
                parts = user_input.split()
                subcmd = parts[1] if len(parts) > 1 else 'list'
                manager = LocalModelManager()

                if subcmd == 'list':
                    cached = manager.list_models()
                    if cached:
                        print("Cached models:")
                        for m in cached:
                            print(f"  {m['name']}  ({m['size_gb']:.1f}GB)  backend={m['backend']}")
                    else:
                        print("No models cached. Use '/models pull <name>' to download one.")
                    print("\nAvailable models:")
                    for m in manager.list_available():
                        status = "cached" if m.get('cached') else f"{m['size_gb']:.1f}GB"
                        print(f"  {m['name']:20s} [{status:>7s}]  {m.get('description', '')}")

                elif subcmd == 'pull' and len(parts) > 2:
                    model_name = parts[2]
                    print(f"Pulling {model_name}... (this may take a while)")
                    try:
                        path = await manager.pull_model(model_name)
                        print(f"Downloaded to: {path}")
                    except ValueError as e:
                        print(f"Error: {e}")

                elif subcmd == 'remove' and len(parts) > 2:
                    model_name = parts[2]
                    if manager.remove_model(model_name):
                        print(f"Removed {model_name}")
                    else:
                        print(f"Model {model_name} not found in cache")

                elif subcmd == 'info' and len(parts) > 2:
                    model_name = parts[2]
                    info = manager.get_model_info(model_name)
                    if info:
                        for k, v in info.items():
                            print(f"  {k}: {v}")
                    else:
                        print(f"Unknown model: {model_name}")

                else:
                    print("Usage: /models list | /models pull <name> | /models remove <name> | /models info <name>")
                continue

            print("Processing...")
            result = await api.chat(user_id="user_001", message=user_input, session_id=session_id)

            if result['success']:
                print(f"\nNeural Assistant ({result['metadata']['provider']}):")
                print(result['response'])
                print(f"\n[tokens: {result['metadata']['tokens_used']} | "
                      f"safety: {result['metadata']['safety_score']:.2f} | "
                      f"time: {result['metadata']['processing_time']:.2f}s]")
                print()
            else:
                print(f"Error: {result['error']}")

        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}")

    await neural_assistant.cognitive_core.shutdown()
    await neural_assistant.math_core.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
