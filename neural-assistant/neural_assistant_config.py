"""
Neural Assistant Configuration System
Comprehensive configuration management with environment-specific settings
"""

import os
import re
import copy
import json
import yaml
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field, fields
from enum import Enum
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# CONFIGURATION ENUMS & TYPES
# ============================================================================

class Environment(Enum):
    """Deployment environments"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    LOCAL = "local"


class LogLevel(Enum):
    """Logging levels"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class ModelTier(Enum):
    """Model performance tiers"""
    LIGHT = "light"        # Fast, basic capabilities
    STANDARD = "standard"  # Balanced performance
    PREMIUM = "premium"    # High capability, slower
    ENTERPRISE = "enterprise"  # Maximum capability


# ============================================================================
# CONFIGURATION DATA CLASSES
# ============================================================================

@dataclass
class TransformerConfig:
    """Transformer architecture configuration"""
    layers: int = 24
    d_model: int = 512
    n_heads: int = 8
    d_ff: int = 2048
    context_window: int = 8192
    attention_type: str = "sparse"
    dropout_rate: float = 0.1
    activation_function: str = "gelu"


@dataclass
class ModelProviderConfig:
    """Individual model provider configuration"""
    enabled: bool = True
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: str = ""
    max_tokens: int = 1000
    temperature: float = 0.7
    timeout: float = 30.0
    rate_limit: int = 100  # requests per minute
    retry_attempts: int = 3
    retry_delay: float = 1.0


@dataclass
class CognitiveConfig:
    """Cognitive framework configuration"""
    reasoning_depth: int = 5
    memory_capacity: int = 10000
    analysis_timeout: float = 10.0
    parallel_processing: bool = True
    learning_rate: float = 0.001
    memory_consolidation: bool = True
    context_awareness: bool = True


@dataclass
class SafetyConfig:
    """Constitutional AI safety configuration"""
    safety_level: str = "standard"
    content_filtering: bool = True
    harmful_pattern_detection: bool = True
    constitutional_weight: float = 1.0
    safety_threshold: float = 0.7
    moderation_endpoint: Optional[str] = None
    custom_safety_rules: List[str] = field(default_factory=list)


@dataclass
class PerformanceConfig:
    """Performance optimization configuration"""
    max_concurrent_sessions: int = 1000
    message_queue_size: int = 10000
    cache_enabled: bool = True
    cache_ttl: int = 3600  # seconds
    batch_processing: bool = True
    batch_size: int = 32
    memory_optimization: bool = True
    gpu_acceleration: bool = False


@dataclass
class MultimodalConfig:
    """Multimodal processing configuration"""
    image_processing: bool = True
    document_processing: bool = True
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    supported_formats: List[str] = field(default_factory=lambda: [
        'txt', 'md', 'py', 'js', 'html', 'css', 'json', 'xml', 'yaml',
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg',
        'pdf', 'docx', 'xlsx', 'csv'
    ])
    vision_model: str = "clip"
    ocr_enabled: bool = True


@dataclass
class ContextCompressionConfig:
    """Context window compression configuration"""
    enabled: bool = True
    auto_compress: bool = True
    compression_threshold: float = 0.75  # fraction of context_window to trigger
    recent_messages_to_keep: int = 10
    max_summary_tokens: int = 500
    preserve_system_messages: bool = True
    extractive_fallback: bool = True  # use keyword extraction when no LLM available


@dataclass
class ToolPermissionConfig:
    """Tool execution permission and audit configuration"""
    enabled: bool = True
    default_permission: str = "allow"  # allow, ask, deny
    audit_enabled: bool = True
    audit_file: str = "tool_audit.jsonl"
    policies: List[Dict[str, Any]] = field(default_factory=lambda: [
        {"tool_name": "code_execution", "permission": "ask", "conditions": {}},
        {"tool_name": "file_management", "permission": "allow",
         "conditions": {"allowed_paths": ["."], "denied_paths": ["/etc", "/root", "C:\\Windows"]}},
    ])


@dataclass
class MCPConfig:
    """Model Context Protocol integration configuration"""
    enabled: bool = False
    servers: List[Dict[str, Any]] = field(default_factory=list)
    default_timeout: float = 30.0
    auto_discover: bool = True
    max_servers: int = 20
    reconnect_attempts: int = 3
    reconnect_delay: float = 5.0


@dataclass
class SecurityConfig:
    """Security and authentication configuration"""
    api_key_encryption: bool = True
    session_encryption: bool = True
    rate_limiting: bool = True
    rate_limit_per_minute: int = 60
    ip_whitelist: List[str] = field(default_factory=list)
    cors_origins: List[str] = field(default_factory=lambda: ["*"])
    auth_required: bool = False
    token_expiry: int = 3600  # seconds
    max_login_attempts: int = 5


# ============================================================================
# MAIN CONFIGURATION CLASS
# ============================================================================

