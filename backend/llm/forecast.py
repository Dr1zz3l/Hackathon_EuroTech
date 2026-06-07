"""
Forecast engine — TabPFN-assisted scenario projection for a single area.

Powers the right-panel "Forecast" tab and the agent's `show_forecast` tool.

Because the dataset is a single 2021 census snapshot (no time series), a literal
multi-year forecast must be assumption-driven. We make that explicit and let
TabPFN do the genuine modelling work:

  • Headline trajectory  — compound-growth projection of the chosen target under
    Low / Expected / High scenarios. The Expected annual rate is modulated per
    unit by a TabPFN "youthfulness" signal (areas the model reads as structurally
    younger grow faster).
  • Future indicators    — TabPFN what-if: scale the area's population & density
    to the horizon and predict its future median age / elderly share.
  • Recommendations      — rules over the projected numbers (housing supply,
    ageing, decline, open space, school demand) with info/warning/critical levels.

Everything is labelled as a cross-sectional model estimate, never a measured
trend. TabPFN regressors are fitted once on all rows and cached per (granularity,
target); what-if prediction perturbs the target area's inputs.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from .data import ALL_METRICS, _metric_value, _rows_for, find_district
from .history import history_growth
from .predict import _matrix, _new_regressor, _select_features

logger = logging.getLogger(__name__)

# ── Transparent assumptions ────────────────────────────────────────────────
BASE_YEAR = 2021                 # census snapshot year (trajectory baseline)
HOUSEHOLD_SIZE = 2.7             # HK average domestic household size (2021 Census)
BASE_MID_RATE = 0.006            # +0.6%/yr Expected baseline (HK is near-flat)
STRUCT_SPREAD = 0.012            # ± modulation from the TabPFN youth signal
BAND = 0.008                     # Low/High band around the Expected rate

VALUE_KIND = {
    "pop": "count", "density": "per_km2", "median_age": "years",
    "pct_over65": "percent", "area_km2": "km2",
    "land.residential": "fraction", "land.industrial": "fraction",
    "land.commercial": "fraction", "land.green": "fraction",
    "land.educational": "fraction", "land.other": "fraction",
}

# Fitted-regressor cache: (granularity, target) -> (regressor, feats, names, model_name)
_CACHE: dict[tuple[str, str], tuple[Any, list[str], list[str], str]] = {}


def _fit_for(granularity: str, target: str):
    """Fit (once) a regressor predicting `target` from the other metrics."""
    key = (granularity, target)
    if key in _CACHE:
        return _CACHE[key]
    rows = [r for r in _rows_for(granularity) if _metric_value(r, target) is not None]
    feats = _select_features(rows, target, None)
    X = _matrix(rows, feats)
    y = np.asarray([_metric_value(r, target) for r in rows], dtype=float)
    reg, model_name = _new_regressor()
    reg.fit(X, y)
    names = [r.get("name", "?") for r in rows]
    _CACHE[key] = (reg, feats, names, model_name)
    return _CACHE[key]


def _youth_signal(granularity: str, unit_name: str) -> float:
    """
    TabPFN-derived structural youthfulness of the unit, in [-1, 1].
    Younger-than-typical predicted median age → positive (faster growth).
    """
    try:
        reg, feats, names, _ = _fit_for(granularity, "median_age")
        rows = [r for r in _rows_for(granularity) if _metric_value(r, "median_age") is not None]
        preds = np.asarray(reg.predict(_matrix(rows, feats)), dtype=float)
        if unit_name not in names:
            return 0.0
        lo, hi = float(preds.min()), float(preds.max())
        if hi - lo < 1e-6:
            return 0.0
        p = preds[names.index(unit_name)]
        youth = 1.0 - (p - lo) / (hi - lo)   # younger → 1
        return float((youth - 0.5) * 2.0)    # → [-1, 1]
    except Exception as exc:  # noqa: BLE001
        logger.warning("youth signal failed: %s", exc)
        return 0.0


def _whatif_target(granularity: str, target: str, row: dict, growth_factor: float) -> float | None:
    """Predict `target` for the unit after scaling pop & density by growth_factor."""
    try:
        reg, feats, _, _ = _fit_for(granularity, target)
        vec = np.asarray([[_metric_value(row, m) for m in feats]], dtype=float)
        for col in ("pop", "density"):
            if col in feats:
                vec[0, feats.index(col)] *= growth_factor
        return float(reg.predict(vec)[0])
    except Exception as exc:  # noqa: BLE001
        logger.warning("what-if for %s failed: %s", target, exc)
        return None


def _round(v: float, kind: str) -> float:
    if kind in ("fraction",):
        return round(v, 4)
    if kind in ("years", "percent", "km2"):
        return round(v, 2)
    return round(v, 1)


def _recommendations(row, target, year, traj_end, future, density_high) -> list[dict]:
    """Rules over the projected numbers → planning recommendations / warnings."""
    recs: list[dict] = []
    pop0 = float(row.get("pop") or 0)
    pop_h = traj_end["pop_mid"]
    dpop = pop_h - pop0
    pct = (pop_h / pop0 - 1.0) if pop0 else 0.0
    res = float((row.get("land") or {}).get("residential", 0.0))
    green = float((row.get("land") or {}).get("green", 0.0))
    dens0 = float(row.get("density") or 0)
    over65_0 = float(row.get("pct_over65") or 0)
    over65_h = future.get("pct_over65")
    medage_h = future.get("median_age")
    new_homes = max(0.0, dpop) / HOUSEHOLD_SIZE

    # 1. Housing supply pressure
    if pct >= 0.05 and dpop > 0:
        tight = density_high or res < 0.30
        if tight:
            sev = "critical" if (pct >= 0.10 and density_high) else "warning"
            recs.append({
                "severity": sev,
                "title": "Housing supply at risk",
                "detail": (
                    f"Population could reach ~{pop_h:,.0f} by {year} (+{pct:.0%}), needing roughly "
                    f"{new_homes:,.0f} more homes (at {HOUSEHOLD_SIZE} people/household). "
                    f"Residential land is only {res:.0%} and density is already {dens0:,.0f}/km² — "
                    f"existing housing supply is likely insufficient. Prioritise redevelopment, "
                    f"higher plot ratios, or new residential sites."
                ),
            })
        else:
            recs.append({
                "severity": "warning",
                "title": "Plan housing supply",
                "detail": (
                    f"About {new_homes:,.0f} additional homes would be needed by {year} to house "
                    f"+{dpop:,.0f} residents. Secure land supply ahead of demand."
                ),
            })

    # 2. Ageing population
    if over65_h is not None and (over65_h - over65_0 >= 2.0 or over65_h >= 22.0):
        recs.append({
            "severity": "warning",
            "title": "Ageing population",
            "detail": (
                f"Elderly share is projected to rise to about {over65_h:.0f}% by {year} "
                f"(from {over65_0:.0f}%). Expand elder-care, healthcare capacity and "
                f"barrier-free access."
            ),
        })

    # 3. Population decline
    if pct <= -0.03:
        recs.append({
            "severity": "info",
            "title": "Population decline",
            "detail": (
                f"Population may fall about {abs(pct):.0%} by {year}. Watch for under-used "
                f"schools and facilities; consider consolidation or repurposing."
            ),
        })

    # 4. Densification vs open space
    if pct >= 0.05 and green < 0.10:
        recs.append({
            "severity": "info",
            "title": "Safeguard open space",
            "detail": (
                f"Growth with limited green space ({green:.0%} today). Protect or add open "
                f"space to keep the area liveable as it densifies."
            ),
        })

    # 5. School / childcare demand
    if pct >= 0.05 and medage_h is not None and medage_h < 42:
        recs.append({
            "severity": "info",
            "title": "School-place demand",
            "detail": (
                f"A growing, relatively young area (projected median age ~{medage_h:.0f}). "
                f"Monitor school-place and childcare demand."
            ),
        })

    if not recs:
        recs.append({
            "severity": "info",
            "title": "Stable outlook",
            "detail": (
                f"Projected change through {year} is modest; no acute capacity pressures "
                f"flagged from the structural profile."
            ),
        })
    return recs


def run_forecast(
    unit: str,
    granularity: str = "district",
    target: str = "pop",
    horizon_years: int = 10,
) -> dict[str, Any]:
    """Project `target` for `unit` over `horizon_years` with Low/Expected/High scenarios."""
    if target not in ALL_METRICS:
        return {"error": f"Unknown target '{target}'.", "valid_targets": list(ALL_METRICS)}

    row = find_district(unit, granularity)
    if row is None:
        # Try the other granularity before giving up (agent may mislabel).
        other = "neighbourhood" if granularity == "district" else "district"
        row = find_district(unit, other)
        if row is not None:
            granularity = other
    if row is None:
        return {"error": f"No area found matching '{unit}'."}

    baseline = _metric_value(row, target)
    if baseline is None:
        return {"error": f"'{target}' is not available for this area."}

    H = max(1, min(int(horizon_years or 10), 30))
    horizon_year = BASE_YEAR + H
    kind = VALUE_KIND.get(target, "count")

    # ── Per-unit growth rates ───────────────────────────────────────────────
    # Prefer a MEASURED trend from historical census data when we have a series
    # for this area; otherwise fall back to the TabPFN structural estimate.
    hist = history_growth(row.get("name", ""))
    if hist is not None:
        basis = "historical"
        mid_rate = hist["cagr"]
        band = hist["band"]
        basis_label = (
            f"Census trend {hist['year_first']}→{hist['year_last']} "
            f"({mid_rate * 100:+.1f}%/yr)"
        )
    else:
        basis = "structural"
        yc = _youth_signal(granularity, row.get("name", ""))
        mid_rate = BASE_MID_RATE + STRUCT_SPREAD * yc
        band = BAND
        basis_label = "TabPFN structural estimate (no historical series for this area)"
    rates = {"low": mid_rate - band, "mid": mid_rate, "high": mid_rate + band}

    pop0 = float(row.get("pop") or 0)
    area = float(row.get("area_km2") or 0) or 1.0

    def pop_at(year_offset: int, scen: str) -> float:
        return pop0 * (1.0 + rates[scen]) ** year_offset

    # ── Build the target trajectory per scenario ────────────────────────────
    def target_at(year_offset: int, scen: str) -> float:
        f = (1.0 + rates[scen]) ** year_offset
        if target == "pop":
            return pop0 * f
        if target == "density":
            return (pop0 * f) / area
        if target == "area_km2":
            return baseline
        # demographic / land target: TabPFN what-if at this growth factor,
        # interpolated from the actual baseline at year 0.
        if year_offset == 0:
            return baseline
        endp = _whatif_target(granularity, target, row, f)
        if endp is None:
            return baseline
        return baseline + (endp - baseline) * (year_offset / H)

    trajectory = []
    for yo in range(0, H + 1):
        trajectory.append({
            "year": BASE_YEAR + yo,
            "low":  _round(target_at(yo, "low"), kind),
            "mid":  _round(target_at(yo, "mid"), kind),
            "high": _round(target_at(yo, "high"), kind),
        })

    end_low = target_at(H, "low")
    end_mid = target_at(H, "mid")
    end_high = target_at(H, "high")
    pct_change_mid = (end_mid / baseline - 1.0) if baseline else 0.0

    # ── Future indicators (mid scenario, TabPFN what-if) ────────────────────
    gf_mid = (1.0 + rates["mid"]) ** H
    future = {
        "median_age": _whatif_target(granularity, "median_age", row, gf_mid),
        "pct_over65": _whatif_target(granularity, "pct_over65", row, gf_mid),
        "density": round((float(row.get("density") or 0)) * gf_mid, 1),
    }
    future = {k: (round(v, 1) if v is not None else None) for k, v in future.items()}

    # ── Density "already dense?" judgement (territory percentile) ───────────
    dens_vals = [
        _metric_value(r, "density") for r in _rows_for(granularity)
        if _metric_value(r, "density") is not None
    ]
    density_high = bool(dens_vals) and (float(row.get("density") or 0) >= float(np.percentile(dens_vals, 75)))

    # ── Housing-derived numbers ─────────────────────────────────────────────
    pop_h_mid = pop_at(H, "mid")
    housing = {
        "household_size": HOUSEHOLD_SIZE,
        "baseline_pop": round(pop0),
        "projected_pop": round(pop_h_mid),
        "added_residents": round(pop_h_mid - pop0),
        "current_homes": round(pop0 / HOUSEHOLD_SIZE) if pop0 else 0,
        "new_homes_needed": round(max(0.0, pop_h_mid - pop0) / HOUSEHOLD_SIZE),
        "residential_share": round(float((row.get("land") or {}).get("residential", 0.0)), 4),
        "density": round(float(row.get("density") or 0)),
        "density_high": density_high,
    }

    recs = _recommendations(
        row, target, horizon_year,
        {"pop_mid": pop_h_mid}, future, density_high,
    )

    _, _, _, model_name = _fit_for(granularity, target)

    if basis == "historical":
        assumptions = [
            f"Growth uses the MEASURED census trend {hist['year_first']}→{hist['year_last']} "
            f"({mid_rate * 100:+.1f}%/yr) for this district; Low/High are ±{band * 100:.1f}% "
            f"(spread of real district trends).",
            f"Projected from the {BASE_YEAR} baseline; future indicators are TabPFN estimates.",
            f"Housing need assumes {HOUSEHOLD_SIZE} people per household.",
        ]
        note = (
            f"Population growth is the observed {hist['year_first']}–{hist['year_last']} census "
            f"trend; demographic indicators are a TabPFN model estimate."
        )
    else:
        assumptions = [
            f"No historical series for this area — growth is a TabPFN structural estimate "
            f"({mid_rate * 100:+.1f}%/yr), not a measured trend; Low/High are ±{band * 100:.1f}%.",
            f"Baseline is the {BASE_YEAR} census; future indicators are TabPFN estimates.",
            f"Housing need assumes {HOUSEHOLD_SIZE} people per household.",
        ]
        note = (
            "Cross-sectional TabPFN model + scenario projection from the 2021 snapshot — "
            "decision-support estimate, not an official forecast."
        )

    return {
        "unit": row.get("name"),
        "name_tc": row.get("name_tc"),
        "granularity": granularity,
        "target": target,
        "target_description": ALL_METRICS[target],
        "value_kind": kind,
        "base_year": BASE_YEAR,
        "horizon_year": horizon_year,
        "horizon_years": H,
        "baseline": _round(baseline, kind),
        "basis": basis,
        "basis_label": basis_label,
        "history": (
            {"year_first": hist["year_first"], "year_last": hist["year_last"],
             "cagr": round(hist["cagr"], 4), "n_points": hist["n_points"]}
            if hist else None
        ),
        "annual_rate_mid": round(rates["mid"], 4),
        "endpoint": {
            "low": _round(end_low, kind),
            "mid": _round(end_mid, kind),
            "high": _round(end_high, kind),
            "pct_change_mid": round(pct_change_mid, 4),
        },
        "trajectory": trajectory,
        "future_indicators": future,
        "housing": housing,
        "recommendations": recs,
        "model": model_name,
        "assumptions": [
            f"Baseline is the {BASE_YEAR} census; projection is a scenario estimate, not a measured trend.",
            f"Expected annual rate {rates['mid']*100:+.1f}% is modulated by a TabPFN structural (youth) signal; Low/High are ±{BAND*100:.1f}%.",
            f"Housing need assumes {HOUSEHOLD_SIZE} people per household.",
        ],
        "note": (
            "Cross-sectional TabPFN model + scenario projection from the 2021 snapshot — "
            "decision-support estimate, not an official forecast."
        ),
    }
