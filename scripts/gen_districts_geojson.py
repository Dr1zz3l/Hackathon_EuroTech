"""
gen_districts_geojson.py
========================
AGENT B helper — generates frontend/public/districts.geojson for the UI stub.

This is a ONE-SHOT generator that Agent A should OVERWRITE with real raster-derived
land-use values via build_data.py once their pipeline is ready.

Until then, land.* uses the §3.3 heuristic (character prior + density nudge),
every feature carries  "land_source": "estimated".

Run:  python3 scripts/gen_districts_geojson.py
Output: frontend/public/districts.geojson
"""

import json, math, pathlib

# ---------------------------------------------------------------------------
# Appendix A — 2021 Census hard-coded fallback
# ---------------------------------------------------------------------------
CENSUS = {
    # name_en (stripped): (pop, pct_over65, median_age, density)
    "Central & Western":  (235_953, 19.3, 44.8, 18_808),
    "Wan Chai":           (166_695, 21.2, 46.0, 15_791),
    "Eastern":            (529_603, 23.4, 49.0, 29_440),
    "Southern":           (263_278, 21.6, 48.1,  6_779),
    "Yau Tsim Mong":      (310_647, 17.9, 44.0, 44_458),
    "Sham Shui Po":       (431_090, 20.4, 46.2, 46_067),
    "Kowloon City":       (410_634, 20.1, 45.4, 40_994),
    "Wong Tai Sin":       (406_802, 23.0, 50.1, 43_730),
    "Kwun Tong":          (673_166, 21.9, 48.0, 59_704),
    "Kwai Tsing":         (495_798, 22.1, 48.0, 21_246),
    "Tsuen Wan":          (320_094, 18.1, 45.4,  5_168),
    "Tuen Mun":           (506_879, 19.3, 46.1,  5_908),
    "Yuen Long":          (668_080, 15.0, 43.7,  4_825),
    "North":              (309_631, 17.9, 46.3,  2_269),
    "Tai Po":             (316_470, 18.5, 45.7,  2_325),
    "Sha Tin":            (692_806, 20.0, 46.2, 10_082),
    "Sai Kung":           (489_037, 15.8, 44.7,  3_771),
    "Islands":            (185_282, 14.7, 42.7,  1_021),
}

# ---------------------------------------------------------------------------
# §3.3 heuristic land-use character priors
# (residential, industrial, commercial, green, educational, other)
# ---------------------------------------------------------------------------
PRIOR = {
    # HK Island — dense urban, some green on the south
    "Central & Western": (0.30, 0.04, 0.28, 0.20, 0.08, 0.10),
    "Wan Chai":          (0.30, 0.04, 0.30, 0.15, 0.10, 0.11),
    "Eastern":           (0.38, 0.06, 0.18, 0.18, 0.10, 0.10),
    "Southern":          (0.20, 0.02, 0.08, 0.50, 0.05, 0.15),
    # Kowloon — very dense, limited green
    "Yau Tsim Mong":     (0.28, 0.06, 0.35, 0.08, 0.08, 0.15),
    "Sham Shui Po":      (0.35, 0.12, 0.20, 0.10, 0.08, 0.15),
    "Kowloon City":      (0.34, 0.06, 0.20, 0.14, 0.12, 0.14),
    "Wong Tai Sin":      (0.40, 0.06, 0.14, 0.14, 0.10, 0.16),
    "Kwun Tong":         (0.28, 0.22, 0.18, 0.10, 0.08, 0.14),
    # New Territories west — industrial + residential mix
    "Kwai Tsing":        (0.28, 0.28, 0.12, 0.14, 0.06, 0.12),
    "Tsuen Wan":         (0.26, 0.20, 0.10, 0.28, 0.06, 0.10),
    "Tuen Mun":          (0.30, 0.12, 0.08, 0.34, 0.06, 0.10),
    "Yuen Long":         (0.26, 0.14, 0.08, 0.38, 0.06, 0.08),
    # New Territories north/east — green-heavy
    "North":             (0.16, 0.06, 0.05, 0.58, 0.04, 0.11),
    "Tai Po":            (0.18, 0.06, 0.06, 0.56, 0.05, 0.09),
    "Sha Tin":           (0.30, 0.10, 0.12, 0.30, 0.08, 0.10),
    "Sai Kung":          (0.10, 0.02, 0.03, 0.72, 0.03, 0.10),
    "Islands":           (0.08, 0.02, 0.04, 0.76, 0.02, 0.08),
}

# ---------------------------------------------------------------------------
# Normalise a NAME_EN value from the boundary file → CENSUS key
# ---------------------------------------------------------------------------
_NAME_MAP = {
    # boundary NAME_EN              → CENSUS key
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

# Traditional Chinese display names (short form, matching Census convention)
_TC_NAME = {
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


def density_nudge(priors, density):
    """
    Very-high-density districts lean slightly more residential+commercial
    and slightly less green, to stay consistent with visible density data.
    Returns normalised tuple (residential, industrial, commercial, green, educational, other).
    """
    r, i, c, g, e, o = priors
    if density > 30_000:
        # very dense → more residential, less green
        delta = min(0.08, (density - 30_000) / 200_000)
        r = r + delta * 0.5
        c = c + delta * 0.3
        g = max(0.03, g - delta * 0.6)
        o = max(0.05, o - delta * 0.2)
    elif density < 3_000:
        # sparse → more green
        delta = min(0.10, (3_000 - density) / 30_000)
        g = min(0.85, g + delta)
        r = max(0.05, r - delta * 0.5)
        i = max(0.01, i - delta * 0.3)
    total = r + i + c + g + e + o
    return (r/total, i/total, c/total, g/total, e/total, o/total)


def build_features():
    src = pathlib.Path("data/districts/district_boundaries.geojson")
    raw = json.loads(src.read_text())
    features = []
    for feat in raw["features"]:
        p = feat["properties"]
        raw_name = p["NAME_EN"].strip()
        census_key = _NAME_MAP.get(raw_name)
        if census_key is None:
            raise ValueError(f"Unknown NAME_EN in boundary file: {raw_name!r}")

        pop, pct_over65, median_age, density = CENSUS[census_key]
        area_km2 = round(pop / density, 2)

        prior = PRIOR[census_key]
        r, i, c, g, e, o = density_nudge(prior, density)

        props = {
            "name":       census_key,
            "name_tc":    _TC_NAME[census_key],
            "pop":        pop,
            "pct_over65": pct_over65,
            "median_age": median_age,
            "density":    density,
            "area_km2":   area_km2,
            "land": {
                "residential": round(r, 4),
                "industrial":  round(i, 4),
                "commercial":  round(c, 4),
                "green":       round(g, 4),
                "educational": round(e, 4),
                "other":       round(o, 4),
            },
            "land_source": "estimated",
        }
        features.append({
            "type":       "Feature",
            "properties": props,
            "geometry":   feat["geometry"],
        })

    return features


def main():
    features = build_features()
    out = {
        "type":     "FeatureCollection",
        "features": features,
    }
    dest = pathlib.Path("frontend/public/districts.geojson")
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"Written {len(features)} features to {dest}")
    # Quick sanity checks
    names = [f["properties"]["name"] for f in features]
    assert len(names) == 18, f"Expected 18 districts, got {len(names)}"
    for f in features:
        land = f["properties"]["land"]
        total = sum(land.values())
        assert abs(total - 1.0) < 1e-3, f"{f['properties']['name']}: land fractions sum to {total:.4f}"
    print("Sanity checks passed ✓")


if __name__ == "__main__":
    main()
