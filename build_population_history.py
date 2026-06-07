"""
build_population_history.py — Build population time-series + census panel for TabPFN
======================================================================================
Extracts demographics from the three STPU census GeoJSONs (2011, 2016, 2021) and
writes two output files:

  1. data/population/population_history.csv  (long format: name, year, pop)
     Consumed by backend/llm/history.py for the measured-trend CAGR path.

  2. data/population/census_panel.json  (JSON: district + neighbourhood rows with year)
     Consumed by backend/llm/panel.py so TabPFN can train on the full temporal panel
     (54 district rows + ~590 STPU rows) rather than the 2021-only cross-section.

For each granularity:
  • District  — totals aggregated from all STPUs via spatial join; area/land taken
                from the committed districts.geojson (2021 snapshot, held constant).
  • STPU      — rows for the 211 canonical tpu_codes in neighbourhoods.geojson; land
                held at the 2024 raster snapshot; area reused from 2021 feature
                (census boundary is stable enough year-to-year for this purpose).
                Units absent from a census year get no panel row for that year.

Assumptions labelled in the panel:
  • Land-use fractions are the 2024 raster snapshot — no historical edition exists.
  • District median_age is a population-weighted mean of STPU medians (monotone proxy).

Run with:
    uv run python build_population_history.py

Outputs:
    data/population/population_history.csv
    data/population/census_panel.json
"""

from __future__ import annotations

import csv
import json
import pathlib
from collections import defaultdict

from shapely.geometry import shape

# Reuse spatial-join helpers from build_neighbourhoods (no side effects at import;
# build() there is guarded by __main__).
from build_neighbourhoods import (
    _build_district_lookup,
    _find_parent,
    _float,
    _int,
    _representative_point,
)

ROOT = pathlib.Path(__file__).parent
DISTRICT_PATH = ROOT / "frontend" / "public" / "districts.geojson"
NEIGHBOURHOODS_PATH = ROOT / "frontend" / "public" / "neighbourhoods.geojson"
CSV_OUTPUT_PATH = ROOT / "data" / "population" / "population_history.csv"
PANEL_OUTPUT_PATH = ROOT / "data" / "population" / "census_panel.json"

# (year, path) ordered newest → oldest so 2021 spatial join is the reference.
CENSUS_YEARS: list[tuple[int, pathlib.Path]] = [
    (2021, ROOT / "data" / "population" / "census_stpu.geojson"),
    (2016, ROOT / "data" / "population" / "census_stpu_2016.geojson"),
    (2011, ROOT / "data" / "population" / "census_stpu_2011.geojson"),
]


def _load_features(path: pathlib.Path) -> list[dict]:
    return json.loads(path.read_text())["features"]


