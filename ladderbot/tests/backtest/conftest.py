import os
import sys

BACKEND = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "backend-trading-service")
)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)
