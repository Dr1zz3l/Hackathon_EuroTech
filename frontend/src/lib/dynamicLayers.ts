/**
 * dynamicLayers.ts — pure model + helpers for AI-agent-created map layers.
 *
 * The conversational assistant can ask the app to drop extra analytical layers
 * on the map (e.g. "show me a heatmap of the densest areas"). Each request is
 * validated into a `DynamicLayer` spec here; MapView turns the spec into a
 * Leaflet layer (heat / choropleth / bubble) — see buildDynamicLayer in MapView.
 *
 * This file is intentionally free of any runtime Leaflet import (type-only),
 * so it is safe to import from server-rendered modules.
 */

import type { District } from '../types'

// ─── Layer model ────────────────────────────────────────────────────────────

export type DynamicLayerType = 'heatmap' | 'choropleth' | 'bubble'
export type DynGranularity = 'district' | 'neighbourhood'

/** A validated, render-ready agent layer. App owns an array of these. */
export interface DynamicLayer {
  /** Stable unique id (App-assigned). */
  id: string
  type: DynamicLayerType
  /** A metric key from METRICS (e.g. 'density', 'pct_over65', 'land.recreational'). */
  metric: string
  granularity: DynGranularity
  /** Human label for the layer row + legend. */
  label: string
  /** Accent colour (hex) — bubble fill / legend accent. */
  color: string
  visible: boolean
  /** 0–1 alpha multiplier. */
  opacity: number
}

/** Loose shape of the agent's `add_layer` tool input (all fields optional/strings). */
export interface AddLayerInput {
  type?: string
  metric?: string
  granularity?: string
  label?: string
  color?: string
}

// ─── Metric catalogue (mirrors backend llm/data.py ALL_METRICS) ─────────────

type MetricKind = 'count' | 'percent' | 'fraction' | 'age' | 'density' | 'area'

interface MetricMeta {
  label: string
  kind: MetricKind
  /** Only at district level (absent on STPU neighbourhoods). */
  districtOnly?: boolean
}

const METRICS: Record<string, MetricMeta> = {
  pop:                   { label: 'Population',           kind: 'count' },
  density:               { label: 'Population density',   kind: 'density' },
  pct_over65:            { label: 'Share aged 65+',       kind: 'percent' },
  median_age:            { label: 'Median age',           kind: 'age' },
  area_km2:              { label: 'Area',                 kind: 'area' },
  ageing_building_share: { label: 'Ageing building share', kind: 'fraction', districtOnly: true },
  'land.residential':    { label: 'Residential land',                       kind: 'fraction' },
  'land.industrial':     { label: 'Industrial land',                         kind: 'fraction' },
  'land.commercial':     { label: 'Commercial land',                         kind: 'fraction' },
  'land.agricultural':   { label: 'Agricultural land (farmland/fish ponds)', kind: 'fraction' },
  'land.recreational':   { label: 'Recreational / open / green space',       kind: 'fraction' },
  'land.institutional':  { label: 'Institutional land (GIC)',                kind: 'fraction' },
  'land.misc':           { label: 'Miscellaneous land',                      kind: 'fraction' },
  'land.infrastructure': { label: 'Infrastructure',                          kind: 'fraction' },
  'land.protected':      { label: 'Protected land (country parks)',          kind: 'fraction' },
}

export const VALID_METRICS = Object.keys(METRICS)

export function isValidMetric(metric: string): boolean {
  return metric in METRICS
}

export function metricLabel(metric: string): string {
  return METRICS[metric]?.label ?? metric
}

/** Resolve a metric path ('density' or 'land.recreational') to a number, or null. */
export function metricValue(props: District, metric: string): number | null {
  let val: unknown
  if (metric.startsWith('land.')) {
    const key = metric.slice(5) as keyof District['land']
    val = props.land?.[key]
  } else {
    val = (props as unknown as Record<string, unknown>)[metric]
  }
  return typeof val === 'number' && Number.isFinite(val) ? val : null
}

/** Pretty-print a metric value for tooltips / legend bounds. */
export function formatMetricValue(metric: string, value: number): string {
  const kind = METRICS[metric]?.kind ?? 'count'
  switch (kind) {
    case 'count':   return Math.round(value).toLocaleString()
    case 'density': return `${Math.round(value).toLocaleString()}/km²`
    case 'percent': return `${value.toFixed(1)}%`
    case 'age':     return `${value.toFixed(1)} yrs`
    case 'area':    return `${value.toFixed(1)} km²`
    case 'fraction':return `${Math.round(value * 100)}%`
    default:        return String(value)
  }
}

