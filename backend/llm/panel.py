"""
backend/llm/panel.py — Lazy loader for the 2011–2021 census temporal panel.

The panel is built by build_population_history.py. It stacks all three census
snapshots (2011, 2016, 2021) into a training set with `year` as a feature, letting
TabPFN learn demographic time-drift rather than a purely cross-sectional signal.

Degrades gracefully if the file is absent:
  panel_available() → False
  panel_rows_for()  → []
The rest of the forecast engine falls back to the 2021 cross-section automatically.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_PANEL_PATHS = [
    _REPO_ROOT / "data" / "population" / "census_panel.json",
    _REPO_ROOT / "frontend" / "public" / "census_panel.json",
]

_PANEL: dict[str, list[dict[str, Any]]] = {}
_loaded = False


def _load() -> None:
    global _PANEL, _loaded
    if _loaded:
        return
    _loaded = True

    path = next((p for p in _PANEL_PATHS if p.exists()), None)
    if path is None:
        logger.info("No census_panel.json found — TabPFN uses 2021 cross-section only.")
        return

    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        _PANEL = {k: v for k, v in data.items() if isinstance(v, list)}
        logger.info(
            "Census panel loaded: %d district rows, %d neighbourhood rows.",
            len(_PANEL.get("district", [])),
            len(_PANEL.get("neighbourhood", [])),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load census_panel.json (%s) — cross-section fallback.", exc)


def panel_available() -> bool:
    """True if the panel was loaded with at least one district row."""
    _load()
    return bool(_PANEL.get("district"))


def panel_rows_for(granularity: str) -> list[dict[str, Any]]:
    """Return panel rows for 'district' or 'neighbourhood'. [] if unavailable."""
    _load()
    key = "neighbourhood" if granularity == "neighbourhood" else "district"
    return _PANEL.get(key, [])
