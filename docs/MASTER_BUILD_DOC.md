# City Health Management — Master Build Document

**Event:** EuroTech × HKTE Hackathon, Munich — Smart City track
**Team size:** 4 · **Time budget:** 24 hours · **Deliverable:** live, deployable web demo + pitch

> **One-line concept:** An interactive map of Hong Kong's 18 districts that takes a city-planning goal (e.g. "+20% green space by 2050") and ranks which districts can meet it with the most spare capacity and the least displacement — with transparent, explainable reasons for every recommendation.

---

## 0. Read this first — three decisions that shape everything

1. **No backend on the critical path.** The scoring model is a weighted sum over 18 rows. It runs client-side in TypeScript in microseconds. We precompute one enriched GeoJSON and do everything in the browser. (Optional thin FastAPI only if a member is idle and we want a "real backend" pitch line — never blocking.)
2. **Real data where it's cheap, clearly-labelled synthetic where it isn't.** Boundaries and demographics are real and trivial. Land-use split is computed from the real Planning Department 10m raster if the pipeline lands in its timebox; otherwise it falls back to a labelled synthetic estimate. See §3.
3. **Narrative reframe (do this before coding).** The score must read as *"achieve the goal while disrupting the fewest people"* — emphasising spare capacity (headroom) and aggregate impact (area), and treating demographics as a displacement-sensitivity input we are trying to *minimise*. It must **not** read as "convert the land where the elderly live because resistance is lowest." Same math, defensible story.

---

## 1. Higher-level functionality

### What the demo does
- Renders Hong Kong's 18 districts as a choropleth map (default colouring: dominant land use).
- Offers 4 pre-defined planning scenarios as buttons.
- On scenario click: recomputes a **viability score** per district and recolours the map (warm = high viability).
- On district tap: opens a detail panel with the land-use breakdown (donut), demographics, the viability score, and the top-3 human-readable reasons for that score.
- Full **EN / Traditional Chinese** toggle across all UI text and reasons.

### Core user flow (also the demo script)
1. Open app → HK map, 18 districts coloured by dominant land use.
2. Tap **"Industrial Growth"** → map recolours by viability score.
3. Tap a district (e.g. Tuen Mun) → detail panel: land mix, median age, area, score + reasons.
4. Switch language → everything flips to Traditional Chinese.
5. Tap **"Green HK 2050"** → a different set of districts highlights.
6. (Optional) Compare two districts via the detail panel.

### The 4 scenarios
| id | Name | Target category | Goal narrative |
|----|------|-----------------|----------------|
| `green_hk_2050` | Green HK 2050 | green | +20% green space, sourced from convertible low-pressure land |
| `industrial_growth` | Industrial Growth | industrial | +15% industrial, favour peripheral lower-density districts |
| `education_hub` | Education Hub | educational | +10% educational capacity near existing institutional clusters |
| `urban_renewal` | Urban Renewal | residential | Renew ageing low-density residential stock (uses building-age signal if built) |

A scenario is just `{ target_category, weight_overrides }`. Switching scenarios swaps weights + target and triggers a recolour.

---

## 2. Architecture

```
Frontend (Vite + React + Leaflet + TypeScript)  — the whole app
  ├── MapView          Leaflet GeoJSON layer, choropleth, click-to-select
  ├── ScenarioPanel    4 scenario buttons → set active scenario → recolour
  ├── DetailPanel      land-use donut + demographics + score + top-3 reasons
  ├── scoring.ts       normalisation + weighted scoring + reason generation (CLIENT-SIDE)
  ├── i18n/            en.json + yue.json (Traditional Chinese)
  └── data/districts.geojson   ← single precomputed, enriched data file

Data prep (Python, run once, offline) — NOT shipped to the browser
  └── build_data.py    merges boundaries + census + land-use → districts.geojson

(Optional, non-blocking) FastAPI wrapper — only for pitch optics
```

**Why static GeoJSON + client-side scoring:** no API latency, no CORS, no env vars, no server to deploy or fall over at 3am. One-click static deploy to Netlify/Vercel. The scoring is too cheap to justify a server.

**Display granularity:** always the **18 districts**. The 10m land-use raster and the finer TPU census layers are *inputs/roadmap*, never rendered — 18 clickable polygons is the correct UX; anything finer is clutter and kills map performance.

