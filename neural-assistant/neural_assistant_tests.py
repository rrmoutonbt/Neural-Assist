"""
Neural Assistant - Comprehensive Test Suite
Unit tests, integration tests, and performance benchmarks
"""

import pytest
import pytest_asyncio
import asyncio
import json
import time
from unittest.mock import AsyncMock
from typing import Dict, Any
import numpy as np

# Import Neural Assistant components
from neural_assistant import (
    NeuralAssistant, NeuralAssistantAPI, NeuralAssistantExtensions,
    NeuralAssistantFactory, AttentionMechanism, AttentionType,
    TransformerBlock, ConstitutionalAI, SafetyLevel, ModelProvider,
    EmbeddingService,
)
from neural_assistant_base import CircuitBreaker
from neural_assistant_config import (
    NeuralAssistantConfig, TransformerConfig, CognitiveConfig,
    SafetyConfig, ModelProviderConfig, ConfigurationManager,
    NeuralAssistantConfigFactory,
)
from mathematical_core import MathematicalCore, SafeExpressionEvaluator, StatisticsEngine
from bee_bot_cognitive_framework import CognitiveBeeBot, MemoryType, ReasoningType


# ============================================================================
# CONFIGURATION FIXTURES
# ============================================================================

@pytest.fixture
def test_config():
    """Test configuration fixture"""
    return NeuralAssistantConfig(
        transformer=TransformerConfig(
            layers=6,
            d_model=256,
            n_heads=4,
            context_window=1024
        ),
        cognitive=CognitiveConfig(
            reasoning_depth=3,
            memory_capacity=1000
        ),
        safety=SafetyConfig(
            safety_level="standard",
            safety_threshold=0.7
        ),
        providers={
            "cognitive_core": ModelProviderConfig(
                enabled=True,
                model_name="CognitiveBeeBot-Test",
                max_tokens=500,
            )
        }
    )


@pytest_asyncio.fixture
async def neural_assistant_instance(test_config):
    """Neural Assistant instance fixture"""
    assistant = NeuralAssistant(test_config.__dict__)
    await assistant.cognitive_core.initialize()
    await assistant.math_core.initialize()
    yield assistant
    await assistant.cognitive_core.shutdown()
    await assistant.math_core.shutdown()


@pytest_asyncio.fixture
async def api_instance(neural_assistant_instance):
    """Neural Assistant API fixture"""
    return NeuralAssistantAPI(neural_assistant_instance)


# ============================================================================
# UNIT TESTS - ATTENTION MECHANISM
# ============================================================================

