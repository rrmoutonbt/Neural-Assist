"""
Neural Assistant Advanced Capabilities
- Image Generation (DALL-E 3, Stability AI)
- Vision / Image Understanding (GPT-4V, Claude Vision)
- Code Execution (sandboxed subprocess)

These integrate into the NeuralAssistant pipeline via the CapabilityRouter,
which detects user intent and dispatches to the appropriate handler.
"""

import asyncio
import base64
import io
import json
import logging
import os
import re
import subprocess
import tempfile
import time
from typing import Dict, List, Optional, Any, Tuple

logger = logging.getLogger(__name__)


# ============================================================================
# IMAGE GENERATION
# ============================================================================

class ImageGenerator:
    """Generate images via native GPU (diffusers), DALL-E 3, or Stability AI.

    Provider priority: native (local GPU) -> dall-e-3 -> stability-ai
    """

    def __init__(self):
        self._openai_client = None
        self._stability_key = None
        self._native_provider = None

    async def initialize(self):
        """Initialize available image generation backends."""
        # Native GPU provider (diffusers — no API key needed)
        try:
            from neural_assistant_native_providers import NativeImageProvider
            self._native_provider = NativeImageProvider()
            if self._native_provider.available:
                logger.info("ImageGenerator: Native GPU (diffusers) available")
            else:
                self._native_provider = None
        except ImportError:
            pass

        # DALL-E 3 via OpenAI
        openai_key = os.environ.get('OPENAI_API_KEY')
        if openai_key:
            try:
                from openai import AsyncOpenAI
                self._openai_client = AsyncOpenAI(api_key=openai_key)
                logger.info("ImageGenerator: DALL-E 3 ready")
            except ImportError:
                logger.warning("ImageGenerator: openai package not installed")

        # Stability AI
        self._stability_key = os.environ.get('STABILITY_API_KEY')
        if self._stability_key:
            logger.info("ImageGenerator: Stability AI ready")

    @property
    def available(self) -> bool:
        return (self._native_provider is not None or
                self._openai_client is not None or
                self._stability_key is not None)

    @property
    def providers(self) -> List[str]:
        p = []
        if self._native_provider:
            p.append(f'native-{self._native_provider._model_name}')
        if self._openai_client:
            p.append('dall-e-3')
        if self._stability_key:
            p.append('stability-ai')
        return p

    async def generate(self, prompt: str, size: str = "1024x1024",
                       style: str = "vivid", provider: str = "auto") -> Dict[str, Any]:
        """Generate an image from a text prompt.

        Provider priority for 'auto': native -> dall-e-3 -> stability-ai
        Returns:
            Dict with 'success', 'image_url' or 'image_base64', 'revised_prompt', 'provider'
        """
        if provider == "auto":
            if self._native_provider:
                provider = "native"
            elif self._openai_client:
                provider = "dall-e-3"
            elif self._stability_key:
                provider = "stability-ai"
            else:
                return {'success': False, 'error': 'No image generation provider available. Install diffusers for local GPU, or set OPENAI_API_KEY / STABILITY_API_KEY.'}

        if provider == "native":
            return await self._generate_native(prompt, size)

        if provider == "dall-e-3":
            return await self._generate_dalle(prompt, size, style)
        elif provider == "stability-ai":
            return await self._generate_stability(prompt, size)
        else:
            return {'success': False, 'error': f'Unknown image provider: {provider}'}

    async def _generate_dalle(self, prompt: str, size: str, style: str) -> Dict[str, Any]:
        """Generate image using DALL-E 3."""
        if not self._openai_client:
            return {'success': False, 'error': 'OpenAI client not initialized'}

        try:
            # Validate size
            valid_sizes = ["1024x1024", "1024x1792", "1792x1024"]
            if size not in valid_sizes:
                size = "1024x1024"

            resp = await self._openai_client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size=size,
                style=style,
                quality="standard",
                n=1,
                response_format="url",
            )

            image_data = resp.data[0]
            return {
                'success': True,
                'image_url': image_data.url,
                'revised_prompt': image_data.revised_prompt or prompt,
                'provider': 'dall-e-3',
                'size': size,
            }
        except Exception as e:
            logger.error(f"DALL-E 3 generation failed: {e}")
            return {'success': False, 'error': str(e), 'provider': 'dall-e-3'}

    async def _generate_stability(self, prompt: str, size: str) -> Dict[str, Any]:
        """Generate image using Stability AI."""
        if not self._stability_key:
            return {'success': False, 'error': 'Stability API key not set'}

        try:
            import httpx

            # Parse size
            try:
                width, height = map(int, size.split('x'))
            except ValueError:
                width, height = 1024, 1024

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                    headers={
                        "Authorization": f"Bearer {self._stability_key}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                    },
                    json={
                        "text_prompts": [{"text": prompt, "weight": 1}],
                        "cfg_scale": 7,
                        "width": min(width, 1024),
                        "height": min(height, 1024),
                        "steps": 30,
                        "samples": 1,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("artifacts"):
                img_b64 = data["artifacts"][0]["base64"]
                return {
                    'success': True,
                    'image_base64': img_b64,
                    'revised_prompt': prompt,
                    'provider': 'stability-ai',
                    'size': f"{width}x{height}",
                }
            return {'success': False, 'error': 'No image returned', 'provider': 'stability-ai'}

        except Exception as e:
            logger.error(f"Stability AI generation failed: {e}")
            return {'success': False, 'error': str(e), 'provider': 'stability-ai'}

    async def _generate_native(self, prompt: str, size: str) -> Dict[str, Any]:
        """Generate image using local GPU via diffusers."""
        if not self._native_provider:
            return {'success': False, 'error': 'Native image provider not available'}
        try:
            width, height = 1024, 1024
            try:
                w, h = size.split('x')
                width, height = int(w), int(h)
            except (ValueError, AttributeError):
                pass
            return await self._native_provider.generate(
                prompt=prompt, width=width, height=height,
            )
        except Exception as e:
            logger.error(f"Native image generation failed: {e}")
            return {'success': False, 'error': str(e), 'provider': 'native'}


# ============================================================================
# VISION / IMAGE UNDERSTANDING
# ============================================================================

class VisionAnalyzer:
    """Analyze images using GPT-4V or Claude Vision."""

    def __init__(self):
        self._openai_client = None
        self._anthropic_client = None

    async def initialize(self):
        openai_key = os.environ.get('OPENAI_API_KEY')
        if openai_key:
            try:
                from openai import AsyncOpenAI
                self._openai_client = AsyncOpenAI(api_key=openai_key)
                logger.info("VisionAnalyzer: GPT-4V ready")
            except ImportError:
                pass

        anthropic_key = os.environ.get('ANTHROPIC_API_KEY')
        if anthropic_key:
            try:
                from anthropic import AsyncAnthropic
                self._anthropic_client = AsyncAnthropic(api_key=anthropic_key)
                logger.info("VisionAnalyzer: Claude Vision ready")
            except ImportError:
                pass

    @property
    def available(self) -> bool:
        return self._openai_client is not None or self._anthropic_client is not None

    async def analyze(self, image_bytes: bytes, prompt: str = "Describe this image in detail.",
                      provider: str = "auto") -> Dict[str, Any]:
        """Analyze an image and return a text description.

        Args:
            image_bytes: Raw image file bytes
            prompt: Question or instruction about the image
            provider: 'gpt-4v', 'claude', or 'auto'
        """
        if provider == "auto":
            if self._openai_client:
                provider = "gpt-4v"
            elif self._anthropic_client:
                provider = "claude"
            else:
                return {'success': False, 'error': 'No vision provider available. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'}

        img_b64 = base64.b64encode(image_bytes).decode('utf-8')
        media_type = self._detect_media_type(image_bytes)

        if provider == "gpt-4v":
            return await self._analyze_openai(img_b64, media_type, prompt)
        elif provider == "claude":
            return await self._analyze_anthropic(img_b64, media_type, prompt)
        return {'success': False, 'error': f'Unknown vision provider: {provider}'}

    def _detect_media_type(self, data: bytes) -> str:
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return 'image/png'
        if data[:2] == b'\xff\xd8':
            return 'image/jpeg'
        if data[:4] == b'GIF8':
            return 'image/gif'
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return 'image/webp'
        return 'image/png'

    async def _analyze_openai(self, img_b64: str, media_type: str, prompt: str) -> Dict[str, Any]:
        try:
            resp = await self._openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {
                            "url": f"data:{media_type};base64,{img_b64}",
                            "detail": "high",
                        }},
                    ],
                }],
                max_tokens=1000,
            )

            if not resp.choices:
                return {'success': False, 'error': 'Empty response from GPT-4V'}

            return {
                'success': True,
                'description': resp.choices[0].message.content,
                'provider': 'gpt-4o-vision',
                'tokens_used': resp.usage.total_tokens if resp.usage else 0,
            }
        except Exception as e:
            logger.error(f"GPT-4V analysis failed: {e}")
            return {'success': False, 'error': str(e), 'provider': 'gpt-4v'}

    async def _analyze_anthropic(self, img_b64: str, media_type: str, prompt: str) -> Dict[str, Any]:
        try:
            resp = await self._anthropic_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1000,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": img_b64,
                        }},
                        {"type": "text", "text": prompt},
                    ],
                }],
            )

            content = ""
            if resp.content:
                first = resp.content[0]
                content = getattr(first, 'text', '') or ''

            return {
                'success': True,
                'description': content,
                'provider': 'claude-vision',
                'tokens_used': (resp.usage.input_tokens + resp.usage.output_tokens) if resp.usage else 0,
            }
        except Exception as e:
            logger.error(f"Claude Vision analysis failed: {e}")
            return {'success': False, 'error': str(e), 'provider': 'claude-vision'}