### 2.1 Visualization & map extent

**Primary visualization: 2D choropleth of all 18 districts.** The unit of analysis is the district, so the map unit must be the district. The "wow" is *scenario click → whole territory recolours → tap a district → see why*. That is a 2D, whole-territory, 18-polygon story. Baseline stack: **Leaflet** (2D, light).

**Map extent: all 18 districts, full territory including the islands.** Not a cropped box, not the Victoria Harbour core, not the Greater Bay Area. The recommendation is only meaningful if peripheral / green-heavy districts (North, Yuen Long, Islands, Sai Kung) are in the comparison set — they are exactly where green/industrial expansion gets recommended. 18 polygons render instantly, so full territory costs nothing. (Greater Bay Area stays a roadmap line.)

**Optional 3D upgrade (on-concept, low-risk): extrude the districts, not the buildings.** 18 district polygons extruded by viability score (taller = higher) is impressive, matches the unit of analysis, re-extrudes instantly on scenario click, and is ~18 polygons of geometry — no perf risk. Stack implication: Leaflet is 2D-only, so this requires switching to **MapLibre GL + deck.gl** (`PolygonLayer`, `extruded: true`, `getElevation: d => d.score * k`). Half-day upgrade for one person, **only after** the 2D version works.

**What we do NOT render: 3D buildings + DTM terrain.** We have a DTM GeoTIFF and the full Lands Dept Building layer (~340k footprints) cropped to a ~2 km box in eastern Kowloon (Kwun Tong / Kai Tak). This is a building-scale viewer — a *different* product from a territory-wide district recommender. Rendering all ~340k footprints at territory zoom is a grey carpet that's analytically meaningless and a memory/loading risk on a hackathon laptop + projector; terrain/slope is irrelevant to land-use transformation. The heavy crop is a symptom of the buildings-first approach and disappears once buildings stop being the map.

