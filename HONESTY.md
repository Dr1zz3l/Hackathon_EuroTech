# HONESTY.md

> Mandatory disclosure for the hackathon. This file lives at the root of your repository. Judges cross-check it against your code and your technical video.
>
> **The deal:** disclosed shortcuts are **not** penalized — that is the entire point of this file. Hidden ones are. Undisclosed pre-built code is heavily penalized, each undisclosed mock carries a small penalty, and a faked demo is heavily penalized. Telling the truth here costs you nothing.

---

## 1. Team — who did what
Judges compare this against `git shortlog -sn`, so keep it honest.

| Member | GitHub handle | Main contributions |
|---|---|---|
| Timo Weiss | `Dr1zz3l` | Lead integration: Leaflet map & React components, `App.tsx` wiring, i18n, scoring & reallocation libs, LLM backend, PyVista visualization (39 commits) |
| Frans Hietaranta | `<fill-in>` | Documentation — README, CLAUDE.md, pitch video guide (11 commits) |
| Till Laube | `<fill-in>` | LLM/data backend, scoring lib, Python packaging (9 commits) |
| Vincent Fiedler | `viincece` | Frontend components & app shell, LLM backend, project config (6 commits) |

---

## 2. What is fully working
Features that run end-to-end on the live app, with real data and real logic.

- **18-district choropleth map** — loads real `raster_2024` land-use GeoJSON (`frontend/public/districts.geojson`) and colours all 18 districts by dominant land use or viability score.
- **WLC viability scoring** (`frontend/src/lib/scoring.ts`) — input: District + Scenario; output: score, per-term breakdown, top-3 reasons. Real weighted-sum math, min-max normalised across all 18 districts; log₁₀ density transform for displacement.
- **4 AHP-derived scenarios** (`frontend/src/scenarios.ts`) — weights derived from real AHP pairwise matrices in `weights_ahp.py` (all consistency ratios CR < 0.07). Switching scenarios re-scores and recolours the map live.
- **Land reallocation / planner** (`frontend/src/lib/reallocation.ts`) — genuine bounded quadratic program solved via closed-form KKT + bisection on the dual variable ν, run over 211 STPU neighbourhoods and aggregated to 18 districts. Conservation of land fractions is asserted in dev.
- **District detail panel** — land-mix donut, demographics (population, density, median age, %65+), score + reason cards, future-state donut + trade list after allocation; `land_source` badge always shown.
- **EN / Traditional-Chinese language toggle** — full 147/147 key parity across `en.json` and `yue.json`; real `t()` lookup with key fallback.
- **LLM assistant (Claude)** — streaming chat (`/api/chat`), NL goal→scenario parsing (`/api/parse-goal`), district score explanations (`/api/explain`), plan summaries (`/api/summarize-plan`); runs against the local FastAPI backend with a real Anthropic API key.
- **TabPFN-assisted forecast & cross-sectional prediction** (`/api/forecast`, `/api/predict`) — real `TabPFNRegressor` inference when `TABPFN_TOKEN` is set.
- **Reddit social-listening tool** — real API calls in the chat agent (`social_listening` tool), 24-hour disk cache.

---

## 3. What is mocked, stubbed, or hardcoded
Every shortcut. Examples: a login that accepts any password, a payment that always succeeds, an "AI" that is an if/else, a database that is an in-memory dictionary, fake JSON returned instead of a real API call.

**Undisclosed mocks carry a small penalty each. Anything you list here = free.**

| What is faked | Where (file:line or folder) | Why we mocked it | What the real version would do |
|---|---|---|---|
| 2021 census values hardcoded as a Python dict | `build_data.py:46-65` (`CENSUS` dict) | Real census numbers, but transcribed by hand rather than parsed from `DC_21C.xlsx` at pipeline runtime | Parse the workbook directly with `openpyxl` / `pandas` |
| Heuristic land-use fallback (present but never fires) | `build_data.py:178-229` (`land_from_heuristic`) | Safety net for raster pixels < 500; all 18 districts have full `raster_2024` coverage so it is never triggered | Would estimate land fractions from density thresholds when raster data is unavailable |
| Forecast historical-trend branch is dead code | `backend/llm/forecast.py` + `backend/llm/history.py` | `population_history.csv` does not exist; every forecast therefore falls to the structural TabPFN estimate — the "MEASURED census trend" branch never executes | Wire in a real multi-year census population series to compute measured CAGR |
| Forecast growth constants hardcoded | `backend/llm/forecast.py:39-42` (`BASE_MID_RATE`, `STRUCT_SPREAD`, `BAND`, `HOUSEHOLD_SIZE`) | Single 2021 census snapshot; no time series to calibrate from | Calibrate constants from historical HK census data |
| Forecast recommendations are deterministic rules (not ML) | `backend/llm/forecast.py:118-213` (`_recommendations`) | Threshold if/else logic that produces planning advice; clearly described in the docstring | Learned or LLM-generated contextual recommendations |
| TabPFN → pure-numpy kNN fallback | `backend/llm/predict.py:46-104` | Real TabPFN v2 requires a `TABPFN_TOKEN` and licence acceptance; the kNN keeps predictions functional without credentials (result is labelled with model name) | Always run TabPFN v2 once a token is obtained |
| Language preference not persisted across reload | `frontend/src/context/I18nContext.tsx` | In-memory React `useState` only | Persist choice to `localStorage` |

---

## 4. External APIs, services & data sources
Everything the project calls or pretends to call. Mark each as real or mocked.

| Service / API / dataset | Used for | Real call or mocked? | Auth (sandbox / test key / none) |
|---|---|---|---|
| **Anthropic Claude API** — `claude-haiku-4-5` (parse-goal, summarize-plan) and `claude-sonnet-4-6` (explain, chat) | NL goal → scenario parsing; per-district score explanations in EN + TC; plan summaries; streaming map assistant with tool use and prompt caching | **Real** — genuine `client.messages.create` / streaming calls via official `anthropic` SDK (`backend/llm/client.py`, `app.py`, `chat.py`); no stubbing | Env var `ANTHROPIC_API_KEY` (real production key) |
| **PriorLabs TabPFN v2** | Cross-sectional metric prediction for districts/neighbourhoods; forecast signal modulating compound-growth projections | **Real** when `TABPFN_TOKEN` is set and weights are downloaded; otherwise **labelled numpy kNN fallback** (see §3) | Optional env var `TABPFN_TOKEN` |
| **Reddit API** | Social-listening sentiment evidence surfaced in the chat agent's `social_listening` tool | **Real** — app-only OAuth token fetch (`reddit.com/api/v1/access_token`) or public no-auth JSON endpoints; 24 h disk cache under `data/social_cache/` (`backend/llm/social.py`) | Optional `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`; works credential-free via public endpoints |
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
- **Forecast is a cross-sectional decision-support estimate, not a temporal forecast** — it projects compound growth over a single 2021 census snapshot (no real time series wired in). Self-labelled as such in the code and UI. The historical-trend code path is present but inoperative (see §3).
- **TabPFN requires a token** — without `TABPFN_TOKEN`, prediction and forecast fall back to a numpy kNN baseline. This is clearly labelled in results but is not the full model.
- **Viability scores are illustrative** and not an official planning assessment. Weights are expert-authored AHP judgments, not empirically validated.
- **Land-use heuristic fallback is untested in production** — all current data is real raster so the code path that generates "estimated" fractions has never been exercised end-to-end.
- **Language preference is not persisted** across page reloads (in-memory React state only).
