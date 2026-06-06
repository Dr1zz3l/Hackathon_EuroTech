/**
 * Client-side WLC (Weighted Linear Combination) scoring engine.
 *
 * Pure TypeScript — no React, no side effects, no network calls.
 * Agent B imports `createScorer`; never edits this file.
 *
 * Implements MASTER_BUILD_DOC §5.0 Stage 0 (WLC baseline).
 * Weights are supplied by scenarios.ts; AHP-derived values replace
 * the hand-set defaults at Stage 1 without any change here.
 */

import type { District, LandCategory, NormStats, Scenario, ScoreResult, ScoreTerm, Scorer } from '../types';

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function minmax(val: number, bounds: { min: number; max: number }): number {
  const { min, max } = bounds;
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function bounds(values: number[]): { min: number; max: number } {
  return { min: Math.min(...values), max: Math.max(...values) };
}

// ------------------------------------------------------------
// Normalisation precomputation
// ------------------------------------------------------------

function precomputeNorms(districts: District[]): NormStats {
  const ageingValues = districts
    .map(d => d.ageing_building_share)
    .filter((v): v is number => v !== undefined);

  return {
    density_log: bounds(districts.map(d => Math.log10(d.density))),
    area:        bounds(districts.map(d => d.area_km2)),
    pct_over65:  bounds(districts.map(d => d.pct_over65)),
    residential: bounds(districts.map(d => d.land.residential)),
    // Only computed when all 18 districts carry the optional field
    ageing: ageingValues.length === districts.length ? bounds(ageingValues) : undefined,
  };
}

// ------------------------------------------------------------
// Scoring
// ------------------------------------------------------------

function computeScore(
  district: District,
  scenario: Scenario,
  norms: NormStats,
): ScoreResult {
  const { target, weights } = scenario;
  const d = district;

  // --- Raw normalised values (each in [0, 1]) ---

  // displacement: low density = high score (fewer people to displace)
  const displacementNorm = 1 - minmax(Math.log10(d.density), norms.density_log);

  // age: higher % over-65 = higher score (displacement-sensitivity signal)
  const ageNorm = minmax(d.pct_over65, norms.pct_over65);

  // headroom: convertible residential land × room left to grow in the target category.
  // The (1 - land[target]) factor is the correctness fix: a district already 50% green
  // should NOT score high as a green-expansion candidate.
  const headroomNorm =
    minmax(d.land.residential, norms.residential) * (1 - d.land[target as LandCategory]);

  // area: larger district = more aggregate impact
  const areaNorm = minmax(d.area_km2, norms.area);

  // --- Build term list ---

  const rawTerms: Array<{ key: ScoreTerm['key']; weight: number; norm: number; displayValue: string }> = [
    {
      key:          'low_density',
      weight:       weights.displacement,
      norm:         displacementNorm,
      displayValue: `${d.density.toLocaleString('en-HK')} /km²`,
    },
    {
      key:          'age_factor',
      weight:       weights.age,
      norm:         ageNorm,
      displayValue: `${d.pct_over65.toFixed(1)}% aged 65+`,
    },
    {
      key:          'headroom',
      weight:       weights.headroom,
      norm:         headroomNorm,
      displayValue: `${((1 - d.land[target as LandCategory]) * 100).toFixed(0)}% headroom for ${target}`,
    },
    {
      key:          'large_area',
      weight:       weights.area,
      norm:         areaNorm,
      displayValue: `${d.area_km2.toFixed(1)} km²`,
    },
  ];

  // Optional renewal term — only when the scenario requests it AND data is present
  if (weights.renewal !== undefined && d.ageing_building_share !== undefined && norms.ageing) {
    const renewalNorm = minmax(d.ageing_building_share, norms.ageing);
    rawTerms.push({
      key:          'ageing_stock',
      weight:       weights.renewal,
      norm:         renewalNorm,
      displayValue: `${(d.ageing_building_share * 100).toFixed(0)}% ageing building stock`,
    });
  }

  // --- Normalise weights so they always sum to 1 ---
  const totalWeight = rawTerms.reduce((sum, t) => sum + t.weight, 0);

  const terms: ScoreTerm[] = rawTerms
    .map(t => ({
      key:           t.key,
      contribution:  (t.weight / totalWeight) * t.norm,
      display_value: t.displayValue,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const score = terms.reduce((sum, t) => sum + t.contribution, 0);

  return {
    score,
    terms,
    top_reasons: terms.slice(0, 3),
  };
}

// ------------------------------------------------------------
// Public factory
// ------------------------------------------------------------

/**
 * Call once at app startup with the full district array.
 * The returned `score` function is bound to the precomputed normalisation
 * stats and is safe to call on every scenario switch with no overhead.
 *
 * @example
 * const scorer = createScorer(geojson.features.map(f => f.properties));
 * const result = scorer.score(district, activeScenario);
 */
export function createScorer(districts: District[]): Scorer {
  const norms = precomputeNorms(districts);
  return {
    score: (district, scenario) => computeScore(district, scenario, norms),
    norms,
  };
}
