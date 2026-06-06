"""
AHP (Analytic Hierarchy Process) weight derivation — Stage 1 of the scoring model.

Run once, offline.  Paste the printed output into frontend/src/scenarios.ts.

Usage:
    uv run python weights_ahp.py

Reference: MASTER_BUILD_DOC §5.1 — criteria order is always:
    [displacement, age, headroom, area]
"""

import numpy as np

# Random Consistency Index for n = 2..10 (Saaty 1980)
RI = {2: 0.00, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}

CRITERIA = ["displacement", "age", "headroom", "area"]


def ahp(matrix: np.ndarray, name: str) -> dict[str, float]:
    """
    Run AHP on a square pairwise-comparison matrix.
    Returns the weight vector as a dict {criterion: weight}.
    Prints a warning if CR >= 0.10.
    """
    n = matrix.shape[0]
    assert matrix.shape == (n, n), "Matrix must be square"

    # Enforce reciprocal structure from the upper triangle
    for i in range(n):
        for j in range(i + 1, n):
            matrix[j, i] = 1.0 / matrix[i, j]

    # Column-normalise, then average each row → weight vector
    col_sums = matrix.sum(axis=0)
    norm = matrix / col_sums
    w = norm.mean(axis=1)

    # Consistency check
    lambda_max = float(np.mean((matrix @ w) / w))
    ci = (lambda_max - n) / (n - 1)
    cr = ci / RI[n]

    status = "✓" if cr < 0.10 else "✗ ADJUST COMPARISONS"
    print(f"\n=== {name} ===")
    print(f"λ_max = {lambda_max:.4f}  CI = {ci:.4f}  CR = {cr:.4f}  {status}")

    weights = {CRITERIA[i]: round(float(w[i]), 4) for i in range(n)}
    # Format as a TypeScript-ready object literal
    ts_literal = "{ " + ", ".join(f"{k}: {v}" for k, v in weights.items()) + " }"
    print(f"weights: {ts_literal}")

    if cr >= 0.10:
        print("  → CR ≥ 0.10: revise the pairwise comparisons above before using these weights.")

    return weights


# ─────────────────────────────────────────────────────────────
# Pairwise comparison matrices
#
# Scale: 1 = equal, 3 = moderate, 5 = strong, 7 = very strong, 9 = extreme
# Upper triangle only — the script fills the lower triangle with reciprocals.
#
# Criteria order: [displacement, age, headroom, area]
#                      0          1       2       3
# ─────────────────────────────────────────────────────────────

def build_base() -> np.ndarray:
    """
    Base weights (balanced): headroom slightly most important,
    displacement and area roughly equal, age least.
    """
    A = np.ones((4, 4))
    # headroom > displacement (slightly)
    A[0, 2] = 1 / 2   # displacement vs headroom → headroom is 2×
    # headroom > area (slightly)
    A[2, 3] = 2        # headroom vs area → headroom is 2×
    # headroom > age (moderately)
    A[1, 2] = 1 / 3   # age vs headroom → headroom is 3×
    # displacement ≈ area
    A[0, 3] = 1
    # displacement > age (slightly)
    A[1, 0] = 1 / 2   # age vs displacement → displacement is 2×
    # area > age (slightly)
    A[1, 3] = 1 / 2   # age vs area → area is 2×
    return A


def build_industrial_growth() -> np.ndarray:
    """
    Industrial Growth: emphasise area (peripheral, large land banks)
    and displacement (low-density = less relocation burden).
    """
    A = np.ones((4, 4))
    # area > age (strongly)
    A[1, 3] = 1 / 5
    # displacement > age (strongly)
    A[1, 0] = 1 / 5
    # headroom > age (moderately)
    A[1, 2] = 1 / 3
    # area ≈ headroom
    A[2, 3] = 1
    # area > displacement (slightly) — large empty land matters most
    A[0, 3] = 1 / 2
    # displacement ≈ headroom
    A[0, 2] = 1
    return A


def build_green_hk_2050() -> np.ndarray:
    """
    Green HK 2050: emphasise headroom (convertible land that isn't already green)
    and area (maximise total green gain).
    """
    A = np.ones((4, 4))
    # headroom > displacement (moderately)
    A[0, 2] = 1 / 3
    # headroom > age (strongly)
    A[1, 2] = 1 / 5
    # headroom ≈ area
    A[2, 3] = 1
    # area > age (moderately)
    A[1, 3] = 1 / 3
    # area > displacement (slightly)
    A[0, 3] = 1 / 2
    # displacement > age (slightly)
    A[1, 0] = 1 / 2
    return A


def build_education_hub() -> np.ndarray:
    """
    Education Hub: headroom dominates (need convertible land that can host
    institutions; adjacency term adds cluster bonus at Stage 3).
    """
    A = np.ones((4, 4))
    # headroom > displacement (strongly)
    A[0, 2] = 1 / 5
    # headroom > age (very strongly)
    A[1, 2] = 1 / 7
    # headroom > area (moderately)
    A[2, 3] = 3
    # displacement > age (slightly)
    A[1, 0] = 1 / 2
    # displacement ≈ area
    A[0, 3] = 1
    # area > age (slightly)
    A[1, 3] = 1 / 2
    return A


def build_urban_renewal_4term() -> np.ndarray:
    """
    Urban Renewal (4-term fallback used when ageing_building_share is absent).
    Treats age as a stronger proxy for renewal need.
    """
    A = np.ones((4, 4))
    # age > displacement (moderately) — ageing population is the signal
    A[1, 0] = 3
    # headroom > area (slightly) — still need land to rebuild on
    A[2, 3] = 2
    # age > area (slightly)
    A[1, 3] = 2
    # age ≈ headroom
    A[1, 2] = 1
    # headroom > displacement (slightly)
    A[0, 2] = 1 / 2
    # displacement ≈ area
    A[0, 3] = 1
    return A


def urban_renewal_5term_fallback(base_weights: dict[str, float]) -> dict[str, float]:
    """
    When ageing_building_share IS available, add a renewal term at ~20% and
    renormalise so the total still sums to 1.  Simple and consistent.
    """
    renewal_share = 0.20
    scale = 1 - renewal_share
    w5 = {k: round(v * scale, 4) for k, v in base_weights.items()}
    w5["renewal"] = renewal_share
    ts = "{ " + ", ".join(f"{k}: {v}" for k, v in w5.items()) + " }"
    print(f"\n=== urban_renewal (5-term, with ageing_building_share) ===")
    print(f"weights: {ts}")
    print("  (renewal term added at 0.20; others scaled by 0.80 — no AHP needed for a single addend)")
    return w5


# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("AHP weight derivation — paste output into scenarios.ts")
    print("=" * 60)

    base   = ahp(build_base(),              "base (balanced fallback)")
    indust = ahp(build_industrial_growth(), "industrial_growth")
    green  = ahp(build_green_hk_2050(),    "green_hk_2050")
    edu    = ahp(build_education_hub(),     "education_hub")
    renew4 = ahp(build_urban_renewal_4term(), "urban_renewal (4-term, no ageing_building_share)")
    _      = urban_renewal_5term_fallback(renew4)

    print("\n" + "=" * 60)
    print("Done.  CR < 0.10 for all scenarios = weights are consistent.")
    print("=" * 60)
