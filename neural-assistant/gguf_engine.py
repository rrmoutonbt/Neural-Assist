"""
Pure Python GGUF Inference Engine
=================================
Self-contained Llama-architecture transformer inference using only Python + NumPy.
No llama-cpp-python, no PyTorch, no external C dependencies.

Supports:
- GGUF v2/v3 file parsing with mmap
- Q4_0, Q8_0, F16, F32 dequantization (vectorized)
- Byte-level BPE tokenizer (Llama 3 style)
- Full Llama transformer forward pass with KV cache
- RoPE with Llama 3 frequency scaling
- Grouped Query Attention (GQA)
- SwiGLU feed-forward
- Temperature, top-k, top-p sampling with repetition penalty

Usage:
    from gguf_engine import PureGGUFBackend
    backend = PureGGUFBackend()
    await backend.load("model.gguf", device="cpu", n_ctx=4096)
    result = await backend.generate([{"role": "user", "content": "Hello"}], max_tokens=100, temperature=0.7)
"""

import asyncio
import logging
import math
import mmap
import os
import re
import struct
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Try to import the ABC from local provider (for type checking)
try:
    from neural_assistant_local_provider import LocalModelBackend
except ImportError:
    # Standalone usage — define a minimal ABC
    from abc import ABC, abstractmethod

    class LocalModelBackend(ABC):
        @abstractmethod
        async def load(self, model_path: str, device: str, **kwargs) -> None: ...
        @abstractmethod
        async def generate(self, messages: List[Dict], max_tokens: int, temperature: float) -> Dict[str, Any]: ...
        @abstractmethod
        async def generate_stream(self, messages: List[Dict], max_tokens: int, temperature: float) -> AsyncIterator[str]: ...
        @abstractmethod
        def unload(self) -> None: ...
        @property
        @abstractmethod
        def is_loaded(self) -> bool: ...
        @property
        @abstractmethod
        def model_info(self) -> Dict[str, Any]: ...


# ============================================================================
# GGUF CONSTANTS
# ============================================================================

GGUF_MAGIC = 0x46554747  # "GGUF" in little-endian

# Metadata value types
GGUF_TYPE_UINT8 = 0
GGUF_TYPE_INT8 = 1
GGUF_TYPE_UINT16 = 2
GGUF_TYPE_INT16 = 3
GGUF_TYPE_UINT32 = 4
GGUF_TYPE_INT32 = 5
GGUF_TYPE_FLOAT32 = 6
GGUF_TYPE_BOOL = 7
GGUF_TYPE_STRING = 8
GGUF_TYPE_ARRAY = 9
GGUF_TYPE_UINT64 = 10
GGUF_TYPE_INT64 = 11
GGUF_TYPE_FLOAT64 = 12

# GGML quantization types
GGML_TYPE_F32 = 0
GGML_TYPE_F16 = 1
GGML_TYPE_Q4_0 = 2
GGML_TYPE_Q4_1 = 3
GGML_TYPE_Q5_0 = 6
GGML_TYPE_Q5_1 = 7
GGML_TYPE_Q8_0 = 8
GGML_TYPE_Q8_1 = 9

# Block sizes: (bytes_per_block, elements_per_block)
GGML_BLOCK_INFO = {
    GGML_TYPE_F32: (4, 1),
    GGML_TYPE_F16: (2, 1),
    GGML_TYPE_Q4_0: (18, 32),
    GGML_TYPE_Q4_1: (20, 32),
    GGML_TYPE_Q5_0: (22, 32),
    GGML_TYPE_Q5_1: (24, 32),
    GGML_TYPE_Q8_0: (34, 32),
    GGML_TYPE_Q8_1: (36, 32),
}

GGML_TYPE_NAMES = {
    0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1",
    6: "Q5_0", 7: "Q5_1", 8: "Q8_0", 9: "Q8_1",
}


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class TensorInfo:
    """Metadata about a tensor stored in the GGUF file."""
    name: str
    shape: Tuple[int, ...]
    dtype_id: int
    dtype_name: str
    offset: int          # relative to tensor data section start
    nbytes: int          # total bytes of tensor data


# ============================================================================
# GGUF PARSER
# ============================================================================

