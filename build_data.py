"""
build_data.py — Agent A (Data & Model lane)
============================================
Offline pipeline that produces frontend/public/districts.geojson from real sources:

  1. Land-use fractions  — Planning Dept 10m LUMHK raster (EPSG:2326, int8, BLU.tif)
  2. Demographics        — 2021 Census hard-coded (Appendix A) + real boundary geometries
  3. Ageing-building     — Buildings Dept "Building information and age records" CSV

Run with:
    uv run python build_data.py

Output: frontend/public/districts.geojson
Land-use source label: "raster_2024" (falls back to "estimated" if raster file is absent).
"""

from __future__ import annotations

import csv
import json
import pathlib
from typing import Dict, Tuple

import numpy as np
import rasterio
from rasterio.mask import mask as rasterio_mask
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform

# ─────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────

ROOT = pathlib.Path(__file__).parent
RASTER_PATH   = ROOT / "data/raster_land_utilization/LUMHK_RasterGrid_2024/BLU.tif"
BOUNDARY_PATH = ROOT / "data/districts/district_boundaries.geojson"
BUILDING_AGE  = ROOT / "data/buildings/building_age.csv"
OUTPUT_PATH   = ROOT / "frontend/public/districts.geojson"

# ─────────────────────────────────────────────────────────────
# 2021 Census — Appendix A hard-coded fallback (real values)
# (pop, pct_over65, median_age, density)
# ─────────────────────────────────────────────────────────────

CENSUS: Dict[str, Tuple[int, float, float, int]] = {
    "Central & Western": (235_953, 19.3, 44.8, 18_808),
    "Wan Chai":          (166_695, 21.2, 46.0, 15_791),
    "Eastern":           (529_603, 23.4, 49.0, 29_440),
    "Southern":          (263_278, 21.6, 48.1,  6_779),
    "Yau Tsim Mong":     (310_647, 17.9, 44.0, 44_458),
    "Sham Shui Po":      (431_090, 20.4, 46.2, 46_067),
    "Kowloon City":      (410_634, 20.1, 45.4, 40_994),
    "Wong Tai Sin":      (406_802, 23.0, 50.1, 43_730),
    "Kwun Tong":         (673_166, 21.9, 48.0, 59_704),
    "Kwai Tsing":        (495_798, 22.1, 48.0, 21_246),
    "Tsuen Wan":         (320_094, 18.1, 45.4,  5_168),
    "Tuen Mun":          (506_879, 19.3, 46.1,  5_908),
    "Yuen Long":         (668_080, 15.0, 43.7,  4_825),
    "North":             (309_631, 17.9, 46.3,  2_269),
    "Tai Po":            (316_470, 18.5, 45.7,  2_325),
    "Sha Tin":           (692_806, 20.0, 46.2, 10_082),
    "Sai Kung":          (489_037, 15.8, 44.7,  3_771),
    "Islands":           (185_282, 14.7, 42.7,  1_021),
}

# Boundary file NAME_EN → CENSUS key
_NAME_MAP: Dict[str, str] = {
    "Southern District":            "Southern",
    "Wan Chai District":            "Wan Chai",
    "Central and Western District": "Central & Western",
    "Eastern District":             "Eastern",
    "Islands District":             "Islands",
    "Yau Tsim Mong District":       "Yau Tsim Mong",
    "Kwun Tong District":           "Kwun Tong",
    "Sham Shui Po District":        "Sham Shui Po",
    "Kowloon City District":        "Kowloon City",
    "Wong Tai Sin District":        "Wong Tai Sin",
    "Kwai Tsing District":          "Kwai Tsing",
    "Tsuen Wan District":           "Tsuen Wan",
    "Tuen Mun District":            "Tuen Mun",
    "Sha Tin District":             "Sha Tin",
    "Sai Kung District":            "Sai Kung",
    "Yuen Long District":           "Yuen Long",
    "Tai Po District":              "Tai Po",
    "North District":               "North",
}

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
# Raster pixel value → land bucket
#
# BLU.tif encoding (int8):
#   tens-digit = Class, ones-digit = Sub-category (matches luhk2024_en.csv order)
#
# Denominator = ALL land except ocean and badland.
# Fractions therefore represent share of all land incl. protected/infrastructure.
#
# Ignored entirely (return None — no denominator contribution):
#   0 / -128 : sea / nodata
#   81       : Badland (geologically unstable, not usable or visible)
#
# Categories:
#   Reallocatable: residential, industrial, commercial, agricultural,
#                  recreational, institutional
#   Frozen (visible in pie, never reallocated):
#     misc           — cemeteries, utilities, vacant, other built-up
#     infrastructure — roads, railways, airport, port
#     protected      — woodland, shrubland, grassland, wetland, reservoirs
# ─────────────────────────────────────────────────────────────

