"""
TabPFN-powered prediction for districts / neighbourhoods.

Uses PriorLabs' TabPFN — a transformer foundation model for tabular data — to
predict a numeric metric for an area from its *other* attributes. Because the
dataset is a single 2021 census snapshot (no time series), this is a
**cross-sectional** model, not a temporal forecast:

  - Named units → out-of-sample predicted-vs-actual for each (train on the rest).
  - Whole set  → 5-fold out-of-sample predictions + R²/MAE, and the areas that
                 diverge most from their predicted profile (anomaly/opportunity).
  - What-if    → override input features to see how the predicted target shifts.

TabPFN is imported lazily on first use (it pulls in torch and downloads model
weights once). If it can't be loaded, we fall back to a dependency-free numpy
kNN regressor so the feature degrades gracefully instead of crashing.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from .data import (
    ALL_METRICS,
    DISTRICT_NAMES,
    _metric_value,
    _rows_for,
    find_district,
)

logger = logging.getLogger(__name__)

# Cap how many units we report / accept so the model result stays compact.
MAX_UNITS = 12
N_FOLDS = 5
MIN_TRAIN_ROWS = 6


# ---------------------------------------------------------------------------
# Model selection (lazy) — TabPFN if available, else a numpy kNN fallback
# ---------------------------------------------------------------------------

class _KNNRegressor:
    """Minimal standardised k-NN regressor — pure numpy, zero dependencies."""

    def __init__(self, k: int = 5, **_: Any) -> None:
        self.k = k

    def fit(self, X: np.ndarray, y: np.ndarray) -> "_KNNRegressor":
        self._X = np.asarray(X, dtype=float)
        self._y = np.asarray(y, dtype=float)
        self._mu = self._X.mean(axis=0)
        self._sd = self._X.std(axis=0)
        self._sd[self._sd == 0] = 1.0
        self._Xs = (self._X - self._mu) / self._sd
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        Xt = (np.asarray(X, dtype=float) - self._mu) / self._sd
        k = min(self.k, len(self._y))
        out = []
        for row in Xt:
            d = np.sqrt(((self._Xs - row) ** 2).sum(axis=1))
            idx = np.argsort(d)[:k]
            out.append(float(self._y[idx].mean()))
        return np.asarray(out, dtype=float)


_REG_CLS: Any = None
_MODEL_NAME: str | None = None


def _get_regressor_cls() -> tuple[Any, str]:
    """
    Resolve the regressor class once, preferring TabPFN.

    TabPFN ≥8 requires a one-time license acceptance + TABPFN_TOKEN to download
    weights for local inference, so we *probe* it with a tiny fit/predict. If the
    token is missing (or anything else fails), we fall back to the numpy kNN
    baseline so predictions still work — clearly labelled in the result.
    Set TABPFN_TOKEN (e.g. in .env) and restart the backend to enable real TabPFN.
    """
    global _REG_CLS, _MODEL_NAME
    if _REG_CLS is not None:
        return _REG_CLS, _MODEL_NAME  # type: ignore[return-value]
    try:
        from tabpfn import TabPFNRegressor  # noqa: PLC0415 (lazy by design)
        # Probe: forces weight download / license check up front.
        probe = TabPFNRegressor(device="cpu")
        Xp = np.linspace(0, 1, 24).reshape(8, 3)
        yp = Xp.sum(axis=1)
        probe.fit(Xp, yp)
        probe.predict(Xp[:2])
        _REG_CLS = TabPFNRegressor
        _MODEL_NAME = "TabPFN v2 (PriorLabs)"
        logger.info("TabPFN loaded and verified for predictions.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("TabPFN unavailable (%s) — using kNN fallback.", exc)
        _REG_CLS = _KNNRegressor
        _MODEL_NAME = "kNN baseline (set TABPFN_TOKEN to enable TabPFN)"
    return _REG_CLS, _MODEL_NAME


def _new_regressor() -> tuple[Any, str]:
    cls, name = _get_regressor_cls()
    if name.startswith("TabPFN"):
        try:
            return cls(device="cpu"), name
        except Exception as exc:  # noqa: BLE001 — construction failed → kNN fallback
            logger.warning("TabPFN construction failed (%s) — kNN fallback.", exc)
            return _KNNRegressor(), "kNN baseline (TabPFN unavailable)"
    return cls(), name


def tabpfn_available() -> bool:
    _, name = _get_regressor_cls()
    return name.startswith("TabPFN")


# ---------------------------------------------------------------------------
# Feature / matrix assembly
# ---------------------------------------------------------------------------

def _select_features(rows: list[dict], target: str, requested: list[str] | None) -> list[str]:
    """Pick numeric feature metrics present for *every* row (excludes target)."""
    if requested:
        candidates = [m for m in requested if m in ALL_METRICS and m != target]
    else:
        candidates = [m for m in ALL_METRICS if m != target]
    feats = []
    for m in candidates:
        if all(_metric_value(r, m) is not None for r in rows):
            feats.append(m)
    return feats


def _matrix(rows: list[dict], feats: list[str]) -> np.ndarray:
    return np.asarray(
        [[_metric_value(r, m) for m in feats] for r in rows], dtype=float
    )


def _round(val: float, target: str) -> float:
    # Land fractions and shares are small; populations / densities are large.
    if target.startswith("land.") or target in {"ageing_building_share"}:
        return round(float(val), 4)
    if target in {"pct_over65", "median_age", "area_km2"}:
        return round(float(val), 2)
    return round(float(val), 1)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def tabpfn_predict(
    target: str,
    granularity: str = "neighbourhood",
    units: list[str] | None = None,
    features: list[str] | None = None,
    whatif: dict[str, float] | None = None,
    top: int = 6,
) -> dict[str, Any]:
    """
    Predict `target` for the chosen granularity. See module docstring for modes.
    """
    if target not in ALL_METRICS:
        return {"error": f"Unknown target '{target}'.", "valid_targets": list(ALL_METRICS)}

    rows_all = _rows_for(granularity)
    rows = [r for r in rows_all if _metric_value(r, target) is not None]
    if len(rows) < MIN_TRAIN_ROWS:
        return {"error": f"Not enough data to model '{target}' at {granularity} level."}

    feats = _select_features(rows, target, features)
    if len(feats) < 2:
        return {"error": "Not enough usable feature columns to build a model."}

    names = [r.get("name", "?") for r in rows]
    X = _matrix(rows, feats)
    y = np.asarray([_metric_value(r, target) for r in rows], dtype=float)

    base = {
        "model": _get_regressor_cls()[1],
        "target": target,
        "target_description": ALL_METRICS[target],
        "granularity": granularity,
        "features_used": feats,
        "note": (
            "Cross-sectional estimate from the 2021 snapshot (no time series) — "
            "a modelled value from each area's structural profile, not a temporal forecast."
        ),
    }

    # ── Mode 1: specific named units ────────────────────────────────────────
    if units:
        idx_map = {}
        for u in units[:MAX_UNITS]:
            row = find_district(u, granularity)
            if row is not None:
                nm = row.get("name")
                if nm in names:
                    idx_map[nm] = names.index(nm)
        if not idx_map:
            return {"error": "None of the requested units were found.",
                    "available_hint": DISTRICT_NAMES if granularity == "district" else None}

        test_idx = sorted(set(idx_map.values()))
        test_mask = np.zeros(len(names), dtype=bool)
        test_mask[test_idx] = True
        if (~test_mask).sum() < MIN_TRAIN_ROWS:
            return {"error": "Too many units requested at once to train a reliable model."}

        reg, model_name = _new_regressor()
        reg.fit(X[~test_mask], y[~test_mask])
        pred = reg.predict(X[test_mask])

        # Optional what-if: apply feature multipliers to the test rows.
        wi_pred = None
        if whatif:
            Xte = X[test_mask].copy()
            applied = {}
            for k, mult in whatif.items():
                if k in feats and isinstance(mult, (int, float)):
                    Xte[:, feats.index(k)] *= float(mult)
                    applied[k] = float(mult)
            if applied:
                wi_pred = reg.predict(Xte)
                base["whatif_applied"] = applied

        order = list(test_idx)
        preds = []
        for j, i in enumerate(order):
            actual = float(y[i])
            predicted = float(pred[j])
            entry = {
                "name": names[i],
                "actual": _round(actual, target),
                "predicted": _round(predicted, target),
                "residual": _round(actual - predicted, target),
            }
            if wi_pred is not None:
                entry["whatif_predicted"] = _round(float(wi_pred[j]), target)
            preds.append(entry)

        base.update({"mode": "units", "model": model_name, "predictions": preds})
        return base

    # ── Mode 2: whole-set survey (k-fold out-of-sample) ─────────────────────
    n = len(names)
    rng = np.random.default_rng(0)
    perm = rng.permutation(n)
    folds = np.array_split(perm, min(N_FOLDS, n))
    oos = np.full(n, np.nan, dtype=float)
    model_name = _get_regressor_cls()[1]

    reg, model_name = _new_regressor()
    for fold in folds:
        if len(fold) == 0:
            continue
        test_mask = np.zeros(n, dtype=bool)
        test_mask[fold] = True
        if (~test_mask).sum() < MIN_TRAIN_ROWS:
            continue
        reg.fit(X[~test_mask], y[~test_mask])
        oos[fold] = reg.predict(X[test_mask])

    valid = ~np.isnan(oos)
    resid = y[valid] - oos[valid]
    ss_res = float((resid ** 2).sum())
    ss_tot = float(((y[valid] - y[valid].mean()) ** 2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    mae = float(np.abs(resid).mean()) if resid.size else 0.0

    rec = [
        {
            "name": names[i],
            "actual": _round(float(y[i]), target),
            "predicted": _round(float(oos[i]), target),
            "residual": _round(float(y[i] - oos[i]), target),
        }
        for i in range(n) if valid[i]
    ]
    above = sorted(rec, key=lambda d: d["residual"], reverse=True)[:top]
    below = sorted(rec, key=lambda d: d["residual"])[:top]

    base.update({
        "mode": "survey",
        "model": model_name,
        "n": int(valid.sum()),
        "accuracy": {"r2": round(r2, 3), "mae": _round(mae, target)},
        "most_above_prediction": above,   # actual >> predicted (higher than profile)
        "most_below_prediction": below,   # actual << predicted (lower than profile)
    })
    return base