class GGUFParser:
    """Parse GGUF binary files and memory-map tensor data."""

    def __init__(self):
        self.metadata: Dict[str, Any] = {}
        self.tensors: Dict[str, TensorInfo] = {}
        self._mmap: Optional[mmap.mmap] = None
        self._file = None
        self._version: int = 3
        self._data_offset: int = 0

    def parse(self, path: str) -> None:
        """Parse a GGUF file: header, metadata, tensor info, then mmap data."""
        self._file = open(path, 'rb')
        f = self._file

        # Header (24 bytes)
        magic = struct.unpack('<I', f.read(4))[0]
        if magic != GGUF_MAGIC:
            raise ValueError(f"Not a GGUF file (magic: 0x{magic:08X}, expected 0x{GGUF_MAGIC:08X})")

        version = struct.unpack('<I', f.read(4))[0]
        if version not in (1, 2, 3):
            raise ValueError(f"Unsupported GGUF version: {version}")
        self._version = version

        if version == 1:
            # v1 uses uint32 for counts and string lengths
            n_tensors = struct.unpack('<I', f.read(4))[0]
            n_kv = struct.unpack('<I', f.read(4))[0]
        else:
            # v2/v3 use uint64
            n_tensors = struct.unpack('<Q', f.read(8))[0]
            n_kv = struct.unpack('<Q', f.read(8))[0]

        logger.info(f"GGUF v{version}: {n_tensors} tensors, {n_kv} metadata entries")

        # Metadata KV pairs
        for _ in range(n_kv):
            key, value = self._read_kv(f)
            self.metadata[key] = value

        # Tensor info entries
        for _ in range(n_tensors):
            info = self._read_tensor_info(f)
            self.tensors[info.name] = info

        # Align to tensor data section
        alignment = self.metadata.get('general.alignment', 32)
        pos = f.tell()
        pad = (alignment - (pos % alignment)) % alignment
        self._data_offset = pos + pad

        # Memory-map the entire file
        f.seek(0)
        self._mmap = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)

        arch = self.metadata.get('general.architecture', 'unknown')
        name = self.metadata.get('general.name', 'unknown')
        logger.info(f"GGUF loaded: {name} (arch={arch}, tensors={len(self.tensors)})")

    def get_tensor_data(self, name: str) -> np.ndarray:
        """Get raw bytes of a tensor as a uint8 numpy array (zero-copy view into mmap)."""
        info = self.tensors[name]
        start = self._data_offset + info.offset
        return np.ndarray(shape=(info.nbytes,), dtype=np.uint8,
                          buffer=self._mmap, offset=start)

    def close(self):
        """Release mmap and file handle."""
        if self._mmap:
            self._mmap.close()
            self._mmap = None
        if self._file:
            self._file.close()
            self._file = None

    # -- Internal parsing methods --

    def _read_kv(self, f) -> Tuple[str, Any]:
        key = self._read_string(f)
        vtype = struct.unpack('<I', f.read(4))[0]
        value = self._read_value(f, vtype)
        return key, value

    def _read_value(self, f, vtype: int) -> Any:
        if vtype == GGUF_TYPE_UINT8:
            return struct.unpack('<B', f.read(1))[0]
        elif vtype == GGUF_TYPE_INT8:
            return struct.unpack('<b', f.read(1))[0]
        elif vtype == GGUF_TYPE_UINT16:
            return struct.unpack('<H', f.read(2))[0]
        elif vtype == GGUF_TYPE_INT16:
            return struct.unpack('<h', f.read(2))[0]
        elif vtype == GGUF_TYPE_UINT32:
            return struct.unpack('<I', f.read(4))[0]
        elif vtype == GGUF_TYPE_INT32:
            return struct.unpack('<i', f.read(4))[0]
        elif vtype == GGUF_TYPE_FLOAT32:
            return struct.unpack('<f', f.read(4))[0]
        elif vtype == GGUF_TYPE_BOOL:
            return bool(struct.unpack('<B', f.read(1))[0])
        elif vtype == GGUF_TYPE_STRING:
            return self._read_string(f)
        elif vtype == GGUF_TYPE_ARRAY:
            elem_type = struct.unpack('<I', f.read(4))[0]
            count = struct.unpack('<Q', f.read(8))[0]
            return [self._read_value(f, elem_type) for _ in range(count)]
        elif vtype == GGUF_TYPE_UINT64:
            return struct.unpack('<Q', f.read(8))[0]
        elif vtype == GGUF_TYPE_INT64:
            return struct.unpack('<q', f.read(8))[0]
        elif vtype == GGUF_TYPE_FLOAT64:
            return struct.unpack('<d', f.read(8))[0]
        else:
            raise ValueError(f"Unknown GGUF value type: {vtype}")

    def _read_string(self, f) -> str:
        if self._version == 1:
            length = struct.unpack('<I', f.read(4))[0]
        else:
            length = struct.unpack('<Q', f.read(8))[0]
        return f.read(length).decode('utf-8')

    def _read_tensor_info(self, f) -> TensorInfo:
        name = self._read_string(f)
        n_dims = struct.unpack('<I', f.read(4))[0]
        # Dimensions are stored in reverse (column-major) order
        dims = [struct.unpack('<Q', f.read(8))[0] for _ in range(n_dims)]
        dims.reverse()  # Convert to row-major
        dtype_id = struct.unpack('<I', f.read(4))[0]
        offset = struct.unpack('<Q', f.read(8))[0]

        dtype_name = GGML_TYPE_NAMES.get(dtype_id, f"type_{dtype_id}")

        # Compute total bytes
        n_elements = 1
        for d in dims:
            n_elements *= d

        if dtype_id in GGML_BLOCK_INFO:
            bytes_per_block, elems_per_block = GGML_BLOCK_INFO[dtype_id]
            n_blocks = (n_elements + elems_per_block - 1) // elems_per_block
            nbytes = n_blocks * bytes_per_block
        else:
            # Unknown type — estimate 2 bytes per element (conservative)
            nbytes = n_elements * 2
            logger.warning(f"Unknown quant type {dtype_id} for tensor {name}, estimating size")

        return TensorInfo(
            name=name, shape=tuple(dims), dtype_id=dtype_id,
            dtype_name=dtype_name, offset=offset, nbytes=nbytes,
        )


# ============================================================================
# DEQUANTIZER
# ============================================================================

