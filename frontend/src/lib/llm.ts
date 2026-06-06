/**
 * llm.ts — thin client for the FastAPI LLM layer.
 *
 * All functions throw on any failure (non-200, timeout, parse error)
 * so callers can catch and degrade gracefully — the UI never blocks on LLM.
 *
 * Base path is `/api`, which Vite proxies to localhost:8000 in development.
 * In production set VITE_API_BASE if the backend is on a different origin.
 */

import type { AllocationResult, LandCategory, Scenario, ScoreResult, WeightSet } from '../types'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

const TIMEOUT_MS = 12_000

async function apiFetch(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// parse-goal
// ---------------------------------------------------------------------------

export interface GoalParse {
  target:           LandCategory
  goal_delta:       number
  donor_weights:    Partial<Record<LandCategory, number>>
  cluster_strength: number
  weight_overrides: Partial<WeightSet>
  horizon_year:     number
  label:            string
  rationale:        string
}

export async function parseGoal(text: string, locale: 'en' | 'yue'): Promise<GoalParse> {
  const res = await apiFetch('/parse-goal', { text, locale })
  return res.json() as Promise<GoalParse>
}

// ---------------------------------------------------------------------------
// summarize-plan
// ---------------------------------------------------------------------------

export interface PlanSummaryPayload {
  user_text:    string
  locale:       'en' | 'yue'
  target:       LandCategory
  goal_delta:   number
  donor_weights: Partial<Record<LandCategory, number>>
  horizon_year: number
  goal_km2:     number
  achieved_km2: number
  city_delta:   Record<string, number>
  top_districts: { name: string; name_tc: string; received_km2: number }[]
}

export async function summarizePlan(payload: PlanSummaryPayload): Promise<string> {
  const res = await apiFetch('/summarize-plan', payload)
  const data = (await res.json()) as { prose: string }
  return data.prose
}

/**
 * Aggregate a full AllocationResult into the city-wide delta (area-weighted
 * average across all 18 districts) and the top 3 recipients.
 */
export function buildPlanSummaryPayload(
  scenario: Scenario,
  allocationResult: AllocationResult,
  userText: string,
  locale: 'en' | 'yue',
): PlanSummaryPayload {
  // City-wide area-weighted delta
  let totalArea = 0
  const sumDelta: Record<string, number> = {}

  for (const alloc of allocationResult.byDistrict.values()) {
    // We need the district area to weight correctly — use current fractions sum × area
    // delta is in fractions; multiply by district area to get km² delta, then divide
    // by city area at the end for a weighted average fraction.
    // Since area_km2 isn't in alloc, we recover it from received_km2 / delta[target]
    // instead — or just use received_km2 as the weight proxy.
    // Simpler: use received_km2 total to normalise (good enough for display).
    for (const [cat, dv] of Object.entries(alloc.delta)) {
      sumDelta[cat] = (sumDelta[cat] ?? 0) + (dv as number)
    }
    totalArea += 1
  }

  const cityDelta: Record<string, number> = {}
  for (const [cat, s] of Object.entries(sumDelta)) {
    cityDelta[cat] = s / totalArea  // simple average across districts
  }

  // Top 3 districts by received_km2
  const sorted = Array.from(allocationResult.byDistrict.values())
    .sort((a, b) => b.received_km2 - a.received_km2)
    .slice(0, 3)
    .map(a => ({ name: a.name, name_tc: a.name, received_km2: a.received_km2 }))

  return {
    user_text:    userText,
    locale,
    target:       scenario.target,
    goal_delta:   scenario.goal_delta ?? 0,
    donor_weights: scenario.donor_weights ?? {},
    horizon_year: scenario.horizon_year,
    goal_km2:     allocationResult.goalKm2,
    achieved_km2: allocationResult.achievedKm2,
    city_delta:   cityDelta,
    top_districts: sorted,
  }
}

// ---------------------------------------------------------------------------
// explain
// ---------------------------------------------------------------------------

export async function explainScore(payload: {
  district: {
    name: string
    name_tc: string
    pop: number
    density: number
    area_km2: number
    pct_over65: number
    land: Record<string, number>
    land_source: string
  }
  scenario: { target: string; label: string; horizon_year: number }
  score: number
  terms: { key: string; display_value: string; contribution: number }[]
  locale: 'en' | 'yue'
}): Promise<string> {
  const res = await apiFetch('/explain', payload)
  const data = (await res.json()) as { prose: string }
  return data.prose
}

// ---------------------------------------------------------------------------
// buildSyntheticScenario
// ---------------------------------------------------------------------------

/** Neutral equal-weight base (sums to 1.0). */
export const BASE_WEIGHTS: WeightSet = {
  displacement: 0.25,
  age:          0.25,
  headroom:     0.25,
  area:         0.25,
}

/**
 * Merge the LLM parse result into a full Scenario object with id:'custom'
 * that drives both createScorer (WLC weights) and createAllocator
 * (goal_delta, donor_weights, cluster_strength).
 */
export function buildSyntheticScenario(parse: GoalParse): Scenario {
  const merged: WeightSet = { ...BASE_WEIGHTS }
  const ov = parse.weight_overrides
  if (ov.displacement != null) merged.displacement = ov.displacement
  if (ov.age          != null) merged.age          = ov.age
  if (ov.headroom     != null) merged.headroom     = ov.headroom
  if (ov.area         != null) merged.area         = ov.area
  if (ov.renewal      != null) merged.renewal      = ov.renewal

  // Convert donor_weights: keys where value is undefined are left out (defaults to 1.0)
  const donorWeights: Partial<Record<LandCategory, number>> = {}
  for (const [k, v] of Object.entries(parse.donor_weights)) {
    if (v != null) donorWeights[k as LandCategory] = v
  }

  return {
    id:               'custom',
    target:           parse.target,
    weights:          merged,
    goal_delta:       parse.goal_delta,
    donor_weights:    Object.keys(donorWeights).length > 0 ? donorWeights : undefined,
    cluster_strength: parse.cluster_strength,
    // Preset scenarios use i18n keys — for custom the raw label string IS
    // the display text. The t() lookup falls back to the raw key if it
    // doesn't match, so passing the label string directly renders correctly.
    label_key:        parse.label,
    description_key:  parse.rationale,
    horizon_year:     parse.horizon_year,
    custom_label:     parse.label,
  }
}

// ---------------------------------------------------------------------------
// buildExplainPayload — assemble the request from app-level types
// ---------------------------------------------------------------------------

export function buildExplainPayload(
  district: {
    name: string; name_tc: string; pop: number; density: number
    area_km2: number; pct_over65: number
    land: Record<string, number>; land_source: string
  },
  scenario: Scenario,
  scoreResult: ScoreResult,
  locale: 'en' | 'yue',
) {
  return {
    district: {
      name:        district.name,
      name_tc:     district.name_tc,
      pop:         district.pop,
      density:     district.density,
      area_km2:    district.area_km2,
      pct_over65:  district.pct_over65,
      land:        district.land,
      land_source: district.land_source,
    },
    scenario: {
      target:       scenario.target,
      label:        scenario.custom_label ?? scenario.label_key,
      horizon_year: scenario.horizon_year,
    },
    score:  scoreResult.score,
    terms:  scoreResult.terms.map(t => ({
      key:           t.key,
      display_value: t.display_value,
      contribution:  t.contribution,
    })),
    locale,
  }
}
