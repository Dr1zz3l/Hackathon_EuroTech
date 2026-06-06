/**
 * Pre-defined planning scenarios for the HK District Viability map.
 *
 * AGENT A PLACEHOLDER — weights are Stage-0 hand-set values.
 * Replace with AHP-derived weights from weights_ahp.py (Stage 1).
 * Land-use fractions in districts.geojson are also heuristic; replace
 * with raster_2024 values from build_data.py when the pipeline lands.
 *
 * Contract: imports only from '../types' (shared contract file).
 * Do not edit without coordinating with Agent B.
 */

import type { Scenario } from './types';

// ---------------------------------------------------------------------------
// Stage-0 hand-set weight sets
//
// Weights express relative importance; scoring.ts normalises them to sum = 1
// internally, so absolute magnitudes don't matter — only ratios do.
//
// Stage 1 (AHP): run  python3 weights_ahp.py  and paste the output here.
// ---------------------------------------------------------------------------

/** Green HK 2050 — headroom + area dominant. */
const greenHk2050: Scenario = {
  id:              'green_hk_2050',
  target:          'green',
  weights: {
    displacement: 0.20,
    age:          0.15,
    headroom:     0.40,
    area:         0.25,
  },
  label_key:       'scenario.green_hk_2050.label',
  description_key: 'scenario.green_hk_2050.description',
  horizon_year:    2050,
};

/** Industrial Growth — area + low-displacement dominant. */
const industrialGrowth: Scenario = {
  id:              'industrial_growth',
  target:          'industrial',
  weights: {
    displacement: 0.35,
    age:          0.10,
    headroom:     0.30,
    area:         0.25,
  },
  label_key:       'scenario.industrial_growth.label',
  description_key: 'scenario.industrial_growth.description',
  horizon_year:    2040,
};

/** Education Hub — headroom dominant. */
const educationHub: Scenario = {
  id:              'education_hub',
  target:          'educational',
  weights: {
    displacement: 0.15,
    age:          0.20,
    headroom:     0.45,
    area:         0.20,
  },
  label_key:       'scenario.education_hub.label',
  description_key: 'scenario.education_hub.description',
  horizon_year:    2035,
};

/** Urban Renewal — age proxy for renewal need, displacement-sensitive. */
const urbanRenewal: Scenario = {
  id:              'urban_renewal',
  target:          'residential',
  weights: {
    displacement: 0.25,
    age:          0.35,
    headroom:     0.25,
    area:         0.15,
  },
  label_key:       'scenario.urban_renewal.label',
  description_key: 'scenario.urban_renewal.description',
  horizon_year:    2040,
};

/** All four scenarios in display order. */
export const SCENARIOS: Scenario[] = [
  greenHk2050,
  industrialGrowth,
  educationHub,
  urbanRenewal,
];

/** Look up a scenario by id (throws if not found). */
export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find(s => s.id === id);
  if (!s) throw new Error(`Unknown scenario id: ${id}`);
  return s;
}
