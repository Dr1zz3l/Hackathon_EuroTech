/**
 * DetailPanel — slide-in drawer showing:
 *   • Land-use donut (hand-rolled SVG)
 *   • Demographics
 *   • Viability score + top-3 reasons  (only when a scenario is active)
 *   • Provenance badge (land_source)
 */

import { useEffect, useRef, useState } from 'react'
import type { District, DistrictAllocation, LandUse, Scenario, ScoreResult, ScoreTerm } from '../types'
import type { Locale } from '../context/I18nContext'
import { useI18n } from '../context/I18nContext'
import { buildExplainPayload, explainScore } from '../lib/llm'

// ---------------------------------------------------------------------------
// Colour map (mirrors MapView + Tailwind config)
// ---------------------------------------------------------------------------
const LAND_COLOURS: Record<string, string> = {
  residential: '#f87171',
  industrial:  '#a78bfa',
  commercial:  '#fb923c',
  green:       '#4ade80',
  educational: '#60a5fa',
  other:       '#94a3b8',
}

// ---------------------------------------------------------------------------
// SVG donut helper
// ---------------------------------------------------------------------------

interface Slice {
  category: string
  fraction: number
  colour: string
}

function DonutChart({ land }: { land: LandUse }) {
  const { t } = useI18n()
  const cx = 60, cy = 60, r = 46, inner = 28
  const total = Object.values(land).reduce((a, b) => a + b, 0)
  const slices: Slice[] = (Object.entries(land) as [string, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ category: k, fraction: v / total, colour: LAND_COLOURS[k] ?? '#94a3b8' }))

  let angle = -Math.PI / 2  // start at 12 o'clock
  const paths = slices.map(sl => {
    const start = angle
    const sweep = sl.fraction * 2 * Math.PI
    angle += sweep
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const xi1 = cx + inner * Math.cos(start)
    const yi1 = cy + inner * Math.sin(start)
    const xi2 = cx + inner * Math.cos(angle)
    const yi2 = cy + inner * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0

    const d = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${xi2} ${yi2}`,
      `A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1}`,
      'Z',
    ].join(' ')

    return <path key={sl.category} d={d} fill={sl.colour} stroke="#1e293b" strokeWidth="1" />
  })

  return (
    <div className="flex gap-3 items-start">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        {paths}
      </svg>
      <div className="flex flex-col gap-1 text-xs mt-1">
        {slices.map(sl => (
          <div key={sl.category} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: sl.colour }}
            />
            <span className="text-slate-300 text-[11px]">
              {t(`land.${sl.category}`)}
            </span>
            <span className="text-slate-400 ml-auto pl-2">
              {(sl.fraction * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Score bar
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const colour = score < 0.4 ? '#93c5fd' : score < 0.65 ? '#fde68a' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: colour }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color: colour }}>
        {pct}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reason row
// ---------------------------------------------------------------------------

function ReasonRow({ term, t }: { term: ScoreTerm; t: (k: string) => string }) {
  const pct = Math.round(term.contribution * 100)
  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        className="mt-0.5 shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
      />
      <span className="text-slate-300 flex-1">
        {t(`reason.${term.key}`).replace('{value}', term.display_value)}
      </span>
      <span className="tabular-nums text-slate-500 text-[10px]">+{pct}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade list — what was given up to achieve the scenario delta
// ---------------------------------------------------------------------------

function TradeList({ allocation, t }: { allocation: DistrictAllocation; t: (k: string) => string }) {
  const entries = (Object.entries(allocation.delta) as [string, number][])
    .filter(([, v]) => Math.abs(v) >= 0.001) // skip sub-0.1% noise
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])) // largest change first

  if (entries.length === 0) return null

  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {t('panel.trade.title')}
      </h3>
      <div className="space-y-1">
        {entries.map(([cat, delta]) => {
          const pct = (delta * 100).toFixed(1)
          const isGain = delta > 0
          return (
            <div key={cat} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ background: LAND_COLOURS[cat] ?? '#94a3b8' }}
              />
              <span className="text-slate-300 flex-1">{t(`land.${cat}`)}</span>
              <span
                className="tabular-nums font-medium"
                style={{ color: isGain ? '#4ade80' : '#f87171' }}
              >
                {isGain ? '+' : ''}{pct}%
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-slate-500 mt-1.5">
        {t('panel.trade.disclaimer')}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  district: District
  scenario: Scenario | null
  scoreResult: ScoreResult | null
  /** Per-district reallocation result — null for Urban Renewal or when not computed yet. */
  allocation: DistrictAllocation | null
  onClose: () => void
}

export default function DetailPanel({
  district,
  scenario,
  scoreResult,
  allocation,
  onClose,
}: DetailPanelProps) {
  const { t, locale } = useI18n()
  const displayName = locale === 'yue' ? district.name_tc : district.name

  // ---- AI explanation (Stage 2) ----
  const [aiProse, setAiProse]     = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  // Track the last fetch key so stale responses from a prior selection are dropped
  const fetchKey = useRef<string>('')

  useEffect(() => {
    if (!scenario || !scoreResult) {
      setAiProse(null)
      return
    }

    const key = `${district.name}|${scenario.id}|${scenario.target}|${scoreResult.score.toFixed(3)}|${locale}`
    if (key === fetchKey.current) return   // already fetched for this combination
    fetchKey.current = key

    setAiProse(null)
    setAiLoading(true)

    const payload = buildExplainPayload(
      { ...district, land: district.land as unknown as Record<string, number> },
      scenario,
      scoreResult,
      locale as Locale,
    )

    explainScore(payload)
      .then(prose => {
        // Only apply if the user hasn't moved to a different district/scenario
        if (fetchKey.current === key) {
          setAiProse(prose)
        }
      })
      .catch(() => {
        // Silently fail — deterministic top-3 reasons remain visible
        if (fetchKey.current === key) setAiProse(null)
      })
      .finally(() => {
        if (fetchKey.current === key) setAiLoading(false)
      })
  }, [district.name, scenario?.id, scenario?.target, scoreResult?.score, locale]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
        <div>
          <h2 className="text-base font-semibold leading-tight">{displayName}</h2>
          {scenario && (
            <p className="text-xs text-slate-400 mt-0.5">
              {t(scenario.label_key)} · {scenario.horizon_year}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white text-xl leading-none px-1"
          aria-label={t('close')}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Viability score — only when a scenario is active */}
        {scenario && scoreResult && (
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {t('panel.score')}
            </h3>
            <ScoreBar score={scoreResult.score} />
            <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
              {t('panel.score.disclaimer')}
            </p>

            {/* AI summary (Stage 2) — gracefully absent when backend is down */}
            {(aiLoading || aiProse) && (
              <div className="mt-3 p-2.5 rounded bg-slate-800 border border-slate-700">
                <h4 className="text-xs font-medium text-amber-400 mb-1.5">
                  {t('panel.ai_summary.title')}
                </h4>
                {aiLoading ? (
                  <p className="text-[10px] text-slate-500 animate-pulse">
                    {t('panel.ai_summary.loading')}
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 leading-relaxed">{aiProse}</p>
                )}
              </div>
            )}

            {/* Top reasons — always shown for transparency */}
            <div className="mt-3 space-y-2">
              <h4 className="text-xs font-medium text-slate-400">
                {t('panel.reasons.title')}
              </h4>
              {scoreResult.top_reasons.map(term => (
                <ReasonRow key={term.key} term={term} t={t} />
              ))}
            </div>
          </section>
        )}

        {/* Land-use donut — future when allocation available, else current */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {allocation ? t('panel.future.title') : t('panel.land.title')}
          </h3>
          <DonutChart land={allocation ? allocation.future : district.land} />
          {/* Provenance badge — never hidden */}
          <p className={`text-[10px] mt-2 ${
            district.land_source === 'estimated'
              ? 'text-amber-400'
              : 'text-green-400'
          }`}>
            {t(`panel.land.source.${district.land_source}`)}
          </p>
        </section>

        {/* Trade list — what was given up */}
        {allocation && (
          <TradeList allocation={allocation} t={t} />
        )}

        {/* Demographics */}
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {t('panel.demographics')}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <StatRow label={t('panel.pop')} value={district.pop.toLocaleString('en-HK')} />
            <StatRow label={t('panel.area')} value={`${district.area_km2.toFixed(1)} km²`} />
            <StatRow
              label={t('panel.density')}
              value={`${district.density.toLocaleString('en-HK')} /km²`}
            />
            <StatRow label={t('panel.median_age')} value={district.median_age.toFixed(1)} />
            <StatRow
              label={t('panel.pct_over65')}
              value={`${district.pct_over65.toFixed(1)}%`}
            />
          </div>
        </section>

      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-medium tabular-nums">{value}</span>
    </>
  )
}