# ============================================================================
# CODE EXECUTION (SANDBOXED)
# ============================================================================

class CodeExecutor:
    """Execute code safely in isolated subprocess with resource limits.

    Uses subprocess with timeout and restricted permissions.
    For production, Docker sandboxing is recommended (see neural_assistant_plugin_system.py).
    """

    SUPPORTED_LANGUAGES = {
        'python': {'cmd': ['python3', '-c'], 'timeout': 15},
        'javascript': {'cmd': ['node', '-e'], 'timeout': 15},
        'bash': {'cmd': ['bash', '-c'], 'timeout': 10},
    }

    # Patterns that indicate dangerous operations
    BLOCKED_PATTERNS = {
        'python': [
            r'import\s+(os|sys|subprocess|shutil|socket|ctypes|signal|pty|commands|pipes|fcntl|resource)',
            r'from\s+(os|sys|subprocess|shutil|socket|ctypes|signal|pty|commands|pipes|fcntl|resource)\s+import',
            r'__import__\s*\(',
            r'importlib',
            r'exec\s*\(', r'eval\s*\(',
            r'compile\s*\(',
            r'getattr\s*\(',
            r'globals\s*\(', r'locals\s*\(',
            r'__builtins__', r'__subclasses__', r'__bases__', r'__mro__',
            r'open\s*\(',  # Block all file access
            r'os\.',
            r'subprocess\.',
            r'shutil\.',
            r'pathlib\.Path',
            r'io\.(open|FileIO|BufferedWriter|BufferedRandom)',
            r'socket\.',
            r'breakpoint\s*\(',
            r'input\s*\(',  # Blocks stdin reads that hang the process
        ],
        'javascript': [
            r'require\s*\(\s*[\'"](?:child_process|fs|net|http|https|os|cluster|dgram|dns|tls|vm|worker_threads)',
            r'import\s*\(',  # Dynamic import
            r'process\.(exit|env|kill|binding)',
            r'eval\s*\(',
            r'Function\s*\(',
            r'globalThis',
        ],
        'bash': [
            r'\brm\s',
            r'\bsudo\b',
            r'\bchmod\b', r'\bchown\b',
            r'\bcurl\b', r'\bwget\b',
            r'>\s*/dev/sd',
            r'\bmkfs\b',
            r'\bdd\s+if=',
            r'\bkill\b', r'\bkillall\b',
            r'\bmount\b', r'\bumount\b',
            r'\bcat\s+/etc/',
            r'\bnc\b', r'\bncat\b',  # netcat
            r'\bpython', r'\bperl\b', r'\bruby\b',  # interpreter escape
            r'\benv\b',
        ],
    }

    def __init__(self):
        self._execution_count = 0
        self._error_count = 0

    @property
    def available(self) -> bool:
        return True  # Subprocess always available

    async def execute(self, code: str, language: str = "python") -> Dict[str, Any]:
        """Execute code and return the output.

        Returns:
            Dict with 'success', 'output', 'error', 'execution_time', 'language'
        """
        language = language.lower().strip()

        if language not in self.SUPPORTED_LANGUAGES:
            return {
                'success': False,
                'error': f'Unsupported language: {language}. Supported: {list(self.SUPPORTED_LANGUAGES.keys())}',
                'language': language,
            }

        # Safety check
        safety = self._check_safety(code, language)
        if not safety['safe']:
            return {
                'success': False,
                'error': f'Code blocked for safety: {safety["reason"]}',
                'language': language,
                'blocked_pattern': safety.get('pattern', ''),
            }

        self._execution_count += 1
        lang_config = self.SUPPORTED_LANGUAGES[language]
        timeout = lang_config['timeout']

        try:
            start = time.time()

            # Run in subprocess with timeout
            result = await asyncio.to_thread(
                self._run_subprocess,
                lang_config['cmd'] + [code],
                timeout,
            )

            elapsed = time.time() - start

            return {
                'success': result['returncode'] == 0,
                'output': result['stdout'][:10000],  # Cap output at 10KB
                'error': result['stderr'][:5000] if result['stderr'] else None,
                'return_code': result['returncode'],
                'execution_time': round(elapsed, 3),
                'language': language,
            }

        except Exception as e:
            self._error_count += 1
            return {
                'success': False,
                'error': str(e),
                'language': language,
            }

    def _run_subprocess(self, cmd: List[str], timeout: int) -> Dict[str, Any]:
        """Run subprocess with timeout and capture output."""
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tempfile.gettempdir(),
                env=self._safe_env(),
            )
            return {
                'stdout': proc.stdout,
                'stderr': proc.stderr,
                'returncode': proc.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                'stdout': '',
                'stderr': f'Execution timed out after {timeout}s',
                'returncode': -1,
            }

    def _safe_env(self) -> Dict[str, str]:
        """Create a restricted environment for subprocess execution."""
        safe = {}
        # Only pass through essential env vars
        for key in ['PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME']:
            val = os.environ.get(key)
            if val:
                safe[key] = val
        # Explicitly exclude API keys and secrets
        return safe

    def _check_safety(self, code: str, language: str) -> Dict[str, Any]:
        """Check code for dangerous patterns."""
        patterns = self.BLOCKED_PATTERNS.get(language, [])
        for pattern in patterns:
            match = re.search(pattern, code, re.IGNORECASE)
            if match:
                return {
                    'safe': False,
                    'reason': f'Blocked pattern detected: {match.group()}',
                    'pattern': pattern,
                }
        return {'safe': True}


