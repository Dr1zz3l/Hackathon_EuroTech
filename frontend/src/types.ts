// ============================================================
// SHARED CONTRACT — Agent A and Agent B both depend on this.
// Do NOT change unilaterally. Coordinate before editing.
// ============================================================

/** The five planning categories tracked per district. */
export type LandCategory =
  | 'residential'
  | 'industrial'
  | 'commercial'
  | 'green'
  | 'educational';

/**
 * Land-use fractions for one district.
 * Each value is in [0, 1]; values sum to ≤ 1 (remainder is `other`).
 */
export interface LandUse {
  residential: number;
  industrial:  number;
  commercial:  number;
  green:       number;
  educational: number;
  /** Transport / water / barren — kept visible; never hidden. */
  other:       number;
}

/**
 * Properties of one GeoJSON Feature in districts.geojson.
 * This is the contract between build_data.py (Agent A) and the map layer (Agent B).
 */
export interface District {
  /** English district name. */
  name:       string;
  /** Traditional Chinese district name. */
  name_tc:    string;
  /** Total population (2021 Census). */
  pop:        number;
  /** Percentage of population aged 65+ (Census gives 65+, not 60+). */
  pct_over65: number;
  /** Median age. */
  median_age: number;
  /** Population density, persons / km². */
  density:    number;
  /** District area in km² (derived: pop / density). */
  area_km2:   number;
  /** Land-use fractions. */
  land:       LandUse;
  /**
   * Data provenance — drives the "estimated" label in the UI.
   * Never hide this from the user.
   */
  land_source: 'raster_2024' | 'estimated';
  /**
   * Fraction of buildings in the district considered ageing.
   * Only present when the optional building-age stretch (§5.0) is built.
   */
  ageing_building_share?: number;
}

// ------------------------------------------------------------
// Scoring model types
// ------------------------------------------------------------

/**
 * Importance weights for the four WLC terms.
 * All values must be positive. They are normalised internally before use,
 * so they express relative importance, not absolute magnitudes.
 */
export interface WeightSet {
  /** 1 − norm(log₁₀ density): fewer people disrupted. */
  displacement: number;
  /** norm(pct_over65): displacement-sensitivity signal. */
  age:          number;
  /** norm(residential_frac) × (1 − land[target]): convertible land × headroom to grow. */
  headroom:     number;
  /** norm(area_km2): aggregate impact potential. */
  area:         number;
  /**
   * norm(ageing_building_share): renewal candidate signal.
   * Only active when the optional stretch is built and the field is present.
   */
  renewal?:     number;
  /**
   * norm(neighbour-average of land[target]): spatial cluster / corridor signal.
   * Only active when adjacency.json is loaded and passed to createScorer.
   */
  adjacency?:   number;
}

export type ScenarioId =
  | 'green_hk_2050'
  | 'industrial_growth'
  | 'education_hub'
  | 'urban_renewal';

/**
 * A pre-defined planning scenario.
 * Switching scenarios swaps `target` + `weights`, triggering a map recolour.
 */
export interface Scenario {
  id:              ScenarioId;
  /** Which land[T] fraction the headroom term works against. */
  target:          LandCategory;
  /** AHP-derived weights (Stage 1) or hand-set fallback (Stage 0). */
  weights:         WeightSet;
  /** i18n key for the scenario button label. */
  label_key:       string;
  /** i18n key for the detail-panel subtitle. */
  description_key: string;
  /** Target completion year shown in the UI. */
  horizon_year:    number;
  /**
   * City-wide growth target expressed as a fraction of current total target-category
   * area, e.g. 0.20 = add 20% more green. Absent for in-place scenarios
   * (urban_renewal) — no land reallocation is performed.
   */
  goal_delta?:       number;
  /**
   * Controls the agglomeration strength μ in the QP objective.
   * High (~1.5) clusters growth near existing concentrations (green corridors,
   * educational clusters); moderate (~0.8) allows more spread (industrial).
   */
  cluster_strength?: number;
}

// ------------------------------------------------------------
// Scoring output types
// ------------------------------------------------------------

/** One factor's contribution to the final viability score. */
export interface ScoreTerm {
  key: 'low_density' | 'age_factor' | 'headroom' | 'large_area' | 'ageing_stock' | 'adjacency';
  /**
   * Weight × normalised value — the addend to the total score.
   * Terms are sorted by this value descending before being returned.
   */
  contribution:  number;
  /** Human-readable value for the reason string, e.g. "5 908 /km²". */
  display_value: string;
}

export interface ScoreResult {
  /** Total viability score in [0, 1]. */
  score:       number;
  /** All computed terms, sorted by contribution descending. */
  terms:       ScoreTerm[];
  /** The top 3 terms — what the detail panel renders as reasons. */
  top_reasons: ScoreTerm[];
}

/**
 * Precomputed min/max bounds used to normalise raw district values.
 * Computed once from the full 18-district array; passed into every score() call.
 */
export interface NormStats {
  density_log: { min: number; max: number };
  area:        { min: number; max: number };
  pct_over65:  { min: number; max: number };
  residential: { min: number; max: number };
  /** Present only when ageing_building_share is available on all districts. */
  ageing?:     { min: number; max: number };
  /**
   * Per-category min/max of the neighbour-average of land[cat].
   * Present only when adjacency data is passed to createScorer.
   */
  adjacency?:  Partial<Record<LandCategory, { min: number; max: number }>>;
}

/**
 * Adjacency map produced by scripts/build_adjacency.py.
 * Maps each district name to its list of border-neighbour names.
 */
export type AdjacencyMap = Record<string, string[]>;

/**
 * The scorer factory exported by scoring.ts.
 * Call once at app startup with the loaded district array;
 * use the returned `score` function for all subsequent scoring calls.
 */
export interface Scorer {
  score: (district: District, scenario: Scenario) => ScoreResult;
  norms: NormStats;
}

/** Factory signature — adjacency is optional; app degrades gracefully without it. */
export type CreateScorer = (districts: District[], adjacency?: AdjacencyMap) => Scorer;

// ------------------------------------------------------------
// Reallocation output types
// ------------------------------------------------------------

/**
 * Per-district result of the reallocation algorithm.
 * `current` = 2024 raster fractions; `future` = projected fractions after
 * the scenario goal is met; `delta` = signed difference (future − current).
 */
export interface DistrictAllocation {
  name:        string;
  current:     LandUse;
  future:      LandUse;
  /** Signed fraction deltas (future − current) for every category including other. */
  delta:       LandUse;
  /** km² of target-category land received by this district. */
  received_km2: number;
}

/**
 * City-wide result returned by Allocator.allocate().
 * `byDistrict` is keyed by district.name.
 */
export interface AllocationResult {
  byDistrict:  Map<string, DistrictAllocation>;
  target:      LandCategory;
  /** Total km² the scenario aimed to add. */
  goalKm2:     number;
  /**
   * Actual km² added (may be < goalKm2 if all districts are capped).
   * Display a shortfall warning when achievedKm2 < 0.99 * goalKm2.
   */
  achievedKm2: number;
}

/**
 * Allocator factory returned by createAllocator().
 * `allocate` returns null for scenarios without a goal_delta (urban_renewal).
 */
export interface Allocator {
  allocate: (scenario: Scenario, scorer: Scorer) => AllocationResult | null;
}

/** Factory signature — adjacency optional, same degradation pattern as CreateScorer. */
export type CreateAllocator = (districts: District[], adjacency?: AdjacencyMap) => Allocator;
