# HK District Viability Map

**EuroTech × HKTE Hackathon, Munich — Smart City track**

An interactive map of Hong Kong's 18 administrative districts that takes a city-planning goal (e.g. "+20% green space by 2050") and ranks which districts can meet it with the most spare capacity and the least displacement — with transparent, explainable reasons for every recommendation.

---

## What it does

- **Choropleth map** — all 18 districts coloured by land-use mix or demographic metric, powered by real HK Planning Dept raster data (LUMHK 2024, 10 m resolution).
- **Scenario engine** — pick one of four AHP-weighted planning scenarios (Green HK 2050, Industrial Growth, Education Hub, Urban Renewal) or type a natural-language goal and let the AI assistant parse it into a scenario.
- **WLC viability engine** — AHP-derived weighted-sum scores (displacement, headroom, area, ageing stock, adjacency) drive the reallocation planner's district weighting. Weights are transparent and scenario-specific.
- **Land reallocation planner** — a genuine bounded quadratic programme (KKT + bisection) distributes a planning target across 211 sub-district neighbourhoods, then aggregates back to districts. Shows what each district donates and what it receives.
- **Forecast** — compound-growth projection (Low / Expected / High) driven by **measured 2011–2021 census CAGRs** for all 18 districts and 189 neighbourhoods. Future `median_age` / `pct_over65` indicators are predicted by TabPFN trained on the full **2011/2016/2021 temporal panel** (600+ rows, `year` as a feature) — a learned time-trend, not a cross-sectional proxy. Planning recommendations cover housing supply, ageing, open space, and school demand.
- **AI assistant** — streaming Claude chat with tools: goal parsing, score explanations, plan summaries, social-listening sentiment from Reddit, and cross-sectional demographic prediction.
- **EN / Traditional Chinese** — full bilingual UI, 135/135 key parity.

**Demo flow:** open the map → select *Industrial Growth* → tap Tuen Mun → see land mix, demographics + future land donut / trade list → switch to 廣東話 → type "more green space by 2050" in the assistant.

---

## Architecture

```
frontend/public/districts.geojson   (precomputed, raster_2024, committed)
frontend/public/neighbourhoods.geojson
        │
        ▼
frontend/src/lib/scoring.ts         (WLC engine, client-side TypeScript)
frontend/src/lib/reallocation.ts    (QP optimizer, client-side TypeScript)
        │
        ▼
React + Leaflet map + panels        (choropleth, scenario buttons, detail drawer)
        │
        ▼  (optional — never on the critical path)
backend/llm/app.py                  (FastAPI: /api/chat, /api/explain, /api/forecast, …)
```

The map, scoring, and reallocation **run entirely in the browser**. The FastAPI backend is optional — it unlocks the AI assistant, NL goal parsing, score-explanation prose, and the forecast tab. If it is not running, those features degrade gracefully; the map and scoring remain fully functional.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, Leaflet 1.9, Tailwind CSS 3, Recharts |
| Backend | FastAPI, Uvicorn, Anthropic SDK (`claude-haiku-4-5` / `claude-sonnet-4-6`) |
| ML | PriorLabs TabPFN v2 (cross-sectional prediction + forecast signals) |
| Data pipeline | rasterio, shapely, pyproj, fiona (offline, output committed) |
| Runtime | Python 3.13 via `uv` |

---

## Quick start

### 1 — Frontend (core app, no backend required)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

The map loads from the committed `frontend/public/` GeoJSON files and runs the full scoring + reallocation logic client-side.

### 2 — Backend (optional — enables AI assistant, forecast, and NL goal parsing)

```bash
# One-time: copy and fill in the env file
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (required for any LLM feature)

# Install Python dependencies
uv sync

# Start the backend
uv run uvicorn backend.llm.app:app --reload --port 8000
```

The frontend dev server proxies `/api/*` → `localhost:8000` automatically (see `frontend/next.config.ts`).

### Environment variables

| Variable | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Required** for LLM features | Claude API key |
| `TABPFN_TOKEN` | Optional | Enables real TabPFN v2; falls back to a labelled kNN baseline without it |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Optional | Enables OAuth Reddit access; falls back to public (no-auth) endpoints |

See `.env.example` for setup instructions.

---

## Scoring model