# ============================================================================
# CAPABILITY ROUTER — INTENT DETECTION
# ============================================================================

class CapabilityRouter:
    """Detects user intent and routes to the appropriate capability.

    Integrated into the chat pipeline to intercept messages that should
    trigger image generation, code execution, or vision analysis.
    """

    # Image generation intent patterns
    IMAGE_GEN_PATTERNS = [
        r'(?:generate|create|make|draw|paint|design|produce)\s+(?:an?\s+)?(?:image|picture|photo|illustration|art|drawing|painting|icon|logo|banner)',
        r'(?:image|picture|photo|illustration)\s+of\b',
        r'(?:show me|visualize|depict|render)\s+',
        r'^(?:draw|paint|sketch|illustrate)\s+',
    ]

    # Transcription intent patterns
    TRANSCRIBE_PATTERNS = [
        r'(?:transcribe|convert|extract\s+text\s+from)\s+(?:this|the|my)?\s*(?:audio|video|recording|speech|voice|podcast|meeting)',
        r'(?:what\s+does?\s+(?:this|the)\s+(?:audio|video|recording)\s+say)',
        r'(?:speech\s+to\s+text|voice\s+to\s+text|audio\s+to\s+text)',
    ]

    # Code execution intent patterns
    CODE_EXEC_PATTERNS = [
        r'```(\w+)\n([\s\S]+?)```',  # Fenced code blocks
        r'(?:run|execute|eval)\s+(?:this|the|my)?\s*(?:code|script|program)',
    ]

    # Code block language detection
    CODE_BLOCK_RE = re.compile(r'```(\w*)\n([\s\S]+?)```')

    def detect_intent(self, message: str) -> Dict[str, Any]:
        """Detect special capabilities needed for this message.

        Returns:
            Dict with 'type' (one of: 'image_gen', 'code_exec', 'chat'),
            plus extracted parameters.
        """
        # Check for image generation
        for pattern in self.IMAGE_GEN_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                prompt = self._extract_image_prompt(message)
                size = self._extract_image_size(message)
                return {
                    'type': 'image_gen',
                    'prompt': prompt,
                    'size': size,
                    'original_message': message,
                }

        # Check for code execution (fenced code blocks with run intent)
        code_blocks = self.CODE_BLOCK_RE.findall(message)
        if code_blocks:
            # Check if user wants to run the code
            run_intent = bool(re.search(
                r'(?:run|execute|try|test|eval|output)',
                message, re.IGNORECASE
            ))
            if run_intent or message.strip().startswith('```'):
                lang = code_blocks[0][0] or 'python'
                code = code_blocks[0][1].strip()
                return {
                    'type': 'code_exec',
                    'language': lang,
                    'code': code,
                    'original_message': message,
                }

        # Check for explicit run commands
        for pattern in self.CODE_EXEC_PATTERNS[1:]:
            if re.search(pattern, message, re.IGNORECASE):
                return {
                    'type': 'code_exec_request',
                    'original_message': message,
                }

        # Check for transcription intent
        for pattern in self.TRANSCRIBE_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return {
                    'type': 'transcribe_request',
                    'original_message': message,
                }

        return {'type': 'chat', 'original_message': message}

    def _extract_image_prompt(self, message: str) -> str:
        """Extract the image description from the message."""
        # Remove the command prefix
        prompt = message
        for prefix in ['generate an image of', 'create an image of', 'draw',
                        'generate a picture of', 'create a picture of',
                        'make an image of', 'paint', 'show me', 'visualize',
                        'generate image of', 'create image of', 'generate image',
                        'create image', 'make image', 'generate a', 'create a']:
            pattern = re.compile(re.escape(prefix), re.IGNORECASE)
            prompt = pattern.sub('', prompt, count=1)
        return prompt.strip().rstrip('.!') or message

    def _extract_image_size(self, message: str) -> str:
        """Extract desired image size from message."""
        size_match = re.search(r'(\d{3,4})\s*[xX]\s*(\d{3,4})', message)
        if size_match:
            w, h = int(size_match.group(1)), int(size_match.group(2))
            # Snap to DALL-E 3 supported sizes
            if w > h:
                return "1792x1024"
            elif h > w:
                return "1024x1792"
        return "1024x1024"


