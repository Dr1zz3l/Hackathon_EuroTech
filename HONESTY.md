# HONESTY.md

> Mandatory disclosure for the hackathon. This file lives at the root of your repository. Judges cross-check it against your code and your technical video.
>
> **The deal:** disclosed shortcuts are **not** penalized — that is the entire point of this file. Hidden ones are. Undisclosed pre-built code is heavily penalized, each undisclosed mock carries a small penalty, and a faked demo is heavily penalized. Telling the truth here costs you nothing.

---

## 1. Team — who did what
Judges compare this against `git shortlog -sn`, so keep it honest.

| Member | GitHub handle | Main contributions |
|---|---|---|
| Timo Weiss | `Dr1zz3l` | Lead integration: Leaflet map & React components, `App.tsx` wiring, i18n, scoring & reallocation libs, LLM backend (39 commits) |
| Frans Hietaranta | `hietarf` | Documentation — README, CLAUDE.md, pitch video guide (11 commits) |
| Till Laube | `till-laube` | LLM/data backend, scoring lib, Python packaging (9 commits) |
| Vincent Fiedler | `viincece` | Frontend components & app shell, LLM backend, project config (6 commits) |

---

## 2. What is fully working
Features that run end-to-end on the live app, with real data and real logic.

- **18-district choropleth map** — loads real `raster_2024` land-use GeoJSON (`frontend/public/districts.geojson`) and colours all 18 districts by dominant land use (current or projected allocation).
- **WLC viability engine** (`frontend/src/lib/scoring.ts`) — input: District + Scenario; output: score and per-term breakdown. Real weighted-sum math, min-max normalised across all 18 districts; log₁₀ density transform for displacement. The score is consumed internally by the reallocation planner as a district weighting, not shown as a per-district UI panel.
- **4 AHP-derived scenarios** (`frontend/src/scenarios.ts`) — weights derived from real AHP pairwise matrices in `weights_ahp.py` (all consistency ratios CR < 0.07). Switching scenarios re-scores and recolours the map live.
- **Land reallocation / planner** (`frontend/src/lib/reallocation.ts`) — genuine bounded quadratic program solved via closed-form KKT + bisection on the dual variable ν, run over 211 STPU neighbourhoods and aggregated to 18 districts. Conservation of land fractions is asserted in dev.
- **District detail panel** — land-mix donut, demographics (population, density, median age, %65+), future-state donut + trade list after allocation; `land_source` badge always shown.
- **EN / Traditional-Chinese language toggle** — full 135/135 key parity across `en.json` and `yue.json`; real `t()` lookup with key fallback.
- **LLM assistant (Claude)** — streaming chat (`/api/chat`), NL goal→scenario parsing (`/api/parse-goal`), district score explanations (`/api/explain`), plan summaries (`/api/summarize-plan`); runs against the local FastAPI backend with a real Anthropic API key.
- **TabPFN-assisted forecast & cross-sectional prediction** (`/api/forecast`, `/api/predict`) — real `TabPFNRegressor` inference when `TABPFN_TOKEN` is set. The forecast now trains TabPFN on a **temporal panel** (2011/2016/2021 census snapshots stacked with `year` as a feature) so demographic projections (`median_age`, `pct_over65`) extrapolate a learned time-trend rather than a 2021-only cross-section.
- **Historical population CAGR** (`backend/llm/history.py`, `data/population/population_history.csv`) — real measured compound annual growth rates derived from the 2011→2016→2021 census series for all 18 districts and 189 STPU neighbourhoods; log-linear fit over all three years. The `Low/High` forecast band is computed from actual cross-area rate dispersion (separate for districts and STPUs). The historical-trend path is **fully active** and overrides the structural estimate for all areas with a measured series.

---

## 3. What is mocked, stubbed, or hardcoded
Every shortcut. Examples: a login that accepts any password, a payment that always succeeds, an "AI" that is an if/else, a database that is an in-memory dictionary, fake JSON returned instead of a real API call.

**Undisclosed mocks carry a small penalty each. Anything you list here = free.**