@dataclass
class NeuralAssistantConfig:
    """Complete Neural Assistant configuration"""
    
    # Environment settings
    environment: Environment = Environment.DEVELOPMENT
    debug: bool = True
    log_level: LogLevel = LogLevel.INFO
    
    # Core architecture
    transformer: TransformerConfig = field(default_factory=TransformerConfig)
    cognitive: CognitiveConfig = field(default_factory=CognitiveConfig)
    safety: SafetyConfig = field(default_factory=SafetyConfig)
    performance: PerformanceConfig = field(default_factory=PerformanceConfig)
    multimodal: MultimodalConfig = field(default_factory=MultimodalConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    compression: ContextCompressionConfig = field(default_factory=ContextCompressionConfig)
    tool_permissions: ToolPermissionConfig = field(default_factory=ToolPermissionConfig)
    mcp: MCPConfig = field(default_factory=MCPConfig)

    # Model providers
    providers: Dict[str, ModelProviderConfig] = field(default_factory=dict)
    default_provider: str = "cognitive_core"
    
    # API settings
    api_host: str = "localhost"
    api_port: int = 8000
    api_prefix: str = "/api/v1"
    
    # Database
    database_url: str = "sqlite:///neural_assistant.db"
    database_pool_size: int = 10
    
    # Logging
    log_file: str = "neural_assistant.log"
    log_rotation: str = "daily"
    log_retention: int = 30  # days


# ============================================================================
# CONFIGURATION MANAGER
# ============================================================================

class ConfigurationManager:
    """Manage Neural Assistant configuration across environments"""
    
    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or Path("config")
        self.config_path.mkdir(exist_ok=True)
        
        # Environment-specific config files
        self.config_files = {
            Environment.DEVELOPMENT: self.config_path / "development.yaml",
            Environment.STAGING: self.config_path / "staging.yaml", 
            Environment.PRODUCTION: self.config_path / "production.yaml",
            Environment.LOCAL: self.config_path / "local.yaml"
        }
        
        # Ensure config files exist
        self._ensure_config_files()
    
    def _ensure_config_files(self):
        """Create default configuration files if they don't exist"""
        for env, config_file in self.config_files.items():
            if not config_file.exists():
                default_config = self._create_default_config(env)
                self.save_config(default_config, env)
    
    def _create_default_config(self, environment: Environment) -> NeuralAssistantConfig:
        """Create default configuration for environment"""
        
        if environment == Environment.DEVELOPMENT:
            return NeuralAssistantConfig(
                environment=environment,
                debug=True,
                log_level=LogLevel.DEBUG,
                transformer=TransformerConfig(
                    layers=12,
                    d_model=256,
                    n_heads=4,
                    context_window=4096
                ),
                performance=PerformanceConfig(
                    max_concurrent_sessions=100,
                    gpu_acceleration=False
                ),
                providers={
                    "cognitive_core": ModelProviderConfig(
                        enabled=True,
                        model_name="CognitiveBeeBot",
                        max_tokens=500
                    ),
                    "ollama": ModelProviderConfig(
                        enabled=True,
                        base_url="http://localhost:11434",
                        model_name="llama2:7b",
                        max_tokens=1000
                    )
                }
            )
        
        elif environment == Environment.STAGING:
            return NeuralAssistantConfig(
                environment=environment,
                debug=False,
                log_level=LogLevel.INFO,
                transformer=TransformerConfig(
                    layers=24,
                    d_model=512,
                    n_heads=8,
                    context_window=8192
                ),
                performance=PerformanceConfig(
                    max_concurrent_sessions=500,
                    gpu_acceleration=True
                ),
                safety=SafetyConfig(
                    safety_level="strict",
                    content_filtering=True
                )
            )
        
        elif environment == Environment.PRODUCTION:
            return NeuralAssistantConfig(
                environment=environment,
                debug=False,
                log_level=LogLevel.WARNING,
                transformer=TransformerConfig(
                    layers=32,
                    d_model=768,
                    n_heads=12,
                    context_window=16384
                ),
                performance=PerformanceConfig(
                    max_concurrent_sessions=2000,
                    gpu_acceleration=True,
                    batch_processing=True,
                    memory_optimization=True
                ),
                safety=SafetyConfig(
                    safety_level="maximum",
                    content_filtering=True,
                    constitutional_weight=1.2
                ),
                security=SecurityConfig(
                    api_key_encryption=True,
                    session_encryption=True,
                    rate_limiting=True,
                    auth_required=True
                )
            )
        
        else:  # LOCAL
            return NeuralAssistantConfig(
                environment=environment,
                transformer=TransformerConfig(
                    layers=8,
                    d_model=256,
                    n_heads=4,
                    context_window=2048
                ),
                providers={
                    "cognitive_core": ModelProviderConfig(
                        enabled=True,
                        model_name="CognitiveBeeBot-Light"
                    )
                }
            )
    
    def load_config(self, environment: Environment) -> NeuralAssistantConfig:
        """Load configuration for specified environment"""
        config_file = self.config_files[environment]
        
        if not config_file.exists():
            logger.warning(f"Config file {config_file} not found, using defaults")
            return self._create_default_config(environment)
        
        try:
            with open(config_file, 'r') as f:
                config_data = yaml.safe_load(f)
            
            # Convert dict to config object
            return self._dict_to_config(config_data, environment)
            
        except Exception as e:
            logger.error(f"Failed to load config from {config_file}: {e}")
            return self._create_default_config(environment)
    
    def save_config(self, config: NeuralAssistantConfig, environment: Environment):
        """Save configuration to file"""
        config_file = self.config_files[environment]
        
        try:
            config_dict = self._config_to_dict(config)
            
            with open(config_file, 'w') as f:
                yaml.dump(config_dict, f, indent=2, default_flow_style=False)
            
            logger.info(f"Configuration saved to {config_file}")
            
        except Exception as e:
            logger.error(f"Failed to save config to {config_file}: {e}")
    
    def _config_to_dict(self, config: NeuralAssistantConfig) -> Dict[str, Any]:
        """Convert config object to dictionary"""
        return {
            'environment': config.environment.value,
            'debug': config.debug,
            'log_level': config.log_level.value,
            
            'transformer': {
                'layers': config.transformer.layers,
                'd_model': config.transformer.d_model,
                'n_heads': config.transformer.n_heads,
                'd_ff': config.transformer.d_ff,
                'context_window': config.transformer.context_window,
                'attention_type': config.transformer.attention_type,
                'dropout_rate': config.transformer.dropout_rate,
                'activation_function': config.transformer.activation_function
            },
            
            'cognitive': {
                'reasoning_depth': config.cognitive.reasoning_depth,
                'memory_capacity': config.cognitive.memory_capacity,
                'analysis_timeout': config.cognitive.analysis_timeout,
                'parallel_processing': config.cognitive.parallel_processing,
                'learning_rate': config.cognitive.learning_rate,
                'memory_consolidation': config.cognitive.memory_consolidation,
                'context_awareness': config.cognitive.context_awareness
            },
            
            'safety': {
                'safety_level': config.safety.safety_level,
                'content_filtering': config.safety.content_filtering,
                'harmful_pattern_detection': config.safety.harmful_pattern_detection,
                'constitutional_weight': config.safety.constitutional_weight,
                'safety_threshold': config.safety.safety_threshold,
                'moderation_endpoint': config.safety.moderation_endpoint,
                'custom_safety_rules': config.safety.custom_safety_rules
            },
            
            'performance': {
                'max_concurrent_sessions': config.performance.max_concurrent_sessions,
                'message_queue_size': config.performance.message_queue_size,
                'cache_enabled': config.performance.cache_enabled,
                'cache_ttl': config.performance.cache_ttl,
                'batch_processing': config.performance.batch_processing,
                'batch_size': config.performance.batch_size,
                'memory_optimization': config.performance.memory_optimization,
                'gpu_acceleration': config.performance.gpu_acceleration
            },
            
            'multimodal': {
                'image_processing': config.multimodal.image_processing,
                'document_processing': config.multimodal.document_processing,
                'max_file_size': config.multimodal.max_file_size,
                'supported_formats': config.multimodal.supported_formats,
                'vision_model': config.multimodal.vision_model,
                'ocr_enabled': config.multimodal.ocr_enabled,
            },

            'security': {
                'api_key_encryption': config.security.api_key_encryption,
                'session_encryption': config.security.session_encryption,
                'rate_limiting': config.security.rate_limiting,
                'ip_whitelist': config.security.ip_whitelist,
                'cors_origins': config.security.cors_origins,
                'auth_required': config.security.auth_required,
                'token_expiry': config.security.token_expiry,
                'max_login_attempts': config.security.max_login_attempts,
            },

            'compression': {
                'enabled': config.compression.enabled,
                'auto_compress': config.compression.auto_compress,
                'compression_threshold': config.compression.compression_threshold,
                'recent_messages_to_keep': config.compression.recent_messages_to_keep,
                'max_summary_tokens': config.compression.max_summary_tokens,
                'preserve_system_messages': config.compression.preserve_system_messages,
                'extractive_fallback': config.compression.extractive_fallback,
            },

            'tool_permissions': {
                'enabled': config.tool_permissions.enabled,
                'default_permission': config.tool_permissions.default_permission,
                'audit_enabled': config.tool_permissions.audit_enabled,
                'audit_file': config.tool_permissions.audit_file,
                'policies': config.tool_permissions.policies,
            },

            'mcp': {
                'enabled': config.mcp.enabled,
                'servers': config.mcp.servers,
                'default_timeout': config.mcp.default_timeout,
                'auto_discover': config.mcp.auto_discover,
                'max_servers': config.mcp.max_servers,
                'reconnect_attempts': config.mcp.reconnect_attempts,
                'reconnect_delay': config.mcp.reconnect_delay,
            },

            'providers': {
                name: {
                    'enabled': provider.enabled,
                    'api_key': None,  # omit real key to prevent round-trip destruction
                    'base_url': provider.base_url,
                    'model_name': provider.model_name,
                    'max_tokens': provider.max_tokens,
                    'temperature': provider.temperature,
                    'timeout': provider.timeout,
                    'rate_limit': provider.rate_limit,
                    'retry_attempts': provider.retry_attempts,
                    'retry_delay': provider.retry_delay
                }
                for name, provider in config.providers.items()
            },

            'api': {
                'host': config.api_host,
                'port': config.api_port,
                'prefix': config.api_prefix
            },
            
            'database': {
                'url': re.sub(r'://[^@]+@', '://***:***@', config.database_url) if config.database_url and '@' in config.database_url else config.database_url,
                'pool_size': config.database_pool_size
            },
            
            'logging': {
                'file': config.log_file,
                'rotation': config.log_rotation,
                'retention': config.log_retention
            }
        }
    
    def _dict_to_config(self, config_dict: Dict[str, Any], environment: Environment) -> NeuralAssistantConfig:
        """Convert dictionary to config object"""
        
        # Create provider configs
        providers = {}
        known_fields = {f.name for f in fields(ModelProviderConfig)}
        for name, provider_data in config_dict.get('providers', {}).items():
            filtered = {k: v for k, v in provider_data.items() if k in known_fields}
            if filtered.get('api_key') == '***REDACTED***':
                filtered['api_key'] = None
            providers[name] = ModelProviderConfig(**filtered)

        def _filter_for(cls, data):
            known = {f.name for f in fields(cls)}
            return {k: v for k, v in data.items() if k in known}

        return NeuralAssistantConfig(
            environment=environment,
            debug=config_dict.get('debug', True),
            log_level=LogLevel(config_dict.get('log_level', 'INFO')),

            transformer=TransformerConfig(**_filter_for(TransformerConfig, config_dict.get('transformer', {}))),
            cognitive=CognitiveConfig(**_filter_for(CognitiveConfig, config_dict.get('cognitive', {}))),
            safety=SafetyConfig(**_filter_for(SafetyConfig, config_dict.get('safety', {}))),
            performance=PerformanceConfig(**_filter_for(PerformanceConfig, config_dict.get('performance', {}))),
            multimodal=MultimodalConfig(**_filter_for(MultimodalConfig, config_dict.get('multimodal', {}))),
            security=SecurityConfig(**_filter_for(SecurityConfig, config_dict.get('security', {}))),
            compression=ContextCompressionConfig(**_filter_for(ContextCompressionConfig, config_dict.get('compression', {}))),
            tool_permissions=ToolPermissionConfig(**_filter_for(ToolPermissionConfig, config_dict.get('tool_permissions', {}))),
            mcp=MCPConfig(**_filter_for(MCPConfig, config_dict.get('mcp', {}))),

            providers=providers,
            default_provider=config_dict.get('default_provider', 'cognitive_core'),
            
            api_host=config_dict.get('api', {}).get('host', 'localhost'),
            api_port=config_dict.get('api', {}).get('port', 8000),
            api_prefix=config_dict.get('api', {}).get('prefix', '/api/v1'),
            
            database_url=config_dict.get('database', {}).get('url', 'sqlite:///neural_assistant.db'),
            database_pool_size=config_dict.get('database', {}).get('pool_size', 10),
            
            log_file=config_dict.get('logging', {}).get('file', 'neural_assistant.log'),
            log_rotation=config_dict.get('logging', {}).get('rotation', 'daily'),
            log_retention=config_dict.get('logging', {}).get('retention', 30)
        )


# ============================================================================
# CONFIGURATION TEMPLATES
# ============================================================================

class ConfigurationTemplates:
    """Pre-configured templates for different use cases"""
    
    @staticmethod
    def get_lightweight_config() -> NeuralAssistantConfig:
        """Lightweight configuration for resource-constrained environments"""
        return NeuralAssistantConfig(
            transformer=TransformerConfig(
                layers=6,
                d_model=256,
                n_heads=4,
                context_window=2048,
                attention_type="local"
            ),
            cognitive=CognitiveConfig(
                reasoning_depth=3,
                memory_capacity=1000,
                parallel_processing=False
            ),
            performance=PerformanceConfig(
                max_concurrent_sessions=50,
                cache_enabled=True,
                memory_optimization=True,
                gpu_acceleration=False
            ),
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Light",
                    max_tokens=500
                )
            }
        )
    
    @staticmethod
    def get_enterprise_config() -> NeuralAssistantConfig:
        """Enterprise-grade configuration with maximum capabilities"""
        return NeuralAssistantConfig(
            environment=Environment.PRODUCTION,
            debug=False,
            log_level=LogLevel.WARNING,
            
            transformer=TransformerConfig(
                layers=48,
                d_model=1024,
                n_heads=16,
                context_window=32768,
                attention_type="full"
            ),
            
            cognitive=CognitiveConfig(
                reasoning_depth=10,
                memory_capacity=100000,
                parallel_processing=True,
                learning_rate=0.0001
            ),
            
            safety=SafetyConfig(
                safety_level="maximum",
                content_filtering=True,
                constitutional_weight=1.5
            ),
            
            performance=PerformanceConfig(
                max_concurrent_sessions=5000,
                batch_processing=True,
                batch_size=64,
                gpu_acceleration=True
            ),
            
            security=SecurityConfig(
                api_key_encryption=True,
                session_encryption=True,
                rate_limiting=True,
                auth_required=True
            ),
            
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Enterprise",
                    max_tokens=4000
                ),
                "openai": ModelProviderConfig(
                    enabled=True,
                    model_name="gpt-4-turbo",
                    max_tokens=4000,
                    rate_limit=1000
                ),
                "anthropic": ModelProviderConfig(
                    enabled=True,
                    model_name="claude-3-opus-20240229",
                    max_tokens=4000,
                    rate_limit=1000
                )
            }
        )
    
    @staticmethod
    def get_research_config() -> NeuralAssistantConfig:
        """Research-oriented configuration with experimental features"""
        return NeuralAssistantConfig(
            transformer=TransformerConfig(
                layers=32,
                d_model=768,
                n_heads=12,
                context_window=16384,
                attention_type="sparse",
                dropout_rate=0.0  # No dropout for research consistency
            ),
            
            cognitive=CognitiveConfig(
                reasoning_depth=15,
                memory_capacity=50000,
                parallel_processing=True,
                memory_consolidation=True,
                context_awareness=True
            ),
            
            safety=SafetyConfig(
                safety_level="standard",
                content_filtering=False,  # Allow research content
                constitutional_weight=0.8
            ),
            
            multimodal=MultimodalConfig(
                image_processing=True,
                document_processing=True,
                max_file_size=200 * 1024 * 1024,  # 200MB for research data
                vision_model="clip",
                ocr_enabled=True
            ),
            
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Research",
                    max_tokens=8000
                ),
                "ollama": ModelProviderConfig(
                    enabled=True,
                    base_url="http://localhost:11434",
                    model_name="llama2:70b",
                    max_tokens=4000
                )
            }
        )


