"""
Neural Assistant — Local LLM Provider

Direct in-process LLM inference without external servers.
Supports three backends:
  - PureGGUFBackend: GGUF files via pure Python+NumPy (no C dependencies, CPU)
  - LlamaCppBackend: GGUF files via llama-cpp-python (CPU + GPU, optional)
  - TransformersBackend: HuggingFace models via transformers + torch (GPU preferred)

Usage:
  provider = LocalLLMProvider(model_name="llama-3.2-3b", device="auto")
  response = await provider.generate_response("Hello!", max_tokens=200)
"""

import asyncio
import json
import logging
import shutil
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import numpy as np

try:
    import psutil
except ImportError:
    psutil = None

from neural_assistant_base import CircuitBreaker, LanguageModelAPI, retry_with_backoff

logger = logging.getLogger(__name__)


# ============================================================================
# MODEL REGISTRY
# ============================================================================

KNOWN_MODELS: Dict[str, Dict[str, Any]] = {
    # GGUF models (llama-cpp-python) — CPU-friendly, quantized
    "llama-3.2-1b": {
        "backend": "gguf",
        "repo": "bartowski/Llama-3.2-1B-Instruct-GGUF",
        "filename": "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        "size_gb": 0.8,
        "context": 8192,
        "description": "Llama 3.2 1B (Q4_K_M) — lightweight, fast",
    },
    "llama-3.2-3b": {
        "backend": "gguf",
        "repo": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "size_gb": 2.0,
        "context": 8192,
        "description": "Llama 3.2 3B (Q4_K_M) — balanced quality/speed",
    },
    "mistral-7b": {
        "backend": "gguf",
        "repo": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
        "filename": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "size_gb": 4.4,
        "context": 8192,
        "description": "Mistral 7B Instruct v0.2 (Q4_K_M)",
    },
    "phi-3-mini": {
        "backend": "gguf",
        "repo": "bartowski/Phi-3.5-mini-instruct-GGUF",
        "filename": "Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "size_gb": 2.3,
        "context": 4096,
        "description": "Phi 3.5 Mini (Q4_K_M) — compact, strong reasoning",
    },
    "qwen-2.5-3b": {
        "backend": "gguf",
        "repo": "Qwen/Qwen2.5-3B-Instruct-GGUF",
        "filename": "qwen2.5-3b-instruct-q4_k_m.gguf",
        "size_gb": 2.0,
        "context": 8192,
        "description": "Qwen 2.5 3B (Q4_K_M) — multilingual",
    },
    # HuggingFace Transformers models (GPU preferred)
    "llama-3.2-3b-hf": {
        "backend": "transformers",
        "repo": "meta-llama/Llama-3.2-3B-Instruct",
        "size_gb": 6.5,
        "context": 8192,
        "description": "Llama 3.2 3B (FP16, transformers) — requires GPU",
    },
    "phi-3-mini-hf": {
        "backend": "transformers",
        "repo": "microsoft/Phi-3.5-mini-instruct",
        "size_gb": 7.6,
        "context": 4096,
        "description": "Phi 3.5 Mini (FP16, transformers) — requires GPU",
    },
}


# ============================================================================
# ABSTRACT BACKEND
# ============================================================================

