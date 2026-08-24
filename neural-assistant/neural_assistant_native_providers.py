"""
Neural Assistant Native Providers
Local GPU-powered image generation and speech-to-text transcription.

- NativeImageProvider: SDXL/Flux via HuggingFace diffusers (fits RTX 5070 12GB)
- NativeTranscriptionProvider: OpenAI Whisper for speech-to-text
- NativeAudioProcessor: FFmpeg-based audio extraction from video

These run entirely on local hardware — no external API keys needed.
"""

import asyncio
import io
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


# ============================================================================
# NATIVE IMAGE GENERATION (HuggingFace Diffusers)
# ============================================================================

class NativeImageProvider:
    """Generate images locally using HuggingFace diffusers on GPU.

    Uses SDXL (Stable Diffusion XL) by default — fits in 8GB VRAM with fp16.
    Falls back to SD 1.5 if VRAM is tight, or CPU if no GPU.
    """

    # Model options ordered by quality (and VRAM usage)
    MODELS = {
        'sdxl': {
            'id': 'stabilityai/stable-diffusion-xl-base-1.0',
            'vram_gb': 8,
            'default_steps': 30,
            'default_size': (1024, 1024),
        },
        'sd-1.5': {
            'id': 'stable-diffusion-v1-5/stable-diffusion-v1-5',
            'vram_gb': 4,
            'default_steps': 30,
            'default_size': (512, 512),
        },
    }

    def __init__(self, model_name: str = 'sdxl', device: str = 'auto'):
        self._model_name = model_name
        self._device = device
        self._pipeline = None
        self._loaded = False
        self._load_error: Optional[str] = None

    @property
    def available(self) -> bool:
        """Check if diffusers + torch are installed. Does NOT download models."""
        try:
            import diffusers  # noqa: F401
            import torch  # noqa: F401
            # Only report available if model is already cached locally
            # to avoid triggering multi-GB downloads at startup
            from huggingface_hub import try_to_load_from_cache
            model_cfg = self.MODELS.get(self._model_name, self.MODELS['sdxl'])
            result = try_to_load_from_cache(model_cfg['id'], 'model_index.json')
            if result is None or isinstance(result, type(None)):
                return False  # Model not cached — don't auto-download
            return True
        except (ImportError, Exception):
            return False

    @property
    def model_info(self) -> Dict[str, Any]:
        return {
            'model': self._model_name,
            'loaded': self._loaded,
            'device': str(self._resolve_device()),
            'error': self._load_error,
        }

    def _resolve_device(self) -> str:
        if self._device != 'auto':
            return self._device
        try:
            import torch
            if torch.cuda.is_available():
                return 'cuda'
        except ImportError:
            pass
        return 'cpu'

    async def load_model(self):
        """Load the diffusion pipeline. Call once at startup or on first generate."""
        if self._loaded:
            return

        try:
            import torch
            from diffusers import StableDiffusionXLPipeline, StableDiffusionPipeline

            device = self._resolve_device()
            dtype = torch.float16 if device == 'cuda' else torch.float32
            model_cfg = self.MODELS.get(self._model_name, self.MODELS['sdxl'])

            # Check VRAM before loading
            if device == 'cuda':
                vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024 ** 3)
                if vram_gb < model_cfg['vram_gb']:
                    # Fall back to smaller model
                    if self._model_name == 'sdxl' and vram_gb >= 4:
                        logger.warning(f"VRAM {vram_gb:.1f}GB < {model_cfg['vram_gb']}GB for SDXL, falling back to SD 1.5")
                        self._model_name = 'sd-1.5'
                        model_cfg = self.MODELS['sd-1.5']
                    else:
                        logger.warning(f"VRAM {vram_gb:.1f}GB insufficient, falling back to CPU")
                        device = 'cpu'
                        dtype = torch.float32

            logger.info(f"Loading {self._model_name} on {device} ({dtype})...")

            if self._model_name == 'sdxl':
                self._pipeline = StableDiffusionXLPipeline.from_pretrained(
                    model_cfg['id'],
                    torch_dtype=dtype,
                    use_safetensors=True,
                    variant="fp16" if dtype == torch.float16 else None,
                )
            else:
                self._pipeline = StableDiffusionPipeline.from_pretrained(
                    model_cfg['id'],
                    torch_dtype=dtype,
                    use_safetensors=True,
                )

            self._pipeline = self._pipeline.to(device)

            # Memory optimizations
            if device == 'cuda':
                self._pipeline.enable_attention_slicing()
                try:
                    self._pipeline.enable_xformers_memory_efficient_attention()
                except Exception:
                    pass  # xformers not installed — attention slicing is enough

            self._loaded = True
            logger.info(f"Image model loaded: {self._model_name} on {device}")

        except ImportError as e:
            self._load_error = f"diffusers not installed: {e}"
            logger.error(self._load_error)
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"Failed to load image model: {e}")

    def unload_model(self):
        """Free GPU memory by unloading the pipeline."""
        if self._pipeline is not None:
            del self._pipeline
            self._pipeline = None
            self._loaded = False
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            logger.info("Image model unloaded, GPU memory freed")

    async def generate(self, prompt: str, negative_prompt: str = "",
                       width: int = 0, height: int = 0,
                       num_steps: int = 0, guidance_scale: float = 7.5,
                       seed: Optional[int] = None) -> Dict[str, Any]:
        """Generate an image from text. Returns PNG bytes."""
        if not self.available:
            return {'success': False, 'error': 'diffusers package not installed. pip install diffusers accelerate'}

        if not self._loaded:
            await self.load_model()

        if not self._loaded:
            return {'success': False, 'error': self._load_error or 'Model failed to load'}

        import torch

        model_cfg = self.MODELS.get(self._model_name, self.MODELS['sdxl'])
        if width <= 0 or height <= 0:
            width, height = model_cfg['default_size']
        if num_steps <= 0:
            num_steps = model_cfg['default_steps']

        generator = None
        if seed is not None:
            generator = torch.Generator(device=self._resolve_device()).manual_seed(seed)

        try:
            start = time.time()

            # Run generation in thread to avoid blocking event loop
            result = await asyncio.to_thread(
                self._pipeline,
                prompt=prompt,
                negative_prompt=negative_prompt or None,
                width=width,
                height=height,
                num_inference_steps=num_steps,
                guidance_scale=guidance_scale,
                generator=generator,
            )

            image = result.images[0]
            elapsed = time.time() - start

            # Convert to PNG bytes
            buf = io.BytesIO()
            image.save(buf, format='PNG')
            png_bytes = buf.getvalue()

            import base64
            img_b64 = base64.b64encode(png_bytes).decode('utf-8')

            return {
                'success': True,
                'image_base64': img_b64,
                'width': width,
                'height': height,
                'model': self._model_name,
                'seed': seed,
                'steps': num_steps,
                'generation_time': round(elapsed, 2),
                'provider': f'native-{self._model_name}',
                'revised_prompt': prompt,
                'size': f'{width}x{height}',
            }
        except Exception as e:
            logger.error(f"Native image generation failed: {e}")
            return {'success': False, 'error': str(e), 'provider': f'native-{self._model_name}'}


