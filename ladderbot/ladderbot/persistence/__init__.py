"""LadderBot persistence layer.

Public surface:
    - init_db, connect: schema + connection helpers
    - CycleRepository: save/load CycleState + trade log; resume support
    - TraceSlipRepository: persist TraceSlip records
    - OrderRepository: persist LadderOrder + Fill records
    - PersistentGovernor: CycleGovernor wrapper that writes to disk
    - PersistentEngine: LadderExecutionEngine wrapper that persists orders
"""

from .db import DEFAULT_DB_PATH, connect, init_db
from .cycle_repo import CycleRepository, CycleRecord
from .slip_repo import TraceSlipRepository
from .order_repo import OrderRepository
from .persistent_governor import PersistentGovernor
from .persistent_engine import PersistentEngine

__all__ = [
    "DEFAULT_DB_PATH", "connect", "init_db",
    "CycleRepository", "CycleRecord",
    "TraceSlipRepository",
    "OrderRepository",
    "PersistentGovernor",
    "PersistentEngine",
]