class LocalModelBackend(ABC):
    """Abstract interface for local model inference backends."""

    @abstractmethod
    async def load(self, model_path: str, device: str, **kwargs) -> None:
        """Load model into memory."""

    @abstractmethod
    async def generate(self, messages: List[Dict], max_tokens: int,
                       temperature: float) -> Dict[str, Any]:
        """Generate a complete response."""

    @abstractmethod
    async def generate_stream(self, messages: List[Dict], max_tokens: int,
                              temperature: float) -> AsyncIterator[str]:
        """Stream response tokens."""

    @abstractmethod
    def unload(self) -> None:
        """Free model from memory."""

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Whether a model is currently loaded."""

    @property
    @abstractmethod
    def model_info(self) -> Dict[str, Any]:
        """Return metadata about the loaded model."""


# ============================================================================
# LLAMA.CPP BACKEND
# ============================================================================

class LlamaCppBackend(LocalModelBackend):
    """GGUF model inference via llama-cpp-python. Works on CPU and GPU."""

    def __init__(self):
        self._model = None
        self._model_path: Optional[str] = None
        self._load_error: Optional[str] = None

    async def load(self, model_path: str, device: str, **kwargs) -> None:
        n_ctx = kwargs.get('n_ctx', 4096)
        n_gpu_layers = kwargs.get('n_gpu_layers', -1)

        if device == 'cpu':
            n_gpu_layers = 0

        loop = asyncio.get_event_loop()

        def _load():
            from llama_cpp import Llama
            return Llama(
                model_path=model_path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                verbose=False,
            )

        try:
            self._model = await loop.run_in_executor(None, _load)
            self._model_path = model_path
            logger.info(f"Loaded GGUF model: {model_path} (device={device}, n_ctx={n_ctx}, "
                        f"n_gpu_layers={n_gpu_layers})")
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"Failed to load GGUF model: {e}")
            raise

    async def generate(self, messages: List[Dict], max_tokens: int,
                       temperature: float) -> Dict[str, Any]:
        if not self._model:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_event_loop()

        def _infer():
            return self._model.create_chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=False,
            )

        result = await loop.run_in_executor(None, _infer)

        choice = result['choices'][0] if result.get('choices') else {}
        usage = result.get('usage', {})

        return {
            'response': choice.get('message', {}).get('content', ''),
            'model': result.get('model', self._model_path),
            'tokens_used': usage.get('total_tokens', 0),
            'input_tokens': usage.get('prompt_tokens', 0),
            'output_tokens': usage.get('completion_tokens', 0),
            'finish_reason': choice.get('finish_reason', 'stop'),
        }

    async def generate_stream(self, messages: List[Dict], max_tokens: int,
                              temperature: float) -> AsyncIterator[str]:
        if not self._model:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_event_loop()

        def _create_stream():
            return self._model.create_chat_completion(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
            )

        stream = await loop.run_in_executor(None, _create_stream)

        def _next_chunk(it):
            try:
                return next(it)
            except StopIteration:
                return None

        while True:
            chunk = await loop.run_in_executor(None, _next_chunk, stream)
            if chunk is None:
                break
            delta = chunk.get('choices', [{}])[0].get('delta', {})
            content = delta.get('content', '')
            if content:
                yield content

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
            self._model_path = None
            logger.info("GGUF model unloaded")

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def model_info(self) -> Dict[str, Any]:
        if not self._model:
            return {'loaded': False, 'error': self._load_error}
        return {
            'loaded': True,
            'backend': 'llama.cpp',
            'path': self._model_path,
            'n_ctx': self._model.n_ctx(),
        }


# ============================================================================
# TRANSFORMERS BACKEND
# ============================================================================

class TransformersBackend(LocalModelBackend):
    """HuggingFace transformers + torch backend. GPU preferred."""

    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._device: Optional[str] = None
        self._model_name: Optional[str] = None
        self._load_error: Optional[str] = None

    async def load(self, model_path: str, device: str, **kwargs) -> None:
        loop = asyncio.get_event_loop()

        def _load():
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            resolved_device = device
            if resolved_device == 'auto':
                resolved_device = 'cuda' if torch.cuda.is_available() else 'cpu'

            dtype = torch.float16 if resolved_device.startswith('cuda') else torch.float32

            # Check VRAM before loading on GPU
            if resolved_device.startswith('cuda') and torch.cuda.is_available():
                vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024 ** 3)
                if vram_gb < 4.0:
                    logger.warning(f"VRAM {vram_gb:.1f}GB may be insufficient, falling back to CPU")
                    resolved_device = 'cpu'
                    dtype = torch.float32

            tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=dtype,
                device_map=resolved_device if resolved_device.startswith('cuda') else None,
                trust_remote_code=True,
            )
            if not resolved_device.startswith('cuda'):
                model = model.to(resolved_device)

            return model, tokenizer, resolved_device

        try:
            self._model, self._tokenizer, self._device = await loop.run_in_executor(None, _load)
            self._model_name = model_path
            logger.info(f"Loaded transformers model: {model_path} on {self._device}")
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"Failed to load transformers model: {e}")
            raise

    async def generate(self, messages: List[Dict], max_tokens: int,
                       temperature: float) -> Dict[str, Any]:
        if not self._model or not self._tokenizer:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_event_loop()

        def _infer():
            import torch

            # Apply chat template if available, else join messages
            if hasattr(self._tokenizer, 'apply_chat_template'):
                input_text = self._tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True
                )
            else:
                input_text = "\n".join(
                    f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages
                )
                input_text += "\nassistant: "

            inputs = self._tokenizer(input_text, return_tensors="pt").to(self._model.device)
            input_len = inputs['input_ids'].shape[1]

            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=max(temperature, 0.01),
                    do_sample=temperature > 0,
                    pad_token_id=self._tokenizer.eos_token_id,
                )

            output_tokens = outputs[0][input_len:]
            response_text = self._tokenizer.decode(output_tokens, skip_special_tokens=True)
            output_len = len(output_tokens)

            return {
                'response': response_text,
                'model': self._model_name,
                'tokens_used': input_len + output_len,
                'input_tokens': input_len,
                'output_tokens': output_len,
                'finish_reason': 'stop',
            }

        return await loop.run_in_executor(None, _infer)

    async def generate_stream(self, messages: List[Dict], max_tokens: int,
                              temperature: float) -> AsyncIterator[str]:
        if not self._model or not self._tokenizer:
            raise RuntimeError("Model not loaded")

        import threading

        loop = asyncio.get_event_loop()
        queue = asyncio.Queue()

        def _stream_worker():
            try:
                import torch
                from transformers import TextIteratorStreamer

                if hasattr(self._tokenizer, 'apply_chat_template'):
                    input_text = self._tokenizer.apply_chat_template(
                        messages, tokenize=False, add_generation_prompt=True
                    )
                else:
                    input_text = "\n".join(
                        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages
                    )
                    input_text += "\nassistant: "

                inputs = self._tokenizer(input_text, return_tensors="pt").to(self._model.device)
                streamer = TextIteratorStreamer(
                    self._tokenizer, skip_prompt=True, skip_special_tokens=True
                )

                gen_kwargs = {
                    **inputs,
                    "max_new_tokens": max_tokens,
                    "temperature": max(temperature, 0.01),
                    "do_sample": temperature > 0,
                    "pad_token_id": self._tokenizer.eos_token_id,
                    "streamer": streamer,
                }

                thread = threading.Thread(
                    target=lambda: self._model.generate(**gen_kwargs),
                    daemon=True,
                )
                thread.start()

                for text in streamer:
                    if text:
                        asyncio.run_coroutine_threadsafe(queue.put(text), loop)

                thread.join(timeout=120)
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        await loop.run_in_executor(None, lambda: threading.Thread(
            target=_stream_worker, daemon=True
        ).start())

        while True:
            token = await queue.get()
            if token is None:
                break
            yield token

    def unload(self) -> None:
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None

        # Free GPU memory
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass

        self._model_name = None
        logger.info("Transformers model unloaded")

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def model_info(self) -> Dict[str, Any]:
        if not self._model:
            return {'loaded': False, 'error': self._load_error}
        return {
            'loaded': True,
            'backend': 'transformers',
            'model': self._model_name,
            'device': self._device,
        }


# ============================================================================
# MODEL MANAGER
# ============================================================================

class LocalModelManager:
    """Download, cache, list, and remove local LLM models."""

    DEFAULT_CACHE_DIR = Path.home() / ".cache" / "neural-assistant" / "models"

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or self.DEFAULT_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def list_available(self) -> List[Dict[str, Any]]:
        """List all known models with cache status."""
        result = []
        for name, info in KNOWN_MODELS.items():
            entry = {'name': name, **info}
            entry['cached'] = self._is_cached(name)
            result.append(entry)
        return result

    def list_models(self) -> List[Dict[str, Any]]:
        """List only cached (downloaded) models."""
        return [m for m in self.list_available() if m['cached']]

    def get_model_info(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get info for a known model."""
        info = KNOWN_MODELS.get(model_name)
        if not info:
            return None
        return {'name': model_name, **info, 'cached': self._is_cached(model_name)}

    def get_model_path(self, model_name: str) -> Optional[Path]:
        """Get local path for a cached model. Returns None if not cached."""
        info = KNOWN_MODELS.get(model_name)
        if not info:
            return None

        if info['backend'] == 'gguf':
            path = self.cache_dir / info['filename']
            return path if path.exists() else None
        else:
            # Transformers models cached by huggingface_hub
            try:
                from huggingface_hub import try_to_load_from_cache
                result = try_to_load_from_cache(info['repo'], "config.json")
                if result and isinstance(result, str):
                    return Path(result).parent
            except Exception:
                pass
            return None

    def resolve_model(self, model_name: str) -> Tuple[str, Optional[Path]]:
        """Return (backend_type, local_path_or_None) for a model."""
        info = KNOWN_MODELS.get(model_name)
        if not info:
            # Treat as direct path or HuggingFace repo
            path = Path(model_name)
            if path.exists():
                backend = 'gguf' if path.suffix == '.gguf' else 'transformers'
                return backend, path
            return 'transformers', None

        return info['backend'], self.get_model_path(model_name)

    async def pull_model(self, model_name: str,
                         progress_callback=None) -> Path:
        """Download a model. Returns local path."""
        info = KNOWN_MODELS.get(model_name)
        if not info:
            raise ValueError(
                f"Unknown model: {model_name}. "
                f"Available: {', '.join(KNOWN_MODELS.keys())}"
            )

        if info['backend'] == 'gguf':
            return await self._pull_gguf(info, progress_callback)
        else:
            return await self._pull_transformers(info, progress_callback)

    async def _pull_gguf(self, info: Dict, progress_callback) -> Path:
        """Download a GGUF file from HuggingFace."""
        from huggingface_hub import hf_hub_download

        loop = asyncio.get_event_loop()

        def _download():
            return hf_hub_download(
                repo_id=info['repo'],
                filename=info['filename'],
                local_dir=str(self.cache_dir),
                local_dir_use_symlinks=False,
            )

        logger.info(f"Downloading {info['repo']}/{info['filename']}...")
        path = await loop.run_in_executor(None, _download)
        logger.info(f"Downloaded to: {path}")
        return Path(path)

    async def _pull_transformers(self, info: Dict, progress_callback) -> Path:
        """Download a transformers model from HuggingFace."""
        loop = asyncio.get_event_loop()

        def _download():
            from huggingface_hub import snapshot_download
            return snapshot_download(repo_id=info['repo'])

        logger.info(f"Downloading {info['repo']}...")
        path = await loop.run_in_executor(None, _download)
        logger.info(f"Downloaded to: {path}")
        return Path(path)

    def remove_model(self, model_name: str) -> bool:
        """Remove a cached model. Returns True if removed."""
        info = KNOWN_MODELS.get(model_name)
        if not info:
            return False

        if info['backend'] == 'gguf':
            path = self.cache_dir / info['filename']
            if path.exists():
                path.unlink()
                logger.info(f"Removed GGUF model: {path}")
                return True
        else:
            path = self.get_model_path(model_name)
            if path and path.exists():
                shutil.rmtree(path, ignore_errors=True)
                logger.info(f"Removed transformers model: {path}")
                return True
        return False

    def _is_cached(self, model_name: str) -> bool:
        return self.get_model_path(model_name) is not None


