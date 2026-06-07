"""
Historical population series → real per-area growth rates for the forecast.

Loads `data/population/population_history.csv` (long format: name,year,pop) if
present and derives, per area, the observed compound annual growth rate (CAGR)
across the available census years. The forecast engine prefers this measured
trend over its structural assumption whenever a series exists for the area;
otherwise it falls back gracefully.

To extend coverage, just add rows (more years, or neighbourhood-level series) to
the CSV — the loader picks them up with no code change. Names are matched
loosely (case / '&' / '-' / '·' folded) against the district / STPU names.
"""

from __future__ import annotations

import csv
import logging
import statistics
from pathlib import Path

from .data import _norm

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_CANDIDATE_PATHS = [
    _REPO_ROOT / "data" / "population" / "population_history.csv",
    _REPO_ROOT / "frontend" / "public" / "population_history.csv",
]

# name_norm -> sorted list of (year, pop)
_SERIES: dict[str, list[tuple[int, float]]] = {}
# name_norm -> CAGR (fraction/yr)
_CAGR: dict[str, float] = {}
_BAND: float = 0.008  # default ± band if dispersion can't be computed
_loaded = False


def _load() -> None:
    global _loaded, _BAND
    if _loaded:
        return
    _loaded = True

    path = next((p for p in _CANDIDATE_PATHS if p.exists()), None)
    if path is None:
        logger.info("No population_history.csv found — forecasts use the structural model.")
        return

    with path.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                name = row["name"]
                year = int(row["year"])
                pop = float(row["pop"])
            except (KeyError, ValueError, TypeError):
                continue
            if pop > 0:
                _SERIES.setdefault(_norm(name), []).append((year, pop))

    for key, pts in _SERIES.items():
        pts.sort()
        if len(pts) >= 2:
            (y0, p0), (y1, p1) = pts[0], pts[-1]
            if y1 > y0 and p0 > 0 and p1 > 0:
                _CAGR[key] = (p1 / p0) ** (1.0 / (y1 - y0)) - 1.0

    # Uncertainty band = cross-area dispersion of growth rates (≥3 areas), so
    # the Low/High scenarios reflect how varied real district trends actually are.
    rates = list(_CAGR.values())
    if len(rates) >= 3:
        _BAND = max(0.005, float(statistics.pstdev(rates)))

    logger.info("Loaded population history: %d areas with a growth trend.", len(_CAGR))


def has_history() -> bool:
    _load()
    return bool(_CAGR)


def history_growth(name: str) -> dict | None:
    """
    Return the observed growth trend for `name`, or None if no usable series.

    {cagr, year_first, year_last, n_points, band}
    """
    _load()
    key = _norm(name)
    if key not in _CAGR:
        return None
    pts = _SERIES[key]
    return {
        "cagr": _CAGR[key],
        "year_first": pts[0][0],
        "year_last": pts[-1][0],
        "n_points": len(pts),
        "band": _BAND,
    }