**Repurposing the assets already built (so they aren't wasted):**
- **Building footprints → data, not visualization.** Aggregate them with building-age records, by district, in Python prep to produce the `ageing_building_share` "city health / renewal" signal (full territory, offline, never rendered live). This is the §6 optional stretch.
- **DTM (terrain) → shelved** for this concept; keep only if pivoting to terrain-relevant analysis (flood, developable slope).
- **Cropped 3D scene → optional pitch hero-shot:** a single pre-rendered street-level cutaway on the intro slide. Eye candy, off the critical path, no live rendering.

---

## 3. Data sources — REAL vs SYNTHETIC

> **This section is the source of truth for what is real and what is fabricated. The demo and pitch must represent each field honestly. The "caveats" slide (§7) is built directly from this table.**

### 3.1 Status of every field

| Field | Status | Source / Method |
|-------|--------|-----------------|
| District boundaries (geometry) | **REAL** | HK Home Affairs Dept — `hksar_18_district_boundary.json` (WGS84, EN+TC names) |
| Population | **REAL** | 2021 Population Census, by District Council District |
| % aged 65+ | **REAL** | 2021 Census (note: census gives **65+**, not 60+ — field renamed `pct_over65`) |
| Median age | **REAL** | 2021 Census |
| Population density (/km²) | **REAL** | 2021 Census |
| Area (km²) | **REAL (derived)** | Computed = population ÷ density; matches official areas within ~1% |
| **Land-use split** (residential / industrial / commercial / green / educational) | **REAL *if* raster pipeline succeeds; otherwise SYNTHETIC** | Primary: zonal stats over Planning Dept 10m LUHK raster. Fallback: labelled synthetic heuristic (see §3.3) |
| Ageing-building share (renewal signal) | **REAL — optional stretch** | Buildings Dept "Building information and age records" + building footprints, aggregated per district |
| **Viability score** | **SYNTHETIC — model output** | Our weighted model (§5). It is an illustrative decision-support proxy, **not** an official planning assessment. Must always be labelled as such. |
| Reason strings | **DERIVED** | Generated deterministically from the score's term contributions |

### 3.2 REAL datasets — confirmed, free, downloadable

**Available Data** - Already downloaded
Extractor file found in ../backend/data_setup.py, data in ../data/

**Boundaries (Core)** — Home Affairs Dept
`https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json`
One file, 18 polygons, EN + TC names, WGS84 lat/long.

**Demographics (Core)** — 2021 Population Census, by District Council District
`https://www.census2021.gov.hk/doc/DC_21C.xlsx` (bilingual; `.zip` CSV variant also available)
Use this as the machine-readable source. Hard-coded fallback values are in Appendix A.

**Land-use raster (Core)** — Planning Dept "Raster Grids on Land Utilization"
10m resolution GeoTIFF, yearly editions 2018–2024 (use 2024). Dataset page on data.gov.hk under provider `hk-pland`. Carries an official "broad-brush, not for detailed calculation" disclaimer — disclose this.

**Building age (Core, optional)** — Buildings Dept "Building information and age records"
CSV; combine with the team's existing `buildings.geojson` (342k footprints, `BuildingBlockType`).

### 3.3 SYNTHETIC fallback — land-use heuristic (only if raster pipeline misses its timebox)

If the raster zonal-stats job is not working by its deadline, generate the 5-category land mix per district as follows, and **label every such figure "estimated" in the UI and pitch**:
1. Hand-set a "character prior" per district from well-known reality (e.g. Yau Tsim Mong / Central → commercial-heavy; Kwun Tong / Kwai Tsing / Tsuen Wan → industrial; Islands / North / Sai Kung → green-heavy).
2. Nudge with the real density figure (very high density → more residential+commercial, less green) so it stays internally consistent with displayed data.
3. Normalise each district's fractions to sum to 1.

The map and scoring are agnostic to which source produced the fractions, so this is a safe drop-in.

### 3.4 Roadmap-only datasets (mention in pitch; do NOT build into the 24h demo)
Country Parks polygons (green cross-check), School enrolment by district (Education Hub demand), Property Market vacancy/completions by district (development pressure), Government Land Allocation + Lot (development pipeline), TPU-level census (finer granularity).

---

## 4. Data schema (the contract between data-prep and frontend)

One GeoJSON file. Each of the 18 features:

```json
{
  "type": "Feature",
  "properties": {
    "name": "Tuen Mun",
    "name_tc": "屯門",
    "pop": 506879,
    "pct_over65": 19.3,
    "median_age": 46.1,
    "density": 5908,
    "area_km2": 85.8,
    "land": {
      "residential": 0.30,
      "industrial":  0.10,
      "commercial":  0.08,
      "green":       0.40,
      "educational": 0.05,
      "other":       0.07
    },
    "land_source": "raster_2024 | estimated",
    "ageing_building_share": 0.42
  },
  "geometry": { "...": "Polygon / MultiPolygon, WGS84" }
}
```

- `land.*` are fractions of total district land area; keep `other` visible (honest about transport/water/barren).
- `land_source` drives the "estimated" label in the UI — never hide it.
- `ageing_building_share` present only if the optional stretch is built.

---

## 5. The core algorithm — staged

The recommendation engine is **not** an LLM and **not** machine learning. It's a transparent scoring method from the established field of land-use planning. We build it in stages: **Stage 0 must ship; Stages 1–4 are independent stretch goals**, each adding credibility or polish without breaking what already works. Always keep the last working stage deployed.

### 5.0 Plain-English glossary (read this first — nobody needs a stats background)
- **MCDA** — *Multi-Criteria Decision Analysis.* The standard way to rank options when several factors matter at once. Our whole engine is one instance of it; it's the academic name for "score and rank the districts."
- **WLC** — *Weighted Linear Combination.* The actual maths: scale each factor to 0–1, multiply by an importance weight, add them up. That sum is the score. This is the most common method in real GIS land-suitability work.
- **Normalisation** — Rescaling different units (people/km², %, km²) onto a common 0–1 scale so they can be added fairly. Without it, big numbers dominate.
- **AHP** — *Analytic Hierarchy Process.* A recipe for choosing the weights instead of guessing them: you compare factors two at a time ("is area more important than density, and by how much, 1–9?") and it computes a consistent weight set.
- **Consistency Ratio (CR)** — A number AHP gives you that proves your comparisons aren't self-contradictory (e.g. you didn't say A>B, B>C, but C>A). CR < 0.1 = trustworthy. Great thing to quote to judges.
- **TOPSIS** — *Technique for Order of Preference by Similarity to Ideal Solution.* An alternative ranking method: score each district by how close it is to an imaginary "perfect" district and how far from the "worst" one. Used here only as an optional second opinion.
- **Adjacency graph** — Treat the 18 districts as dots connected when they share a border. Lets us reward districts *next to* good ones (clusters, green corridors).

