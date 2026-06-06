# CLAUDE.md

## Project Overview

**EuroTech × HKTE Hackathon, Munich — Smart City track**

An interactive map of Hong Kong's 18 administrative districts that takes a city-planning goal (e.g. "+20% green space by 2050") and ranks which districts can meet it with the most spare capacity and the least displacement — with transparent, explainable reasons for every recommendation.

> Full specification: `docs/MASTER_BUILD_DOC.md` — read it before writing any code.

---

## Architecture in one line

**No backend on the critical path.** The scoring model is a weighted sum over 18 rows. It runs client-side in TypeScript. One precomputed GeoJSON file (`frontend/public/districts.geojson`) is the only data dependency. A FastAPI wrapper is optional and never blocking.

```
frontend/public/districts.geojson   (precomputed, committed)
        │
        ▼
frontend/src/lib/scoring.ts         (WLC engine, client-side)
        │
        ▼
React + Leaflet map + panels        (choropleth, scenario buttons, detail drawer)
```

---

## Two-agent build — file ownership

The repo is built in parallel by **two Claude Code agents**. The core rule: **never edit a file outside your lane.**

| Path | Owner | Notes |
|------|-------|-------|
| `frontend/src/types.ts` | **SHARED** | The contract. Change only by agreement — read it before writing any code. |
| `frontend/public/districts.geojson` | **Agent A** | A commits a stub (2–3 districts) first so B is never blocked |
| `build_data.py` | **Agent A** | Raster pipeline + census merge |
| `weights_ahp.py` | **Agent A** | AHP weight derivation (run offline, paste output into scenarios.ts) |
| `frontend/src/lib/scoring.ts` | **Agent A** | Pure TS, no React — B only imports `createScorer` |
| `frontend/src/scenarios.ts` | **Agent A** | Scenario configs + AHP-derived weights |
| `frontend/src/components/Map*.tsx` | **Agent B** | Leaflet / deck.gl map |
| `frontend/src/components/ScenarioPanel.tsx` | **Agent B** | Scenario buttons |
| `frontend/src/components/DetailPanel.tsx` | **Agent B** | District detail drawer |
| `frontend/src/i18n/*.json` | **Agent B** | EN + Traditional Chinese strings |
| `frontend/src/App.tsx` | **Agent B (sole integrator)** | All wiring lives here — Agent A never edits this |
| `vite.config.ts`, styling, deploy | **Agent B** | |
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
    "residential": 0.30, "industrial": 0.10,
    "commercial": 0.08, "green": 0.40,
    "educational": 0.05, "other": 0.07
  },
  "land_source": "raster_2024 | estimated"
}
```

### Real data sources

| Data | Source |
|------|--------|
| District boundaries | `https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json` |
| Demographics (65+, median age, density) | 2021 Census `DC_21C.xlsx` — `https://www.census2021.gov.hk/doc/DC_21C.xlsx` |
| Land-use raster | Planning Dept LUHK 10m GeoTIFF — data.gov.hk, provider `hk-pland` (2024 edition) |

Hard-coded fallback census values are in `docs/MASTER_BUILD_DOC.md` Appendix A.

If the raster pipeline doesn't finish within its timebox, ship the heuristic land-use fallback described in the master doc §3.3 — **always label it "estimated" in the UI.**

---

## Scoring model

Implemented in `frontend/src/lib/scoring.ts`. Read the source before touching anything.

```
viability(district, scenario) =
    w_displacement × (1 − norm(log₁₀ density))
  + w_age          × norm(pct_over65)
  + w_headroom     × norm(residential_frac) × (1 − land[target])
  + w_area         × norm(area_km2)
```

- Weights are AHP-derived (run `weights_ahp.py` to regenerate).
- The headroom `× (1 − land[target])` factor is critical — without it, a district already 50% green scores high as a green candidate. Do not remove it.
- Normalisation is min-max across all 18 districts, except density which uses `log₁₀` first.

---

## Scenarios

Four pre-defined scenarios in `frontend/src/scenarios.ts`:

| id | Target | Emphasis |
|----|--------|---------|
| `green_hk_2050` | green | headroom + area |
| `industrial_growth` | industrial | area + displacement |
| `education_hub` | educational | headroom dominant |
| `urban_renewal` | residential | age proxy for renewal need |

A scenario is `{ id, target, weights, label_key, description_key, horizon_year }`. Switching scenarios triggers a map recolour — nothing else changes.

---

## Language support

EN + Traditional Chinese (not Simplified). Keys in `frontend/src/i18n/en.json` and `yue.json`.

---

## Hackathon build order

Irreducible core — ship this before anything else:

1. `districts.geojson` stub (Agent A) so Agent B is unblocked
2. 18-district choropleth on the map (Agent B)
3. One scenario recolours the map (both)
4. District tap → detail panel with score + top-3 reasons (Agent B)
5. Language toggle (Agent B)

Then in priority order: real raster land-use data, second scenario, donut chart, all four scenarios, deploy.

Cut list (drop in this order if behind): FastAPI wrapper, building-age stretch, district comparison, two of four scenarios.

---

## Demo script

1. Open app → HK map, 18 districts coloured by dominant land use
2. Tap **"Industrial Growth"** → map recolours by viability score
3. Tap a district (e.g. Tuen Mun) → detail panel: land mix, demographics, score, top-3 reasons
4. Switch language → everything flips to Traditional Chinese
5. Tap **"Green HK 2050"** → a different set of districts highlights

---

## Important constraints

- **Do not render 3D buildings or DTM terrain** at territory zoom — analytically meaningless and a performance risk. The existing PyVista viewer is shelved for this concept.
- **Always show `land_source`** in the UI. Never hide whether data is real or estimated.
- **Do not call viability scores "official"** — they are an illustrative decision-support model, not a planning assessment.
- **No backend on the critical path.** The scoring runs in the browser. Do not block UI work on a server.
- **No ML, no LLM for ranking.** The WLC model is the ranking engine. LLM is Stage 2 optional, only for natural-language input and explanation polish.