# ============================================================================
# LOCAL LLM PROVIDER
# ============================================================================

class LocalLLMProvider(LanguageModelAPI):
    """Local LLM provider — loads and runs models directly in-process.

    Implements LanguageModelAPI for seamless integration with Neural Assistant's
    provider selection, failover, and switching systems.
    """

    def __init__(self, model_name: str = "llama-3.2-3b", device: str = "auto",
                 cache_dir: Optional[str] = None, n_ctx: int = 4096,
                 n_gpu_layers: int = -1):
        self.model_name = model_name
        self.model = model_name  # compatibility with provider detail views
        self._device = device
        self._n_ctx = n_ctx
        self._n_gpu_layers = n_gpu_layers
        self._circuit = CircuitBreaker(failure_threshold=3, recovery_timeout=30.0)
        self._backend: Optional[LocalModelBackend] = None
        self._manager = LocalModelManager(Path(cache_dir) if cache_dir else None)
        self._loaded = False
        self._load_lock = asyncio.Lock()

    def _resolve_device(self) -> str:
        """Auto-detect best available device."""
        if self._device != 'auto':
            return self._device
        try:
            import torch
            if torch.cuda.is_available():
                return 'cuda'
        except ImportError:
            pass
        return 'cpu'

    async def _ensure_loaded(self) -> None:
        """Lazy-load model on first inference. Thread-safe via asyncio.Lock."""
        if self._loaded:
            return

        async with self._load_lock:
            if self._loaded:
                return

            backend_type, model_path = self._manager.resolve_model(self.model_name)

            # Auto-download if not cached
            if model_path is None:
                info = KNOWN_MODELS.get(self.model_name)
                if info:
                    logger.info(f"Model '{self.model_name}' not cached. Downloading...")
                    model_path = await self._manager.pull_model(self.model_name)
                else:
                    # Assume it's a HuggingFace repo ID — transformers will download
                    model_path = Path(self.model_name)
                    backend_type = 'transformers'

            # Select backend — prefer pure Python GGUF (no C deps)
            if backend_type == 'gguf':
                try:
                    from gguf_engine import PureGGUFBackend
                    self._backend = PureGGUFBackend()
                    logger.info("Using PureGGUFBackend (pure Python+NumPy)")
                except ImportError:
                    self._backend = LlamaCppBackend()
                    logger.info("Using LlamaCppBackend (llama-cpp-python)")
            else:
                self._backend = TransformersBackend()

            device = self._resolve_device()

            # Check available memory
            self._check_memory(device)

            await self._backend.load(
                str(model_path),
                device,
                n_ctx=self._n_ctx,
                n_gpu_layers=self._n_gpu_layers,
            )
            self._loaded = True
            logger.info(f"Local provider ready: {self.model_name} on {device}")

    def _check_memory(self, device: str) -> None:
        """Warn if available memory seems insufficient."""
        info = KNOWN_MODELS.get(self.model_name)
        if not info:
            return

        required_gb = info.get('size_gb', 0)

        if device.startswith('cuda'):
            try:
                import torch
                vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024 ** 3)
                if vram_gb < required_gb * 1.2:
                    logger.warning(
                        f"VRAM {vram_gb:.1f}GB may be tight for {self.model_name} "
                        f"({required_gb}GB). Consider using device='cpu'."
                    )
            except Exception:
                pass
        else:
            ram_gb = psutil.virtual_memory().available / (1024 ** 3) if psutil else None
            if ram_gb is not None and ram_gb < required_gb * 1.5:
                logger.warning(
                    f"Available RAM {ram_gb:.1f}GB may be tight for {self.model_name} "
                    f"({required_gb}GB)."
                )

    async def generate_response(self, prompt: str, **kwargs) -> Dict[str, Any]:
        """Generate a response from the local model."""
        if self._circuit.is_open:
            raise ConnectionError(
                f"Local provider circuit breaker open (state={self._circuit.state})"
            )

        await self._ensure_loaded()

        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]
        max_tokens = kwargs.get('max_tokens', 1000)
        temperature = kwargs.get('temperature', 0.7)

        async def _call():
            return await self._backend.generate(messages, max_tokens, temperature)

        try:
            result = await retry_with_backoff(_call, max_retries=1, base_delay=1.0)
            self._circuit.record_success()
            return result
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"Local LLM error: {e}")
            raise

    async def generate_stream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """Stream response tokens from the local model."""
        if self._circuit.is_open:
            raise ConnectionError(
                f"Local provider circuit breaker open (state={self._circuit.state})"
            )

        await self._ensure_loaded()

        conversation_history = kwargs.get('conversation_history', [])
        messages = list(conversation_history) + [{"role": "user", "content": prompt}]
        max_tokens = kwargs.get('max_tokens', 1000)
        temperature = kwargs.get('temperature', 0.7)

        try:
            async for token in self._backend.generate_stream(messages, max_tokens, temperature):
                yield token
            self._circuit.record_success()
        except Exception as e:
            self._circuit.record_failure()
            logger.error(f"Local LLM stream error: {e}")
            raise

    async def get_embeddings(self, text: str) -> np.ndarray:
        """Embeddings are handled by the separate EmbeddingService.

        This raises NotImplementedError to signal callers to use
        EmbeddingService instead, which supports sentence-transformers
        with TF-IDF fallback.
        """
        raise NotImplementedError(
            "Local LLM provider does not generate embeddings. "
            "Use EmbeddingService (sentence-transformers) instead."
        )

    def unload_model(self) -> None:
        """Free model from memory."""
        if self._backend:
            self._backend.unload()
        self._loaded = False
        logger.info(f"Local model '{self.model_name}' unloaded")

    @property
    def provider_info(self) -> Dict[str, Any]:
        """Return provider status and model details."""
        info = {
            'provider': 'local',
            'model_name': self.model_name,
            'device': self._resolve_device(),
            'loaded': self._loaded,
            'circuit_state': self._circuit.state,
        }
        if self._backend and self._backend.is_loaded:
            info.update(self._backend.model_info)
        return info