# Pixel codes excluded entirely (not counted in any denominator)
_EXCLUDED = frozenset({
    0, -128,   # sea / nodata
    81,        # Badland — geologically unstable, ignored everywhere
})

# Minimum total (non-ocean) pixels for a district — below this fall back to heuristic
_MIN_DEV_PIXELS = 500

# All 9 land categories: 6 reallocatable + 3 frozen
CATEGORIES = [
    "residential", "industrial", "commercial",
    "agricultural", "recreational", "institutional",
    "misc", "infrastructure", "protected",
]

def _bucket(code: int) -> str | None:
    """Return the land category bucket for a BLU raster pixel value, or None to exclude.

    None only for sea/nodata (0, -128) and badland (81).
    All other codes map to one of the 9 land categories.
    """
    if code in _EXCLUDED:
        return None
    if code in (1, 2, 3):
        return "residential"    # Private / Public / Rural Settlement
    if code == 11:
        return "commercial"     # Commercial/Business & Office
    if code in (21, 22, 23):
        return "industrial"     # Industrial Land / Estates / Warehouse & Open Storage
    if code == 31:
        return "institutional"  # Government/Institution/Community (GIC)
    if code in (32, 83, 92):
        return "recreational"   # Open Space & Recreation / Rocky Shore / Streams
    if code in (61, 62):
        return "agricultural"   # Agricultural Land / Fish Ponds & Gei Wais
    if code in (51, 52, 53, 54):
        return "misc"           # Cemeteries / Utilities / Vacant & Construction / Other built-up
    if code in (41, 42, 43, 44):
        return "infrastructure" # Roads & Transport / Railways / Airport / Port Facilities
    if code in (71, 72, 73, 74, 91):
        return "protected"      # Woodland / Shrubland / Grassland / Wetland / Reservoirs
    # Fallback (should not occur with known LUMHK codes)
    return "misc"


# ─────────────────────────────────────────────────────────────
# §3.3 Heuristic fallback (used only if raster file absent or pixel count too low)
#
# Territory-wide average fractions from raster_2024 zonal stats.
# Used for any district that falls below _MIN_DEV_PIXELS — all 18 districts
# are fully covered by the raster, so this path is only a safety net.
#
# Keys: all 9 categories (6 reallocatable + 3 frozen).
# Density nudge adjusts the reallocatable residential/green fractions only;
# frozen categories (infrastructure, protected, misc) are kept as territory average.
# ─────────────────────────────────────────────────────────────

# Territory-wide average 9-key fractions (safety-net fallback)
_TERRITORY_AVG: Dict[str, float] = {
    "residential":    0.09,
    "industrial":     0.03,
    "commercial":     0.01,
    "agricultural":   0.05,
    "recreational":   0.08,
    "institutional":  0.07,
    "misc":           0.04,
    "infrastructure": 0.13,
    "protected":      0.50,
}


def _density_nudge(priors: Dict[str, float], density: int) -> Dict[str, float]:
    """Nudge residential/recreational fractions based on density and renormalise."""
    p = dict(priors)
    if density > 30_000:
        delta = min(0.08, (density - 30_000) / 200_000)
        p["residential"]  = p["residential"]  + delta * 0.5
        p["commercial"]   = p["commercial"]   + delta * 0.3
        p["recreational"] = max(0.01, p["recreational"] - delta * 0.6)
        p["misc"]         = max(0.02, p["misc"]         - delta * 0.2)
    elif density < 3_000:
        delta = min(0.10, (3_000 - density) / 30_000)
        p["protected"]    = min(0.85, p["protected"]    + delta)
        p["residential"]  = max(0.02, p["residential"]  - delta * 0.5)
        p["industrial"]   = max(0.01, p["industrial"]   - delta * 0.3)
    total = sum(p.values())
    return {k: v / total for k, v in p.items()}