### 5.1 Why this method (one paragraph for the pitch)
Ranking districts against several conflicting goals is textbook **MCDA**, and **WLC with AHP-derived weights** is exactly the methodology used in real GIS land-suitability planning. We chose it over an LLM/ML model on purpose: it is fully transparent — every score breaks down into named reasons — which is what a planning/government audience trusts. The explainability *is* the product.

---

### Stage 0 — WLC baseline (MUST SHIP — ~core build)
The guaranteed demo. Hand-set weights, pure weighted sum, client-side in `scoring.ts`.

**Normalisation (precompute once across the 18 districts):** min-max each feature to 0–1. **Density is the exception** — it spans ~1,000 to ~60,000 /km², so normalise `log10(density)` or dense urban districts swamp everything.

**Score for a target category `T`:**
```
viability(d, T) =
    0.30 * displacement_score(d)   // = 1 - norm(density proxy)   → "fewer people disrupted"
  + 0.20 * age_factor(d)           // = norm(pct_over65)          → displacement sensitivity (narrated, not "opportunity")
  + 0.30 * headroom_score(d, T)    // = norm(residential_frac) * (1 - land[T])  → convertible land × room to grow
  + 0.20 * area_score(d)           // = norm(area_km2)            → aggregate impact
```
- **Headroom is the key correctness fix:** without `(1 - land[T])`, a district already 50% green scores high for *adding* green — looks broken when a judge taps it.
- Scenarios override the four weights to express emphasis (Industrial Growth weights area + low-density higher, etc.).
- **Optional Urban-Renewal term** (needs the building-age signal): add `renewal_score = norm(ageing_building_share)` and rebalance.

**Reasons (top-3):** sort each district's term contributions, take the top ones, emit an i18n key + the real value. This is just `Object.entries(terms).sort()` — cheap, and it's what makes the panel feel intelligent.
- `reason.headroom` → "Only {x}% {category} today → room to grow"
- `reason.large_area` → "Large district ({x} km²) → high aggregate impact"
- `reason.low_density` → "Lower density ({x}/km²) → less displacement"
- `reason.ageing_stock` → "{x}% of buildings ageing → renewal candidate"

### Stage 1 — AHP-derived weights (~1–2 h · biggest credibility win)
Replace the hand-picked 0.30/0.20/0.30/0.20 with weights *derived* by AHP, so a judge can't call them arbitrary. Do the pairwise comparisons once, **offline in Python**, print the weight vector + the consistency ratio, and paste the numbers into the scenario configs. The live app stays a plain weighted sum — nothing changes in `scoring.ts` except the constants. Pitch line: *"weights derived via AHP, consistency ratio 0.0x."* Library: `pyDecision` or `PyLUSAT` (don't hand-roll the matrix maths).

### Stage 2 — LLM language layer (~2–3 h · demo wow, must degrade gracefully)
Wrap the engine — never let it do the ranking. Two uses: (a) **free-text goals** — type "make the New Territories greener," an LLM returns structured JSON `{target, weight_overrides}` that feeds the same WLC; (b) **natural-language explanations** — turn the deterministic score + reason-terms into fluent EN/TC sentences. Must fall back to the 4 preset scenarios + templated reasons if the API is unavailable (this is the only network dependency in the app).

### Stage 3 — Adjacency-graph term (~1–2 h · adds a "spatial reasoning" story)
Build the 18-node border-adjacency graph from the geometry (trivial). Add one extra WLC term = neighbour-average of the target fraction, so the *Education Hub* scenario rewards districts next to institutional clusters and *Green HK 2050* rewards contiguous green corridors. One term, big narrative payoff. **Do not** escalate to a graph neural network — 18 nodes don't justify it and you'd lose explainability.

### Stage 4 — TOPSIS second opinion (~1 h · optional robustness garnish)
Expose a "ranking method: WLC vs TOPSIS" toggle to show the recommendations are stable across methods. `pymcdm` runs TOPSIS in ~5 lines. Nice-to-have only — it can muddy a 90-second demo, so add it last and cut it first.

