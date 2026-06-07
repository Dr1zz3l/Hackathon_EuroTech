'use client'

/**
 * ForecastPanel — the right-panel "Forecast" tab.
 *
 * For the selected district / neighbourhood, projects a chosen metric over a
 * horizon (Low / Expected / High) using the TabPFN-assisted /api/forecast
 * engine, and renders:
 *   - metric + horizon controls
 *   - a headline (baseline → projected, with range)
 *   - a band+line area chart (Recharts)
 *   - TabPFN-predicted future indicators
 *   - rules-based recommendations / warnings (housing, ageing, …)
 *
 * Visual system: Vercel light canvas. The chart is themed to match (hairlines,
 * mono ticks, brand-gradient band, ink mid-line). Renders only after data loads,
 * which also avoids any SSR sizing quirks from Recharts.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { useI18n } from '../context/I18nContext'
import type { District } from '../types'
import {
  fetchForecast, formatTick, formatValue,
  type ForecastResult, type Severity, type ValueKind,
} from '../lib/forecast'
import { BoltIcon } from './Icons'

interface ForecastPanelProps {
  district: District | null
  /** Optional agent-driven request (target/horizon); applied when nonce changes. */
  requested?: { target?: string; horizon?: number; nonce?: number }
}

const METRICS: { key: string; label: string }[] = [
  { key: 'pop',         label: 'Population' },
  { key: 'median_age',  label: 'Median age' },
  { key: 'pct_over65',  label: 'Elderly %' },
  { key: 'density',     label: 'Density' },
]
const HORIZONS = [5, 10, 15]

const SEVERITY: Record<Severity, { color: string; label: string }> = {
  critical: { color: '#ee0000', label: 'Critical' },
  warning:  { color: '#f5a623', label: 'Warning' },
  info:     { color: '#0070f3', label: 'Insight' },
}

