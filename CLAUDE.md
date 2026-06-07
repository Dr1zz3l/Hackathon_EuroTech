# CLAUDE.md

## Project Overview

**EuroTech × HKTE Hackathon, Munich — Smart City track**

An interactive map of Hong Kong's 18 administrative districts that takes a city-planning goal (e.g. "+20% green space by 2050") and ranks which districts can meet it with the most spare capacity and the least displacement — with transparent, explainable reasons for every recommendation.

> Full specification: `docs/MASTER_BUILD_DOC.md` — read it before writing any code.

---

## Architecture in one line

**No backend on the critical path.** The scoring model is a weighted sum over 18 rows. It runs client-side in TypeScript. One precomputed GeoJSON file (`frontend/public/districts.geojson`) is the only data dependency. The FastAPI backend is optional and never blocking — it powers the AI assistant, forecast, and NL goal parsing.

```
frontend/public/districts.geojson        (18 districts, raster_2024, committed)
frontend/public/neighbourhoods.geojson   (211 STPU neighbourhoods, committed)
frontend/public/adjacency.json           (18-node border graph, committed)
        │
        ▼
frontend/src/lib/scoring.ts         (WLC engine, client-side)
frontend/src/lib/reallocation.ts    (QP optimizer over 211 STPUs → 18 districts)
        │
        ▼
React + Leaflet map + panels        (choropleth, scenario buttons, detail drawer, planner)
        │
        ▼  (optional — never on the critical path)
backend/llm/app.py                  (FastAPI: /api/chat, /api/explain, /api/parse-goal,
                                     /api/summarize-plan, /api/forecast, /api/health)
```

---

## Two-agent build — file ownership

The repo is built in parallel by **two Claude Code agents**. The core rule: **never edit a file outside your lane.**

| Path | Owner | Notes |
|------|-------|-------|
| `frontend/src/types.ts` | **SHARED** | The contract. Change only by agreement — read it before writing any code. |
| `frontend/public/districts.geojson` | **Agent A** | 18 districts, raster_2024, ageing_building_share on all |
| `frontend/public/neighbourhoods.geojson` | **Agent A** | 211 STPU neighbourhoods |
| `frontend/public/adjacency.json` | **Agent A** | 18-node border-adjacency graph |
| `build_data.py` | **Agent A** | Raster pipeline + census merge → districts.geojson |
| `build_neighbourhoods.py` | **Agent A** | Raster pipeline → neighbourhoods.geojson |
| `weights_ahp.py` | **Agent A** | AHP weight derivation (run offline, paste output into scenarios.ts) |
| `scripts/` | **Agent A** | build_adjacency.py, gen_districts_geojson.py |
| `frontend/src/lib/scoring.ts` | **Agent A** | Pure TS, no React — B only imports `createScorer` |
| `frontend/src/lib/reallocation.ts` | **Agent A** | QP optimizer — B only imports `createAllocator` |
| `frontend/src/scenarios.ts` | **Agent A** | Scenario configs + AHP-derived weights |
| `backend/llm/` | **Agent A** | FastAPI LLM/forecast backend — B calls `/api/*` only |
| `frontend/src/components/Map*.tsx` | **Agent B** | Leaflet map |
| `frontend/src/components/ScenarioPanel.tsx` | **Agent B** | Scenario buttons |
| `frontend/src/components/DetailPanel.tsx` | **Agent B** | District detail drawer |
| `frontend/src/components/ForecastPanel.tsx` | **Agent B** | Forecast tab |
| `frontend/src/components/ChatPanel.tsx` | **Agent B** | AI assistant panel |
| `frontend/src/components/AssistantPanel.tsx` | **Agent B** | Assistant container |
| `frontend/src/i18n/*.json` | **Agent B** | EN + Traditional Chinese strings |
| `frontend/src/App.tsx` | **Agent B (sole integrator)** | All wiring lives here — Agent A never edits this |
| `frontend/next.config.ts`, styling, deploy | **Agent B** | |
| `docs/` | Either | |

**If you are Agent A:** you own the data, model, and scoring logic. Do not touch `App.tsx`, components, or i18n files.

**If you are Agent B:** you own everything the user sees. Import `createScorer` and all types from Agent A's files — treat them as fixed. Do not edit `scoring.ts`, `scenarios.ts`, `build_data.py`, or `weights_ahp.py`.

---

## Data

### Districts GeoJSON schema (`frontend/public/districts.geojson`)

Each of the 18 features carries these properties — this is the `District` type in `types.ts`:

```json
{
  "name": "Tuen Mun",
  "name_tc": "屯門",
  "pop": 506879,
  "pct_over65": 19.3,
  "median_age": 46.1,
  "density": 5908,
  "area_km2": 85.8,
  "land": {
    "residential":    0.30,
    "industrial":     0.10,
    "commercial":     0.08,
    "agricultural":   0.03,
    "recreational":   0.18,
    "institutional":  0.05,
    "misc":           0.04,
    "infrastructure": 0.12,
    "protected":      0.10
  },
  "land_source": "raster_2024",
  "ageing_building_share": 0.42
}
```

