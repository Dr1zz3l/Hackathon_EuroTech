/**
 * llm.ts — thin client for the FastAPI LLM layer.
 *
 * Both functions throw on any failure (non-200, timeout, parse error)
 * so callers can catch and degrade gracefully — the UI never blocks on LLM.
 *
 * Base path is `/api`, which Vite proxies to localhost:8000 in development.
 * In production set VITE_API_BASE if the backend is on a different origin.
 */

import type { LandCategory, Scenario, ScoreResult, WeightSet } from '../types'

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
  target: LandCategory
  weight_overrides: Partial<WeightSet>
  horizon_year: number
  label: string
  rationale: string
}

export async function parseGoal(text: string, locale: 'en' | 'yue'): Promise<GoalParse> {
  const res = await apiFetch('/parse-goal', { text, locale })
  return res.json() as Promise<GoalParse>
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
const BASE_WEIGHTS: WeightSet = {
  displacement: 0.25,
  age:          0.25,
  headroom:     0.25,
  area:         0.25,
}

/**
 * Merge the LLM weight_overrides into the neutral base and return a
 * full Scenario object with id:'custom' that can be fed directly to
 * createScorer / setActiveScenario.
 */
export function buildSyntheticScenario(parse: GoalParse): Scenario {
  const merged: WeightSet = { ...BASE_WEIGHTS }
  const ov = parse.weight_overrides
  if (ov.displacement != null) merged.displacement = ov.displacement
  if (ov.age          != null) merged.age          = ov.age
  if (ov.headroom     != null) merged.headroom     = ov.headroom
  if (ov.area         != null) merged.area         = ov.area
  if (ov.renewal      != null) merged.renewal      = ov.renewal

  return {
    id:              'custom',
    target:          parse.target,
    weights:         merged,
    // Preset scenarios use i18n keys — for custom the raw label string IS
    // the display text. The t() lookup falls back to the raw key if it
    // doesn't match, so passing the label string directly renders correctly.
    label_key:       parse.label,
    description_key: parse.rationale,
    horizon_year:    parse.horizon_year,
    custom_label:    parse.label,
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