# ============================================================================
# ENVIRONMENT CONFIGURATION LOADER
# ============================================================================

class EnvironmentConfigLoader:
    """Load configuration based on environment variables and files"""
    
    def __init__(self):
        self.config_manager = ConfigurationManager()
    
    def load_from_environment(self) -> NeuralAssistantConfig:
        """Load configuration from environment variables and files"""
        
        # Determine environment
        env_name = os.getenv('NEURAL_ASSISTANT_ENV', 'development').lower()
        try:
            environment = Environment(env_name)
        except ValueError:
            logger.warning(f"Unknown environment '{env_name}', using development")
            environment = Environment.DEVELOPMENT
        
        # Load base config from file
        config = self.config_manager.load_config(environment)
        
        # Override with environment variables
        config = self._apply_env_overrides(config)
        
        # Validate configuration
        self._validate_config(config)
        
        return config
    
    def _apply_env_overrides(self, config: NeuralAssistantConfig) -> NeuralAssistantConfig:
        """Apply environment variable overrides.

        API keys from environment are injected both into the provider configs
        and as top-level attributes so that NeuralAssistant._initialize_providers()
        can discover them regardless of whether a provider block was declared in
        the config file.
        """

        # API Keys — populate provider configs AND top-level for discovery
        openai_key = os.getenv('OPENAI_API_KEY')
        if openai_key:
            if 'openai' not in config.providers:
                config.providers['openai'] = ModelProviderConfig(
                    enabled=True, model_name='gpt-4', api_key=openai_key,
                )
            else:
                config.providers['openai'].api_key = openai_key

        anthropic_key = os.getenv('ANTHROPIC_API_KEY')
        if anthropic_key:
            if 'anthropic' not in config.providers:
                config.providers['anthropic'] = ModelProviderConfig(
                    enabled=True, model_name='claude-sonnet-4-20250514', api_key=anthropic_key,
                )
            else:
                config.providers['anthropic'].api_key = anthropic_key

        google_key = os.getenv('GOOGLE_API_KEY')
        if google_key:
            if 'google' not in config.providers:
                config.providers['google'] = ModelProviderConfig(
                    enabled=True, model_name='gemini-1.5-flash', api_key=google_key,
                )
            else:
                config.providers['google'].api_key = google_key

        # API settings
        if os.getenv('API_HOST'):
            config.api_host = os.getenv('API_HOST')

        if os.getenv('API_PORT'):
            try:
                config.api_port = int(os.getenv('API_PORT'))
            except (ValueError, TypeError):
                logger.warning(f"Invalid API_PORT value: {os.getenv('API_PORT')!r}, keeping default")

        # Database URL
        if os.getenv('DATABASE_URL'):
            config.database_url = os.getenv('DATABASE_URL')

        # Performance settings
        if os.getenv('MAX_CONCURRENT_SESSIONS'):
            try:
                config.performance.max_concurrent_sessions = int(os.getenv('MAX_CONCURRENT_SESSIONS'))
            except (ValueError, TypeError):
                logger.warning(f"Invalid MAX_CONCURRENT_SESSIONS value: {os.getenv('MAX_CONCURRENT_SESSIONS')!r}")

        # GPU acceleration
        if os.getenv('GPU_ACCELERATION'):
            config.performance.gpu_acceleration = os.getenv('GPU_ACCELERATION').lower() == 'true'

        # Safety level
        if os.getenv('SAFETY_LEVEL'):
            config.safety.safety_level = os.getenv('SAFETY_LEVEL')

        # CORS origins (comma-separated)
        if os.getenv('CORS_ORIGINS'):
            config.security.cors_origins = [
                o.strip() for o in os.getenv('CORS_ORIGINS').split(',') if o.strip()
            ]

        # Auth required flag
        if os.getenv('AUTH_REQUIRED'):
            config.security.auth_required = os.getenv('AUTH_REQUIRED').lower() == 'true'

        # Ollama configuration
        if os.getenv('OLLAMA_URL'):
            if 'ollama' not in config.providers:
                config.providers['ollama'] = ModelProviderConfig(
                    enabled=True, base_url=os.getenv('OLLAMA_URL'),
                    model_name=os.getenv('OLLAMA_MODEL', 'llama3.2'),
                )
            else:
                config.providers['ollama'].base_url = os.getenv('OLLAMA_URL')

        # Local LLM configuration (in-process inference)
        if os.getenv('LOCAL_LLM_ENABLED'):
            if 'local' not in config.providers:
                config.providers['local'] = ModelProviderConfig(
                    enabled=os.getenv('LOCAL_LLM_ENABLED', '').lower() == 'true',
                    model_name=os.getenv('LOCAL_LLM_MODEL', 'llama-3.2-3b'),
                )
            else:
                config.providers['local'].enabled = os.getenv('LOCAL_LLM_ENABLED', '').lower() == 'true'
                if os.getenv('LOCAL_LLM_MODEL'):
                    config.providers['local'].model_name = os.getenv('LOCAL_LLM_MODEL')

        return config
    
    def _validate_config(self, config: NeuralAssistantConfig):
        """Validate configuration settings. Raises ValueError on critical errors."""
        errors = []

        # Transformer
        if config.transformer.layers <= 0:
            errors.append("Transformer layers must be positive")
        if config.transformer.d_model <= 0:
            errors.append("Model dimension must be positive")
        if config.transformer.n_heads <= 0:
            errors.append("Number of heads must be positive")
        if config.transformer.d_model % config.transformer.n_heads != 0:
            errors.append("d_model must be divisible by n_heads")

        # Performance
        if config.performance.max_concurrent_sessions <= 0:
            errors.append("Max concurrent sessions must be positive")
        if config.performance.cache_ttl <= 0:
            errors.append("Cache TTL must be positive")

        # Providers
        for name, provider in config.providers.items():
            if provider.enabled:
                if provider.max_tokens <= 0:
                    errors.append(f"Max tokens for {name} must be positive")
                if not (0 <= provider.temperature <= 2):
                    errors.append(f"Temperature for {name} must be between 0 and 2")

        # Safety
        if not (0 <= config.safety.safety_threshold <= 1):
            errors.append("Safety threshold must be between 0 and 1")

        # Production-specific checks
        if config.environment == Environment.PRODUCTION:
            if not config.security.auth_required:
                logger.warning("PRODUCTION: auth_required is False — strongly recommended to enable")
            if "*" in config.security.cors_origins:
                logger.warning("PRODUCTION: CORS allows '*' — lock down to specific origins")

        if errors:
            for e in errors:
                logger.error(f"Config validation: {e}")
            raise ValueError(f"Configuration validation failed: {'; '.join(errors)}")

        logger.info("Configuration validation passed")