**Land categories — 9 total:**
- **Reallocatable (6):** `residential`, `industrial`, `commercial`, `agricultural`, `recreational`, `institutional` — these are scenario targets and donor pools.
- **Frozen (3):** `misc` (cemeteries/utilities/vacant), `infrastructure` (roads/rail/airport), `protected` (woodland/shrubland/wetland/reservoirs) — visible in the UI, never touched by the reallocation engine.

All 18 districts carry `"land_source": "raster_2024"` and `ageing_building_share` (both are present and real — the estimated fallback and optional-stretch paths were never triggered).

### Real data sources

| Data | Source |
|------|--------|
| District boundaries | HK Home Affairs Dept, 18-polygon GeoJSON |
| Demographics (65+, median age, density) | 2021 Census `DC_21C.xlsx` (values hardcoded in `build_data.py:46-65`) |
| Land-use raster | Planning Dept LUMHK 2024 10m GeoTIFF (`data/raster_land_utilization/`) |
| Building-age records | Buildings Dept CSV (`data/buildings/building_age.csv`) |
| STPU neighbourhood boundaries | 2021 Census STPU GeoJSON files under `data/` |

Hard-coded fallback census values are in `docs/MASTER_BUILD_DOC.md` Appendix A. The raster pipeline has run successfully — all 18 districts and 211 neighbourhoods carry `land_source: "raster_2024"`.

---

## Scoring model

Implemented in `frontend/src/lib/scoring.ts`. Read the source before touching anything.

```
viability(district, scenario) =
    w_displacement × (1 − norm(log₁₀ density))
  + w_age          × norm(pct_over65)
  + w_headroom     × norm(residential_frac) × (1 − land[target])
  + w_area         × norm(area_km2)
  + w_renewal      × norm(ageing_building_share)   [urban_renewal only]
  + w_adjacency    × norm(neighbour-avg land[target])  [all scenarios, optional]
```

- **Weights are AHP-derived** (run `weights_ahp.py` to regenerate; all CR < 0.07).
- The headroom `× (1 − land[target])` factor is critical — without it, a district already 50% recreational scores high as a green candidate. Do not remove it.
- Normalisation is min-max across all 18 districts, except density which uses `log₁₀` first.
- The `renewal` term is active when `ageing_building_share` is present on all districts (it is, for all 18).
- The `adjacency` term is active when `adjacency.json` is loaded (it is, in `App.tsx`). If the file is absent, scoring degrades gracefully.

---

## Scenarios

Four pre-defined scenarios in `frontend/src/scenarios.ts`:

| id | `target` (LandCategory) | Emphasis | `goal_delta` |
|----|--------|---------|---|
| `green_hk_2050` | `recreational` | headroom + area + adjacency | +20% city-wide green |
| `industrial_growth` | `industrial` | area + headroom | +15% city-wide industrial |
| `education_hub` | `institutional` | headroom dominant + adjacency | +10% city-wide institutional |
| `urban_renewal` | `residential` | age + renewal signal | — (no reallocation) |

A scenario is `{ id, target, weights, label_key, description_key, horizon_year, goal_delta?, cluster_strength?, donor_weights? }`. Switching scenarios triggers a map recolour and (when `goal_delta` is set) a reallocation run in the planner tab.

---

## Language support

EN + Traditional Chinese (not Simplified). Keys in `frontend/src/i18n/en.json` and `yue.json`.

---

## What's built (current state)

All core and stretch goals are complete:

- 18-district choropleth map — real `raster_2024` land-use GeoJSON
- WLC viability engine (AHP weights + adjacency) — runs internally, drives reallocation district weighting (Stage 0 + 1 + 3); score not shown as UI panel
- All 4 scenarios, each with AHP-derived weights + adjacency term (Stage 3)
- Land reallocation QP planner over 211 STPU neighbourhoods (beyond original scope)
- District detail panel: land donut, demographics, future donut + trade list
- Forecast tab (TabPFN structural estimate)
- AI assistant: streaming chat, NL goal parsing, score explanations, Reddit social tool
- EN / Traditional-Chinese toggle (135/135 keys)

Not built: TOPSIS second-opinion toggle (Stage 4), district-vs-district comparison, historical forecast time series.

---

## Demo script

1. Open app → HK map, 18 districts coloured by dominant land use
2. Tap **"Industrial Growth"** → reallocation runs, future land projections update
3. Tap a district (e.g. Tuen Mun) → detail panel: land mix, demographics, future donut + trade list
4. Switch language → everything flips to Traditional Chinese
5. Tap **"Green HK 2050"** → different districts gain green-space allocation

---

## Important constraints

- **Always show `land_source`** in the UI. Never hide whether data is real or estimated.
- **Do not call viability scores "official"** — they are an illustrative decision-support model, not a planning assessment.
- **No backend on the critical path.** The scoring and reallocation run in the browser. Do not block UI work on a server. All `/api/*` calls must degrade gracefully when the backend is not running.
- **The WLC model does the ranking — not the LLM.** The AI assistant explains, summarises, and parses goals, but never scores or ranks districts.