# ============================================================================
# CAPABILITY MANAGER — TIES IT ALL TOGETHER
# ============================================================================

class CapabilityManager:
    """Manages all advanced capabilities and integrates them into the chat pipeline."""

    def __init__(self):
        self.image_generator = ImageGenerator()
        self.vision_analyzer = VisionAnalyzer()
        self.code_executor = CodeExecutor()
        self.transcription = None  # Initialized lazily
        self.router = CapabilityRouter()

    async def initialize(self):
        """Initialize all capability backends."""
        await self.image_generator.initialize()
        await self.vision_analyzer.initialize()

        # Initialize native transcription
        try:
            from neural_assistant_native_providers import NativeTranscriptionProvider
            self.transcription = NativeTranscriptionProvider()
            if self.transcription.available:
                logger.info(f"Transcription: Whisper available (model={self.transcription._model_size})")
            else:
                logger.info("Transcription: Whisper not installed (pip install openai-whisper)")
        except ImportError:
            logger.info("Transcription: native providers module not found")

        logger.info(
            f"Capabilities initialized — "
            f"image_gen={self.image_generator.available} ({self.image_generator.providers}), "
            f"vision={self.vision_analyzer.available}, "
            f"code_exec={self.code_executor.available}, "
            f"transcription={self.transcription is not None and self.transcription.available}"
        )

    async def process_message(self, message: str) -> Optional[Dict[str, Any]]:
        """Check if a message triggers a capability. Returns result or None for normal chat."""
        intent = self.router.detect_intent(message)

        if intent['type'] == 'image_gen':
            if not self.image_generator.available:
                return {
                    'handled': True,
                    'content': 'Image generation is not available. Set OPENAI_API_KEY or STABILITY_API_KEY to enable it.',
                    'type': 'error',
                }
            result = await self.image_generator.generate(
                prompt=intent['prompt'],
                size=intent.get('size', '1024x1024'),
            )
            if result['success']:
                return {
                    'handled': True,
                    'type': 'image',
                    'content': f"Generated image: {result.get('revised_prompt', intent['prompt'])}",
                    'image_url': result.get('image_url'),
                    'image_base64': result.get('image_base64'),
                    'provider': result.get('provider'),
                    'size': result.get('size'),
                }
            return {
                'handled': True,
                'type': 'error',
                'content': f"Image generation failed: {result.get('error', 'Unknown error')}",
            }

        elif intent['type'] == 'code_exec':
            result = await self.code_executor.execute(
                code=intent['code'],
                language=intent.get('language', 'python'),
            )
            output = result.get('output', '').strip()
            error = result.get('error', '')
            exec_time = result.get('execution_time', 0)

            if result['success']:
                content = f"Code executed successfully ({intent.get('language', 'python')}, {exec_time}s):\n```\n{output}\n```"
            else:
                content = f"Code execution failed:\n```\n{error or output}\n```"

            return {
                'handled': True,
                'type': 'code_result',
                'content': content,
                'output': output,
                'error': error,
                'execution_time': exec_time,
                'language': intent.get('language', 'python'),
                'success': result['success'],
            }

        elif intent['type'] == 'code_exec_request':
            return {
                'handled': True,
                'type': 'code_prompt',
                'content': "Please provide your code in a fenced code block. Example:\n\n````\n```python\nprint('Hello, world!')\n```\n````",
            }

        elif intent['type'] == 'transcribe_request':
            avail = self.transcription and self.transcription.available
            return {
                'handled': True,
                'type': 'transcribe_prompt',
                'content': (
                    "Upload an audio or video file and I'll transcribe it for you. "
                    "Supported formats: MP3, WAV, FLAC, AAC, OGG, MP4, AVI, MOV, MKV, WEBM."
                ) if avail else (
                    "Transcription is not available. Install Whisper: pip install openai-whisper"
                ),
            }

        return None  # Normal chat — not handled by capabilities

    async def analyze_image(self, image_bytes: bytes,
                            prompt: str = "Describe this image in detail.") -> Dict[str, Any]:
        """Analyze an uploaded image using vision AI."""
        if not self.vision_analyzer.available:
            return {
                'success': False,
                'error': 'Vision analysis not available. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.',
            }
        return await self.vision_analyzer.analyze(image_bytes, prompt)

    async def transcribe_file(self, file_bytes: bytes, filename: str,
                               language: Optional[str] = None,
                               model_size: Optional[str] = None,
                               output_format: str = 'txt') -> Dict[str, Any]:
        """Transcribe an audio/video file using Whisper."""
        if not self.transcription or not self.transcription.available:
            return {
                'success': False,
                'error': 'Transcription not available. pip install openai-whisper',
            }

        result = await self.transcription.transcribe(
            file_bytes, filename, language=language, model_size=model_size,
        )

        if result.get('success') and output_format != 'json':
            result['formatted_output'] = self.transcription.format_output(result, output_format)

        return result

    def get_status(self) -> Dict[str, Any]:
        trans_status = {'available': False}
        if self.transcription:
            trans_status = {
                'available': self.transcription.available,
                **self.transcription.model_info,
            }

        return {
            'image_generation': {
                'available': self.image_generator.available,
                'providers': self.image_generator.providers,
            },
            'vision': {
                'available': self.vision_analyzer.available,
            },
            'code_execution': {
                'available': self.code_executor.available,
                'languages': list(CodeExecutor.SUPPORTED_LANGUAGES.keys()),
                'executions': self.code_executor._execution_count,
                'errors': self.code_executor._error_count,
            },
            'transcription': trans_status,
        }