def build() -> None:
    print("=" * 68)
    print("build_population_history.py — population time-series + panel builder")
    print("=" * 68)

    # 1. Load district boundaries + metadata for spatial join and panel rows.
    print(f"\n[1/5] Loading district data from {DISTRICT_PATH.name}...")
    if not DISTRICT_PATH.exists():
        raise FileNotFoundError(DISTRICT_PATH)
    district_features = _load_features(DISTRICT_PATH)
    district_polys = _build_district_lookup(district_features)

    # Properties needed for district panel rows (fixed across years).
    district_meta: dict[str, dict] = {}
    for f in district_features:
        p = f["properties"]
        district_meta[p["name"]] = {
            "area_km2": float(p.get("area_km2") or 0.0),
            "land":     dict(p.get("land") or {}),
        }
    print(f"      {len(district_features)} districts ✓")

    # 2. Load canonical neighbourhoods — code → name + land mapping.
    print(f"\n[2/5] Loading canonical neighbourhood data from {NEIGHBOURHOODS_PATH.name}...")
    if not NEIGHBOURHOODS_PATH.exists():
        raise FileNotFoundError(NEIGHBOURHOODS_PATH)
    nbhd_features = _load_features(NEIGHBOURHOODS_PATH)

    code_to_name: dict[str, str] = {}
    code_to_land: dict[str, dict] = {}
    code_to_area: dict[str, float] = {}  # 2021 area, reused for all years

    for f in nbhd_features:
        p = f["properties"]
        code = p.get("tpu_code")
        if code and "name" in p:
            code_to_name[code] = p["name"]
            code_to_land[code] = dict(p.get("land") or {})
            code_to_area[code] = float(p.get("area_km2") or 0.0)

    canonical_codes = set(code_to_name)
    print(f"      {len(canonical_codes)} canonical STPU codes ✓")

    # 3. Process each census year.
    # --- CSV accumulators ---
    # district_totals[year][district_name] = total population
    district_totals: dict[int, dict[str, int]] = {}
    # stpu_csv_series[stpug][year] = population
    stpu_csv_series: dict[str, dict[int, int]] = defaultdict(dict)

    # --- Panel accumulators ---
    # panel_stpu[year] = list of row dicts
    panel_stpu: dict[int, list[dict]] = {}
    # panel_dist_accum[year][district_name] = {pop, age5, wt_ma (Σ pop*t_ma), n}
    panel_dist_accum: dict[int, dict[str, dict]] = {}

    print("\n[3/5] Processing census years...")
    for year, path in CENSUS_YEARS:
        if not path.exists():
            print(f"  ⚠  {path.name} not found — skipping {year}.")
            continue
        print(f"\n  {year}  ({path.name})")
        features = _load_features(path)
        print(f"       {len(features)} STPU features loaded")

        year_csv_totals: dict[str, int] = defaultdict(int)
        year_dist_accum: dict[str, dict] = defaultdict(
            lambda: {"pop": 0, "age5": 0, "wt_ma": 0.0}
        )
        year_stpu_rows: list[dict] = []
        n_ok = n_skip = 0

        for feat in features:
            props = feat["properties"]
            stpug = str(props.get("stpug", "")).strip()
            pop   = _int(props.get("t_pop", 0))
            age5  = _int(props.get("age_5", 0))
            t_ma  = _float(props.get("t_ma", 0.0))

            if not stpug or pop <= 0:
                n_skip += 1
                continue

            # Spatial join → parent district.
            geom = shape(feat["geometry"])
            pt   = _representative_point(geom)
            parent = _find_parent(pt, district_polys)

            # ── CSV path ──────────────────────────────────────────────────────
            year_csv_totals[parent] += pop
            if stpug in canonical_codes:
                stpu_csv_series[stpug][year] = pop

            # ── Panel path ────────────────────────────────────────────────────
            # District accumulation (all STPUs, even non-canonical codes).
            acc = year_dist_accum[parent]
            acc["pop"]   += pop
            acc["age5"]  += age5
            acc["wt_ma"] += t_ma * pop   # pop-weighted sum for median_age proxy

            # STPU panel rows — only canonical codes (those with 2021 land data).
            if stpug in canonical_codes:
                area = code_to_area.get(stpug, 0.0) or 1.0
                pct_over65 = round(age5 / pop * 100, 1) if pop > 0 else 0.0
                year_stpu_rows.append({
                    "name":        code_to_name[stpug],
                    "tpu_code":    stpug,
                    "year":        year,
                    "pop":         pop,
                    "pct_over65":  pct_over65,
                    "median_age":  round(t_ma, 1),
                    "area_km2":    round(area, 4),
                    "density":     round(pop / area, 1),
                    "land":        code_to_land.get(stpug, {}),
                    "parent_district": parent,
                    "land_source": "raster_2024 (held constant across years)",
                })

            n_ok += 1

        district_totals[year]    = dict(year_csv_totals)
        panel_stpu[year]         = year_stpu_rows
        panel_dist_accum[year]   = {k: dict(v) for k, v in year_dist_accum.items()}

        print(f"       {n_ok} processed, {n_skip} skipped (zero/missing pop)")
        print(f"       {len(year_dist_accum)} district totals, "
              f"{len(year_stpu_rows)} canonical STPU panel rows")

    # 4. Write CSV.
    print(f"\n[4/5] Writing {CSV_OUTPUT_PATH}...")
    CSV_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    csv_rows: list[tuple[str, int, int]] = []

    for year in sorted(district_totals):
        for name in sorted(district_totals[year]):
            csv_rows.append((name, year, district_totals[year][name]))

    for stpug in sorted(stpu_csv_series, key=lambda c: (len(c), c)):
        name = code_to_name[stpug]
        for year in sorted(stpu_csv_series[stpug]):
            csv_rows.append((name, year, stpu_csv_series[stpug][year]))

    with CSV_OUTPUT_PATH.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["name", "year", "pop"])
        writer.writerows(csv_rows)

    dist_csv  = sum(len(v) for v in district_totals.values())
    stpu_csv  = sum(len(v) for v in stpu_csv_series.values())
    stpu_all3 = sum(1 for v in stpu_csv_series.values() if len(v) == 3)
    stpu_part = sum(1 for v in stpu_csv_series.values() if 0 < len(v) < 3)
    print(f"       {dist_csv} district rows, {stpu_csv} STPU rows "
          f"({stpu_all3} all-3-year, {stpu_part} partial)")
    print(f"       Total: {len(csv_rows)} + 1 header ✓")

    # 5. Build and write census panel JSON.
    print(f"\n[5/5] Building and writing {PANEL_OUTPUT_PATH}...")

    # Assemble district panel rows.
    panel_district_rows: list[dict] = []
    for year in sorted(panel_dist_accum):
        for dist_name in sorted(panel_dist_accum[year]):
            acc   = panel_dist_accum[year][dist_name]
            pop   = acc["pop"]
            age5  = acc["age5"]
            wt_ma = acc["wt_ma"]
            meta  = district_meta.get(dist_name, {})
            area  = meta.get("area_km2", 0.0) or 1.0
            panel_district_rows.append({
                "name":        dist_name,
                "year":        year,
                "pop":         pop,
                "pct_over65":  round(age5 / pop * 100, 1) if pop > 0 else 0.0,
                "median_age":  round(wt_ma / pop, 1) if pop > 0 else 0.0,
                "area_km2":    round(area, 4),
                "density":     round(pop / area, 1),
                "land":        meta.get("land", {}),
                "land_source": "raster_2024 (held constant across years)",
            })

    # Assemble STPU panel rows (flatten year→rows dict).
    panel_neighbourhood_rows: list[dict] = []
    for year in sorted(panel_stpu):
        panel_neighbourhood_rows.extend(panel_stpu[year])
    # Sort by name then year for readability.
    panel_neighbourhood_rows.sort(key=lambda r: (r["name"], r["year"]))

    panel = {
        "note": (
            "Temporal census panel: 2011, 2016, 2021 census snapshots stacked with "
            "`year` as a feature. Land-use fractions are the 2024 raster snapshot "
            "(no historical edition exists). District median_age is a population-weighted "
            "mean of STPU medians (monotone proxy, not a true district median)."
        ),
        "district":      panel_district_rows,
        "neighbourhood": panel_neighbourhood_rows,
    }

    with PANEL_OUTPUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(panel, fh, ensure_ascii=False, separators=(",", ":"))

    print(f"       {len(panel_district_rows)} district rows "
          f"({len(panel_dist_accum)} years × 18 districts)")
    print(f"       {len(panel_neighbourhood_rows)} neighbourhood rows")
    print(f"\n✓  Written: {CSV_OUTPUT_PATH}")
    print(f"✓  Written: {PANEL_OUTPUT_PATH}\n")


if __name__ == "__main__":
    build()
