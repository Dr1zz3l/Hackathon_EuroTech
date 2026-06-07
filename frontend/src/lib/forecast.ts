/**
 * forecast.ts — client for the TabPFN-assisted forecast endpoint (/api/forecast).
 *
 * Mirrors backend/llm/forecast.run_forecast. The Forecast tab calls this when a
 * district/neighbourhood is selected; results drive the chart + recommendations.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string | undefined) ?? ''
const TIMEOUT_MS = 30_000

export type ValueKind = 'count' | 'per_km2' | 'years' | 'percent' | 'km2' | 'fraction'
export type Severity = 'info' | 'warning' | 'critical'

export interface ForecastPoint { year: number; low: number; mid: number; high: number }

export interface Recommendation { severity: Severity; title: string; detail: string }

export interface ForecastResult {
  unit: string
  name_tc?: string
  granularity: 'district' | 'neighbourhood'
  target: string
  target_description: string
  value_kind: ValueKind
  base_year: number
  horizon_year: number
  horizon_years: number
  baseline: number
  basis: 'historical' | 'structural'
  basis_label: string
  history: { year_first: number; year_last: number; cagr: number; n_points: number } | null
  annual_rate_mid: number
  endpoint: { low: number; mid: number; high: number; pct_change_mid: number }
  trajectory: ForecastPoint[]
  future_indicators: { median_age: number | null; pct_over65: number | null; density: number | null }
  housing: {
    household_size: number
    baseline_pop: number
    projected_pop: number
    added_residents: number
    current_homes: number
    new_homes_needed: number
    residential_share: number
    density: number
    density_high: boolean
  }
  recommendations: Recommendation[]
  model: string
  assumptions: string[]
  note: string
  error?: string
}

export interface ForecastQuery {
  unit: string
  granularity: 'district' | 'neighbourhood'
  target?: string
  horizon_years?: number
}

export async function fetchForecast(q: ForecastQuery, signal?: AbortSignal): Promise<ForecastResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  // Chain an external abort (component unmount / param change) into ours.
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const res = await fetch(`${API_BASE}/api/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unit: q.unit,
        granularity: q.granularity,
        target: q.target ?? 'pop',
        horizon_years: q.horizon_years ?? 10,
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as ForecastResult
  } finally {
    clearTimeout(timer)
  }
}

// ── Formatting helpers (shared by the panel + chart) ────────────────────────

export function formatValue(v: number, kind: ValueKind, opts: { compact?: boolean } = {}): string {
  switch (kind) {
    case 'count':
      return opts.compact
        ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
        : Math.round(v).toLocaleString('en')
    case 'per_km2':
      return `${Math.round(v).toLocaleString('en')}/km²`
    case 'years':
      return `${v.toFixed(1)} yrs`
    case 'percent':
      return `${v.toFixed(1)}%`
    case 'km2':
      return `${v.toFixed(1)} km²`
    case 'fraction':
      return `${(v * 100).toFixed(0)}%`
    default:
      return String(v)
  }
}

/** Compact axis-tick formatter. */
export function formatTick(v: number, kind: ValueKind): string {
  if (kind === 'fraction') return `${Math.round(v * 100)}%`
  if (kind === 'count' || kind === 'per_km2') {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 }).format(v)
  }
  return `${Math.round(v)}`
}