// ─── Colour ramps ────────────────────────────────────────────────────────────

type Stop = [number, [number, number, number]]

/** YlOrRd-style sequential ramp for choropleth fills. */
const CHORO_STOPS: Stop[] = [
  [0.0, [255, 255, 178]],
  [0.25, [254, 204, 92]],
  [0.5, [253, 141, 60]],
  [0.75, [240, 59, 32]],
  [1.0, [189, 0, 38]],
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interpolate(stops: Stop[], tRaw: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, tRaw))
  for (let i = 1; i < stops.length; i++) {
    const [p0, c0] = stops[i - 1]
    const [p1, c1] = stops[i]
    if (t <= p1) {
      const k = (t - p0) / (p1 - p0 || 1)
      return [
        Math.round(lerp(c0[0], c1[0], k)),
        Math.round(lerp(c0[1], c1[1], k)),
        Math.round(lerp(c0[2], c1[2], k)),
      ]
    }
  }
  return stops[stops.length - 1][1]
}

/** Sequential heat colour for a normalised [0,1] value. */
export function rampColor(t: number): string {
  const [r, g, b] = interpolate(CHORO_STOPS, t)
  return `rgb(${r},${g},${b})`
}

/** CSS gradient string for the legend ramp. */
export function rampCssGradient(): string {
  const stops = CHORO_STOPS.map(([p, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(p * 100)}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** Gradient object for leaflet.heat (brand-warm, transparent → hot). */
export const HEAT_GRADIENT: Record<number, string> = {
  0.0: 'rgba(0,112,243,0)',
  0.3: '#0070f3',
  0.5: '#50e3c2',
  0.7: '#f5a623',
  0.9: '#ff0080',
  1.0: '#ee0000',
}

// ─── Defaults + validation ───────────────────────────────────────────────────

const TYPE_DEFAULT_COLOR: Record<DynamicLayerType, string> = {
  heatmap: '#ee0000',
  choropleth: '#fd8d3c',
  bubble: '#0070f3',
}

function coerceType(raw: string | undefined): DynamicLayerType {
  const t = (raw ?? '').toLowerCase()
  if (t === 'heatmap' || t === 'heat') return 'heatmap'
  if (t === 'bubble' || t === 'bubbles' || t === 'proportional') return 'bubble'
  return 'choropleth'
}

/** One-line subtitle for the Layers panel row. */
export function describeLayer(layer: DynamicLayer): string {
  const typeLabel =
    layer.type === 'heatmap' ? 'Heatmap' : layer.type === 'bubble' ? 'Bubbles' : 'Choropleth'
  const level = layer.granularity === 'neighbourhood' ? 'neighbourhood' : 'district'
  return `${typeLabel} · ${level}`
}

export interface ValidateResult {
  layer?: DynamicLayer
  error?: string
}

/**
 * Validate an agent `add_layer` request into a render-ready spec.
 * `id` is supplied by the caller; `hasNbhd` reports whether STPU data is loaded.
 */
export function validateAddLayer(
  input: AddLayerInput,
  id: string,
  hasNbhd: boolean,
): ValidateResult {
  const metric = (input.metric ?? '').trim()
  if (!isValidMetric(metric)) {
    return { error: `Unknown metric "${metric}". Valid metrics: ${VALID_METRICS.join(', ')}.` }
  }

  const type = coerceType(input.type)

  // Granularity: honour the request, but fall back to district when STPU data
  // is missing or the metric only exists at district level. Heatmaps look best
  // at neighbourhood resolution, so default to it when unspecified + available.
  let granularity: DynGranularity =
    input.granularity === 'neighbourhood' || input.granularity === 'district'
      ? input.granularity
      : type === 'heatmap'
        ? 'neighbourhood'
        : 'district'
  if (METRICS[metric].districtOnly) granularity = 'district'
  if (granularity === 'neighbourhood' && !hasNbhd) granularity = 'district'

  const color = (input.color ?? '').trim() || TYPE_DEFAULT_COLOR[type]
  const label = (input.label ?? '').trim() || metricLabel(metric)

  return {
    layer: { id, type, metric, granularity, label, color, visible: true, opacity: 1 },
  }
}