export default function ForecastPanel({ district, requested }: ForecastPanelProps) {
  const { t } = useI18n()
  const [target, setTarget] = useState('pop')
  const [horizon, setHorizon] = useState(10)
  const [data, setData] = useState<ForecastResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastNonce = useRef<number | undefined>(undefined)

  // Apply an agent-driven request (e.g. "predict population of Sha Tin").
  useEffect(() => {
    if (requested && requested.nonce !== lastNonce.current) {
      lastNonce.current = requested.nonce
      if (requested.target) setTarget(requested.target)
      if (requested.horizon) setHorizon(requested.horizon)
    }
  }, [requested])

  const granularity: 'district' | 'neighbourhood' = district?.tpu_code ? 'neighbourhood' : 'district'

  // Fetch whenever the selected area / metric / horizon changes.
  useEffect(() => {
    if (!district) { setData(null); setError(null); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchForecast({ unit: district.name, granularity, target, horizon_years: horizon }, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        if (res.error) { setError(res.error); setData(null) }
        else { setData(res); setError(null) }
      })
      .catch((e: unknown) => {
        // Ignore aborts from rapid re-renders / param changes — not real errors.
        if (controller.signal.aborted || (e as { name?: string })?.name === 'AbortError') return
        setError(t('forecast.error'))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [district, granularity, target, horizon, t])

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!district) {
    return (
      <div className="relative h-full overflow-hidden flex flex-col">
        <div className="absolute inset-0 bg-brand-mesh-soft opacity-80 pointer-events-none" />
        <div className="relative flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-[220px]">
            <p className="eyebrow mb-3">{t('forecast.eyebrow')}</p>
            <h3 className="display-md mb-2">{t('forecast.empty.title')}</h3>
            <p className="text-[13px] text-mute tracking-body-sm leading-snug">{t('forecast.empty.sub')}</p>
          </div>
        </div>
      </div>
    )
  }

  const kind: ValueKind = data?.value_kind ?? 'count'
  const chartData = data?.trajectory.map(p => ({ year: p.year, range: [p.low, p.high], mid: p.mid })) ?? []
  const pct = data ? data.endpoint.pct_change_mid : 0
  const up = pct >= 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Header: area + controls ─────────────────────────────────────── */}
      <div className="shrink-0 p-4 pb-3 border-b border-hairline">
        <p className="eyebrow mb-1">{t('forecast.eyebrow')}</p>
        <h3 className="display-sm leading-tight truncate">{district.name}</h3>

        {/* Metric pills */}
        <div className="mt-3 flex flex-wrap gap-1">
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => setTarget(m.key)}
              className={`
                h-7 px-2.5 rounded-full text-[11px] font-medium tracking-body-sm transition-colors
                ${target === m.key
                  ? 'bg-ink text-canvas'
                  : 'bg-canvas-soft-2 text-mute hover:text-ink'}
              `}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Horizon segmented */}
        <div className="mt-2 flex items-center gap-1">
          <span className="eyebrow text-[9px] mr-1">{t('forecast.horizon')}</span>
          {HORIZONS.map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`
                h-6 px-2 rounded-md text-[11px] font-mono tabular-nums transition-colors
                ${horizon === h
                  ? 'bg-canvas text-ink shadow-hairline-inset'
                  : 'text-mute hover:text-ink'}
              `}
            >
              {h}y
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading / error ─────────────────────────────────────────────── */}
      {loading && (
        <div className="p-4 space-y-3">
          <div className="h-8 w-1/2 rounded bg-canvas-soft-2 animate-pulse" />
          <div className="h-[160px] rounded bg-canvas-soft-2 animate-pulse" />
          <div className="h-16 rounded bg-canvas-soft-2 animate-pulse" />
        </div>
      )}
      {error && !loading && (
        <div className="p-4">
          <p className="text-[12px] text-error">{error}</p>
        </div>
      )}

      {/* ── Loaded ──────────────────────────────────────────────────────── */}
      {data && !loading && (
        <div className="p-4 space-y-5">

          {/* Headline */}
          <div>
            <p className="eyebrow mb-1.5">
              {data.target_description} · {data.horizon_year}
            </p>
            <div className="flex items-end gap-2">
              <span className="display-lg tabular-nums">{formatValue(data.endpoint.mid, kind)}</span>
              <span
                className="mb-1.5 text-[12px] font-mono font-medium px-1.5 py-0.5 rounded-sm"
                style={{
                  color: up ? '#0a7c33' : '#ee0000',
                  background: up ? 'rgba(80,227,194,0.15)' : 'rgba(238,0,0,0.10)',
                }}
              >
                {up ? '▲' : '▼'} {(pct * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] text-mute mt-1 tracking-body-sm">
              {t('forecast.from')} {formatValue(data.baseline, kind)} ({data.base_year}) ·{' '}
              {t('forecast.range')} {formatValue(data.endpoint.low, kind, { compact: true })}–{formatValue(data.endpoint.high, kind, { compact: true })}
            </p>

            {/* Basis chip — measured census trend vs structural model estimate */}
            <span
              className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium tracking-body-sm"
              style={{
                color: data.basis === 'historical' ? '#0a7c33' : '#8a6d1f',
                background: data.basis === 'historical' ? 'rgba(80,227,194,0.16)' : 'rgba(245,166,35,0.14)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: data.basis === 'historical' ? '#0a7c33' : '#f5a623' }}
              />
              {data.basis_label}
            </span>
          </div>

          {/* Chart */}
          <div className="h-[170px] -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="fcBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0070f3" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#0070f3" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ebebeb" vertical={false} />
                <XAxis
                  dataKey="year" type="number" domain={['dataMin', 'dataMax']}
                  ticks={[data.base_year, data.base_year + Math.round(data.horizon_years / 2), data.horizon_year]}
                  tick={{ fontSize: 10, fill: '#888888', fontFamily: 'var(--font-geist-mono), monospace' }}
                  tickLine={false} axisLine={{ stroke: '#ebebeb' }}
                />
                <YAxis
                  width={38} domain={['auto', 'auto']}
                  tickFormatter={(v: number) => formatTick(v, kind)}
                  tick={{ fontSize: 10, fill: '#888888', fontFamily: 'var(--font-geist-mono), monospace' }}
                  tickLine={false} axisLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null
                    const row = payload[0]?.payload as { mid: number; range: [number, number] }
                    return (
                      <div className="bg-canvas rounded-md shadow-modal px-2.5 py-1.5 text-[11px]">
                        <div className="font-mono text-mute mb-0.5">{label}</div>
                        <div className="font-medium text-ink tabular-nums">{formatValue(row.mid, kind)}</div>
                        <div className="text-mute tabular-nums">
                          {formatValue(row.range[0], kind, { compact: true })}–{formatValue(row.range[1], kind, { compact: true })}
                        </div>
                      </div>
                    )
                  }}
                />
                <Area type="monotone" dataKey="range" stroke="none" fill="url(#fcBand)" isAnimationActive={false} />
                <Line type="monotone" dataKey="mid" stroke="#0070f3" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Future indicators (TabPFN what-if) */}
          {(data.future_indicators.median_age != null || data.future_indicators.pct_over65 != null) && (
            <div>
              <p className="eyebrow mb-2">{t('forecast.future')} · {data.horizon_year}</p>
              <div className="grid grid-cols-3 gap-2">
                <Indicator label={t('panel.median_age')} value={data.future_indicators.median_age != null ? `${data.future_indicators.median_age.toFixed(1)}` : '—'} />
                <Indicator label={t('panel.pct_over65')} value={data.future_indicators.pct_over65 != null ? `${data.future_indicators.pct_over65.toFixed(0)}%` : '—'} />
                <Indicator label={t('panel.density')} value={data.future_indicators.density != null ? new Intl.NumberFormat('en', { notation: 'compact' }).format(data.future_indicators.density) : '—'} />
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <p className="eyebrow mb-2">{t('forecast.recs')}</p>
            <div className="space-y-2">
              {data.recommendations.map((r, i) => {
                const s = SEVERITY[r.severity]
                return (
                  <div
                    key={i}
                    className="rounded-md p-2.5 pl-3"
                    style={{ background: `${s.color}0f`, borderLeft: `2px solid ${s.color}` }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="eyebrow text-[9px]" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <p className="text-[12px] font-medium text-ink tracking-body-sm leading-snug mb-0.5">{r.title}</p>
                    <p className="text-[11.5px] text-body tracking-body-sm leading-relaxed">{r.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Provenance + assumptions */}
          <div className="pt-1 border-t border-hairline">
            <div className="flex items-center gap-1.5 mb-1.5">
              <BoltIcon size={11} />
              <span className="eyebrow text-[9px]">{data.model} · {t('forecast.estimate')}</span>
            </div>
            <ul className="space-y-0.5">
              {data.assumptions.map((a, i) => (
                <li key={i} className="text-[10px] text-mute leading-snug tracking-body-sm">• {a}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-canvas-soft border border-hairline p-2 text-center">
      <div className="text-[15px] font-semibold tabular-nums text-ink leading-none mb-1">{value}</div>
      <div className="eyebrow text-[8px] truncate">{label}</div>
    </div>
  )
}