| What is faked | Where (file:line or folder) | Why we mocked it | What the real version would do |
|---|---|---|---|
| 2021 census values hardcoded as a Python dict | `build_data.py:46-65` (`CENSUS` dict) | Real census numbers, but transcribed by hand rather than parsed from `DC_21C.xlsx` at pipeline runtime | Parse the workbook directly with `openpyxl` / `pandas` |
| Heuristic land-use fallback (present but never fires) | `build_data.py:178-229` (`land_from_heuristic`) | Safety net for raster pixels < 500; all 18 districts have full `raster_2024` coverage so it is never triggered | Would estimate land fractions from density thresholds when raster data is unavailable |
| Forecast structural-fallback constants still hardcoded | `backend/llm/forecast.py:38-42` (`BASE_MID_RATE=0.006`, `STRUCT_SPREAD=0.012`, `BAND=0.008`) | Used only when no historical census series exists for an area (boundary-changed STPUs that appear only in 2021); all 18 districts and 189 of 211 STPUs now use real measured CAGRs instead | Calibrate the fallback from a broader set of HK sub-area series |
| District median_age in temporal panel is approximate | `build_population_history.py` (district panel assembly) | Computed as population-weighted mean of STPU medians — a monotone proxy, not a true district-level median | Parse the district-level age distribution directly from census tables |
| Forecast recommendations are deterministic rules (not ML) | `backend/llm/forecast.py:118-213` (`_recommendations`) | Threshold if/else logic that produces planning advice; clearly described in the docstring | Learned or LLM-generated contextual recommendations |
| TabPFN → pure-numpy kNN fallback | `backend/llm/predict.py:46-104` | Real TabPFN v2 requires a `TABPFN_TOKEN` and licence acceptance; the kNN keeps predictions functional without credentials (result is labelled with model name) | Always run TabPFN v2 once a token is obtained |
| Language preference not persisted across reload | `frontend/src/context/I18nContext.tsx` | In-memory React `useState` only | Persist choice to `localStorage` |

---

## 4. External APIs, services & data sources
Everything the project calls or pretends to call. Mark each as real or mocked.

| Service / API / dataset | Used for | Real call or mocked? | Auth (sandbox / test key / none) |
|---|---|---|---|
| **Anthropic Claude API** — `claude-haiku-4-5` (parse-goal, summarize-plan) and `claude-sonnet-4-6` (explain, chat) | NL goal → scenario parsing; per-district score explanations in EN + TC; plan summaries; streaming map assistant with tool use and prompt caching | **Real** — genuine `client.messages.create` / streaming calls via official `anthropic` SDK (`backend/llm/client.py`, `app.py`, `chat.py`); no stubbing | Env var `ANTHROPIC_API_KEY` (real production key) |
| **PriorLabs TabPFN v2** | (1) Cross-sectional metric prediction and anomaly detection (`/api/predict`). (2) Temporal demographic forecast: trained on a stacked 2011/2016/2021 census panel (54 district + 606 STPU rows) with `year` as a feature — predicts future `median_age` and `pct_over65` at the requested horizon year. (3) Structural "youth signal" modulating the growth rate when no historical series exists. | **Real** when `TABPFN_TOKEN` is set; otherwise **labelled numpy kNN fallback** (see §3) | Optional env var `TABPFN_TOKEN` |
| **HK Census 2011 & 2016 STPU data** | Historical population + demographics for the forecast CAGR and TabPFN temporal panel | **Real** — downloaded from CSDI portal (`data/population/census_stpu_2011.geojson`, `census_stpu_2016.geojson`); processed by `build_population_history.py` into `population_history.csv` and `census_panel.json` | None |
| **HK Planning Dept LUMHK 2024 raster** (`BLU.tif`, 10 m GeoTIFF) | District & neighbourhood land-use fractions — processed offline by `build_data.py` via rasterio zonal stats; baked into `districts.geojson` as `land_source: "raster_2024"` | **Real** local file (`data/raster_land_utilization/LUMHK_RasterGrid_2024/`) — not a live API call | None |
| **HK 2021 Census** (DC_21C) | Population, % aged 65+, median age, density for all 18 districts | **Real** values — hardcoded as a Python dict in `build_data.py:46-65` (see §3) | None |
| **HK Buildings Dept building-age records** | Ageing-building share used in the urban-renewal scoring term | **Real** local CSV (`data/buildings/building_age.csv`, 17 MB) | None |

---

## 5. Pre-existing code
Anything written **before** kickoff that we brought into this project: prior personal projects, forked open-source code, templates, boilerplate, internal libraries.

**Undisclosed pre-built code is heavily penalized. Anything you list here = free.**

*All code in this repo was written during the hackathon window.*

---

## 6. Known limitations & next steps
What we would build next, and the weak spots we already know about. Naming these honestly is a strength, not a flaw.

- **Not yet hosted/deployed.** The app currently runs locally only. The Claude assistant, NL goal-parser, score explanations, and TabPFN forecast require the local FastAPI backend running with `ANTHROPIC_API_KEY`. We will update this file once a hosted version is live.
- **Forecast demographics are a model estimate, not a measured trend** — `median_age` and `pct_over65` projections come from TabPFN trained on the 2011–2021 census panel. Population growth uses measured CAGRs. Both are labelled as estimates in the UI, not official projections.
- **Land-use fractions are the 2024 raster snapshot** — held constant across the temporal panel; no historical land-use editions exist. Noted in the panel metadata.
- **TabPFN requires a token** — without `TABPFN_TOKEN`, prediction and forecast fall back to a numpy kNN baseline. This is clearly labelled in results but is not the full model.
- **Viability scores are illustrative** and not an official planning assessment. Weights are expert-authored AHP judgments, not empirically validated.
- **Land-use heuristic fallback is untested in production** — all current data is real raster so the code path that generates "estimated" fractions has never been exercised end-to-end.
- **Language preference is not persisted** across page reloads (in-memory React state only).
