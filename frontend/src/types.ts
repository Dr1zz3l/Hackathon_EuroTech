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
}

// ------------------------------------------------------------
// Scoring output types
// ------------------------------------------------------------

/** One factor's contribution to the final viability score. */
export interface ScoreTerm {
  key: 'low_density' | 'age_factor' | 'headroom' | 'large_area' | 'ageing_stock';
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
}

/**
 * The scorer factory exported by scoring.ts.
 * Call once at app startup with the loaded district array;
 * use the returned `score` function for all subsequent scoring calls.
 */
export interface Scorer {
  score: (district: District, scenario: Scenario) => ScoreResult;
  norms: NormStats;
}
