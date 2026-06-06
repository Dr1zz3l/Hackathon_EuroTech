"""
build_neighbourhoods.py — Agent A (Data & Model lane)
=====================================================
Offline pipeline that produces frontend/public/neighbourhoods.geojson from:

  1. Census STPU boundaries + demographics  — data/population/census_stpu.geojson
  2. Land-use raster (10 m BLU.tif)         — same file used by build_data.py
  3. District boundaries (for spatial join) — frontend/public/districts.geojson

Each of the 211 Small Tertiary Planning Units (STPUs) becomes a `District`-shaped
GeoJSON feature — identical fields, two extra optional ones:
  parent_district  : str   (which of the 18 districts contains it)
  tpu_code         : str   (raw stpug value, e.g. "111")

The reallocation engine runs a single flat QP over all 211 units.  The district
view is derived by aggregating neighbourhood deltas upward (see reallocation.ts
aggregateToDistricts).

Run with:
    uv run python build_neighbourhoods.py

Output: frontend/public/neighbourhoods.geojson   (target < ~3 MB after simplify)
"""

from __future__ import annotations

import json
import pathlib
from typing import Dict, List, Optional, Tuple

import numpy as np
import rasterio
from rasterio.mask import mask as rasterio_mask
from pyproj import Transformer
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform

# ─────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────

ROOT          = pathlib.Path(__file__).parent
RASTER_PATH   = ROOT / "data/raster_land_utilization/LUMHK_RasterGrid_2024/BLU.tif"
STPU_PATH     = ROOT / "data/population/census_stpu.geojson"
DISTRICT_PATH = ROOT / "frontend/public/districts.geojson"
OUTPUT_PATH   = ROOT / "frontend/public/neighbourhoods.geojson"

SIMPLIFY_TOL    = 1e-4   # degrees (≈11 m) — keeps the payload small for the web
_MIN_DEV_PIXELS = 500    # below this → use parent-district land as heuristic

CATEGORIES = ["residential", "industrial", "commercial", "green", "educational", "other"]

# ─────────────────────────────────────────────────────────────
# TC names for display (mirrors build_data.py)
# ─────────────────────────────────────────────────────────────

_TC_NAME: Dict[str, str] = {
    "Southern":          "南區",
    "Wan Chai":          "灣仔區",
    "Central & Western": "中西區",
    "Eastern":           "東區",
    "Islands":           "離島區",
    "Yau Tsim Mong":     "油尖旺區",
    "Kwun Tong":         "觀塘區",
    "Sham Shui Po":      "深水埗區",
    "Kowloon City":      "九龍城區",
    "Wong Tai Sin":      "黃大仙區",
    "Kwai Tsing":        "葵青區",
    "Tsuen Wan":         "荃灣區",
    "Tuen Mun":          "屯門區",
    "Sha Tin":           "沙田區",
    "Sai Kung":          "西貢區",
    "Yuen Long":         "元朗區",
    "Tai Po":            "大埔區",
    "North":             "北區",
}

# ─────────────────────────────────────────────────────────────
# Pixel value → land category (verbatim from build_data.py)
# ─────────────────────────────────────────────────────────────

_EXCLUDED = frozenset({
    0, -128,
    71, 72, 73, 74,   # protected natural: Woodland / Shrubland / Grassland / Mangrove
    41, 42, 43, 44,   # fixed transport: Roads / Railways / Airport / Port
    91,               # Reservoirs (protected water supply)
})


def _bucket(code: int) -> Optional[str]:
    """Map a BLU.tif pixel value to a land category, or None to exclude."""
    if code in _EXCLUDED:
        return None
    if code in (1, 2, 3):
        return "residential"
    if code == 11:
        return "commercial"
    if code in (21, 22, 23):
        return "industrial"
    if code == 31:
        return "educational"
    if code in (32, 61, 62):
        return "green"
    return "other"


# ─────────────────────────────────────────────────────────────
# Geometry helpers
# ─────────────────────────────────────────────────────────────

def _area_km2(geom_4326, tf_fwd) -> float:
    """Return the planar area of a WGS84 shapely geometry reprojected to EPSG:2326 (metres)."""
    geom_2326 = transform(tf_fwd, geom_4326)
    return geom_2326.area / 1e6


def _representative_point(geom) -> Point:
    """Return a point guaranteed to lie inside the polygon (shapely built-in)."""
    return geom.representative_point()


# ─────────────────────────────────────────────────────────────
# Raster zonal stats for one STPU polygon
# ─────────────────────────────────────────────────────────────