### Not in scope (roadmap slide only)
**Optimization / spatial allocation** (linear programming, multi-objective NSGA-II, CLUE-type models) would turn "rank the districts" into "compute the optimal allocation of +20% green across districts under constraints." More powerful, far heavier, hard to demo and explain. Perfect as a *"v2 goes from ranking to constrained allocation"* pitch line; wrong as a 24 h build. **Supervised ML** is also out — there is no labelled training data for "correct" transformations.

### Build-vs-adapt summary
DIY the thin glue (the WLC sum + reasons in TS, the scenario configs); **adapt** the established pieces from mature Python libraries — `pyDecision` / `pymcdm` / `PyLUSAT` for AHP and TOPSIS. Faster *and* more credible than inventing a method.

---

## 6. Step-by-step implementation plan (24h, team of 4)

### Roles (parallel from hour 0)
- **P1 — Data & raster pipeline.** Ships a stub/heuristic `districts.geojson` early so everyone is unblocked, then upgrades land-use to real raster-derived values within a strict timebox.
- **P2 — Map core.** Vite/React/Leaflet, render 18 polygons, dominant-use choropleth, click → select.
- **P3 — Scoring & panels.** `scoring.ts`, scenario buttons, recolour, detail panel (donut + demographics + score + reasons).
- **P4 — Narrative, i18n, integration, pitch.** EN/TC strings, styling, caveats slide, demo script, deploy, floats to unblock.

### Hour-by-hour
| Window | P1 (Data/Raster) | P2 (Map) | P3 (Scoring/Panels) | P4 (Narrative/Integration) |
|--------|------------------|----------|---------------------|----------------------------|
| **H0–2** | Repo + Vite skeleton agreed; ship **stub GeoJSON** (real demographics + heuristic land use) | Render 18 polygons from stub | Wire `scoring.ts` against stub, verify in console | Lock reframed narrative; scaffold i18n files |
| **H2–6** | Start raster pipeline: load GeoTIFF, **reproject districts to raster CRS (EPSG:2326)**, `rasterstats` zonal stats | Dominant-use choropleth + click → select event | Scenario buttons recolour map; headroom term working | Color ramp, legend, base styling |
| **H6–10** | Map LUHK classes → 5 buckets (read legend file), swap real land-use into GeoJSON | Selection state solid | Detail panel: donut + demographics + score + reasons | **Protect the minimum viable demo here** |
| **H10–14** | (Stretch) building-age aggregation OR harden raster | Hover states, polish | Wire `land_source` "estimated" label | EN/TC toggle live across all text |
| **H14–18** | Buffer / fallback decision (raster vs heuristic) | — | — | Deploy to Netlify/Vercel; test on venue network + projector res; sleep in shifts |
| **H18–22** | — | — | — | Build + rehearse pitch against demo script; add caveats slide |
| **H22–24** | Freeze code. Buffer. Rehearse twice more. | | | |

