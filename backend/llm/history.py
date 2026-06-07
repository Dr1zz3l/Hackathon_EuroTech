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
import math
import statistics
from pathlib import Path

from .data import DISTRICT_NAMES, _norm

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
# name_norm -> uncertainty band for Low/High scenarios (fraction/yr).
# Stored per-area so district and STPU series carry their own peer dispersion.
_BAND: dict[str, float] = {}
_DEFAULT_BAND: float = 0.008  # fallback when <3 peers in a group
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
        if len(pts) >= 3:
            # Log-linear fit over all available years so the 2016 (middle) point
            # contributes rather than being discarded by an endpoint-only formula.
            years_seq = [float(p[0]) for p in pts]
            log_pops = [math.log(p[1]) for p in pts if p[1] > 0]
            if len(log_pops) == len(pts):
                lr = statistics.linear_regression(years_seq, log_pops)
                _CAGR[key] = math.exp(lr.slope) - 1.0
        elif len(pts) == 2:
            (y0, p0), (y1, p1) = pts[0], pts[-1]
            if y1 > y0 and p0 > 0 and p1 > 0:
                _CAGR[key] = (p1 / p0) ** (1.0 / (y1 - y0)) - 1.0

    # Per-granularity uncertainty band: district series and STPU series have very
    # different variance profiles, so we compute the cross-peer dispersion separately
    # for each group and assign each area its group band.
    district_norms = {_norm(n) for n in DISTRICT_NAMES}
    district_rates = [r for k, r in _CAGR.items() if k in district_norms]
    stpu_rates     = [r for k, r in _CAGR.items() if k not in district_norms]

    district_band = (
        max(0.005, float(statistics.pstdev(district_rates)))
        if len(district_rates) >= 3 else _DEFAULT_BAND
    )
    stpu_band = (
        max(0.005, float(statistics.pstdev(stpu_rates)))
        if len(stpu_rates) >= 3 else _DEFAULT_BAND
    )

    for key in _CAGR:
        _BAND[key] = district_band if key in district_norms else stpu_band

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
        "band": _BAND.get(key, _DEFAULT_BAND),
    }