def _land_from_raster(geom_4326, tf_fwd, ds) -> Tuple[Optional[Dict[str, float]], str]:
    """
    Compute land-use fractions for one STPU polygon using the open rasterio dataset.

    Returns:
        (land_dict, source) where source is 'raster_2024' or 'low_pixels'.
        Returns (None, 'low_pixels') when the polygon is too small for reliable stats.
    """
    geom_2326 = transform(tf_fwd, geom_4326)

    try:
        out, _ = rasterio_mask(ds, [mapping(geom_2326)], crop=True, filled=True)
    except Exception:
        return None, "low_pixels"

    arr = out[0].astype(int)

    pixel_totals: Dict[str, int] = {}
    vals, counts = np.unique(arr, return_counts=True)
    for v, c in zip(vals.tolist(), counts.tolist()):
        bkt = _bucket(v)
        if bkt is not None:
            pixel_totals[bkt] = pixel_totals.get(bkt, 0) + c

    total_land = sum(pixel_totals.values())
    if total_land < _MIN_DEV_PIXELS:
        return None, "low_pixels"

    land = {cat: round(pixel_totals.get(cat, 0) / total_land, 4) for cat in CATEGORIES}

    # Renormalise to avoid floating-point drift
    s = sum(land.values())
    if s > 0 and abs(s - 1.0) > 1e-6:
        land = {k: round(v / s, 4) for k, v in land.items()}

    return land, "raster_2024"


# ─────────────────────────────────────────────────────────────
# Spatial join: STPU → parent district
# ─────────────────────────────────────────────────────────────

def _build_district_lookup(district_features: list) -> List[Tuple[str, object]]:
    """
    Return a list of (district_name, shapely_polygon) pairs.
    Buffered by 1 e-4° to absorb micro-gaps at district borders.
    """
    pairs = []
    for f in district_features:
        name = f["properties"]["name"]
        poly = shape(f["geometry"]).buffer(1e-4)
        pairs.append((name, poly))
    return pairs


def _find_parent(point: Point, district_polys: List[Tuple[str, object]]) -> str:
    """Return the district name whose polygon contains the given point.
    Falls back to nearest district if no polygon strictly contains it."""
    for name, poly in district_polys:
        if poly.contains(point):
            return name
    # Nearest fallback (covers boundary STPUs not fully contained after simplify)
    return min(district_polys, key=lambda x: x[1].distance(point))[0]


# ─────────────────────────────────────────────────────────────
# Demographics helpers
# ─────────────────────────────────────────────────────────────

def _int(v) -> int:
    try:
        return int(float(str(v).replace(",", "")))
    except (ValueError, TypeError):
        return 0


def _float(v) -> float:
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return 0.0


# ─────────────────────────────────────────────────────────────
# Main build
# ─────────────────────────────────────────────────────────────

