"""
In-memory geodata access for the conversational assistant's data tools.

Loads the same GeoJSON files the frontend uses (districts + neighbourhoods)
once at import time, and exposes typed query / ranking helpers. The chat
endpoint calls these to answer factual questions accurately instead of letting
the model guess.

The only fields the model is allowed to claim about a district are the ones
returned here — see FIELD_DESCRIPTIONS, which is injected into the system
prompt so the assistant never hallucinates a metric that doesn't exist.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# Repo root = parents[2] of backend/llm/data.py  →  backend/ → repo/
_REPO_ROOT = Path(__file__).resolve().parents[2]
_PUBLIC = _REPO_ROOT / "frontend" / "public"

_DISTRICTS_PATH = _PUBLIC / "districts.geojson"
_NEIGHBOURHOODS_PATH = _PUBLIC / "neighbourhoods.geojson"


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def _load_features(path: Path) -> list[dict[str, Any]]:
    """Return the list of feature `properties` dicts from a GeoJSON file."""
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return [feat.get("properties", {}) for feat in data.get("features", [])]


# Loaded once at import. The files are committed and small (18 + 211 rows).
DISTRICTS: list[dict[str, Any]] = _load_features(_DISTRICTS_PATH)
NEIGHBOURHOODS: list[dict[str, Any]] = _load_features(_NEIGHBOURHOODS_PATH)

DISTRICT_NAMES: list[str] = [d["name"] for d in DISTRICTS if "name" in d]


def _norm(s: str) -> str:
    """Loose normalisation for name matching: lowercase, fold separators."""
    s = s.strip().lower().replace("&", "and").replace("-", " ").replace("·", " ")
    return re.sub(r"\s+", " ", s).strip()


# STPU neighbourhoods grouped by their parent district (for discovery + the prompt).
NEIGHBOURHOODS_BY_PARENT: dict[str, list[dict[str, Any]]] = {}
for _row in NEIGHBOURHOODS:
    NEIGHBOURHOODS_BY_PARENT.setdefault(_row.get("parent_district", "?"), []).append(_row)


# ---------------------------------------------------------------------------
# Field catalogue — drives the system prompt and metric validation
# ---------------------------------------------------------------------------

# Top-level numeric metrics available on every district.
SCALAR_METRICS = {
    "pop":                   "Total population (2021 Census)",
    "pct_over65":            "Percentage of residents aged 65 or older",
    "median_age":            "Median age of residents",
    "density":               "Population density (persons per km²)",
    "area_km2":              "District area in km²",
    "ageing_building_share": "Share of building stock considered ageing (0–1; proxy for redevelopment need)",
}

# Land-use fractions (0–1) nested under `land`. Addressable as e.g. "land.green".
LAND_METRICS = {
    "land.residential": "Fraction of land that is residential",
    "land.industrial":  "Fraction of land that is industrial",
    "land.commercial":  "Fraction of land that is commercial",
    "land.green":       "Fraction of land that is green / open space",
    "land.educational": "Fraction of land that is educational",
    "land.other":       "Fraction of land that is other (transport / water / barren)",
}

ALL_METRICS = {**SCALAR_METRICS, **LAND_METRICS}


def field_catalogue_text() -> str:
    """Human-readable list of valid metrics, for the system prompt."""
    lines = ["Scalar metrics:"]
    lines += [f"  - {k}: {v}" for k, v in SCALAR_METRICS.items()]
    lines += ["Land-use fractions (0–1):"]
    lines += [f"  - {k}: {v}" for k, v in LAND_METRICS.items()]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def _metric_value(row: dict[str, Any], metric: str) -> float | None:
    """Resolve a metric path ('density' or 'land.green') to a number."""
    if metric.startswith("land."):
        key = metric.split(".", 1)[1]
        land = row.get("land") or {}
        val = land.get(key)
    else:
        val = row.get(metric)
    if isinstance(val, (int, float)):
        return float(val)
    return None


def _rows_for(granularity: str) -> list[dict[str, Any]]:
    return NEIGHBOURHOODS if granularity == "neighbourhood" else DISTRICTS


def find_district(name: str, granularity: str = "district") -> dict[str, Any] | None:
    """Case/format-insensitive lookup by name within the chosen granularity."""
    target = _norm(name)
    rows = _rows_for(granularity)
    # Exact (normalised) match first.
    for row in rows:
        if _norm(row.get("name", "")) == target:
            return row
    # Fall back to substring match (handles "Tuen Mun district" etc.).
    for row in rows:
        rn = _norm(row.get("name", ""))
        if target and (target in rn or rn in target):
            return row
    return None


def query_district(name: str, granularity: str = "district") -> dict[str, Any]:
    """Return the full property record for one district / neighbourhood."""
    row = find_district(name, granularity)
    if row is None:
        return {
            "error": f"No {granularity} found matching '{name}'.",
            "available": DISTRICT_NAMES if granularity == "district" else None,
        }
    out = {
        "name":        row.get("name"),
        "name_tc":     row.get("name_tc"),
        "pop":         row.get("pop"),
        "pct_over65":  row.get("pct_over65"),
        "median_age":  row.get("median_age"),
        "density":     row.get("density"),
        "area_km2":    row.get("area_km2"),
        "land":        row.get("land"),
        "land_source": row.get("land_source"),
    }
    if "ageing_building_share" in row:
        out["ageing_building_share"] = row["ageing_building_share"]
    if "parent_district" in row:
        out["parent_district"] = row["parent_district"]
    return out


def rank_districts(
    metric: str,
    order: str = "desc",
    limit: int = 5,
    granularity: str = "district",
    parent_district: str | None = None,
) -> dict[str, Any]:
    """
    Sort districts / neighbourhoods by a metric and return the top `limit`.

    `order` is 'desc' (largest first) or 'asc' (smallest first).
    When granularity='neighbourhood', an optional `parent_district` restricts
    the ranking to STPU units inside that one district.
    """
    if metric not in ALL_METRICS:
        return {
            "error": f"Unknown metric '{metric}'.",
            "valid_metrics": list(ALL_METRICS.keys()),
        }

    rows = _rows_for(granularity)

    parent_label = None
    if granularity == "neighbourhood" and parent_district:
        match = find_district(parent_district, "district")
        parent_label = match["name"] if match else parent_district
        target = _norm(parent_label)
        rows = [r for r in rows if _norm(r.get("parent_district", "")) == target]
        if not rows:
            return {
                "error": f"No neighbourhoods found for district '{parent_district}'.",
                "available_districts": DISTRICT_NAMES,
            }

    scored: list[tuple[str, float]] = []
    for row in rows:
        val = _metric_value(row, metric)
        if val is not None:
            scored.append((row.get("name", "?"), val))

    reverse = order != "asc"
    scored.sort(key=lambda t: t[1], reverse=reverse)

    limit = max(1, min(int(limit or 5), len(scored)))
    ranked = [
        {"rank": i + 1, "name": name, "value": round(val, 4)}
        for i, (name, val) in enumerate(scored[:limit])
    ]
    out: dict[str, Any] = {
        "metric": metric,
        "metric_description": ALL_METRICS[metric],
        "order": "ascending" if order == "asc" else "descending",
        "granularity": granularity,
        "results": ranked,
        "total_units": len(scored),
    }
    if parent_label:
        out["parent_district"] = parent_label
    return out


def list_neighbourhoods(parent_district: str) -> dict[str, Any]:
    """
    List the STPU neighbourhood units within one district, with key stats.
    Lets the assistant discover the (coded) neighbourhood names before
    querying or highlighting them.
    """
    match = find_district(parent_district, "district")
    label = match["name"] if match else parent_district
    rows = NEIGHBOURHOODS_BY_PARENT.get(label)
    if not rows:
        # Fall back to a normalised scan (handles '&'/'-' variants).
        target = _norm(parent_district)
        rows = [r for r in NEIGHBOURHOODS if _norm(r.get("parent_district", "")) == target]
    if not rows:
        return {
            "error": f"No neighbourhoods found for district '{parent_district}'.",
            "available_districts": DISTRICT_NAMES,
        }
    units = [
        {
            "name":       r.get("name"),
            "tpu_code":   r.get("tpu_code"),
            "pop":        r.get("pop"),
            "density":    r.get("density"),
            "median_age": r.get("median_age"),
            "pct_over65": r.get("pct_over65"),
            "area_km2":   r.get("area_km2"),
        }
        for r in rows
    ]
    return {
        "parent_district": label,
        "count": len(units),
        "neighbourhoods": units,
    }
