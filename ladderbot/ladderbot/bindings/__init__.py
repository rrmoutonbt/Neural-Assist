"""ladderbot.bindings — scorer <-> backtest adapter.

In the earlier cross-repo layout this module owned a sys.path shim
that pulled Bee_bot + Mastery + DATASOURCE onto the path. In the
consolidated LadderBot repo that shim is obsolete — everything ships
under `ladderbot.*` — so the module now only exports the
mastery_scorer_to_fn helper for backtest wiring.
"""

from .mastery_adapter import mastery_scorer_to_fn

__all__ = ["mastery_scorer_to_fn"]