# ============================================================================
# CONFIGURATION UTILITIES
# ============================================================================

class ConfigurationUtils:
    """Utility functions for configuration management"""
    
    @staticmethod
    def create_model_tier_config(tier: ModelTier) -> TransformerConfig:
        """Create transformer config based on model tier"""
        
        tier_configs = {
            ModelTier.LIGHT: TransformerConfig(
                layers=6,
                d_model=256,
                n_heads=4,
                context_window=2048,
                attention_type="local"
            ),
            ModelTier.STANDARD: TransformerConfig(
                layers=24,
                d_model=512,
                n_heads=8,
                context_window=8192,
                attention_type="sparse"
            ),
            ModelTier.PREMIUM: TransformerConfig(
                layers=32,
                d_model=768,
                n_heads=12,
                context_window=16384,
                attention_type="full"
            ),
            ModelTier.ENTERPRISE: TransformerConfig(
                layers=48,
                d_model=1024,
                n_heads=16,
                context_window=32768,
                attention_type="full"
            )
        }
        
        return tier_configs[tier]
    
    @staticmethod
    def calculate_memory_requirements(config: NeuralAssistantConfig) -> Dict[str, float]:
        """Calculate estimated memory requirements"""
        
        # Transformer memory calculation
        transformer_params = (
            config.transformer.layers * 
            config.transformer.d_model * 
            config.transformer.d_model * 4  # Rough parameter count
        )
        transformer_memory = transformer_params * 4 / (1024**3)  # GB (float32)
        
        # Context memory
        context_memory = (
            config.transformer.context_window * 
            config.transformer.d_model * 
            config.performance.max_concurrent_sessions * 4 / (1024**3)
        )
        
        # Cognitive framework memory
        cognitive_memory = config.cognitive.memory_capacity * 0.001  # 1KB per memory item
        
        # Cache memory
        cache_memory = 1.0 if config.performance.cache_enabled else 0.0
        
        total_memory = transformer_memory + context_memory + cognitive_memory + cache_memory
        
        return {
            'transformer_memory_gb': transformer_memory,
            'context_memory_gb': context_memory,
            'cognitive_memory_gb': cognitive_memory,
            'cache_memory_gb': cache_memory,
            'total_memory_gb': total_memory,
            'recommended_ram_gb': total_memory * 2  # 2x for safety margin
        }
    
    @staticmethod
    def generate_deployment_manifest(config: NeuralAssistantConfig) -> Dict[str, Any]:
        """Generate Kubernetes deployment manifest"""
        
        memory_req = ConfigurationUtils.calculate_memory_requirements(config)
        
        return {
            'apiVersion': 'apps/v1',
            'kind': 'Deployment',
            'metadata': {
                'name': 'neural-assistant',
                'labels': {
                    'app': 'neural-assistant',
                    'environment': config.environment.value
                }
            },
            'spec': {
                'replicas': 3 if config.environment == Environment.PRODUCTION else 1,
                'selector': {
                    'matchLabels': {
                        'app': 'neural-assistant'
                    }
                },
                'template': {
                    'metadata': {
                        'labels': {
                            'app': 'neural-assistant'
                        }
                    },
                    'spec': {
                        'containers': [{
                            'name': 'neural-assistant',
                            'image': 'neural-assistant:latest',
                            'ports': [{
                                'containerPort': config.api_port
                            }],
                            'env': [
                                {
                                    'name': 'NEURAL_ASSISTANT_ENV',
                                    'value': config.environment.value
                                },
                                {
                                    'name': 'API_HOST',
                                    'value': '0.0.0.0'
                                },
                                {
                                    'name': 'API_PORT',
                                    'value': str(config.api_port)
                                }
                            ],
                            'resources': {
                                'requests': {
                                    'memory': f"{memory_req['recommended_ram_gb']:.1f}Gi",
                                    'cpu': '1000m'
                                },
                                'limits': {
                                    'memory': f"{memory_req['recommended_ram_gb'] * 1.5:.1f}Gi",
                                    'cpu': '4000m'
                                }
                            }
                        }]
                    }
                }
            }
        }


