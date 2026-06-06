# City Health Management — MVP Plan

## Concept

Pool city data (land use breakdown, population demographics) across Hong Kong's 18 administrative districts. Allow users to set planning goals (e.g. "20% more industrial capacity by 2050") and surface which districts are the best candidates for gradual land use transformation — based on population age, density, current land mix, and area size.

This is not a "one district = one function" model. Every district has a **percentage breakdown** across all land use categories. The system recommends which districts could most viably *shift* some of their land use toward a target category.

---

## Land Use Categories

1. Residential
2. Industrial
3. Commercial / Retail
4. Green Space / Recreation
5. Educational / Institutional

---

## Architecture

```
Frontend (React/Leaflet)
  ├── ZoneLayer       →  GET  /api/zones     →  choropleth of 18 districts
  ├── ScenarioPanel   →  POST /api/plan      →  ranked recommendations
  └── ZoneDetailPanel (tap a district → land use breakdown + demographics + score)

Backend (FastAPI)
  ├── GET  /health
  ├── GET  /api/zones       → hk_districts.geojson with attributes
  ├── GET  /api/scenarios   → list of pre-defined scenarios
  └── POST /api/plan        → { scenario_id } → ranked district recommendations

Data
  └── data/zones/hk_districts.geojson  (pre-built by prepare_zones.py)
```

---

## Data Per District

Each of the 18 district GeoJSON features carries:

```json
{
  "district": "Yau Tsim Mong",
  "district_tc": "油尖旺",
  "land_use": {
    "residential":  0.30,
    "industrial":   0.05,
    "commercial":   0.50,
    "green":        0.08,
    "educational":  0.07
  },
  "demographics": {
    "median_age":          44,
    "pct_over60":          0.28,
    "pop_density_per_km2": 43000,
    "total_pop":           310000,
    "area_km2":            7.1
  },
  "geometry": { "..." }
}
```

### Target data sources (get as much real data as possible)

| Data | Source | Notes |
|------|--------|-------|
| District boundaries (GeoJSON) | OSM / GADM / HK Gov | 18 polygons |
| Land use breakdown | OpenStreetMap (Overpass API) | Spatial join land use polygons → districts |
| Population & age | HK 2021 Population Census | District-level tables at census2021.gov.hk |
| Population density | HK 2021 Census | Derived from pop / area |
| Building types | `data/buildings/buildings.geojson` (already downloaded) | 342k buildings with `BuildingBlockType` |

If real land use data is hard to obtain quickly, fall back to OSM land use tags aggregated per district, clearly labelled as "estimated from OpenStreetMap."

---

## Backend — New Files

```
backend/
└── api/
    ├── __init__.py
    ├── main.py        FastAPI app, CORS, mounts /api routes
    ├── zones.py       Load & cache hk_districts.geojson at startup
    ├── scorer.py      Viability scoring algorithm
    └── scenarios.py   Pre-defined scenario configs
```

Launch: `uv run uvicorn backend.api.main:app --reload --port 8000`

### Scoring algorithm

```
viability_score(district, target_category) =
  0.30 × age_score(pct_over60)          # older pop → less disruption
+ 0.25 × density_score(pop_density)     # lower density → easier to relocate
+ 0.25 × land_score(current_use)        # % residential easiest to convert
+ 0.20 × area_score(area_km2)           # larger district → more aggregate impact
```

Reason generation (top 3 per district, keyed for EN/TC i18n):
- `reason.old_population` — "High proportion of residents over 60 (X%)"
- `reason.low_density` — "Relatively low population density (X/km²)"
- `reason.large_area` — "Large district area (X km²) maximises impact"
- `reason.dominant_residential` — "Currently X% residential — lower disruption to convert"

---

## Pre-defined Scenarios (Demo)

| id | Name | Target | Goal |
|----|------|--------|------|
| `green_hk_2050` | Green HK 2050 | green | +20% green space, sourced from low-density residential |
| `industrial_growth` | Industrial Growth | industrial | +15% industrial, prioritise peripheral low-density districts |
| `education_hub` | Education Hub | educational | +10% educational capacity, near existing institutional clusters |
| `urban_renewal` | Urban Renewal | residential | Replace ageing low-density residential with modern high-density |

---

## Frontend — New & Modified Files

### New components

| File | Role |
|------|------|
| `ZoneLayer.tsx` | Leaflet GeoJSON layer — choropleth by dominant use or viability score |
| `ScenarioPanel.tsx` | 4 scenario buttons; on click → POST /api/plan → re-colour map |
| `ZoneDetailPanel.tsx` | Slide-up drawer: land use donut, demographics, recommendation score + reasons |
| `api/client.ts` | Fetch wrapper for /api/zones, /api/scenarios, /api/plan |

### Modified files

- `App.tsx` — integrate new components; add `VITE_API_URL` env var
- `i18n/en.json` + `yue.json` — add keys for categories, scenarios, detail panel, reason templates

---

## Demo Script

1. Open app → HK map, 18 districts coloured by dominant land use
2. Tap **"Industrial Growth"** → districts re-colour by viability score (warm = high)
3. Tap e.g. **Tuen Mun** → detail panel: "42% residential, median age 47, large area, near container port — score 0.74"
4. Switch language → all text flips to Traditional Chinese
5. Tap **"Green HK 2050"** → different districts highlight (dense older urban areas with low green %)
6. Compare two districts via the detail panel

---

## Build Order

1. `data/zones/prepare_zones.py` — download + merge district boundaries, land use, census → `hk_districts.geojson`
2. `backend/api/` — FastAPI skeleton, zones endpoint, scenarios endpoint
3. `backend/api/scorer.py` — scoring + reason generation
4. `frontend/src/components/ZoneLayer.tsx` — choropleth on the existing Leaflet map
5. `frontend/src/components/ScenarioPanel.tsx` — scenario buttons wired to API
6. `frontend/src/components/ZoneDetailPanel.tsx` — district detail drawer
7. i18n strings for all new content
8. Integration + demo data validation
9. Polish & demo rehearsal

---

## Important Caveats (for demo honesty)

- Land use figures are estimates derived from OpenStreetMap and census data, not official planning records.
- Viability scores are illustrative — they use simplified demographic proxies, not full urban planning assessments.
- This is a prototype concept tool, not a policy recommendation system.