# ============================================================================
# NATIVE TRANSCRIPTION (OpenAI Whisper)
# ============================================================================

class NativeTranscriptionProvider:
    """Transcribe audio/video files using OpenAI Whisper locally.

    Supports models: tiny (1GB), base (1GB), small (2GB), medium (5GB), large (10GB).
    RTX 5070 with 12GB VRAM can run up to 'large' model.
    """

    MODEL_VRAM = {
        'tiny': 1, 'base': 1, 'small': 2, 'medium': 5, 'large': 10,
    }

    def __init__(self, model_size: str = 'base', device: str = 'auto'):
        self._model_size = model_size
        self._device = device
        self._model = None
        self._loaded = False
        self._load_error: Optional[str] = None
        self._audio_processor = NativeAudioProcessor()

    @property
    def available(self) -> bool:
        try:
            import whisper  # noqa: F401
            return True
        except ImportError:
            return False

    @property
    def model_info(self) -> Dict[str, Any]:
        return {
            'model_size': self._model_size,
            'loaded': self._loaded,
            'ffmpeg_available': self._audio_processor.ffmpeg_available,
            'error': self._load_error,
            'supported_models': list(self.MODEL_VRAM.keys()),
        }

    async def load_model(self, model_size: Optional[str] = None):
        """Load Whisper model."""
        if model_size:
            self._model_size = model_size

        if self._loaded and self._model is not None:
            return

        try:
            import whisper

            logger.info(f"Loading Whisper '{self._model_size}' model...")
            self._model = await asyncio.to_thread(
                whisper.load_model, self._model_size
            )
            self._loaded = True
            logger.info(f"Whisper '{self._model_size}' model loaded")
        except ImportError:
            self._load_error = "openai-whisper not installed. pip install openai-whisper"
            logger.error(self._load_error)
        except Exception as e:
            self._load_error = str(e)
            logger.error(f"Failed to load Whisper model: {e}")

    def unload_model(self):
        """Free memory."""
        if self._model is not None:
            del self._model
            self._model = None
            self._loaded = False
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

    async def transcribe(self, file_bytes: bytes, filename: str,
                         language: Optional[str] = None,
                         model_size: Optional[str] = None) -> Dict[str, Any]:
        """Transcribe audio/video file bytes.

        Returns:
            Dict with 'success', 'text', 'segments', 'language', 'duration', 'processing_time'
        """
        if not self.available:
            return {'success': False, 'error': 'openai-whisper not installed. pip install openai-whisper'}

        if model_size and model_size != self._model_size:
            self.unload_model()
            self._model_size = model_size

        if not self._loaded:
            await self.load_model()

        if not self._loaded:
            return {'success': False, 'error': self._load_error or 'Whisper model failed to load'}

        start = time.time()

        # Write to temp file (delete=False needed for Windows file locking)
        suffix = Path(filename).suffix or '.wav'
        extracted_audio = None
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, dir=tempfile.gettempdir())
        try:
            tmp.write(file_bytes)
            tmp.close()
            tmp_path = Path(tmp.name)

            # Extract audio if video
            audio_path = tmp_path
            video_exts = {'.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp'}
            if suffix.lower() in video_exts:
                extracted = self._audio_processor.extract_audio(tmp_path)
                if extracted:
                    audio_path = extracted
                    extracted_audio = extracted

            # Run Whisper
            opts = {}
            if language and language != 'auto':
                opts['language'] = language

            result = await asyncio.to_thread(
                self._model.transcribe, str(audio_path), **opts
            )

            elapsed = time.time() - start

            # Build segments
            segments = []
            for seg in result.get('segments', []):
                segments.append({
                    'start': round(seg['start'], 3),
                    'end': round(seg['end'], 3),
                    'text': seg['text'].strip(),
                    'confidence': round(seg.get('avg_logprob', -0.5) + 1.0, 3),
                })

            duration = segments[-1]['end'] if segments else 0

            return {
                'success': True,
                'text': result.get('text', '').strip(),
                'segments': segments,
                'language': result.get('language', language or 'unknown'),
                'model': self._model_size,
                'duration': duration,
                'word_count': len(result.get('text', '').split()),
                'segment_count': len(segments),
                'processing_time': round(elapsed, 2),
                'provider': f'whisper-{self._model_size}',
            }

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return {'success': False, 'error': str(e)}
        finally:
            # Cleanup temp files (ignore errors on Windows file locking)
            for path in [tmp.name, str(extracted_audio) if extracted_audio else None]:
                if path:
                    try:
                        os.unlink(path)
                    except (OSError, PermissionError):
                        pass

    def format_output(self, transcription: Dict[str, Any], fmt: str = 'txt') -> str:
        """Format transcription result as TXT, SRT, VTT, or JSON."""
        segments = transcription.get('segments', [])
        text = transcription.get('text', '')

        if fmt == 'txt':
            return text

        if fmt == 'json':
            import json
            return json.dumps(transcription, indent=2)

        if fmt == 'srt':
            lines = []
            for i, seg in enumerate(segments, 1):
                start = self._format_time_srt(seg['start'])
                end = self._format_time_srt(seg['end'])
                lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
            return '\n'.join(lines)

        if fmt == 'vtt':
            lines = ['WEBVTT\n']
            for seg in segments:
                start = self._format_time_vtt(seg['start'])
                end = self._format_time_vtt(seg['end'])
                lines.append(f"{start} --> {end}\n{seg['text']}\n")
            return '\n'.join(lines)

        return text

    @staticmethod
    def _format_time_srt(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    @staticmethod
    def _format_time_vtt(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


# ============================================================================
# AUDIO PROCESSOR (FFmpeg)
# ============================================================================

class NativeAudioProcessor:
    """Extract and process audio using FFmpeg."""

    def __init__(self):
        self._ffmpeg_path = shutil.which('ffmpeg')
        self._ffprobe_path = shutil.which('ffprobe')

    @property
    def ffmpeg_available(self) -> bool:
        return self._ffmpeg_path is not None

    def extract_audio(self, input_path: Path, sample_rate: int = 16000) -> Optional[Path]:
        """Extract audio from video file as 16kHz mono WAV."""
        if not self._ffmpeg_path:
            logger.warning("FFmpeg not found, skipping audio extraction")
            return None

        output_path = input_path.with_suffix('.extracted.wav')
        cmd = [
            self._ffmpeg_path,
            '-y', '-i', str(input_path),
            '-vn',                    # No video
            '-ar', str(sample_rate),  # Sample rate
            '-ac', '1',              # Mono
            '-f', 'wav',
            str(output_path),
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=600, text=True)
            if result.returncode == 0 and output_path.exists():
                return output_path
            logger.warning(f"FFmpeg extraction failed: {result.stderr[:200]}")
            return None
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.warning(f"FFmpeg extraction error: {e}")
            return None

    @staticmethod
    def _parse_fps(value) -> Optional[float]:
        """Safely parse FFprobe frame rate like '30/1' without eval()."""
        if not value:
            return None
        s = str(value)
        if '/' in s:
            try:
                num, den = s.split('/', 1)
                d = float(den)
                if d == 0:
                    return None
                return round(float(num) / d, 2)
            except (ValueError, ZeroDivisionError):
                return None
        try:
            return round(float(s), 2)
        except ValueError:
            return None

    def get_media_info(self, file_path: Path) -> Dict[str, Any]:
        """Get media metadata via FFprobe."""
        if not self._ffprobe_path:
            return {'error': 'FFprobe not available'}

        cmd = [
            self._ffprobe_path,
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            str(file_path),
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, timeout=30, text=True)
            if result.returncode == 0:
                import json
                data = json.loads(result.stdout)
                fmt = data.get('format', {})
                streams = data.get('streams', [])

                audio_streams = [s for s in streams if s.get('codec_type') == 'audio']
                video_streams = [s for s in streams if s.get('codec_type') == 'video']

                info = {
                    'duration': float(fmt.get('duration', 0)),
                    'size_bytes': int(fmt.get('size', 0)),
                    'format': fmt.get('format_name', 'unknown'),
                    'bitrate': int(fmt.get('bit_rate', 0)),
                    'has_audio': len(audio_streams) > 0,
                    'has_video': len(video_streams) > 0,
                }

                if audio_streams:
                    a = audio_streams[0]
                    info['audio'] = {
                        'codec': a.get('codec_name'),
                        'sample_rate': int(a.get('sample_rate', 0)),
                        'channels': a.get('channels', 0),
                    }

                if video_streams:
                    v = video_streams[0]
                    info['video'] = {
                        'codec': v.get('codec_name'),
                        'width': v.get('width'),
                        'height': v.get('height'),
                        'fps': self._parse_fps(v.get('r_frame_rate')),
                    }

                return info
            return {'error': f'FFprobe failed: {result.stderr[:200]}'}
        except Exception as e:
            return {'error': str(e)}