# ============================================================================
# CONFIGURATION VALIDATION & MIGRATION
# ============================================================================

class ConfigurationValidator:
    """Validate and migrate configuration files"""
    
    def __init__(self):
        self.required_fields = {
            'transformer': ['layers', 'd_model', 'n_heads'],
            'cognitive': ['reasoning_depth', 'memory_capacity'],
            'safety': ['safety_level', 'safety_threshold'],
            'performance': ['max_concurrent_sessions']
        }
    
    def validate_config(self, config: NeuralAssistantConfig) -> Dict[str, Any]:
        """Comprehensive configuration validation"""
        validation_results = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'recommendations': []
        }
        
        # Validate transformer configuration
        transformer_validation = self._validate_transformer(config.transformer)
        validation_results['errors'].extend(transformer_validation['errors'])
        validation_results['warnings'].extend(transformer_validation['warnings'])
        
        # Validate cognitive configuration
        cognitive_validation = self._validate_cognitive(config.cognitive)
        validation_results['errors'].extend(cognitive_validation['errors'])
        validation_results['warnings'].extend(cognitive_validation['warnings'])
        
        # Validate performance configuration
        performance_validation = self._validate_performance(config.performance)
        validation_results['errors'].extend(performance_validation['errors'])
        validation_results['warnings'].extend(performance_validation['warnings'])
        
        # Validate provider configurations
        provider_validation = self._validate_providers(config.providers)
        validation_results['errors'].extend(provider_validation['errors'])
        validation_results['warnings'].extend(provider_validation['warnings'])
        
        # Check for configuration conflicts
        conflict_validation = self._check_configuration_conflicts(config)
        validation_results['errors'].extend(conflict_validation['errors'])
        validation_results['warnings'].extend(conflict_validation['warnings'])
        
        validation_results['valid'] = len(validation_results['errors']) == 0
        
        return validation_results
    
    def _validate_transformer(self, transformer: TransformerConfig) -> Dict[str, List[str]]:
        """Validate transformer configuration"""
        errors = []
        warnings = []
        
        # Check layer count
        if transformer.layers < 1:
            errors.append("Transformer layers must be at least 1")
        elif transformer.layers > 100:
            warnings.append("Very large layer count may impact performance")
        
        # Check attention heads
        if transformer.d_model % transformer.n_heads != 0:
            errors.append("d_model must be divisible by n_heads")
        
        # Check context window
        if transformer.context_window > 32768:
            warnings.append("Large context window requires significant memory")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _validate_cognitive(self, cognitive: CognitiveConfig) -> Dict[str, List[str]]:
        """Validate cognitive configuration"""
        errors = []
        warnings = []
        
        if cognitive.reasoning_depth < 1:
            errors.append("Reasoning depth must be at least 1")
        elif cognitive.reasoning_depth > 20:
            warnings.append("Very deep reasoning may impact response time")
        
        if cognitive.memory_capacity < 100:
            warnings.append("Low memory capacity may limit context understanding")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _validate_performance(self, performance: PerformanceConfig) -> Dict[str, List[str]]:
        """Validate performance configuration"""
        errors = []
        warnings = []
        
        if performance.max_concurrent_sessions < 1:
            errors.append("Max concurrent sessions must be at least 1")
        elif performance.max_concurrent_sessions > 10000:
            warnings.append("Very high session limit requires substantial resources")
        
        if performance.batch_size > 128:
            warnings.append("Large batch sizes may cause memory issues")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _validate_providers(self, providers: Dict[str, ModelProviderConfig]) -> Dict[str, List[str]]:
        """Validate provider configurations"""
        errors = []
        warnings = []
        
        enabled_providers = [name for name, config in providers.items() if config.enabled]
        
        if not enabled_providers:
            errors.append("At least one provider must be enabled")
        
        for name, provider in providers.items():
            if provider.enabled:
                if provider.max_tokens < 1:
                    errors.append(f"Provider {name}: max_tokens must be positive")
                
                if not (0 <= provider.temperature <= 2):
                    errors.append(f"Provider {name}: temperature must be between 0 and 2")
                
                if provider.rate_limit < 1:
                    warnings.append(f"Provider {name}: very low rate limit may impact performance")
        
        return {'errors': errors, 'warnings': warnings}
    
    def _check_configuration_conflicts(self, config: NeuralAssistantConfig) -> Dict[str, List[str]]:
        """Check for configuration conflicts"""
        errors = []
        warnings = []
        
        # Memory vs performance conflicts
        memory_req = ConfigurationUtils.calculate_memory_requirements(config)
        if (memory_req['total_memory_gb'] > 32 and 
            config.performance.max_concurrent_sessions > 1000):
            warnings.append("High memory requirements with many sessions may cause issues")
        
        # GPU acceleration vs availability
        if config.performance.gpu_acceleration and config.environment == Environment.LOCAL:
            warnings.append("GPU acceleration enabled for local environment")
        
        # Safety vs research conflicts
        if config.safety.safety_level == "maximum" and not config.safety.content_filtering:
            warnings.append("Maximum safety level with disabled content filtering")
        
        return {'errors': errors, 'warnings': warnings}


# ============================================================================
# CONFIGURATION MIGRATION SYSTEM
# ============================================================================

