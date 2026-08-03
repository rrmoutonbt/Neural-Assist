"""LadderBot execution layer.

Public surface:
    - OptionChainProvider protocol + SyntheticChainProvider, FileChainProvider
    - LadderBroker protocol + PaperBroker
    - LadderOrder, Fill, OrderStatus, OrderRequest
    - LadderExecutionEngine
    - chain_provider_to_option_context: adapter that plugs a chain
      provider into LadderStrategy's option_context_provider slot
"""

from .order import LadderOrder, Fill, OrderStatus, OrderRequest, OrderSide
from .chain_provider import (
    OptionChainProvider,
    SyntheticChainProvider,
    FileChainProvider,
)
from .broker import LadderBroker, PaperBroker
from .engine import LadderExecutionEngine
from .provider_adapter import chain_provider_to_option_context

__all__ = [
    "OrderStatus", "OrderSide", "OrderRequest", "LadderOrder", "Fill",
    "OptionChainProvider", "SyntheticChainProvider", "FileChainProvider",
    "LadderBroker", "PaperBroker",
    "LadderExecutionEngine",
    "chain_provider_to_option_context",
]