def land_from_heuristic() -> Dict[str, dict]:
    """§3.3 fallback: returns {census_key: land_dict} with land_source='estimated'."""
    result: Dict[str, dict] = {}
    for key, (_, _, _, density) in CENSUS.items():
        nudged = _density_nudge(_TERRITORY_AVG, density)
        result[key] = {k: round(v, 4) for k, v in nudged.items()}
        result[key]["_source"] = "estimated"
    return result


# ─────────────────────────────────────────────────────────────
# Real raster pipeline
# ─────────────────────────────────────────────────────────────

def land_from_raster(boundary_features: list) -> Dict[str, dict]:
    """
    Compute per-district land-use fractions from the LUMHK 2024 raster.
    Reprojects each district polygon from WGS84 → EPSG:2326 (HK Grid) before masking.
    Returns {census_key: land_dict} with _source='raster_2024'.

    Denominator = all non-ignored pixels (everything except ocean + badland).
    Fractions therefore include frozen categories (protected, infrastructure, misc).
    """
    tf = Transformer.from_crs("EPSG:4326", "EPSG:2326", always_xy=True).transform
    result: Dict[str, dict] = {}

    with rasterio.open(RASTER_PATH) as ds:
        for feat in boundary_features:
            raw_name = feat["properties"]["NAME_EN"].strip()
            census_key = _NAME_MAP[raw_name]

            # Reproject geometry WGS84 → EPSG:2326
            geom_4326 = shape(feat["geometry"])
            geom_2326 = transform(tf, geom_4326)

            # Zonal stats: mask raster to district polygon
            out, _ = rasterio_mask(ds, [mapping(geom_2326)], crop=True, filled=True)
            arr = out[0].astype(int)

            # Tally pixel counts by bucket (exclude sea/nodata/badland)
            pixel_totals: Dict[str, int] = {}
            vals, counts = np.unique(arr, return_counts=True)
            for v, c in zip(vals.tolist(), counts.tolist()):
                bkt = _bucket(v)
                if bkt is not None:
                    pixel_totals[bkt] = pixel_totals.get(bkt, 0) + c

            total_land = sum(pixel_totals.values())
            if total_land < _MIN_DEV_PIXELS:
                if total_land > 0:
                    print(f"  WARNING: {census_key} — only {total_land} land pixels (< {_MIN_DEV_PIXELS}), using heuristic")
                else:
                    print(f"  WARNING: {census_key} — zero land pixels, using heuristic")
                # Fallback to territory-average heuristic for this district
                nudged = _density_nudge(_TERRITORY_AVG, CENSUS[census_key][3])
                result[census_key] = {k: round(v, 4) for k, v in nudged.items()}
                result[census_key]["_source"] = "estimated"
            else:
                land = {cat: round(pixel_totals.get(cat, 0) / total_land, 4) for cat in CATEGORIES}
                # Renormalise to guarantee sum = 1.0 exactly (floating-point rounding)
                s = sum(land.values())
                if s > 0 and abs(s - 1.0) > 1e-6:
                    land = {k: round(v / s, 4) for k, v in land.items()}
                land["_source"] = "raster_2024"
                result[census_key] = land

    return result


# ─────────────────────────────────────────────────────────────
# Building-age: ageing_building_share
# ─────────────────────────────────────────────────────────────

AGEING_CUTOFF_YEAR = 1985   # buildings completed before this year are considered "ageing"