class ConfigurationMigrator:
    """Handle configuration migrations between versions"""
    
    VERSION_MIGRATIONS = {
        '1.0': '1.1',
        '1.1': '1.2',
        '1.2': '2.0'
    }
    
    def __init__(self):
        self.current_version = "2.0"
    
    def migrate_config(self, config_dict: Dict[str, Any], from_version: str) -> Dict[str, Any]:
        """Migrate configuration from old version to current"""
        
        current_version = from_version
        migrated_config = copy.deepcopy(config_dict)
        
        while current_version in self.VERSION_MIGRATIONS:
            next_version = self.VERSION_MIGRATIONS[current_version]
            migration_method = getattr(self, f'_migrate_{current_version.replace(".", "_")}_to_{next_version.replace(".", "_")}', None)
            
            if migration_method:
                migrated_config = migration_method(migrated_config)
                logger.info(f"Migrated configuration from {current_version} to {next_version}")
            
            current_version = next_version
        
        # Add version info
        migrated_config['config_version'] = self.current_version
        migrated_config['migrated_at'] = datetime.now().isoformat()
        
        return migrated_config
    
    def _migrate_1_0_to_1_1(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate from version 1.0 to 1.1"""
        # Add new safety features
        if 'safety' not in config:
            config['safety'] = {
                'safety_level': 'standard',
                'content_filtering': True,
                'constitutional_weight': 1.0
            }
        
        # Add multimodal configuration
        if 'multimodal' not in config:
            config['multimodal'] = {
                'image_processing': True,
                'document_processing': True,
                'max_file_size': 50 * 1024 * 1024
            }
        
        return config
    
    def _migrate_1_1_to_1_2(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate from version 1.1 to 1.2"""
        # Add performance optimization settings
        if 'performance' in config:
            config['performance']['memory_optimization'] = True
            config['performance']['batch_processing'] = True
        
        # Update provider configurations
        for provider_name, provider_config in config.get('providers', {}).items():
            if 'retry_attempts' not in provider_config:
                provider_config['retry_attempts'] = 3
            if 'retry_delay' not in provider_config:
                provider_config['retry_delay'] = 1.0
        
        return config
    
    def _migrate_1_2_to_2_0(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate from version 1.2 to 2.0"""
        # Add security configuration
        if 'security' not in config:
            config['security'] = {
                'api_key_encryption': True,
                'session_encryption': True,
                'rate_limiting': True,
                'auth_required': False
            }
        
        # Update transformer configuration for new attention types
        if 'transformer' in config:
            if 'attention_type' not in config['transformer']:
                config['transformer']['attention_type'] = 'sparse'
            if 'activation_function' not in config['transformer']:
                config['transformer']['activation_function'] = 'gelu'
        
        return config


# ============================================================================
# CONFIGURATION FACTORY
# ============================================================================

class NeuralAssistantConfigFactory:
    """Factory for creating configured Neural Assistant instances"""
    
    def __init__(self):
        self.config_manager = ConfigurationManager()
        self.env_loader = EnvironmentConfigLoader()
        self.validator = ConfigurationValidator()
        self.migrator = ConfigurationMigrator()
    
    def create_from_environment(self) -> NeuralAssistantConfig:
        """Create configuration from environment"""
        return self.env_loader.load_from_environment()
    
    def create_from_file(self, config_file: Path) -> NeuralAssistantConfig:
        """Create configuration from specific file"""
        try:
            with open(config_file, 'r') as f:
                if config_file.suffix.lower() == '.yaml':
                    config_data = yaml.safe_load(f)
                else:
                    config_data = json.load(f)
            
            # Check for version and migrate if needed
            config_version = config_data.get('config_version', '1.0')
            if config_version != self.migrator.current_version:
                config_data = self.migrator.migrate_config(config_data, config_version)
            
            # Convert to config object
            environment = Environment(config_data.get('environment', 'development'))
            config = self.config_manager._dict_to_config(config_data, environment)
            
            # Validate
            validation = self.validator.validate_config(config)
            if not validation['valid']:
                raise ValueError(f"Configuration validation failed: {validation['errors']}")
            
            return config
            
        except Exception as e:
            logger.error(f"Failed to load config from {config_file}: {e}")
            raise
    
    def create_for_deployment(self, environment: Environment, tier: ModelTier) -> NeuralAssistantConfig:
        """Create optimized configuration for specific deployment"""
        
        # Start with base template
        if tier == ModelTier.ENTERPRISE:
            config = ConfigurationTemplates.get_enterprise_config()
        elif tier == ModelTier.LIGHT:
            config = ConfigurationTemplates.get_lightweight_config()
        else:
            config = self.config_manager._create_default_config(environment)
        
        # Apply tier-specific transformer settings
        config.transformer = ConfigurationUtils.create_model_tier_config(tier)
        
        # Environment-specific optimizations
        if environment == Environment.PRODUCTION:
            config.debug = False
            config.log_level = LogLevel.WARNING
            config.safety.safety_level = "maximum"
            config.security.auth_required = True
            config.security.rate_limiting = True
        
        elif environment == Environment.DEVELOPMENT:
            config.debug = True
            config.log_level = LogLevel.DEBUG
            config.safety.safety_level = "standard"
            config.security.auth_required = False
        
        return config
    
    def export_config_template(self, environment: Environment, output_file: Path):
        """Export configuration template to file"""
        config = self.config_manager._create_default_config(environment)
        
        if output_file.suffix.lower() == '.yaml':
            config_dict = self.config_manager._config_to_dict(config)
            with open(output_file, 'w') as f:
                yaml.dump(config_dict, f, indent=2, default_flow_style=False)
        else:
            config_dict = self.config_manager._config_to_dict(config)
            with open(output_file, 'w') as f:
                json.dump(config_dict, f, indent=2)
        
        logger.info(f"Configuration template exported to {output_file}")


# ============================================================================
# CONFIGURATION CLI UTILITIES
# ============================================================================

class ConfigurationCLI:
    """Command-line interface for configuration management"""
    
    def __init__(self):
        self.factory = NeuralAssistantConfigFactory()
    
    def create_config_interactive(self) -> NeuralAssistantConfig:
        """Interactive configuration creation"""
        print("🧠 Neural Assistant Configuration Setup")
        print("=" * 50)
        
        # Environment selection
        print("\n1. Select Environment:")
        for i, env in enumerate(Environment, 1):
            print(f"  {i}. {env.value.title()}")
        
        while True:
            try:
                env_choice = int(input("Enter choice (1-4): ")) - 1
                if 0 <= env_choice < len(list(Environment)):
                    break
                print("  Invalid choice. Please enter a number between 1 and 4.")
            except ValueError:
                print("  Invalid input. Please enter a number.")
        environment = list(Environment)[env_choice]

        # Model tier selection
        print("\n2. Select Model Tier:")
        for i, tier in enumerate(ModelTier, 1):
            print(f"  {i}. {tier.value.title()}")

        while True:
            try:
                tier_choice = int(input("Enter choice (1-4): ")) - 1
                if 0 <= tier_choice < len(list(ModelTier)):
                    break
                print("  Invalid choice. Please enter a number between 1 and 4.")
            except ValueError:
                print("  Invalid input. Please enter a number.")
        tier = list(ModelTier)[tier_choice]
        
        # Provider configuration
        print("\n3. Configure Model Providers:")
        providers = {}
        
        # Cognitive Core (always enabled)
        providers["cognitive_core"] = ModelProviderConfig(
            enabled=True,
            model_name="CognitiveBeeBot",
            max_tokens=2000
        )
        
        # OpenAI
        openai_key = input("OpenAI API Key (optional): ").strip()
        if openai_key:
            providers["openai"] = ModelProviderConfig(
                enabled=True,
                api_key=openai_key,
                model_name="gpt-4",
                max_tokens=2000
            )
        
        # Anthropic
        anthropic_key = input("Anthropic API Key (optional): ").strip()
        if anthropic_key:
            providers["anthropic"] = ModelProviderConfig(
                enabled=True,
                api_key=anthropic_key,
                model_name="claude-3-sonnet-20240229",
                max_tokens=2000
            )
        
        # Ollama
        ollama_enabled = input("Enable Ollama local models? (y/n): ").lower() == 'y'
        if ollama_enabled:
            ollama_url = input("Ollama URL (default: http://localhost:11434): ").strip()
            ollama_model = input("Ollama model (default: llama2): ").strip()
            
            providers["ollama"] = ModelProviderConfig(
                enabled=True,
                base_url=ollama_url or "http://localhost:11434",
                model_name=ollama_model or "llama2",
                max_tokens=2000
            )
        
        # Create configuration
        config = self.factory.create_for_deployment(environment, tier)
        config.providers = providers
        
        # Safety settings
        print("\n4. Safety Configuration:")
        safety_levels = ["permissive", "standard", "strict", "maximum"]
        for i, level in enumerate(safety_levels, 1):
            print(f"  {i}. {level.title()}")
        
        safety_choice = int(input("Select safety level (1-4): ")) - 1
        config.safety.safety_level = safety_levels[safety_choice]
        
        return config
    
    def validate_config_file(self, config_file: Path) -> bool:
        """Validate configuration file"""
        try:
            config = self.factory.create_from_file(config_file)
            validation = self.factory.validator.validate_config(config)
            
            print(f"\n📋 Configuration Validation Results for {config_file.name}")
            print("=" * 60)
            
            if validation['valid']:
                print("✅ Configuration is valid!")
            else:
                print("❌ Configuration has errors:")
                for error in validation['errors']:
                    print(f"  • {error}")
            
            if validation['warnings']:
                print("\n⚠️ Warnings:")
                for warning in validation['warnings']:
                    print(f"  • {warning}")
            
            if validation['recommendations']:
                print("\n💡 Recommendations:")
                for rec in validation['recommendations']:
                    print(f"  • {rec}")
            
            return validation['valid']
            
        except Exception as e:
            print(f"❌ Failed to validate configuration: {e}")
            return False


# ============================================================================
# CONFIGURATION EXAMPLES & PRESETS
# ============================================================================

class ConfigurationExamples:
    """Example configurations for different use cases"""
    
    @staticmethod
    def trading_system_config() -> NeuralAssistantConfig:
        """Configuration optimized for trading system integration"""
        return NeuralAssistantConfig(
            environment=Environment.PRODUCTION,
            
            transformer=TransformerConfig(
                layers=32,
                d_model=768,
                n_heads=12,
                context_window=16384,
                attention_type="sparse"
            ),
            
            cognitive=CognitiveConfig(
                reasoning_depth=8,
                memory_capacity=20000,
                parallel_processing=True,
                context_awareness=True
            ),
            
            safety=SafetyConfig(
                safety_level="strict",
                content_filtering=True,
                constitutional_weight=1.2,
                custom_safety_rules=[
                    "No financial advice without disclaimers",
                    "Verify all trading-related calculations",
                    "Maintain audit trail for all decisions"
                ]
            ),
            
            performance=PerformanceConfig(
                max_concurrent_sessions=1000,
                cache_enabled=True,
                batch_processing=True,
                memory_optimization=True,
                gpu_acceleration=True
            ),
            
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Trading",
                    max_tokens=4000,
                    temperature=0.3  # Lower temperature for trading precision
                ),
                "openai": ModelProviderConfig(
                    enabled=True,
                    model_name="gpt-4",
                    max_tokens=4000,
                    temperature=0.3,
                    rate_limit=500
                )
            },
            
            api_host="0.0.0.0",
            api_port=8000,
            database_url="postgresql://user:pass@localhost/neural_assistant_trading"
        )
    
    @staticmethod
    def research_config() -> NeuralAssistantConfig:
        """Configuration for research and development"""
        return NeuralAssistantConfig(
            environment=Environment.DEVELOPMENT,
            debug=True,
            
            transformer=TransformerConfig(
                layers=24,
                d_model=512,
                n_heads=8,
                context_window=12288,
                attention_type="full",  # Full attention for research accuracy
                dropout_rate=0.0
            ),
            
            cognitive=CognitiveConfig(
                reasoning_depth=12,
                memory_capacity=50000,
                parallel_processing=True,
                learning_rate=0.0001,
                memory_consolidation=True
            ),
            
            safety=SafetyConfig(
                safety_level="standard",
                content_filtering=False,  # Allow research content
                constitutional_weight=0.8
            ),
            
            multimodal=MultimodalConfig(
                image_processing=True,
                document_processing=True,
                max_file_size=200 * 1024 * 1024,  # 200MB for research data
                supported_formats=[
                    'txt', 'md', 'py', 'r', 'ipynb', 'tex',
                    'pdf', 'docx', 'xlsx', 'csv', 'json',
                    'jpg', 'png', 'svg', 'eps'
                ]
            ),
            
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Research",
                    max_tokens=8000,
                    temperature=0.7
                ),
                "ollama": ModelProviderConfig(
                    enabled=True,
                    base_url="http://localhost:11434",
                    model_name="llama2:70b",
                    max_tokens=4000,
                    temperature=0.7
                )
            }
        )
    
    @staticmethod
    def edge_deployment_config() -> NeuralAssistantConfig:
        """Configuration for edge/mobile deployment"""
        return NeuralAssistantConfig(
            environment=Environment.LOCAL,
            
            transformer=TransformerConfig(
                layers=6,
                d_model=256,
                n_heads=4,
                context_window=1024,
                attention_type="local",
                dropout_rate=0.2
            ),
            
            cognitive=CognitiveConfig(
                reasoning_depth=3,
                memory_capacity=1000,
                parallel_processing=False,
                analysis_timeout=5.0
            ),
            
            performance=PerformanceConfig(
                max_concurrent_sessions=10,
                cache_enabled=True,
                cache_ttl=1800,
                batch_processing=False,
                memory_optimization=True,
                gpu_acceleration=False
            ),
            
            multimodal=MultimodalConfig(
                image_processing=False,
                document_processing=False,
                max_file_size=1 * 1024 * 1024  # 1MB limit
            ),
            
            providers={
                "cognitive_core": ModelProviderConfig(
                    enabled=True,
                    model_name="CognitiveBeeBot-Edge",
                    max_tokens=500,
                    temperature=0.7
                )
            }
        )


# ============================================================================
# CONFIGURATION TESTING & BENCHMARKING
# ============================================================================

class ConfigurationBenchmark:
    """Benchmark different configurations"""
    
    def __init__(self):
        self.test_scenarios = [
            "Simple question answering",
            "Complex reasoning task",
            "Mathematical computation",
            "Code analysis request",
            "Multi-turn conversation"
        ]
    
    async def benchmark_config(self, config: NeuralAssistantConfig) -> Dict[str, Any]:
        """Benchmark configuration performance"""
        results = {
            'config_summary': self._summarize_config(config),
            'memory_requirements': ConfigurationUtils.calculate_memory_requirements(config),
            'performance_estimates': {},
            'benchmark_timestamp': datetime.now().isoformat()
        }
        
        # Estimate performance for each scenario
        for scenario in self.test_scenarios:
            perf_estimate = await self._estimate_scenario_performance(config, scenario)
            results['performance_estimates'][scenario] = perf_estimate
        
        # Overall performance score
        results['overall_score'] = self._calculate_overall_score(results['performance_estimates'])
        
        return results
    
    def _summarize_config(self, config: NeuralAssistantConfig) -> Dict[str, Any]:
        """Create configuration summary"""
        return {
            'environment': config.environment.value,
            'transformer_layers': config.transformer.layers,
            'model_dimension': config.transformer.d_model,
            'context_window': config.transformer.context_window,
            'enabled_providers': [name for name, provider in config.providers.items() if provider.enabled],
            'safety_level': config.safety.safety_level,
            'max_sessions': config.performance.max_concurrent_sessions
        }
    
    async def _estimate_scenario_performance(self, config: NeuralAssistantConfig, scenario: str) -> Dict[str, Any]:
        """Estimate performance for specific scenario"""
        # Mathematical estimation based on configuration
        
        base_latency = 0.1  # Base processing time
        
        # Transformer complexity impact
        layer_factor = config.transformer.layers / 24  # Normalized to 24 layers
        model_factor = config.transformer.d_model / 512  # Normalized to 512 dimensions
        context_factor = min(1.0, config.transformer.context_window / 8192)
        
        estimated_latency = base_latency * layer_factor * model_factor * context_factor
        
        # Cognitive processing impact
        if config.cognitive.parallel_processing:
            estimated_latency *= 0.7  # 30% faster with parallel processing
        
        cognitive_factor = config.cognitive.reasoning_depth / 5
        estimated_latency *= cognitive_factor
        
        # Performance optimizations
        if config.performance.cache_enabled:
            estimated_latency *= 0.8  # 20% faster with caching
        
        if config.performance.gpu_acceleration:
            estimated_latency *= 0.5  # 50% faster with GPU
        
        if config.performance.memory_optimization:
            estimated_latency *= 0.9  # 10% faster with memory optimization
        
        # Scenario-specific adjustments
        scenario_factors = {
            "Simple question answering": 0.5,
            "Complex reasoning task": 2.0,
            "Mathematical computation": 1.5,
            "Code analysis request": 1.8,
            "Multi-turn conversation": 1.2
        }
        
        estimated_latency *= scenario_factors.get(scenario, 1.0)
        
        return {
            'estimated_latency_ms': estimated_latency * 1000,
            'estimated_tokens': self._estimate_token_usage(scenario),
            'memory_usage_mb': self._estimate_memory_usage(config, scenario),
            'confidence': 0.8  # Estimation confidence
        }
    
    def _estimate_token_usage(self, scenario: str) -> int:
        """Estimate token usage for scenario"""
        token_estimates = {
            "Simple question answering": 150,
            "Complex reasoning task": 800,
            "Mathematical computation": 300,
            "Code analysis request": 1200,
            "Multi-turn conversation": 400
        }
        return token_estimates.get(scenario, 300)
    
    def _estimate_memory_usage(self, config: NeuralAssistantConfig, scenario: str) -> float:
        """Estimate memory usage for scenario"""
        base_memory = config.transformer.d_model * 0.001  # Base memory per token
        
        scenario_multipliers = {
            "Simple question answering": 1.0,
            "Complex reasoning task": 2.5,
            "Mathematical computation": 1.5,
            "Code analysis request": 3.0,
            "Multi-turn conversation": 1.8
        }
        
        return base_memory * scenario_multipliers.get(scenario, 1.0)
    
    def _calculate_overall_score(self, performance_estimates: Dict[str, Dict[str, Any]]) -> float:
        """Calculate overall performance score"""
        latencies = [est['estimated_latency_ms'] for est in performance_estimates.values()]
        avg_latency = sum(latencies) / len(latencies)
        
        # Score based on latency (lower is better)
        # 100ms = 1.0, 1000ms = 0.5, 2000ms = 0.25
        score = max(0.1, 1.0 / (1 + avg_latency / 100))
        
        return round(score, 3)


# ============================================================================
# CONFIGURATION EXPORT & IMPORT
# ============================================================================

class ConfigurationExporter:
    """Export configurations in various formats"""
    
    @staticmethod
    def export_to_docker_compose(config: NeuralAssistantConfig, output_file: Path):
        """Export configuration as Docker Compose file"""
        
        memory_req = ConfigurationUtils.calculate_memory_requirements(config)
        
        compose_config = {
            'version': '3.8',
            'services': {
                'neural-assistant': {
                    'image': 'neural-assistant:latest',
                    'container_name': 'neural-assistant',
                    'ports': [f"{config.api_port}:{config.api_port}"],
                    'environment': [
                        f'NEURAL_ASSISTANT_ENV={config.environment.value}',
                        f'API_HOST={config.api_host}',
                        f'API_PORT={config.api_port}',
                        f'LOG_LEVEL={config.log_level.value}'
                    ],
                    'volumes': [
                        './data:/app/data',
                        './logs:/app/logs',
                        './config:/app/config'
                    ],
                    'deploy': {
                        'resources': {
                            'limits': {
                                'memory': f"{memory_req['recommended_ram_gb']:.1f}G",
                                'cpus': '4.0'
                            },
                            'reservations': {
                                'memory': f"{memory_req['total_memory_gb']:.1f}G",
                                'cpus': '2.0'
                            }
                        }
                    },
                    'restart': 'unless-stopped',
                    'healthcheck': {
                        'test': ['CMD', 'curl', '-f', f'http://localhost:{config.api_port}/health'],
                        'interval': '30s',
                        'timeout': '10s',
                        'retries': 3
                    }
                }
            }
        }
        
        # Add database service if not SQLite
        if not config.database_url.startswith('sqlite'):
            compose_config['services']['database'] = {
                'image': 'postgres:13',
                'environment': [
                    'POSTGRES_DB=neural_assistant',
                    'POSTGRES_USER=neural_assistant',
                    'POSTGRES_PASSWORD=secure_password'
                ],
                'volumes': ['postgres_data:/var/lib/postgresql/data'],
                'ports': ['5432:5432']
            }
            compose_config['volumes'] = {'postgres_data': {}}
        
        with open(output_file, 'w') as f:
            yaml.dump(compose_config, f, indent=2, default_flow_style=False)
        
        print(f"Docker Compose configuration exported to {output_file}")
    
    @staticmethod
    def export_to_kubernetes(config: NeuralAssistantConfig, output_dir: Path):
        """Export configuration as Kubernetes manifests"""
        output_dir.mkdir(exist_ok=True)
        
        # Deployment manifest
        deployment = ConfigurationUtils.generate_deployment_manifest(config)
        with open(output_dir / 'deployment.yaml', 'w') as f:
            yaml.dump(deployment, f, indent=2, default_flow_style=False)
        
        # Service manifest
        service = {
            'apiVersion': 'v1',
            'kind': 'Service',
            'metadata': {
                'name': 'neural-assistant-service',
                'labels': {'app': 'neural-assistant'}
            },
            'spec': {
                'selector': {'app': 'neural-assistant'},
                'ports': [{
                    'port': 80,
                    'targetPort': config.api_port,
                    'protocol': 'TCP'
                }],
                'type': 'LoadBalancer'
            }
        }
        
        with open(output_dir / 'service.yaml', 'w') as f:
            yaml.dump(service, f, indent=2, default_flow_style=False)
        
        # ConfigMap for configuration
        configmap = {
            'apiVersion': 'v1',
            'kind': 'ConfigMap',
            'metadata': {'name': 'neural-assistant-config'},
            'data': {
                'config.yaml': yaml.dump(
                    ConfigurationManager()._config_to_dict(config),
                    default_flow_style=False
                )
            }
        }
        
        with open(output_dir / 'configmap.yaml', 'w') as f:
            yaml.dump(configmap, f, indent=2, default_flow_style=False)
        
        print(f"Kubernetes manifests exported to {output_dir}")


# ============================================================================
# USAGE EXAMPLES
# ============================================================================

def main():
    """Configuration system usage examples"""
    
    # Create configuration manager
    config_manager = ConfigurationManager()
    factory = NeuralAssistantConfigFactory()
    
    # Example 1: Load configuration from environment
    print("Loading configuration from environment...")
    env_config = factory.create_from_environment()
    print(f"Loaded {env_config.environment.value} configuration")
    
    # Example 2: Create trading system configuration
    print("\nCreating trading system configuration...")
    trading_config = ConfigurationExamples.trading_system_config()
    config_manager.save_config(trading_config, Environment.PRODUCTION)
    
    # Example 3: Validate configuration
    print("\nValidating configuration...")
    validator = ConfigurationValidator()
    validation = validator.validate_config(trading_config)
    print(f"Configuration valid: {validation['valid']}")
    
    # Example 4: Export to Docker Compose
    print("\nExporting to Docker Compose...")
    ConfigurationExporter.export_to_docker_compose(
        trading_config, 
        Path('docker-compose.yml')
    )
    
    # Example 5: Benchmark configuration
    print("\nBenchmarking configuration...")
    benchmark = ConfigurationBenchmark()
    benchmark_results = asyncio.run(benchmark.benchmark_config(trading_config))
    print(f"Benchmark results: {benchmark_results}")