```
viability(district, scenario) =
    w_displacement × (1 − norm(log₁₀ density))
  + w_age          × norm(pct_over65)
  + w_headroom     × norm(residential_frac) × (1 − land[target])
  + w_area         × norm(area_km2)
  + w_renewal      × norm(ageing_building_share)          [urban_renewal only]
  + w_adjacency    × norm(neighbour-avg land[target])     [all scenarios]
```

Weights are AHP-derived (`weights_ahp.py`; all consistency ratios CR < 0.07). Normalisation is min-max across all 18 districts; density uses log₁₀ first. The `(1 − land[target])` headroom factor prevents districts already saturated with the target land use from scoring artificially high. The adjacency term uses the 18-node border graph (`frontend/public/adjacency.json`) to reward districts near land-rich neighbours.

### Scenarios

| ID | Target | Emphasis |
|---|---|---|
| `green_hk_2050` | Recreational / green | Headroom + area |
| `industrial_growth` | Industrial | Area + low displacement |
| `education_hub` | Educational / institutional | Headroom dominant |
| `urban_renewal` | Residential | Age proxy for renewal need |

Full model specification: [`docs/MASTER_BUILD_DOC.md`](docs/MASTER_BUILD_DOC.md)

---

## Data

All data is real and locally precomputed — no live API calls for the map itself.

| Source | Used for |
|---|---|
| HK Planning Dept LUMHK 2024 (10 m GeoTIFF) | Land-use fractions for all 18 districts + 211 STPU neighbourhoods |
| HK 2021 Census (DC_21C) | Population, %65+, median age, density |
| HK Census 2011 & 2016 STPU GeoJSONs | Historical population + demographics for measured CAGRs and TabPFN temporal panel |
| HK Buildings Dept records | Ageing-building share (urban-renewal scoring term) |

The GeoJSON files in `frontend/public/` are precomputed and committed — you do not need to rerun the pipeline to use the app. To regenerate from raw data:

```bash
# 1. Download all raw source datasets (skips files that already exist)
uv run python main.py

# 2. Run the build pipeline
uv run python build_data.py               # 18 districts → districts.geojson
uv run python build_neighbourhoods.py     # 211 STPUs → neighbourhoods.geojson
uv run python build_population_history.py # population_history.csv + census_panel.json
uv run python weights_ahp.py              # AHP weight derivation
```

---

## Project structure

```
frontend/
  public/               # districts.geojson, neighbourhoods.geojson, adjacency.json
  src/
    lib/                # scoring.ts, reallocation.ts, forecast.ts (client-side engines)
    components/         # MapView, ScenarioPanel, DetailPanel, ForecastPanel, ChatPanel …
    scenarios.ts        # AHP-derived scenario configs
    types.ts            # shared TypeScript types (District, Scenario, …)
    i18n/               # en.json, yue.json

backend/llm/
  app.py                # FastAPI app + /api/* endpoints
  chat.py               # streaming assistant (multi-turn, tool use)
  predict.py            # TabPFN / kNN cross-sectional regressor
  forecast.py           # compound-growth projection + temporal TabPFN panel
  history.py            # measured CAGR loader (population_history.csv)
  panel.py              # temporal census panel loader (census_panel.json)
  social.py             # Reddit social-listening (24 h cache)

data/population/
  census_stpu.geojson         # 2021 STPU census (211 units)
  census_stpu_2016.geojson    # 2016 STPU census (214 units)
  census_stpu_2011.geojson    # 2011 STPU census (209 units)
  population_history.csv      # long-format CAGR input (generated)
  census_panel.json           # TabPFN temporal training panel (generated)

build_data.py                 # raster pipeline → districts.geojson
build_neighbourhoods.py       # raster pipeline → neighbourhoods.geojson
build_population_history.py   # census series → population_history.csv + census_panel.json
weights_ahp.py                # AHP weight derivation (run offline)
```

---

## Status

The app runs **locally** and is **not yet hosted**. A public deployment is the next step — this file will be updated once it is live.

See [`HONESTY.md`](HONESTY.md) for the full hackathon disclosure (what is real, what is mocked, known limitations).

---

## Docs

- [`docs/MASTER_BUILD_DOC.md`](docs/MASTER_BUILD_DOC.md) — full specification and architecture
- [`HONESTY.md`](HONESTY.md) — hackathon disclosure
- [`CLAUDE.md`](CLAUDE.md) — agent build instructions and file ownership

---

## Team

Timo Weiss · Frans Hietaranta · Till Laube · Vincent Fiedler