class GGUFDequantizer:
    """Dequantize GGUF tensor data to float32. Fully vectorized with NumPy."""

    @staticmethod
    def dequantize(raw: np.ndarray, dtype_id: int, shape: Tuple[int, ...]) -> np.ndarray:
        """Dispatch to the appropriate dequantization routine."""
        if dtype_id == GGML_TYPE_F32:
            return GGUFDequantizer._f32(raw, shape)
        elif dtype_id == GGML_TYPE_F16:
            return GGUFDequantizer._f16(raw, shape)
        elif dtype_id == GGML_TYPE_Q4_0:
            return GGUFDequantizer._q4_0(raw, shape)
        elif dtype_id == GGML_TYPE_Q4_1:
            return GGUFDequantizer._q4_1(raw, shape)
        elif dtype_id == GGML_TYPE_Q8_0:
            return GGUFDequantizer._q8_0(raw, shape)
        elif dtype_id == GGML_TYPE_Q5_0:
            return GGUFDequantizer._q5_0(raw, shape)
        elif dtype_id == GGML_TYPE_Q5_1:
            return GGUFDequantizer._q5_1(raw, shape)
        else:
            raise ValueError(f"Unsupported quantization type: {GGML_TYPE_NAMES.get(dtype_id, dtype_id)}")

    @staticmethod
    def _f32(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        return raw.view(np.float32).reshape(shape).copy()

    @staticmethod
    def _f16(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        return raw.view(np.float16).astype(np.float32).reshape(shape)

    @staticmethod
    def _q4_0(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        """Q4_0: 18 bytes/block → 32 float32 weights.
        Layout: [fp16 scale (2B)] [16 bytes packed nibbles]
        Each nibble is unsigned 4-bit; subtract 8 for signed range.
        """
        blocks = raw.reshape(-1, 18)
        # Extract scales (fp16 → fp32)
        scales = blocks[:, :2].copy().view(np.float16).ravel().astype(np.float32)
        # Extract nibbles
        qbytes = blocks[:, 2:]  # (n_blocks, 16)
        lo = (qbytes & 0x0F).astype(np.float32) - 8.0
        hi = (qbytes >> 4).astype(np.float32) - 8.0
        # Interleave: each byte gives lo then hi
        weights = np.empty((blocks.shape[0], 32), dtype=np.float32)
        weights[:, :16] = lo
        weights[:, 16:] = hi
        weights *= scales[:, np.newaxis]
        n_elements = 1
        for d in shape:
            n_elements *= d
        return weights.ravel()[:n_elements].reshape(shape)

    @staticmethod
    def _q4_1(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        """Q4_1: 20 bytes/block → 32 float32 weights.
        Layout: [fp16 scale (2B)] [fp16 min (2B)] [16 bytes packed nibbles]
        Unsigned range shifted by min.
        """
        blocks = raw.reshape(-1, 20)
        scales = blocks[:, :2].copy().view(np.float16).ravel().astype(np.float32)
        mins = blocks[:, 2:4].copy().view(np.float16).ravel().astype(np.float32)
        qbytes = blocks[:, 4:]
        lo = (qbytes & 0x0F).astype(np.float32)
        hi = (qbytes >> 4).astype(np.float32)
        weights = np.empty((blocks.shape[0], 32), dtype=np.float32)
        weights[:, :16] = lo
        weights[:, 16:] = hi
        weights = mins[:, np.newaxis] + scales[:, np.newaxis] * weights
        n_elements = 1
        for d in shape:
            n_elements *= d
        return weights.ravel()[:n_elements].reshape(shape)

    @staticmethod
    def _q5_0(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        """Q5_0: 22 bytes/block → 32 float32 weights.
        Layout: [fp16 scale (2B)] [uint32 high_bits (4B)] [16 bytes nibbles]
        """
        blocks = raw.reshape(-1, 22)
        scales = blocks[:, :2].copy().view(np.float16).ravel().astype(np.float32)
        # High bits: 1 bit per weight, packed in uint32
        qh = blocks[:, 2:6].copy().view(np.uint32).ravel()
        qbytes = blocks[:, 6:]
        lo = (qbytes & 0x0F).astype(np.uint8)
        hi = (qbytes >> 4).astype(np.uint8)
        nibbles = np.empty((blocks.shape[0], 32), dtype=np.uint8)
        nibbles[:, :16] = lo
        nibbles[:, 16:] = hi
        # Extract 5th bit
        high = np.zeros((blocks.shape[0], 32), dtype=np.uint8)
        for b in range(32):
            high[:, b] = ((qh >> b) & 1).astype(np.uint8)
        five_bit = (high << 4) | nibbles
        weights = scales[:, np.newaxis] * (five_bit.astype(np.float32) - 16.0)
        n_elements = 1
        for d in shape:
            n_elements *= d
        return weights.ravel()[:n_elements].reshape(shape)

    @staticmethod
    def _q5_1(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        """Q5_1: 24 bytes/block → 32 float32 weights."""
        blocks = raw.reshape(-1, 24)
        scales = blocks[:, :2].copy().view(np.float16).ravel().astype(np.float32)
        mins = blocks[:, 2:4].copy().view(np.float16).ravel().astype(np.float32)
        qh = blocks[:, 4:8].copy().view(np.uint32).ravel()
        qbytes = blocks[:, 8:]
        lo = (qbytes & 0x0F).astype(np.uint8)
        hi = (qbytes >> 4).astype(np.uint8)
        nibbles = np.empty((blocks.shape[0], 32), dtype=np.uint8)
        nibbles[:, :16] = lo
        nibbles[:, 16:] = hi
        high = np.zeros((blocks.shape[0], 32), dtype=np.uint8)
        for b in range(32):
            high[:, b] = ((qh >> b) & 1).astype(np.uint8)
        five_bit = (high << 4) | nibbles
        weights = mins[:, np.newaxis] + scales[:, np.newaxis] * five_bit.astype(np.float32)
        n_elements = 1
        for d in shape:
            n_elements *= d
        return weights.ravel()[:n_elements].reshape(shape)

    @staticmethod
    def _q8_0(raw: np.ndarray, shape: Tuple[int, ...]) -> np.ndarray:
        """Q8_0: 34 bytes/block → 32 float32 weights.
        Layout: [fp16 scale (2B)] [32 int8 values]
        """
        blocks = raw.reshape(-1, 34)
        scales = blocks[:, :2].copy().view(np.float16).ravel().astype(np.float32)
        qs = blocks[:, 2:].copy().view(np.int8).reshape(-1, 32).astype(np.float32)
        weights = scales[:, np.newaxis] * qs
        n_elements = 1
        for d in shape:
            n_elements *= d
        return weights.ravel()[:n_elements].reshape(shape)


# ============================================================================
# BPE TOKENIZER
# ============================================================================

class BPETokenizer:
    """Byte-level BPE tokenizer built from GGUF metadata (Llama 3 style)."""

    # GPT-2 byte-to-unicode mapping — maps byte values 0-255 to Unicode codepoints.
    # Used by Llama 3 and GPT-2 style tokenizers.
    _BYTE_TO_UNICODE: Optional[Dict[int, str]] = None
    _UNICODE_TO_BYTE: Optional[Dict[str, int]] = None

    @classmethod
    def _build_byte_unicode_map(cls):
        """Build the GPT-2 bytes_to_unicode mapping (cached on class)."""
        if cls._BYTE_TO_UNICODE is not None:
            return
        # Printable ASCII chars that map to themselves
        bs = list(range(ord('!'), ord('~') + 1)) + \
             list(range(ord('\xa1'), ord('\xac') + 1)) + \
             list(range(ord('\xae'), ord('\xff') + 1))
        cs = list(bs)
        # Non-printable bytes get mapped to Unicode codepoints starting at 256
        n = 0
        for b in range(256):
            if b not in bs:
                bs.append(b)
                cs.append(256 + n)
                n += 1
        cls._BYTE_TO_UNICODE = {b: chr(c) for b, c in zip(bs, cs)}
        cls._UNICODE_TO_BYTE = {chr(c): b for b, c in zip(bs, cs)}

    def __init__(self, metadata: Dict[str, Any]):
        self.vocab: List[str] = metadata.get('tokenizer.ggml.tokens', [])
        self.token_types: List[int] = metadata.get('tokenizer.ggml.token_type', [])
        self.scores: List[float] = metadata.get('tokenizer.ggml.scores', [])

        # Build GPT-2 byte↔unicode mapping
        self._build_byte_unicode_map()

        # Build lookup tables
        self.token_to_id: Dict[str, int] = {}
        self.byte_tokens: Dict[int, int] = {}  # byte_value -> token_id
        for i, tok in enumerate(self.vocab):
            self.token_to_id[tok] = i
            # Identify byte-level tokens: type 6 with <0x..> format
            if i < len(self.token_types) and self.token_types[i] == 6:
                try:
                    byte_val = int(tok.replace('<0x', '').replace('>', ''), 16)
                    self.byte_tokens[byte_val] = i
                except (ValueError, AttributeError):
                    pass

        # If byte_tokens is empty, build mapping from GPT-2 unicode chars in vocab
        if not self.byte_tokens:
            for byte_val, unicode_char in self._BYTE_TO_UNICODE.items():
                if unicode_char in self.token_to_id:
                    self.byte_tokens[byte_val] = self.token_to_id[unicode_char]

        # BPE merge rules
        raw_merges = metadata.get('tokenizer.ggml.merges', [])
        self.merges: List[Tuple[str, str]] = []
        self.merge_priority: Dict[Tuple[str, str], int] = {}
        for i, m in enumerate(raw_merges):
            parts = m.split(' ', 1)
            if len(parts) == 2:
                pair = (parts[0], parts[1])
                self.merges.append(pair)
                self.merge_priority[pair] = i

        # Special tokens
        self.bos_id: int = metadata.get('tokenizer.ggml.bos_token_id', 128000)
        self.eos_id: int = metadata.get('tokenizer.ggml.eos_token_id', 128001)
        self.eot_id: Optional[int] = metadata.get('tokenizer.ggml.eot_token_id', None)
        self.chat_template: str = metadata.get('tokenizer.chat_template', '')

        # Build set of all stop token IDs
        self.stop_ids: set = {self.eos_id}
        if self.eot_id is not None:
            self.stop_ids.add(self.eot_id)
        # Also detect <|eot_id|> by name in vocab
        if '<|eot_id|>' in self.token_to_id:
            self.stop_ids.add(self.token_to_id['<|eot_id|>'])

        # Detect tokenizer model type
        self.model_type = metadata.get('tokenizer.ggml.model', 'gpt2')

        # GPT-2 style pre-tokenization regex (splits text into words before BPE)
        self._pre_tokenize_re = re.compile(
            r"""'s|'t|'re|'ve|'m|'ll|'d| ?[a-zA-Z]+| ?[0-9]+| ?[^\s\w]+|\s+""",
        )

        logger.info(f"Tokenizer loaded: vocab_size={len(self.vocab)}, "
                     f"merges={len(self.merges)}, type={self.model_type}")

    def encode(self, text: str) -> List[int]:
        """Encode text to token IDs using byte-level BPE with pre-tokenization."""
        if not text:
            return []

        # Try to find direct token matches first (for special tokens)
        if text in self.token_to_id:
            return [self.token_to_id[text]]

        # Pre-tokenize: split text into word-level chunks before BPE
        # This prevents BPE merges from crossing word boundaries
        words = self._pre_tokenize_re.findall(text)
        if not words:
            words = [text]

        all_ids = []
        for word in words:
            # Convert word to byte-level tokens using byte↔unicode mapping
            word_bytes = word.encode('utf-8')
            b2u = self._BYTE_TO_UNICODE or {}
            tokens = []
            for b in word_bytes:
                # Try GPT-2 unicode mapping first (Llama 3 style)
                if b2u and b2u.get(b, '') in self.token_to_id:
                    tokens.append(b2u[b])
                elif b in self.byte_tokens:
                    tokens.append(self.vocab[self.byte_tokens[b]])
                else:
                    ch = chr(b) if b < 128 else f'<0x{b:02X}>'
                    if ch in self.token_to_id:
                        tokens.append(ch)
                    elif f'<0x{b:02X}>' in self.token_to_id:
                        tokens.append(f'<0x{b:02X}>')
                    else:
                        tokens.append(chr(b))

            # Apply BPE merges within each word
            if self.merges:
                tokens = self._apply_bpe(tokens)

            # Convert to IDs
            for tok in tokens:
                if tok in self.token_to_id:
                    all_ids.append(self.token_to_id[tok])
                else:
                    for b in tok.encode('utf-8'):
                        if b in self.byte_tokens:
                            all_ids.append(self.byte_tokens[b])
        return all_ids

    def _apply_bpe(self, tokens: List[str]) -> List[str]:
        """Apply BPE merge rules iteratively until no more merges apply."""
        while len(tokens) >= 2:
            # Find the highest-priority (lowest index) merge that applies
            best_pair = None
            best_priority = float('inf')
            best_idx = -1

            for i in range(len(tokens) - 1):
                pair = (tokens[i], tokens[i + 1])
                if pair in self.merge_priority:
                    p = self.merge_priority[pair]
                    if p < best_priority:
                        best_priority = p
                        best_pair = pair
                        best_idx = i

            if best_pair is None:
                break

            # Apply the merge at all positions
            merged = best_pair[0] + best_pair[1]
            new_tokens = []
            i = 0
            while i < len(tokens):
                if (i < len(tokens) - 1 and
                        tokens[i] == best_pair[0] and
                        tokens[i + 1] == best_pair[1]):
                    new_tokens.append(merged)
                    i += 2
                else:
                    new_tokens.append(tokens[i])
                    i += 1
            tokens = new_tokens

        return tokens

    def decode(self, token_ids: List[int]) -> str:
        """Decode token IDs back to text."""
        byte_buffer = bytearray()
        u2b = self._UNICODE_TO_BYTE or {}

        for tid in token_ids:
            if 0 <= tid < len(self.vocab):
                tok = self.vocab[tid]
                # Check if it's a <0x..> byte token (type 6)
                if (tid < len(self.token_types) and self.token_types[tid] == 6
                        and tok.startswith('<0x') and tok.endswith('>')):
                    try:
                        byte_buffer.append(int(tok[3:-1], 16))
                        continue
                    except ValueError:
                        pass
                # Try GPT-2 unicode-to-byte mapping (Llama 3 style)
                if u2b:
                    decoded = True
                    for ch in tok:
                        if ch in u2b:
                            byte_buffer.append(u2b[ch])
                        else:
                            decoded = False
                            break
                    if decoded:
                        continue
                # Regular token — encode to UTF-8 bytes
                try:
                    byte_buffer.extend(tok.encode('utf-8'))
                except UnicodeEncodeError:
                    pass
        try:
            return byte_buffer.decode('utf-8', errors='replace')
        except Exception:
            return byte_buffer.decode('latin-1')

    def apply_chat_template(self, messages: List[Dict[str, str]]) -> List[int]:
        """Format messages using Llama 3 chat template and encode.

        Llama 3 format:
            <|begin_of_text|>
            <|start_header_id|>{role}<|end_header_id|>\n\n{content}<|eot_id|>
            ...
            <|start_header_id|>assistant<|end_header_id|>\n\n
        """
        # Detect template type from metadata
        is_llama3 = '<|start_header_id|>' in self.chat_template or \
                     'start_header_id' in self.chat_template

        if is_llama3:
            return self._llama3_template(messages)
        else:
            return self._chatml_template(messages)

    def _llama3_template(self, messages: List[Dict[str, str]]) -> List[int]:
        """Llama 3 / 3.1 / 3.2 chat template."""
        tokens = [self.bos_id]  # <|begin_of_text|>

        for msg in messages:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            # <|start_header_id|>role<|end_header_id|>\n\ncontent<|eot_id|>
            header_start = self.token_to_id.get('<|start_header_id|>')
            header_end = self.token_to_id.get('<|end_header_id|>')
            eot = self.token_to_id.get('<|eot_id|>')

            if header_start is not None and header_end is not None:
                tokens.append(header_start)
                tokens.extend(self.encode(role))
                tokens.append(header_end)
                tokens.extend(self.encode('\n\n'))
                tokens.extend(self.encode(content))
                if eot is not None:
                    tokens.append(eot)
            else:
                # Fallback if special tokens not found
                tokens.extend(self.encode(f"[{role}]: {content}\n"))

        # Add assistant prompt
        header_start = self.token_to_id.get('<|start_header_id|>')
        header_end = self.token_to_id.get('<|end_header_id|>')
        if header_start is not None and header_end is not None:
            tokens.append(header_start)
            tokens.extend(self.encode('assistant'))
            tokens.append(header_end)
            tokens.extend(self.encode('\n\n'))

        return tokens

    def _chatml_template(self, messages: List[Dict[str, str]]) -> List[int]:
        """Generic ChatML template fallback."""
        im_start = self.token_to_id.get('<|im_start|>')
        im_end = self.token_to_id.get('<|im_end|>')

        tokens = [self.bos_id]
        for msg in messages:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if im_start is not None and im_end is not None:
                tokens.append(im_start)
                tokens.extend(self.encode(f"{role}\n{content}"))
                tokens.append(im_end)
                tokens.extend(self.encode('\n'))
            else:
                # No special tokens found — encode as plain text
                tokens.extend(self.encode(f"[{role}]: {content}\n"))

        if im_start is not None:
            tokens.append(im_start)
            tokens.extend(self.encode("assistant\n"))
        return tokens


# ============================================================================
# LLAMA TRANSFORMER
# ============================================================================

class LlamaTransformer:
    """Pure NumPy Llama transformer forward pass with KV cache."""

    def __init__(self, parser: GGUFParser, dequant: GGUFDequantizer):
        self.parser = parser
        self.dequant = dequant
        meta = parser.metadata

        # Detect architecture
        arch = meta.get('general.architecture', 'llama')

        # Model dimensions
        self.n_layers = meta.get(f'{arch}.block_count', 16)
        self.hidden_dim = meta.get(f'{arch}.embedding_length', 2048)
        self.n_heads = meta.get(f'{arch}.attention.head_count', 16)
        self.n_kv_heads = meta.get(f'{arch}.attention.head_count_kv', self.n_heads)
        self.head_dim = self.hidden_dim // self.n_heads
        self.ffn_dim = meta.get(f'{arch}.feed_forward_length', 8192)
        self.rms_norm_eps = meta.get(f'{arch}.attention.layer_norm_rms_epsilon', 1e-5)
        self.rope_theta = meta.get(f'{arch}.rope.freq_base', 500000.0)
        self.vocab_size = meta.get(f'{arch}.vocab_size', 128256)
        self.n_ctx = 4096  # Configurable, set by caller

        # GQA ratio
        self.n_rep = self.n_heads // self.n_kv_heads

        # KV cache
        self._cache_k: Optional[List[np.ndarray]] = None
        self._cache_v: Optional[List[np.ndarray]] = None

        # Weight cache for frequently accessed tensors
        self._weight_cache: Dict[str, np.ndarray] = {}

        # Precomputed RoPE frequencies
        self._rope_cos: Optional[np.ndarray] = None
        self._rope_sin: Optional[np.ndarray] = None

        logger.info(
            f"Transformer: layers={self.n_layers} hidden={self.hidden_dim} "
            f"heads={self.n_heads} kv_heads={self.n_kv_heads} ffn={self.ffn_dim} "
            f"head_dim={self.head_dim} vocab={self.vocab_size}"
        )

    def _get_weight(self, name: str, cache: bool = True) -> np.ndarray:
        """Get dequantized weight tensor. Cached by default to avoid
        re-dequantizing on every token (critical for inference speed)."""
        if name in self._weight_cache:
            return self._weight_cache[name]

        info = self.parser.tensors[name]
        raw = self.parser.get_tensor_data(name)
        weight = self.dequant.dequantize(raw, info.dtype_id, info.shape)

        if cache:
            self._weight_cache[name] = weight
        return weight

    def _init_kv_cache(self):
        """Allocate KV cache arrays."""
        self._cache_k = [
            np.zeros((self.n_ctx, self.n_kv_heads, self.head_dim), dtype=np.float32)
            for _ in range(self.n_layers)
        ]
        self._cache_v = [
            np.zeros((self.n_ctx, self.n_kv_heads, self.head_dim), dtype=np.float32)
            for _ in range(self.n_layers)
        ]

    def _precompute_rope(self):
        """Precompute RoPE sin/cos frequencies."""
        half_dim = self.head_dim // 2
        freqs = 1.0 / (self.rope_theta ** (np.arange(0, self.head_dim, 2, dtype=np.float32) / self.head_dim))

        t = np.arange(self.n_ctx, dtype=np.float32)
        angles = np.outer(t, freqs)  # (n_ctx, half_dim)
        self._rope_cos = np.cos(angles).astype(np.float32)
        self._rope_sin = np.sin(angles).astype(np.float32)

    def _apply_rope(self, x: np.ndarray, positions: np.ndarray) -> np.ndarray:
        """Apply rotary position embedding.
        x shape: (seq_len, n_heads, head_dim)
        """
        x1 = x[..., 0::2]  # (seq_len, n_heads, half_dim)
        x2 = x[..., 1::2]

        cos = self._rope_cos[positions]  # (seq_len, half_dim)
        sin = self._rope_sin[positions]

        # Broadcast over heads dimension
        cos = cos[:, np.newaxis, :]  # (seq_len, 1, half_dim)
        sin = sin[:, np.newaxis, :]

        out1 = x1 * cos - x2 * sin
        out2 = x1 * sin + x2 * cos

        # Interleave back
        out = np.empty_like(x)
        out[..., 0::2] = out1
        out[..., 1::2] = out2
        return out

    def _rms_norm(self, x: np.ndarray, weight: np.ndarray) -> np.ndarray:
        """RMSNorm: x / sqrt(mean(x^2) + eps) * weight"""
        rms = np.sqrt(np.mean(x.astype(np.float64) ** 2, axis=-1, keepdims=True) + self.rms_norm_eps)
        return ((x / rms) * weight).astype(np.float32)

    def _silu(self, x: np.ndarray) -> np.ndarray:
        """SiLU activation: x * sigmoid(x)"""
        return x * (1.0 / (1.0 + np.exp(-np.clip(x, -88, 88))))

    def _softmax(self, x: np.ndarray, axis: int = -1) -> np.ndarray:
        """Numerically stable softmax."""
        x_max = np.max(x, axis=axis, keepdims=True)
        e_x = np.exp(x - x_max)
        return e_x / np.sum(e_x, axis=axis, keepdims=True)

    def _attention_layer(self, h: np.ndarray, layer: int, start_pos: int) -> np.ndarray:
        """Single attention layer with KV cache and GQA.
        h shape: (seq_len, hidden_dim)
        """
        seq_len = h.shape[0]
        positions = np.arange(start_pos, start_pos + seq_len)

        # Q, K, V projections
        wq = self._get_weight(f'blk.{layer}.attn_q.weight')
        wk = self._get_weight(f'blk.{layer}.attn_k.weight')
        wv = self._get_weight(f'blk.{layer}.attn_v.weight')

        q = h @ wq.T  # (seq_len, n_heads * head_dim)
        k = h @ wk.T  # (seq_len, n_kv_heads * head_dim)
        v = h @ wv.T

        # Reshape for heads
        q = q.reshape(seq_len, self.n_heads, self.head_dim)
        k = k.reshape(seq_len, self.n_kv_heads, self.head_dim)
        v = v.reshape(seq_len, self.n_kv_heads, self.head_dim)

        # Apply RoPE to Q and K
        q = self._apply_rope(q, positions)
        k = self._apply_rope(k, positions)

        # Update KV cache
        end_pos = start_pos + seq_len
        if end_pos > self.n_ctx:
            raise ValueError(
                f"Context length exceeded: position {end_pos} > max {self.n_ctx}. "
                f"Increase n_ctx or shorten the conversation."
            )
        self._cache_k[layer][start_pos:end_pos] = k
        self._cache_v[layer][start_pos:end_pos] = v

        # Read full KV from cache
        k_full = self._cache_k[layer][:end_pos]  # (cache_len, n_kv_heads, head_dim)
        v_full = self._cache_v[layer][:end_pos]
        cache_len = end_pos

        # GQA: repeat KV heads to match Q heads
        if self.n_rep > 1:
            k_full = np.repeat(k_full, self.n_rep, axis=1)  # (cache_len, n_heads, head_dim)
            v_full = np.repeat(v_full, self.n_rep, axis=1)

        # Attention scores: Q @ K^T / sqrt(head_dim)
        # q: (seq_len, n_heads, head_dim) → transpose to (n_heads, seq_len, head_dim)
        q_t = q.transpose(1, 0, 2)        # (n_heads, seq_len, head_dim)
        k_t = k_full.transpose(1, 0, 2)   # (n_heads, cache_len, head_dim)
        v_t = v_full.transpose(1, 0, 2)   # (n_heads, cache_len, head_dim)

        scale = 1.0 / math.sqrt(self.head_dim)
        scores = np.matmul(q_t, k_t.transpose(0, 2, 1)) * scale  # (n_heads, seq_len, cache_len)

        # Causal mask: position i can only attend to positions <= start_pos + i
        # Vectorized construction using broadcasting
        query_pos = np.arange(start_pos, start_pos + seq_len)[:, np.newaxis]  # (seq_len, 1)
        key_pos = np.arange(cache_len)[np.newaxis, :]                         # (1, cache_len)
        mask = np.where(key_pos <= query_pos, 0.0, float('-inf')).astype(np.float32)
        scores = scores + mask[np.newaxis, :, :]  # broadcast over heads

        # Softmax
        attn_weights = self._softmax(scores, axis=-1)

        # Weighted sum of values
        attn_out = np.matmul(attn_weights, v_t)  # (n_heads, seq_len, head_dim)

        # Reshape back: (seq_len, n_heads * head_dim)
        attn_out = attn_out.transpose(1, 0, 2).reshape(seq_len, self.n_heads * self.head_dim)

        # Output projection
        wo = self._get_weight(f'blk.{layer}.attn_output.weight')
        return attn_out @ wo.T  # (seq_len, hidden_dim)

    def _ffn_layer(self, h: np.ndarray, layer: int) -> np.ndarray:
        """SwiGLU feed-forward network.
        h shape: (seq_len, hidden_dim)
        """
        w_gate = self._get_weight(f'blk.{layer}.ffn_gate.weight')
        w_up = self._get_weight(f'blk.{layer}.ffn_up.weight')
        w_down = self._get_weight(f'blk.{layer}.ffn_down.weight')

        gate = h @ w_gate.T   # (seq_len, ffn_dim)
        up = h @ w_up.T       # (seq_len, ffn_dim)
        ffn_out = self._silu(gate) * up
        return ffn_out @ w_down.T  # (seq_len, hidden_dim)

    def forward(self, token_ids: List[int], start_pos: int = 0) -> np.ndarray:
        """Full forward pass. Returns logits for the last token.

        Args:
            token_ids: Token IDs to process
            start_pos: Position in the sequence (for KV cache)

        Returns:
            logits: (vocab_size,) array of logit scores
        """
        if self._cache_k is None:
            self._init_kv_cache()
        if self._rope_cos is None:
            self._precompute_rope()

        seq_len = len(token_ids)

        # Embedding lookup
        embd = self._get_weight('token_embd.weight', cache=True)
        h = embd[token_ids].astype(np.float32)  # (seq_len, hidden_dim)

        # Transformer layers
        for i in range(self.n_layers):
            # Attention sub-layer
            norm_w = self._get_weight(f'blk.{i}.attn_norm.weight', cache=True)
            h_norm = self._rms_norm(h, norm_w)
            h = h + self._attention_layer(h_norm, i, start_pos)

            # FFN sub-layer
            ffn_norm_w = self._get_weight(f'blk.{i}.ffn_norm.weight', cache=True)
            h_norm = self._rms_norm(h, ffn_norm_w)
            h = h + self._ffn_layer(h_norm, i)

        # Final norm
        out_norm_w = self._get_weight('output_norm.weight', cache=True)
        h = self._rms_norm(h, out_norm_w)

        # LM head (may be tied to embedding)
        if 'output.weight' in self.parser.tensors:
            lm_head = self._get_weight('output.weight', cache=True)
        else:
            lm_head = embd  # weight tying

        # Only compute logits for the last position
        logits = h[-1] @ lm_head.T  # (vocab_size,)
        return logits.astype(np.float32)

    def reset_cache(self):
        """Clear KV cache for a new conversation."""
        self._cache_k = None
        self._cache_v = None


# ============================================================================
# SAMPLER
# ============================================================================

class Sampler:
    """Token sampling with temperature, top-k, top-p, and repetition penalty."""

    @staticmethod
    def sample(logits: np.ndarray, temperature: float = 0.7,
               top_k: int = 40, top_p: float = 0.9,
               repetition_penalty: float = 1.1,
               prev_tokens: Optional[List[int]] = None) -> int:
        """Sample next token from logits."""
        logits = logits.copy().astype(np.float64)

        # Repetition penalty
        if prev_tokens and repetition_penalty != 1.0:
            for tid in set(prev_tokens[-64:]):  # Look back 64 tokens
                if 0 <= tid < len(logits):
                    if logits[tid] > 0:
                        logits[tid] /= repetition_penalty
                    else:
                        logits[tid] *= repetition_penalty

        # Greedy
        if temperature <= 0:
            return int(np.argmax(logits))

        # Temperature
        logits = logits / temperature

        # Top-k
        if top_k > 0 and top_k < len(logits):
            indices = np.argpartition(logits, -top_k)[-top_k:]
            mask = np.full_like(logits, float('-inf'))
            mask[indices] = logits[indices]
            logits = mask

        # Top-p (nucleus sampling)
        if 0 < top_p < 1.0:
            sorted_indices = np.argsort(logits)[::-1]
            sorted_logits = logits[sorted_indices]
            # Softmax on sorted
            max_val = sorted_logits[0]
            probs = np.exp(sorted_logits - max_val)
            probs = probs / probs.sum()
            cumulative = np.cumsum(probs)
            # Find cutoff
            cutoff_idx = np.searchsorted(cumulative, top_p) + 1
            cutoff_idx = min(cutoff_idx, len(probs))
            # Zero out everything below cutoff
            mask = np.full_like(logits, float('-inf'))
            mask[sorted_indices[:cutoff_idx]] = logits[sorted_indices[:cutoff_idx]]
            logits = mask

        # Softmax → probabilities
        max_val = np.max(logits)
        probs = np.exp(logits - max_val)
        probs = probs / probs.sum()

        # Handle NaN/inf
        if np.any(np.isnan(probs)) or np.any(np.isinf(probs)):
            return int(np.argmax(logits))

        return int(np.random.choice(len(probs), p=probs))


# ============================================================================
# PURE GGUF BACKEND — LocalModelBackend implementation
# ============================================================================

class PureGGUFBackend(LocalModelBackend):
    """Pure Python+NumPy GGUF inference backend.
    Drop-in replacement for LlamaCppBackend with zero C dependencies.
    """

    def __init__(self):
        self._parser: Optional[GGUFParser] = None
        self._tokenizer: Optional[BPETokenizer] = None
        self._transformer: Optional[LlamaTransformer] = None
        self._sampler: Sampler = Sampler()
        self._model_path: Optional[str] = None
        self._load_error: Optional[str] = None

    async def load(self, model_path: str, device: str, **kwargs) -> None:
        """Parse GGUF file and initialize all components."""
        n_ctx = kwargs.get('n_ctx', 4096)
        loop = asyncio.get_running_loop()

        def _load():
            parser = GGUFParser()
            parser.parse(model_path)
            tokenizer = BPETokenizer(parser.metadata)
            transformer = LlamaTransformer(parser, GGUFDequantizer())
            transformer.n_ctx = n_ctx
            return parser, tokenizer, transformer

        try:
            self._parser, self._tokenizer, self._transformer = \
                await loop.run_in_executor(None, _load)
            self._model_path = model_path
            logger.info(f"PureGGUFBackend loaded: {model_path}")
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"PureGGUFBackend load failed: {e}")
            raise

    async def generate(self, messages: List[Dict], max_tokens: int,
                       temperature: float) -> Dict[str, Any]:
        """Generate a complete response."""
        if not self._transformer:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_running_loop()

        def _infer():
            try:
                # Tokenize with chat template
                token_ids = self._tokenizer.apply_chat_template(messages)
                input_len = len(token_ids)

                # Prefill: forward pass on full prompt
                logits = self._transformer.forward(token_ids, start_pos=0)

                # Autoregressive decode
                generated = []
                for step in range(max_tokens):
                    token = self._sampler.sample(
                        logits, temperature=temperature,
                        prev_tokens=token_ids + generated,
                    )
                    if token in self._tokenizer.stop_ids:
                        break
                    generated.append(token)
                    # Single-token forward with KV cache
                    logits = self._transformer.forward(
                        [token], start_pos=input_len + step,
                    )

                response_text = self._tokenizer.decode(generated)
                finish = 'stop' if (not generated or len(generated) < max_tokens) else 'length'
                return {
                    'response': response_text,
                    'model': os.path.basename(self._model_path or 'unknown'),
                    'tokens_used': input_len + len(generated),
                    'input_tokens': input_len,
                    'output_tokens': len(generated),
                    'finish_reason': finish,
                }
            finally:
                self._transformer.reset_cache()

        return await loop.run_in_executor(None, _infer)

    async def generate_stream(self, messages: List[Dict], max_tokens: int,
                              temperature: float) -> AsyncIterator[str]:
        """Stream tokens one at a time."""
        if not self._transformer:
            raise RuntimeError("Model not loaded")

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _stream_worker():
            try:
                token_ids = self._tokenizer.apply_chat_template(messages)
                input_len = len(token_ids)
                logits = self._transformer.forward(token_ids, start_pos=0)

                generated = []
                for step in range(max_tokens):
                    token = self._sampler.sample(
                        logits, temperature=temperature,
                        prev_tokens=token_ids + generated,
                    )
                    if token in self._tokenizer.stop_ids:
                        break
                    generated.append(token)
                    text = self._tokenizer.decode([token])
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop)
                    logits = self._transformer.forward(
                        [token], start_pos=input_len + step,
                    )
            except Exception as e:
                logger.error(f"Stream generation error: {e}")
                # Propagate error through queue so caller can see it
                asyncio.run_coroutine_threadsafe(queue.put(e), loop)
            finally:
                self._transformer.reset_cache()
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        threading.Thread(target=_stream_worker, daemon=True).start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item

    def unload(self) -> None:
        """Release all resources."""
        if self._parser:
            self._parser.close()
            self._parser = None
        self._tokenizer = None
        if self._transformer:
            self._transformer._weight_cache.clear()
            self._transformer.reset_cache()
            self._transformer = None
        self._model_path = None
        logger.info("PureGGUFBackend unloaded")

    @property
    def is_loaded(self) -> bool:
        return self._transformer is not None

    @property
    def model_info(self) -> Dict[str, Any]:
        if not self._transformer:
            return {'loaded': False, 'backend': 'pure-gguf', 'error': self._load_error}
        t = self._transformer
        return {
            'loaded': True,
            'backend': 'pure-gguf',
            'path': self._model_path,
            'n_layers': t.n_layers,
            'hidden_dim': t.hidden_dim,
            'n_heads': t.n_heads,
            'n_kv_heads': t.n_kv_heads,
            'ffn_dim': t.ffn_dim,
            'head_dim': t.head_dim,
            'vocab_size': t.vocab_size,
            'n_ctx': t.n_ctx,
        }