def build() -> None:
    print("=" * 68)
    print("build_neighbourhoods.py — STPU neighbourhood pipeline")
    print("=" * 68)

    # 1. Load STPU census boundaries
    print(f"\n[1/5] Loading STPU boundaries from {STPU_PATH.name}...")
    stpu_data = json.loads(STPU_PATH.read_text())
    stpu_features = stpu_data["features"]
    print(f"      {len(stpu_features)} STPU features loaded ✓")

    # 2. Load district file for spatial join + fallback land fractions
    print(f"\n[2/5] Loading district boundaries + land fractions from {DISTRICT_PATH.name}...")
    district_data = json.loads(DISTRICT_PATH.read_text())
    district_features = district_data["features"]
    district_polys = _build_district_lookup(district_features)

    # Fallback land fractions keyed by district name
    fallback_land: Dict[str, Dict[str, float]] = {
        f["properties"]["name"]: dict(f["properties"]["land"])
        for f in district_features
    }
    print(f"      {len(district_features)} districts, {len(fallback_land)} with land data ✓")

    # 3. Coordinate transformers
    tf_fwd = Transformer.from_crs("EPSG:4326", "EPSG:2326", always_xy=True).transform

    # 4. Per-STPU raster zonal stats
    raster_ok = RASTER_PATH.exists()
    if raster_ok:
        print(f"\n[3/5] Computing per-STPU land-use from raster: {RASTER_PATH.name}")
        print(f"      Processing {len(stpu_features)} polygons (this takes ~1–2 min)...")
    else:
        print(f"\n[3/5] Raster not found — using parent-district fallback for all STPUs")

    # 5. Build output features
    print("\n[4/5] Assembling neighbourhood features...")
    header = (
        f"{'TPU':>5}  {'Parent district':24s}  "
        f"{'src':11s}  res    ind    com    grn    edu    oth"
    )
    print(f"  {header}")
    print("  " + "-" * len(header))

    features = []
    n_raster = 0
    n_fallback = 0
    n_no_parent = 0

    raster_ctx = rasterio.open(RASTER_PATH) if raster_ok else None

    try:
        for feat in stpu_features:
            props = feat["properties"]
            stpug = str(props.get("stpug", "")).strip()
            geom_4326 = shape(feat["geometry"])

            # --- Demographics ---
            pop       = _int(props.get("t_pop", 0))
            pct_65raw = _int(props.get("age_5", 0))  # pop aged 65+
            t_ma      = _float(props.get("t_ma", 0.0))

            pct_over65 = round(pct_65raw / pop * 100, 1) if pop > 0 else 0.0

            # --- Geometry area ---
            area_km2 = _area_km2(geom_4326, tf_fwd)
            density  = round(pop / area_km2, 0) if area_km2 > 0.001 else 0.0

            # --- Spatial join: find parent district ---
            centroid = _representative_point(geom_4326)
            parent = _find_parent(centroid, district_polys)
            if not parent:
                parent = "Unknown"
                n_no_parent += 1

            # --- Land use ---
            if raster_ctx is not None:
                land, source = _land_from_raster(geom_4326, tf_fwd, raster_ctx)
            else:
                land, source = None, "low_pixels"

            if land is None:
                # Use parent-district land as best available estimate
                land = dict(fallback_land.get(parent, {
                    "residential": 0.33, "industrial": 0.05, "commercial": 0.04,
                    "green": 0.22, "educational": 0.14, "other": 0.22,
                }))
                source = "estimated"
                n_fallback += 1
            else:
                n_raster += 1

            # --- Display names ---
            name    = f"{parent} · {stpug}"
            name_tc = f"{_TC_NAME.get(parent, parent)} · {stpug}"

            # --- Simplified geometry (smaller payload, still visually accurate) ---
            geom_simplified = geom_4326.simplify(SIMPLIFY_TOL, preserve_topology=True)

            out_props = {
                "name":             name,
                "name_tc":          name_tc,
                "pop":              pop,
                "pct_over65":       pct_over65,
                "median_age":       round(t_ma, 1),
                "density":          int(density),
                "area_km2":         round(area_km2, 4),
                "land":             land,
                "land_source":      source,
                "parent_district":  parent,
                "tpu_code":         stpug,
            }

            features.append({
                "type":       "Feature",
                "properties": out_props,
                "geometry":   mapping(geom_simplified),
            })

            print(
                f"  {stpug:>5}  {parent:24s}  "
                f"{source:11s}  "
                f"{land['residential']:.3f}  "
                f"{land['industrial']:.3f}  "
                f"{land['commercial']:.3f}  "
                f"{land['green']:.3f}  "
                f"{land['educational']:.3f}  "
                f"{land['other']:.3f}"
            )

    finally:
        if raster_ctx is not None:
            raster_ctx.close()

    # --- Write output ---
    print(f"\n[5/5] Writing output → {OUTPUT_PATH}")
    geojson_out = {"type": "FeatureCollection", "features": features}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(geojson_out, ensure_ascii=False, indent=2))

    # --- Summary ---
    size_mb = OUTPUT_PATH.stat().st_size / 1e6
    print(f"\n{'=' * 68}")
    print(f"  Features written : {len(features)}")
    print(f"  raster_2024      : {n_raster}")
    print(f"  estimated        : {n_fallback}")
    print(f"  No parent found  : {n_no_parent}")
    print(f"  File size        : {size_mb:.2f} MB")

    # --- Sanity checks ---
    print("\nRunning sanity checks...")
    assert len(features) == len(stpu_features), \
        f"Feature count mismatch: {len(features)} vs {len(stpu_features)}"

    codes = [f["properties"]["tpu_code"] for f in features]
    assert len(set(codes)) == len(codes), "Duplicate tpu_code values!"

    for f in features:
        n = f["properties"]["name"]
        land = f["properties"]["land"]
        assert set(land.keys()) == set(CATEGORIES), f"{n}: unexpected land keys"
        total = sum(land.values())
        assert abs(total - 1.0) < 0.02, f"{n}: land fractions sum to {total:.4f}"
        assert f["properties"]["parent_district"] != "Unknown", \
            f"{n}: parent district not resolved"

    parents_seen = set(f["properties"]["parent_district"] for f in features)
    pop_by_district: Dict[str, int] = {}
    for f in features:
        pd = f["properties"]["parent_district"]
        pop_by_district[pd] = pop_by_district.get(pd, 0) + f["properties"]["pop"]

    print("  Parent districts covered:", sorted(parents_seen))
    print("\n  Population totals by parent district (STPU sum vs district file):")
    for df in district_features:
        dn = df["properties"]["name"]
        stpu_total = pop_by_district.get(dn, 0)
        dist_total = df["properties"]["pop"]
        pct_diff = abs(stpu_total - dist_total) / max(dist_total, 1) * 100
        flag = "⚠" if pct_diff > 10 else "✓"
        print(f"    {flag} {dn:<24s}  STPU Σpop={stpu_total:>8,}  district={dist_total:>8,}"
              f"  diff={pct_diff:.1f}%")

    print("\nSanity checks passed ✓")
    print("=" * 68)


if __name__ == "__main__":
    build()