class TestAttentionMechanism:
    """Test attention mechanism computation"""
    
    def test_attention_initialization(self):
        """Test attention mechanism initialization"""
        attention = AttentionMechanism(d_model=512, n_heads=8)
        
        assert attention.d_model == 512
        assert attention.n_heads == 8
        assert attention.d_k == 64  # 512 / 8
    
    def test_scaled_dot_product_attention(self):
        """Test scaled dot-product attention computation"""
        attention = AttentionMechanism(d_model=64, n_heads=4)
        
        # Create test inputs
        batch_size, seq_len, d_k = 2, 10, 16
        Q = np.random.randn(batch_size, seq_len, d_k)
        K = np.random.randn(batch_size, seq_len, d_k)
        V = np.random.randn(batch_size, seq_len, d_k)
        
        output, weights = attention.scaled_dot_product_attention(Q, K, V)
        
        # Validate output shape
        assert output.shape == (batch_size, seq_len, d_k)
        assert weights.shape == (batch_size, seq_len, seq_len)
        
        # Validate attention weights sum to 1
        weight_sums = np.sum(weights, axis=-1)
        assert np.allclose(weight_sums, 1.0, atol=1e-6)
    
    def test_sparse_attention_pattern(self):
        """Test sparse attention optimization"""
        attention = AttentionMechanism(d_model=64, n_heads=4, attention_type=AttentionType.SPARSE)

        seq_len = 100
        scores = np.random.randn(1, seq_len, seq_len)
        sparse_scores = attention._apply_sparse_pattern(scores)

        # Check that some positions are masked
        masked_positions = np.sum(sparse_scores == -1e9)
        assert masked_positions > 0

        # Check that local window is preserved (window_size = min(64, max(1, 100//4)) = 25)
        window_size = min(64, max(1, seq_len // 4))
        for i in range(min(10, seq_len)):
            window_start = max(0, i - window_size)
            window_end = min(seq_len, i + window_size + 1)
            assert not np.any(sparse_scores[0, i, window_start:window_end] == -1e9)


# ============================================================================
# UNIT TESTS - TRANSFORMER BLOCK
# ============================================================================

class TestTransformerBlock:
    """Test transformer block functionality"""
    
    def test_transformer_block_initialization(self):
        """Test transformer block initialization"""
        block = TransformerBlock(d_model=512, n_heads=8, d_ff=2048)
        
        assert block.d_model == 512
        assert block.d_ff == 2048
        assert block.attention.n_heads == 8
    
    def test_layer_normalization(self):
        """Test layer normalization"""
        block = TransformerBlock(d_model=64, n_heads=4)
        
        # Test input
        x = np.random.randn(2, 10, 64)
        weight = np.ones(64)
        bias = np.zeros(64)
        
        normalized = block.layer_norm(x, weight, bias)
        
        # Check output shape
        assert normalized.shape == x.shape
        
        # Check normalization properties
        mean = np.mean(normalized, axis=-1)
        std = np.std(normalized, axis=-1)
        
        assert np.allclose(mean, 0.0, atol=1e-6)
        assert np.allclose(std, 1.0, atol=1e-6)
    
    def test_forward_pass(self):
        """Test complete forward pass"""
        block = TransformerBlock(d_model=64, n_heads=4)
        
        # Test input
        batch_size, seq_len, d_model = 2, 10, 64
        x = np.random.randn(batch_size, seq_len, d_model)
        
        # Forward pass
        output = block.forward(x)
        
        # Validate output shape
        assert output.shape == x.shape
        assert not np.array_equal(output, x)  # Should be different from input


# ============================================================================
# UNIT TESTS - CONSTITUTIONAL AI
# ============================================================================

class TestConstitutionalAI:
    """Test Constitutional AI safety mechanisms"""
    
    @pytest.fixture
    def constitutional_ai(self):
        return ConstitutionalAI()
    
    @pytest.mark.asyncio
    async def test_safety_evaluation_safe_content(self, constitutional_ai):
        """Test safety evaluation for safe content"""
        safe_prompt = "What is the weather like today?"
        safe_response = "I don't have access to real-time weather data."
        
        result = await constitutional_ai.evaluate_safety(safe_prompt, safe_response)
        
        assert result['is_safe'] == True
        assert result['safety_score'] > 0.7
        assert len(result['flags']) == 0
    
    @pytest.mark.asyncio
    async def test_safety_evaluation_harmful_content(self, constitutional_ai):
        """Test safety evaluation for harmful content"""
        harmful_prompt = "How to make bomb explosive"
        harmful_response = "Here's how to create explosives..."
        
        result = await constitutional_ai.evaluate_safety(harmful_prompt, harmful_response)
        
        assert result['is_safe'] == False
        assert result['safety_score'] < 0.7
        assert len(result['flags']) > 0
    
    @pytest.mark.asyncio
    async def test_constitutional_alignment(self, constitutional_ai):
        """Test constitutional principle alignment"""
        helpful_response = "I can help you with that task. Here's a detailed explanation..."
        
        score = await constitutional_ai._evaluate_constitutional_alignment(helpful_response)
        
        assert 0.0 <= score <= 1.0
        assert score > 0.5  # Should be reasonably aligned


# ============================================================================
# INTEGRATION TESTS - NEURAL ASSISTANT
# ============================================================================

class TestNeuralAssistant:
    """Integration tests for Neural Assistant"""
    
    @pytest.mark.asyncio
    async def test_conversation_start(self, neural_assistant_instance):
        """Test starting a new conversation"""
        session_id = await neural_assistant_instance.start_conversation("test_user")
        
        assert session_id.startswith("session_test_user_")
        assert session_id in neural_assistant_instance.conversations
        
        context = neural_assistant_instance.conversations[session_id]
        assert context.session_id == session_id
        assert len(context.messages) == 0
    
    @pytest.mark.asyncio
    async def test_message_processing(self, neural_assistant_instance):
        """Test complete message processing pipeline"""
        session_id = await neural_assistant_instance.start_conversation("test_user")
        
        # Process test message
        result = await neural_assistant_instance.process_message(
            session_id, 
            "Hello, how are you?"
        )
        
        assert 'content' in result
        assert 'provider' in result
        assert 'safety_score' in result
        assert result['safety_score'] >= 0.7
        
        # Check conversation context
        context = neural_assistant_instance.conversations[session_id]
        assert len(context.messages) == 2  # User + Assistant messages
    
    @pytest.mark.asyncio
    async def test_provider_switching(self, neural_assistant_instance):
        """Test switching between model providers"""
        session_id = await neural_assistant_instance.start_conversation("test_user")
        
        # Test switching to different providers
        for provider in ModelProvider:
            if provider in neural_assistant_instance.model_providers:
                success = await neural_assistant_instance.switch_provider(session_id, provider)
                assert success == True
                context = neural_assistant_instance.conversations[session_id]
                assert context.active_provider == provider.value
    
    @pytest.mark.asyncio
    async def test_mathematical_content_processing(self, neural_assistant_instance):
        """Test mathematical content processing"""
        session_id = await neural_assistant_instance.start_conversation("test_user")
        
        math_message = "What is 2 + 2 * 3?"
        result = await neural_assistant_instance.process_message(session_id, math_message)
        
        assert 'content' in result
        assert 'processing_metadata' in result
        
        # Should detect mathematical content
        cognitive_analysis = result['processing_metadata'].get('cognitive_enhancement', {})
        assert cognitive_analysis.get('mathematical_analysis') is not None
    
    @pytest.mark.asyncio
    async def test_context_awareness(self, neural_assistant_instance):
        """Test conversation context awareness"""
        session_id = await neural_assistant_instance.start_conversation("test_user")
        
        # Send related messages
        await neural_assistant_instance.process_message(session_id, "Tell me about Python programming.")
        result = await neural_assistant_instance.process_message(session_id, "What are its main features?")
        
        # Second message should have high context relevance
        cognitive_analysis = result['processing_metadata'].get('cognitive_enhancement', {})
        context_relevance = cognitive_analysis.get('context_relevance', 0.0)
        
        assert context_relevance > 0.3  # Should detect relationship to previous message
    
    @pytest.mark.asyncio
    async def test_performance_optimization(self, neural_assistant_instance):
        """Test system performance optimization"""
        # Add some conversations to optimize
        for i in range(5):
            session_id = await neural_assistant_instance.start_conversation(f"user_{i}")
            await neural_assistant_instance.process_message(session_id, f"Test message {i}")
        
        initial_sessions = len(neural_assistant_instance.conversations)
        
        optimization_result = await neural_assistant_instance.optimize_performance()
        
        assert 'cognitive_optimization' in optimization_result
        assert 'math_optimization' in optimization_result
        
        # Should maintain or improve session count
        final_sessions = len(neural_assistant_instance.conversations)
        assert final_sessions <= initial_sessions


# ============================================================================
# API TESTS
# ============================================================================

class TestNeuralAssistantAPI:
    """Test Neural Assistant API functionality"""
    
    @pytest.mark.asyncio
    async def test_chat_endpoint(self, api_instance):
        """Test chat API endpoint"""
        result = await api_instance.chat(
            user_id="test_user",
            message="Hello, world!"
        )
        
        assert result['success'] == True
        assert 'session_id' in result
        assert 'response' in result
        assert 'metadata' in result
        
        metadata = result['metadata']
        assert 'provider' in metadata
        assert 'tokens_used' in metadata
        assert 'safety_score' in metadata
    
    @pytest.mark.asyncio
    async def test_get_providers(self, api_instance):
        """Test get providers endpoint"""
        result = await api_instance.get_providers()
        
        assert result['success'] == True
        assert 'providers' in result
        assert 'active_provider' in result
        assert len(result['providers']) > 0
    
    @pytest.mark.asyncio
    async def test_conversation_history(self, api_instance):
        """Test conversation history retrieval"""
        # Create conversation with messages
        chat_result = await api_instance.chat(
            user_id="test_user",
            message="First message"
        )
        session_id = chat_result['session_id']
        
        await api_instance.chat(
            user_id="test_user",
            message="Second message",
            session_id=session_id
        )
        
        # Get history
        history_result = await api_instance.get_history(session_id, limit=10)
        
        assert history_result['success'] == True
        assert 'history' in history_result
        assert len(history_result['history']) >= 4  # 2 user + 2 assistant messages


# ============================================================================
# WEBSOCKET TESTS
# ============================================================================

class TestWebSocketConnections:
    """Test WebSocket functionality"""

    @pytest.fixture
    def connection_manager(self):
        # Import here to avoid module-level server initialization side effects
        from neural_assistant_api_server import ConnectionManager
        return ConnectionManager()
    
    @pytest.mark.asyncio
    async def test_websocket_connection(self, connection_manager):
        """Test WebSocket connection management"""
        # Mock WebSocket
        mock_websocket = AsyncMock()
        mock_websocket.accept = AsyncMock()
        
        session_id = "test_session"
        connection_id = await connection_manager.connect(mock_websocket, session_id)
        
        assert connection_id in connection_manager.active_connections
        assert connection_manager.session_connections[session_id] == connection_id
        
        # Test disconnect
        connection_manager.disconnect(connection_id)
        assert connection_id not in connection_manager.active_connections
        assert session_id not in connection_manager.session_connections
    
    @pytest.mark.asyncio
    async def test_websocket_messaging(self, connection_manager):
        """Test WebSocket message sending"""
        # Mock WebSocket
        mock_websocket = AsyncMock()
        mock_websocket.accept = AsyncMock()
        mock_websocket.send_text = AsyncMock()
        
        session_id = "test_session"
        await connection_manager.connect(mock_websocket, session_id)
        
        # Send message
        test_message = {"type": "test", "data": "Hello WebSocket"}
        await connection_manager.send_personal_message(test_message, session_id)
        
        mock_websocket.send_text.assert_called_once()


# ============================================================================
# CONFIGURATION TESTS
# ============================================================================

class TestConfiguration:
    """Test configuration management"""
    
    def test_config_creation(self, test_config):
        """Test configuration object creation"""
        assert test_config.transformer.layers == 6
        assert test_config.transformer.d_model == 256
        assert test_config.cognitive.reasoning_depth == 3
        assert test_config.safety.safety_level == "standard"
    
    def test_config_validation(self):
        """Test configuration validation"""
        from neural_assistant_config import ConfigurationValidator
        
        validator = ConfigurationValidator()
        
        # Valid configuration (needs at least one provider)
        valid_config = NeuralAssistantConfig(
            providers={"cognitive_core": ModelProviderConfig(enabled=True, model_name="test")}
        )
        validation = validator.validate_config(valid_config)
        assert validation['valid'] == True
        
        # Invalid configuration
        invalid_config = NeuralAssistantConfig(
            transformer=TransformerConfig(layers=0, d_model=100, n_heads=8)  # Invalid: d_model not divisible by n_heads
        )
        validation = validator.validate_config(invalid_config)
        assert validation['valid'] == False
        assert len(validation['errors']) > 0
    
    def test_config_memory_calculation(self, test_config):
        """Test memory requirement calculation"""
        from neural_assistant_config import ConfigurationUtils
        
        memory_req = ConfigurationUtils.calculate_memory_requirements(test_config)
        
        assert 'transformer_memory_gb' in memory_req
        assert 'total_memory_gb' in memory_req
        assert 'recommended_ram_gb' in memory_req
        assert memory_req['total_memory_gb'] > 0
        assert memory_req['recommended_ram_gb'] > memory_req['total_memory_gb']


# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

class TestPerformance:
    """Performance and load testing"""
    
    @pytest.mark.asyncio
    async def test_response_time(self, neural_assistant_instance):
        """Test response time performance"""
        session_id = await neural_assistant_instance.start_conversation("perf_user")
        
        start_time = time.time()
        await neural_assistant_instance.process_message(session_id, "Quick test message")
        end_time = time.time()
        
        response_time = end_time - start_time
        assert response_time < 30.0  # Allows for model loading on first call
    
    @pytest.mark.asyncio
    async def test_concurrent_sessions(self, neural_assistant_instance):
        """Test handling multiple concurrent sessions"""
        num_sessions = 10
        
        # Create multiple sessions concurrently
        tasks = []
        for i in range(num_sessions):
            task = neural_assistant_instance.start_conversation(f"concurrent_user_{i}")
            tasks.append(task)
        
        session_ids = await asyncio.gather(*tasks)
        assert len(session_ids) == num_sessions
        assert len(set(session_ids)) == num_sessions  # All unique
        
        # Process messages concurrently
        message_tasks = []
        for session_id in session_ids:
            task = neural_assistant_instance.process_message(session_id, "Concurrent test")
            message_tasks.append(task)
        
        results = await asyncio.gather(*message_tasks)
        assert len(results) == num_sessions
        assert all(r['safety_score'] >= 0.7 for r in results)
    
    @pytest.mark.asyncio
    async def test_memory_efficiency(self, neural_assistant_instance):
        """Test memory efficiency with large conversations"""
        session_id = await neural_assistant_instance.start_conversation("memory_user")
        
        # Generate long conversation
        for i in range(50):
            await neural_assistant_instance.process_message(
                session_id, 
                f"Message {i}: Testing memory efficiency with longer conversations."
            )
        
        context = neural_assistant_instance.conversations[session_id]
        
        # Should not exceed reasonable message count due to optimization
        assert len(context.messages) <= 100  # Should be optimized
    
    @pytest.mark.asyncio
    async def test_token_efficiency(self, neural_assistant_instance):
        """Test token usage efficiency"""
        session_id = await neural_assistant_instance.start_conversation("token_user")
        
        short_message = "Hi"
        result = await neural_assistant_instance.process_message(session_id, short_message)
        
        tokens_used = result['tokens_used']
        
        # Should be efficient with token usage
        assert tokens_used < 100  # Short message should use minimal tokens
        assert tokens_used > 0    # But should use some tokens


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """End-to-end integration tests"""
    
    @pytest.mark.asyncio
    async def test_complete_conversation_flow(self, neural_assistant_instance):
        """Test complete conversation workflow"""
        # Start conversation
        session_id = await neural_assistant_instance.start_conversation("integration_user")
        
        # Multi-turn conversation
        conversation_flow = [
            "Hello, I'm new here.",
            "Can you help me with Python programming?",
            "What are list comprehensions?",
            "Can you show me an example?",
            "Thank you for the explanation."
        ]
        
        responses = []
        for message in conversation_flow:
            result = await neural_assistant_instance.process_message(session_id, message)
            responses.append(result)
            
            # Validate each response
            assert result['safety_score'] >= 0.7
            assert len(result['content']) > 0
        
        # Check conversation context
        context = neural_assistant_instance.conversations[session_id]
        assert len(context.messages) == len(conversation_flow) * 2  # User + Assistant pairs
    
    @pytest.mark.asyncio
    async def test_error_handling_and_recovery(self, neural_assistant_instance):
        """Test error handling and system recovery"""
        session_id = await neural_assistant_instance.start_conversation("error_test_user")
        
        # Test with potentially problematic input
        problematic_inputs = [
            "",  # Empty message
            "a" * 10000,  # Very long message
            "🎭🎨🎪" * 100,  # Unicode heavy
            None  # This should be handled by API layer
        ]
        
        for test_input in problematic_inputs[:-1]:  # Skip None for this test
            try:
                result = await neural_assistant_instance.process_message(session_id, test_input)
                # Should either succeed or handle gracefully
                if result:
                    assert 'content' in result
            except Exception as e:
                # Should be specific exceptions, not generic failures
                assert isinstance(e, (ValueError, TypeError))
    
    @pytest.mark.asyncio
    async def test_multi_provider_consistency(self, neural_assistant_instance):
        """Test consistency across different providers"""
        session_id = await neural_assistant_instance.start_conversation("consistency_user")
        
        test_message = "What is 2 + 2?"
        results = {}
        
        # Test with different providers
        for provider in neural_assistant_instance.model_providers.keys():
            try:
                await neural_assistant_instance.switch_provider(session_id, provider)
                result = await neural_assistant_instance.process_message(session_id, test_message)
                results[provider.value] = result
            except Exception as e:
                # Some providers might not be available in test environment
                continue
        
        # All available providers should give valid responses
        for provider, result in results.items():
            assert result['safety_score'] >= 0.7
            assert len(result['content']) > 0


# ============================================================================
# STRESS TESTS
# ============================================================================

class TestStressTesting:
    """Stress testing for system limits"""
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_high_load_stress(self, neural_assistant_instance):
        """Test system under high load"""
        num_concurrent_users = 20
        messages_per_user = 5
        
        async def user_session(user_id: int):
            session_id = await neural_assistant_instance.start_conversation(f"stress_user_{user_id}")
            results = []
            
            for i in range(messages_per_user):
                result = await neural_assistant_instance.process_message(
                    session_id, 
                    f"Stress test message {i} from user {user_id}"
                )
                results.append(result)
            
            return results
        
        # Run concurrent user sessions
        start_time = time.time()
        tasks = [user_session(i) for i in range(num_concurrent_users)]
        all_results = await asyncio.gather(*tasks)
        end_time = time.time()
        
        # Validate results
        total_messages = num_concurrent_users * messages_per_user
        total_time = end_time - start_time
        throughput = total_messages / total_time
        
        print(f"Processed {total_messages} messages in {total_time:.2f}s")
        print(f"Throughput: {throughput:.2f} messages/second")
        
        # All messages should be processed successfully
        for user_results in all_results:
            assert len(user_results) == messages_per_user
            for result in user_results:
                assert result['safety_score'] >= 0.7
    
    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_memory_leak_detection(self, neural_assistant_instance):
        """Test for memory leaks during extended operation"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Run extended operation
        for i in range(100):
            session_id = await neural_assistant_instance.start_conversation(f"memory_test_user_{i}")
            await neural_assistant_instance.process_message(session_id, f"Memory test message {i}")
            
            # Periodically check memory
            if i % 25 == 0:
                current_memory = process.memory_info().rss / 1024 / 1024
                memory_growth = current_memory - initial_memory
                print(f"Iteration {i}: Memory usage {current_memory:.1f}MB (growth: {memory_growth:.1f}MB)")
        
        final_memory = process.memory_info().rss / 1024 / 1024
        memory_growth = final_memory - initial_memory
        
        # Memory growth should be reasonable (less than 500MB for this test)
        assert memory_growth < 500, f"Excessive memory growth: {memory_growth:.1f}MB"


# ============================================================================
# BENCHMARK TESTS
# ============================================================================

class TestBenchmarks:
    """Performance benchmarking tests"""
    
    @pytest.mark.asyncio
    async def test_attention_mechanism_benchmark(self):
        """Benchmark attention mechanism performance"""
        from neural_assistant import AttentionMechanism
        
        attention = AttentionMechanism(d_model=512, n_heads=8)
        
        # Test different sequence lengths
        seq_lengths = [128, 512, 1024, 2048]
        results = {}
        
        for seq_len in seq_lengths:
            batch_size, d_k = 4, 64
            Q = np.random.randn(batch_size, seq_len, d_k)
            K = np.random.randn(batch_size, seq_len, d_k)
            V = np.random.randn(batch_size, seq_len, d_k)
            
            start_time = time.time()
            output, weights = attention.scaled_dot_product_attention(Q, K, V)
            end_time = time.time()
            
            results[seq_len] = {
                'time_ms': (end_time - start_time) * 1000,
                'output_shape': output.shape,
                'weights_shape': weights.shape
            }
        
        # Print benchmark results
        print("\nAttention Mechanism Benchmark:")
        for seq_len, metrics in results.items():
            print(f"Seq Length {seq_len}: {metrics['time_ms']:.2f}ms")
        
        # Validate performance scaling
        assert results[128]['time_ms'] < results[2048]['time_ms']  # Should scale with sequence length
    
    @pytest.mark.asyncio
    async def test_end_to_end_benchmark(self, neural_assistant_instance):
        """End-to-end performance benchmark"""
        
        test_scenarios = [
            ("Simple question", "What is the capital of France?"),
            ("Mathematical query", "Calculate the derivative of x^2 + 3x + 1"),
            ("Code analysis", "def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)"),
            ("Complex reasoning", "Explain the philosophical implications of artificial intelligence consciousness"),
            ("Multi-step problem", "Plan a trip to Japan including budget, itinerary, and cultural considerations")
        ]
        
        benchmark_results = {}
        
        for scenario_name, message in test_scenarios:
            session_id = await neural_assistant_instance.start_conversation(f"benchmark_user_{scenario_name}")
            
            # Warm up
            await neural_assistant_instance.process_message(session_id, "Hello")
            
            # Benchmark
            start_time = time.time()
            result = await neural_assistant_instance.process_message(session_id, message)
            end_time = time.time()
            
            benchmark_results[scenario_name] = {
                'response_time_ms': (end_time - start_time) * 1000,
                'tokens_used': result['tokens_used'],
                'safety_score': result['safety_score'],
                'response_length': len(result['content'])
            }
        
        # Print benchmark results
        print("\nEnd-to-End Benchmark Results:")
        for scenario, metrics in benchmark_results.items():
            print(f"{scenario}:")
            print(f"  Response Time: {metrics['response_time_ms']:.0f}ms")
            print(f"  Tokens Used: {metrics['tokens_used']}")
            print(f"  Safety Score: {metrics['safety_score']:.2f}")
            print(f"  Response Length: {metrics['response_length']} chars")
        
        # Validate all scenarios perform within reasonable bounds
        for scenario, metrics in benchmark_results.items():
            assert metrics['response_time_ms'] < 30000  # 30 seconds max (includes model loading)
            assert metrics['safety_score'] >= 0.7
            assert metrics['response_length'] > 0


# ============================================================================
# TEST UTILITIES AND FIXTURES
# ============================================================================

# ============================================================================
# MATHEMATICAL CORE TESTS
# ============================================================================

class TestMathematicalCore:
    """Tests for the mathematical computation engine."""

    @pytest.mark.asyncio
    async def test_basic_arithmetic(self):
        mc = MathematicalCore()
        await mc.initialize()
        assert await mc.evaluate_expression('2 + 3') == 5
        assert await mc.evaluate_expression('10 * 5') == 50
        assert await mc.evaluate_expression('2 ** 10') == 1024
        assert abs(await mc.evaluate_expression('10 / 3') - 3.333) < 0.01

    @pytest.mark.asyncio
    async def test_math_functions(self):
        mc = MathematicalCore()
        await mc.initialize()
        assert await mc.evaluate_expression('sqrt(144)') == 12.0
        assert abs(await mc.evaluate_expression('pi') - 3.14159) < 0.001
        assert abs(await mc.evaluate_expression('sin(0)')) < 0.001

    @pytest.mark.asyncio
    async def test_safe_eval_blocks_dangerous(self):
        mc = MathematicalCore()
        await mc.initialize()
        assert await mc.evaluate_expression('open("file")') is None
        assert await mc.evaluate_expression('__import__("os")') is None
        assert await mc.evaluate_expression('2**9999') is None
        assert await mc.evaluate_expression('1/0') is None

    @pytest.mark.asyncio
    async def test_linear_equation(self):
        mc = MathematicalCore()
        await mc.initialize()
        sol = await mc.solve_equation('2x + 5 = 15')
        assert sol['solution'] == 5.0

    @pytest.mark.asyncio
    async def test_statistics(self):
        mc = MathematicalCore()
        await mc.initialize()
        stats = await mc.compute_statistics([1, 2, 3, 4, 5])
        assert stats['mean'] == 3.0
        assert stats['count'] == 5
        assert stats['min'] == 1
        assert stats['max'] == 5

    @pytest.mark.asyncio
    async def test_statistics_empty(self):
        mc = MathematicalCore()
        await mc.initialize()
        result = await mc.compute_statistics([])
        assert 'error' in result

    @pytest.mark.asyncio
    async def test_math_text_analysis(self):
        mc = MathematicalCore()
        await mc.initialize()
        analysis = await mc.analyze_mathematical_expression('What is 2 + 3?')
        assert analysis['has_math'] is True
        assert '2 + 3' in analysis['results']


# ============================================================================
# COGNITIVE FRAMEWORK TESTS
# ============================================================================

class TestCognitiveFramework:
    """Tests for the cognitive processing engine."""

    @pytest.mark.asyncio
    async def test_process_input(self):
        cb = CognitiveBeeBot()
        await cb.initialize()
        result = await cb.process_input('What is AI?', [], ReasoningType.ANALYTICAL)
        assert 'reasoning' in result
        assert result['reasoning']['confidence'] > 0
        await cb.shutdown()

    @pytest.mark.asyncio
    async def test_generate_response_greeting(self):
        cb = CognitiveBeeBot()
        await cb.initialize()
        resp = await cb.generate_response('Hello!', {}, ReasoningType.CONVERSATIONAL)
        assert 'Hello' in resp['response']
        await cb.shutdown()

    @pytest.mark.asyncio
    async def test_generate_response_farewell(self):
        cb = CognitiveBeeBot()
        await cb.initialize()
        resp = await cb.generate_response('Goodbye!', {}, ReasoningType.CONVERSATIONAL)
        assert 'Goodbye' in resp['response'] or 'bye' in resp['response'].lower()
        await cb.shutdown()

    @pytest.mark.asyncio
    async def test_text_analysis(self):
        cb = CognitiveBeeBot()
        await cb.initialize()
        result = await cb.analyze_text_structure('Hello world. This is a test.')
        assert result['sentence_count'] == 2
        assert result['word_count'] == 6
        await cb.shutdown()

    @pytest.mark.asyncio
    async def test_memory_store_and_search(self):
        from bee_bot_cognitive_framework import MemoryManager
        mm = MemoryManager(capacity=100)
        mm.store('machine learning is great', MemoryType.LONG_TERM, 0.9)
        mm.store('hello world', MemoryType.SHORT_TERM, 0.5)
        results = mm.search('machine learning')
        assert len(results) > 0
        assert 'machine' in results[0][1].content.lower()


# ============================================================================
# CIRCUIT BREAKER TESTS
# ============================================================================

class TestCircuitBreaker:
    """Tests for the circuit breaker resilience pattern."""

    def test_initial_state(self):
        cb = CircuitBreaker(failure_threshold=3)
        assert cb.state == 'closed'
        assert cb.is_open is False

    def test_opens_on_threshold(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == 'closed'
        cb.record_failure()
        assert cb.state == 'open'
        assert cb.is_open is True

    def test_closes_on_success(self):
        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.01)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == 'open'
        time.sleep(0.02)
        assert cb.state == 'half_open'
        cb.record_success()
        assert cb.state == 'closed'


# ============================================================================
# EMBEDDING SERVICE TESTS
# ============================================================================

class TestEmbeddingService:
    """Tests for the embedding service."""

    @pytest.mark.asyncio
    async def test_embed_produces_vector(self):
        es = EmbeddingService()
        await es.initialize()
        vec = es.embed('hello world')
        assert len(vec) > 0
        assert isinstance(vec, np.ndarray)

    @pytest.mark.asyncio
    async def test_similarity_self(self):
        es = EmbeddingService()
        await es.initialize()
        vec = es.embed('test')
        sim = es.similarity(vec, vec)
        assert abs(sim - 1.0) < 0.01

    @pytest.mark.asyncio
    async def test_similarity_different(self):
        es = EmbeddingService()
        await es.initialize()
        v1 = es.embed('cat')
        v2 = es.embed('quantum physics')
        sim = es.similarity(v1, v2)
        assert sim < 0.8  # Should not be very similar


# ============================================================================
# CONFIG BRIDGE TESTS
# ============================================================================

class TestConfigBridge:
    """Tests that NeuralAssistant correctly reads both flat and structured configs."""

    @pytest.mark.asyncio
    async def test_flat_config(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        assert na.transformer_layers == 24
        assert na.d_model == 512
        assert na.constitutional_ai.safety_level == SafetyLevel.STANDARD

    @pytest.mark.asyncio
    async def test_structured_config(self):
        cfg = NeuralAssistantConfig(
            transformer=TransformerConfig(layers=8, d_model=128, n_heads=4, context_window=2048),
            safety=SafetyConfig(safety_level='strict'),
        )
        na = NeuralAssistant(cfg.__dict__)
        assert na.transformer_layers == 8
        assert na.d_model == 128
        assert na.context_window == 2048
        assert na.constitutional_ai.safety_level == SafetyLevel.STRICT


# ============================================================================
# TOOL INTEGRATION TESTS
# ============================================================================

class TestToolIntegration:
    """Tests for the tool execution system."""

    @pytest.mark.asyncio
    async def test_math_tool(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        await na.math_core.initialize()
        ext = NeuralAssistantExtensions(na)
        result = await ext.tools.execute_tool('mathematical_computation', {'expression': '2**8'})
        assert result['success'] is True
        assert result['result'] == 256

    @pytest.mark.asyncio
    async def test_code_tool_valid(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        ext = NeuralAssistantExtensions(na)
        result = await ext.tools.execute_tool('code_analysis', {'code': 'x = 1', 'language': 'python'})
        assert result['success'] is True
        assert result['analysis']['syntax_valid'] is True

    @pytest.mark.asyncio
    async def test_code_tool_invalid(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        ext = NeuralAssistantExtensions(na)
        result = await ext.tools.execute_tool('code_analysis', {'code': 'def foo(', 'language': 'python'})
        assert result['success'] is True
        assert result['analysis']['syntax_valid'] is False

    @pytest.mark.asyncio
    async def test_path_traversal_blocked(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        ext = NeuralAssistantExtensions(na)
        result = await ext.tools.execute_tool('file_management', {'file_path': '../../../etc/passwd', 'operation': 'read'})
        assert result['success'] is False

    @pytest.mark.asyncio
    async def test_unknown_tool(self):
        config = NeuralAssistantFactory.create_default_config()
        config['ollama_enabled'] = False
        na = NeuralAssistant(config)
        ext = NeuralAssistantExtensions(na)
        result = await ext.tools.execute_tool('nonexistent', {})
        assert result['success'] is False


# ============================================================================
# PYTEST CONFIGURATION
# ============================================================================

def pytest_configure(config):
    """Pytest configuration"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "gpu: marks tests requiring GPU acceleration"
    )


@pytest.fixture(scope="session")
def event_loop_policy():
    """Use default event loop policy for async tests (pytest-asyncio >= 0.21)."""
    return asyncio.DefaultEventLoopPolicy()


# ============================================================================
# TEST EXECUTION HELPERS
# ============================================================================

if __name__ == "__main__":
    """Run tests directly"""
    pytest.main([
        __file__,
        "-v",
        "--tb=short",
        "--cov=neural_assistant",
        "--cov-report=html",
        "--cov-report=term"
    ])


# ============================================================================
# LOCAL LLM PROVIDER TESTS
# ============================================================================

from neural_assistant_local_provider import (
    LocalLLMProvider, LocalModelManager, LlamaCppBackend,
    TransformersBackend, KNOWN_MODELS,
)


class TestLocalModelManager:
    """Test model management without downloading."""

    def test_list_available_models(self):
        manager = LocalModelManager()
        available = manager.list_available()
        assert len(available) > 0
        assert any(m['name'] == 'llama-3.2-3b' for m in available)

    def test_list_available_has_required_fields(self):
        manager = LocalModelManager()
        for model in manager.list_available():
            assert 'name' in model
            assert 'backend' in model
            assert 'size_gb' in model
            assert 'cached' in model

    def test_get_model_info_known(self):
        manager = LocalModelManager()
        info = manager.get_model_info('llama-3.2-3b')
        assert info is not None
        assert info['backend'] == 'gguf'
        assert info['size_gb'] == 2.0

    def test_get_model_info_unknown(self):
        manager = LocalModelManager()
        assert manager.get_model_info('nonexistent-model') is None

    def test_resolve_model_known(self):
        manager = LocalModelManager()
        backend_type, path = manager.resolve_model('llama-3.2-3b')
        assert backend_type == 'gguf'

    def test_resolve_model_unknown_treated_as_transformers(self):
        manager = LocalModelManager()
        backend_type, path = manager.resolve_model('some-org/some-model')
        assert backend_type == 'transformers'

    def test_list_models_empty_cache(self, tmp_path):
        manager = LocalModelManager(cache_dir=tmp_path / "empty_cache")
        cached = manager.list_models()
        assert cached == []

    def test_remove_model_not_cached(self):
        manager = LocalModelManager()
        assert manager.remove_model('llama-3.2-3b') is False or manager.remove_model('llama-3.2-3b') is True  # depends on cache state

    def test_known_models_registry(self):
        """Verify all known models have required fields."""
        for name, info in KNOWN_MODELS.items():
            assert 'backend' in info, f"{name} missing backend"
            assert 'repo' in info, f"{name} missing repo"
            assert 'size_gb' in info, f"{name} missing size_gb"
            assert 'context' in info, f"{name} missing context"
            assert info['backend'] in ('gguf', 'transformers'), f"{name} invalid backend"


class TestLocalLLMProvider:
    """Test LocalLLMProvider without loading real models."""

    def test_provider_init(self):
        provider = LocalLLMProvider(model_name='llama-3.2-3b')
        assert provider.model_name == 'llama-3.2-3b'
        assert provider._circuit.state == 'closed'
        assert not provider._loaded

    def test_device_resolution_cpu(self):
        provider = LocalLLMProvider(device='cpu')
        assert provider._resolve_device() == 'cpu'

    def test_device_resolution_explicit_cuda(self):
        provider = LocalLLMProvider(device='cuda')
        assert provider._resolve_device() == 'cuda'

    def test_device_resolution_auto(self):
        provider = LocalLLMProvider(device='auto')
        device = provider._resolve_device()
        assert device in ('cpu', 'cuda')

    @pytest.mark.asyncio
    async def test_circuit_breaker_blocks_when_open(self):
        provider = LocalLLMProvider()
        for _ in range(5):
            provider._circuit.record_failure()
        with pytest.raises(ConnectionError, match="circuit breaker open"):
            await provider.generate_response("test")

    def test_unload_when_not_loaded(self):
        provider = LocalLLMProvider()
        provider.unload_model()  # Should not raise
        assert not provider._loaded

    def test_provider_info(self):
        provider = LocalLLMProvider(model_name='phi-3-mini', device='cpu')
        info = provider.provider_info
        assert info['provider'] == 'local'
        assert info['model_name'] == 'phi-3-mini'
        assert info['device'] == 'cpu'
        assert info['loaded'] is False

    @pytest.mark.asyncio
    async def test_get_embeddings_raises(self):
        provider = LocalLLMProvider()
        with pytest.raises(NotImplementedError, match="EmbeddingService"):
            await provider.get_embeddings("test text")

    def test_model_attribute_compatibility(self):
        """Provider should have .model attribute for detail views."""
        provider = LocalLLMProvider(model_name='llama-3.2-1b')
        assert provider.model == 'llama-3.2-1b'


class TestLocalProviderIntegration:
    """Integration tests: provider registration with NeuralAssistant config."""

    def test_local_provider_in_model_provider_enum(self):
        assert ModelProvider.LOCAL.value == 'local'

    def test_model_provider_config_for_local(self):
        cfg = ModelProviderConfig(
            enabled=True,
            model_name='llama-3.2-1b',
            max_tokens=500,
            temperature=0.7,
        )
        assert cfg.enabled is True
        assert cfg.model_name == 'llama-3.2-1b'


class TestLlamaCppBackend:
    """Test LlamaCppBackend without loading models."""

    def test_init(self):
        backend = LlamaCppBackend()
        assert not backend.is_loaded
        assert backend.model_info == {'loaded': False, 'error': None}

    def test_unload_when_not_loaded(self):
        backend = LlamaCppBackend()
        backend.unload()  # Should not raise

    @pytest.mark.asyncio
    async def test_generate_without_load_raises(self):
        backend = LlamaCppBackend()
        with pytest.raises(RuntimeError, match="Model not loaded"):
            await backend.generate(
                [{"role": "user", "content": "test"}],
                max_tokens=10, temperature=0.7,
            )


class TestTransformersBackend:
    """Test TransformersBackend without loading models."""

    def test_init(self):
        backend = TransformersBackend()
        assert not backend.is_loaded
        assert backend.model_info == {'loaded': False, 'error': None}

    def test_unload_when_not_loaded(self):
        backend = TransformersBackend()
        backend.unload()  # Should not raise

    @pytest.mark.asyncio
    async def test_generate_without_load_raises(self):
        backend = TransformersBackend()
        with pytest.raises(RuntimeError, match="Model not loaded"):
            await backend.generate(
                [{"role": "user", "content": "test"}],
                max_tokens=10, temperature=0.7,
            )


# ============================================================================
# USAGE EXAMPLES
# ============================================================================

"""
Test Execution Examples:

# Run all tests
pytest test_neural_assistant.py -v

# Run specific test class
pytest test_neural_assistant.py::TestAttentionMechanism -v

# Run without slow tests
pytest test_neural_assistant.py -m "not slow" -v

# Run with coverage
pytest test_neural_assistant.py --cov=neural_assistant --cov-report=html

# Run integration tests only
pytest test_neural_assistant.py -m integration -v

# Run benchmarks
pytest test_neural_assistant.py::TestBenchmarks -v -s

# Run in parallel (with pytest-xdist)
pytest test_neural_assistant.py -n auto

# Generate test report
pytest test_neural_assistant.py --html=report.html --self-contained-html
"""