### The raster pipeline recipe (P1 — the only real GIS, so de-risk it)
1. `rasterio` to read GeoTIFF; `geopandas` to read district polygons.
2. **CRS gotcha (the #1 silent failure):** HK rasters are likely EPSG:2326 (HK 1980 Grid); boundaries are WGS84. Reproject polygons → 2326, run zonal stats there, reproject geometry → 4326 for Leaflet. Nonsense percentages = this step is wrong.
3. `rasterstats.zonal_stats(districts, raster, categorical=True)` → per-district pixel counts per class.
4. Map classes → 5 buckets + `other` using the **legend in the dataset's data-description file** (do not guess pixel values):
   - residential ← Residential
   - commercial ← Commercial
   - industrial ← Industrial (+ warehouse/open storage)
   - green ← Open Space + Woodland/Shrubland/Grassland + Agriculture (+ wetland)
   - educational ← Government/Institution/Community (GIC)
   - other ← Transportation + Water + Barren (kept visible)
5. Fractions over total district land area.
6. **Timebox: if not working by H14, ship the §3.3 heuristic.** The demo is identical either way except the label.

### Cut list (drop in this order if behind)
1. Optional FastAPI (already non-critical)
2. Building-age stretch
3. District-vs-district comparison
4. Two of the four scenarios

**Irreducible core that still demos well:** map + one scenario recolour + detail panel + language toggle.

### 6.5 Two-agent parallel build (2 people + 2 Claude Code agents, one repo)

The whole build is run by **two Claude Code agents on the same repository** — one per person. The goal is that the two agents almost never touch the same file, so you avoid merge conflicts and duplicated work. The trick: **disjoint file ownership + one shared contract defined first.** (Any other teammates take the non-code tracks — pitch deck, data sourcing, live testing — per the P4 workstream above.)

**Two lanes** (this collapses the four workstreams into two agents):
- **Agent A — Data & Model:** everything upstream of the UI. Owns `build_data.py`, the raster pipeline, `weights_ahp.py`, the pure `scoring.ts`, and the scenario configs. Produces `districts.geojson` + the `score()` function. (≈ old P1 + the algorithm half of P3.)
- **Agent B — App & UI:** everything the user sees + the app shell. Owns the map, panels, i18n, styling, integration, deploy. Consumes A's data + score function as fixed. (≈ old P2 + the UI half of P3 + P4.)

**File ownership — the core anti-collision rule is: never edit a file in the other agent's lane.**

| Path | Owner | Notes |
|------|-------|-------|
| `frontend/src/types.ts` | **SHARED** | The contract: `District` properties (§4 schema) + `score()` signature. Change **only by agreement.** |
| `frontend/public/districts.geojson` | A | A commits a 2–3-district **stub** first so B is never blocked |
| `build_data.py`, raster pipeline, `weights_ahp.py`, `data/` | A | offline Python |
| `frontend/src/lib/scoring.ts` | A | pure TS, no React; B only *imports* it |
| `frontend/src/scenarios.ts` (configs + weights) | A | |
| `frontend/src/components/Map*.tsx` | B | Leaflet / deck.gl |
| `frontend/src/components/ScenarioPanel.tsx`, `DetailPanel.tsx` | B | |
| `frontend/src/i18n/*.json` | B | |
| `frontend/src/App.tsx` (all wiring) | **B (sole integrator)** | A never edits this |
| vite config, styling, deploy | B | |

**The handshake — do this together in the first ~30–45 min, before either agent goes solo:**
1. Agree and commit `types.ts`: the `District` schema (§4) + `score(district, scenario) → { score, terms }`.
2. Agent A commits a **stub** `districts.geojson` (2–3 fake districts, real shape) **and** a stub `scoring.ts` that returns a dummy score immediately.
3. From here both work in parallel: B builds the entire UI against the stub; A swaps in real data + scoring behind the same interface. Neither blocks the other.

**The one rule that prevents ~90% of conflicts:** integration lives in exactly one file — `App.tsx`, owned by B. Agent A exposes everything as clean module exports; Agent B does all the wiring. Conflicts only happen where two people edit the same lines, so all the "glue" sits with one owner and every other file stays single-owner.

**Git workflow:**
- Commit the contract (`types.ts` + both stubs) to `main` first.
- Each agent works on its own branch (`agent-a-data`, `agent-b-ui`), commits small and often, and merges to `main` at every working increment.
- Lanes are disjoint, so merges are usually clean. Need something in the other lane? Ask — don't reach across.
- `git pull` before every work session.

**How to brief each Claude Code agent so it stays in its lane:**
- Put a `CLAUDE.md` at the repo root containing the ownership table above + the rule "do not modify files outside your lane; never change `types.ts` unilaterally." Both agents read it on every run.
- Give each agent a one-paragraph scoped brief, e.g. **Agent B:** "You own `frontend/src/components/*`, `App.tsx`, `i18n/*`, styling. Import `score()` and the `District` type from `lib/scoring.ts` and `types.ts` and treat them as fixed. Do **not** edit `build_data.py`, `scoring.ts`, `scenarios.ts`, or `data/`."
- Tell each agent: read `types.ts` before writing code.

**Mapping to the staged algorithm (§5):** Agent A owns Stage 0 (WLC), Stage 1 (AHP, Python), Stage 3 (graph term), Stage 4 (TOPSIS), and the scoring-side glue of Stage 2 (free-text JSON → weights). Agent B owns the UI side of Stage 2 (the free-text input box + rendering the LLM explanations).

---

## 7. Honest caveats slide (say these out loud — reads as rigour to planning judges)
- Demographics are **real** 2021 Census data (by District Council District).
- District boundaries are **real** (Home Affairs Department).
- Land-use figures are **derived from the Planning Department's 10m satellite land-use raster** *(or, if heuristic fallback was used: **estimated from district characteristics and density**)* — broad-brush, not official planning records.
- Viability scores are an **illustrative decision-support model**, not a planning assessment.
- This is a **prototype concept tool**, not a policy recommendation system.

**Differentiator to land in the pitch:** interactive goal-to-capacity matching with transparent, explainable reasons — plus a credible roadmap (real OZP/land-use integration, building-age "city health" index, Greater Bay Area extension) that fits this delegation's agenda.

---

## Appendix A — Real 2021 Census figures (hard-coded fallback)

Use `DC_21C.xlsx` as primary; these are the guaranteed fallback values. `area_km2` = pop ÷ density (approx).

| District | Pop | %0–14 | %15–64 | %65+ | Median age | Density /km² |
|---|---|---|---|---|---|---|
| Central & Western | 235,953 | 10.3 | 70.4 | 19.3 | 44.8 | 18,808 |
| Wan Chai | 166,695 | 10.1 | 68.6 | 21.2 | 46.0 | 15,791 |
| Eastern | 529,603 | 9.7 | 66.9 | 23.4 | 49.0 | 29,440 |
| Southern | 263,278 | 10.4 | 68.1 | 21.6 | 48.1 | 6,779 |
| Yau Tsim Mong | 310,647 | 11.6 | 70.5 | 17.9 | 44.0 | 44,458 |
| Sham Shui Po | 431,090 | 11.4 | 68.2 | 20.4 | 46.2 | 46,067 |
| Kowloon City | 410,634 | 12.3 | 67.7 | 20.1 | 45.4 | 40,994 |
| Wong Tai Sin | 406,802 | 8.9 | 68.1 | 23.0 | 50.1 | 43,730 |
| Kwun Tong | 673,166 | 10.4 | 67.6 | 21.9 | 48.0 | 59,704 |
| Kwai Tsing | 495,798 | 10.0 | 68.0 | 22.1 | 48.0 | 21,246 |
| Tsuen Wan | 320,094 | 11.8 | 70.0 | 18.1 | 45.4 | 5,168 |
| Tuen Mun | 506,879 | 10.7 | 70.0 | 19.3 | 46.1 | 5,908 |
| Yuen Long | 668,080 | 11.6 | 73.4 | 15.0 | 43.7 | 4,825 |
| North | 309,631 | 10.8 | 71.2 | 17.9 | 46.3 | 2,269 |
| Tai Po | 316,470 | 10.9 | 70.7 | 18.5 | 45.7 | 2,325 |
| Sha Tin | 692,806 | 11.4 | 68.6 | 20.0 | 46.2 | 10,082 |
| Sai Kung | 489,037 | 11.5 | 72.7 | 15.8 | 44.7 | 3,771 |
| Islands | 185,282 | 12.8 | 72.4 | 14.7 | 42.7 | 1,021 |

Source: Census and Statistics Department, 2021 Population Census, Table 2 (Key demographic characteristics of District Council districts).

## Appendix B — Key dataset URLs
- District boundary (JSON): `https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json`
- Census by DCD (XLSX): `https://www.census2021.gov.hk/doc/DC_21C.xlsx`
- LUHK raster + statistics: data.gov.hk, provider `hk-pland` (use 2024 edition)
- Building information & age records: data.gov.hk — Buildings Department
- Roadmap layers: Country Parks, School enrolment by district, Property Market Statistics, GLA/Lot (all on data.gov.hk)

## Appendix C — Stack quick reference
- Frontend (2D baseline): Vite + React + TypeScript + Leaflet; charts via a lightweight donut (Recharts or hand-rolled SVG).
- Frontend (optional 3D): MapLibre GL + deck.gl `PolygonLayer` (extruded districts by score) — only after 2D works.
- Data prep: Python + geopandas + rasterio + rasterstats (offline, run once).
- Deploy: Netlify or Vercel (static).
- No browser storage APIs; no `<form>` tags in React; all state in React state.