def ageing_shares() -> Dict[str, float]:
    """
    Parse building_age.csv; return {census_key: share_pre_cutoff}.
    'Ageing' = occupied before AGEING_CUTOFF_YEAR (i.e. ≥40 years old in 2025).
    District name in SEARCH1_E already matches CENSUS keys (with & / spacing adjustments below).
    """
    totals: Dict[str, int] = {}
    old: Dict[str, int] = {}

    # building_age.csv uses "Central & Western", which matches our keys directly
    with open(BUILDING_AGE, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            district = row.get("SEARCH1_E", "").strip()
            if not district or district == "Out Of District":
                continue
            date_str = row.get("NSEARCH3_E", "").strip()
            year_str = date_str[:4]
            if not (len(year_str) == 4 and year_str.isdigit()):
                continue
            year = int(year_str)
            totals[district] = totals.get(district, 0) + 1
            if year < AGEING_CUTOFF_YEAR:
                old[district] = old.get(district, 0) + 1

    return {
        k: round(old.get(k, 0) / totals[k], 3)
        for k in CENSUS
        if totals.get(k, 0) > 0
    }


# ─────────────────────────────────────────────────────────────
# Main build
# ─────────────────────────────────────────────────────────────

def build() -> None:
    print("=" * 60)
    print("build_data.py — Agent A real-data pipeline")
    print("=" * 60)

    # 1. Load boundary file (provides WGS84 geometry + NAME_EN)
    print("\n[1/4] Loading district boundaries...")
    raw = json.loads(BOUNDARY_PATH.read_text())
    boundary_features = raw["features"]
    assert len(boundary_features) == 18, f"Expected 18 boundary features, got {len(boundary_features)}"
    print(f"      {len(boundary_features)} features loaded ✓")

    # 2. Land-use fractions
    if RASTER_PATH.exists():
        print(f"\n[2/4] Computing land-use fractions from raster: {RASTER_PATH.name}")
        land_map = land_from_raster(boundary_features)
        print("      Raster zonal stats complete ✓")
    else:
        print(f"\n[2/4] Raster not found — using §3.3 heuristic fallback")
        land_map = land_from_heuristic()

    # 3. Ageing building shares
    if BUILDING_AGE.exists():
        print(f"\n[3/4] Computing ageing_building_share (pre-{AGEING_CUTOFF_YEAR})...")
        shares = ageing_shares()
        print(f"      {len(shares)} districts covered ✓")
    else:
        print(f"\n[3/4] building_age.csv not found — ageing_building_share omitted")
        shares = {}

    # 4. Assemble GeoJSON features
    print("\n[4/4] Assembling features...")
    header = (
        f"{'District':28s}  {'source':11s}  "
        f"res    ind    com    agr    rec    ins    mis    inf    prt    age_share"
    )
    print(f"  {header}")
    print("  " + "-" * len(header))

    features = []
    for feat in boundary_features:
        raw_name = feat["properties"]["NAME_EN"].strip()
        census_key = _NAME_MAP[raw_name]
        pop, pct_over65, median_age, density = CENSUS[census_key]

        land_data = land_map[census_key]
        source = land_data["_source"]
        land = {k: land_data[k] for k in CATEGORIES}

        props: dict = {
            "name":       census_key,
            "name_tc":    _TC_NAME[census_key],
            "pop":        pop,
            "pct_over65": pct_over65,
            "median_age": median_age,
            "density":    density,
            "area_km2":   round(pop / density, 2),
            "land":       land,
            "land_source": source,
        }
        if census_key in shares:
            props["ageing_building_share"] = shares[census_key]

        share_str = f"{shares[census_key]:.3f}" if census_key in shares else "  n/a"
        print(f"  {census_key:28s}  {source:11s}  "
              f"{land['residential']:.3f}  {land['industrial']:.3f}  {land['commercial']:.3f}  "
              f"{land['agricultural']:.3f}  {land['recreational']:.3f}  {land['institutional']:.3f}  "
              f"{land['misc']:.3f}  {land['infrastructure']:.3f}  {land['protected']:.3f}  {share_str}")

        features.append({
            "type":       "Feature",
            "properties": props,
            "geometry":   feat["geometry"],   # WGS84 — Leaflet ready
        })

    # Write output
    geojson = {"type": "FeatureCollection", "features": features}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False, indent=2))
    print(f"\nWritten → {OUTPUT_PATH}")

    # Sanity checks
    print("\nRunning sanity checks...")
    names = [f["properties"]["name"] for f in features]
    assert len(names) == 18, f"Expected 18 districts, got {len(names)}"

    _EXPECTED_LAND_KEYS = set(CATEGORIES)
    for f in features:
        n = f["properties"]["name"]
        land = f["properties"]["land"]
        assert set(land.keys()) == _EXPECTED_LAND_KEYS, \
            f"{n}: unexpected land keys {set(land.keys())} (expected {_EXPECTED_LAND_KEYS})"
        total = sum(land.values())
        assert abs(total - 1.0) < 1e-2, f"{n}: land fractions sum to {total:.4f}"

    sources = [f["properties"]["land_source"] for f in features]
    n_real = sources.count("raster_2024")
    n_est  = sources.count("estimated")
    print(f"  raster_2024: {n_real}/18   estimated: {n_est}/18")

    age_present = [f for f in features if "ageing_building_share" in f["properties"]]
    print(f"  ageing_building_share: {len(age_present)}/18 districts")

    print("\nSanity checks passed ✓")
    print("=" * 60)


if __name__ == "__main__":
    build()
