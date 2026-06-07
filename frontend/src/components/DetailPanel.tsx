'use client'

/**
 * DetailPanel — Vercel card-marketing-large chrome (see public/DESIGN-vercel.md).
 *
 * Header band hosts the subtle brand mesh gradient when a scenario is active —
 * the one explicit "brand moment" in the entire app. Everywhere else is the
 * stark canvas/ink system: mono caption-eyebrows per section, display-md
 * district names with aggressive negative tracking, hairline dividers between
 * sections, and stacked-shadow elevation rather than heavy drop-shadows.
 *
 *   • Score in display-xl (48 px, weight 600, tracking-display-xl)
 *   • ScoreBar ramp brand-aligned: link → warning → error
 *   • AI summary block (Stage 2) — light-themed, gracefully absent
 *   • Reason rows with mono percentage badges
 *   • Land-use donut: refined SVG with centered dominant% + sorted legend
 *     — shows future projected land when allocation data is present
 *   • TradeList — what was given up to achieve the scenario
 *   • Demographics in a clean 2-up stat grid
 *   • Provenance badge — never hidden
 *   • Close button → icon-button-circular ghost
 */

import type { District, DistrictAllocation, LandUse, Scenario } from '../types'
import { useI18n } from '../context/I18nContext'

// ---------------------------------------------------------------------------
// Land-use palette — keep in sync with MapView + tailwind.config theme.colors.land
// ---------------------------------------------------------------------------
const LAND_COLOURS: Record<string, string> = {
  residential:    '#ff0080',
  industrial:     '#7928ca',
  commercial:     '#f5a623',
  agricultural:   '#a3c644',
  recreational:   '#50e3c2',
  institutional:  '#0070f3',
  misc:           '#a1a1a1',
  infrastructure: '#6b7280',
  protected:      '#1d8a4e',
}

// ---------------------------------------------------------------------------
// SVG donut — Vercel brand visuals with centered dominant% label
// ---------------------------------------------------------------------------

interface Slice {
  category: string
  fraction: number
  colour: string
}

function DonutChart({ land }: { land: LandUse }) {
  const { t } = useI18n()
  const cx = 64, cy = 64, r = 52, inner = 34
  const total = Object.values(land).reduce((a, b) => a + b, 0)
  const slices: Slice[] = (Object.entries(land) as [string, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ category: k, fraction: v / total, colour: LAND_COLOURS[k] ?? '#a1a1a1' }))

  let angle = -Math.PI / 2
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

    return <path key={sl.category} d={d} fill={sl.colour} stroke="#ffffff" strokeWidth="1.5" />
  })

  const dominant = slices.reduce((a, b) => (b.fraction > a.fraction ? b : a), slices[0])

  return (
    <div className="flex gap-4 items-start">
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 128 128">
          {paths}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="eyebrow text-[9px]">{t('detail.dominant')}</span>
          <span className="text-[16px] font-semibold tracking-display-sm">
            {dominant ? Math.round(dominant.fraction * 100) : 0}%
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {slices
          .slice()
          .sort((a, b) => b.fraction - a.fraction)
          .map(sl => (
            <div key={sl.category} className="flex items-center gap-2 text-[12px]">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0 shadow-hairline-inset"
                style={{ background: sl.colour }}
              />
              <span className="text-body truncate">{t(`land.${sl.category}`)}</span>
              <span className="text-mute ml-auto font-mono tabular-nums text-[11px]">
                {(sl.fraction * 100).toFixed(1)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat row
// ---------------------------------------------------------------------------

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span className="text-[14px] font-medium text-ink tabular-nums tracking-body-sm">
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trade list — what was given up to achieve the scenario delta
// ---------------------------------------------------------------------------

function TradeList({ allocation, t }: { allocation: DistrictAllocation; t: (k: string) => string }) {
  const entries = (Object.entries(allocation.delta) as [string, number][])
    .filter(([, v]) => Math.abs(v) >= 0.001)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

  if (entries.length === 0) return null

  return (
    <section>
      <p className="eyebrow mb-3">{t('panel.trade.title')}</p>
      <div className="space-y-1.5">
        {entries.map(([cat, delta]) => {
          const pct = (delta * 100).toFixed(1)
          const isGain = delta > 0
          return (
            <div key={cat} className="flex items-center gap-2 text-[12px]">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ background: LAND_COLOURS[cat] ?? '#94a3b8' }}
              />
              <span className="text-body flex-1">{t(`land.${cat}`)}</span>
              <span
                className="tabular-nums font-mono font-medium text-[11px]"
                style={{ color: isGain ? '#16a34a' : '#dc2626' }}
              >
                {isGain ? '+' : ''}{pct}%
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-mute mt-2">
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
  /** Per-district reallocation result — null for Urban Renewal or when not computed yet. */
  allocation: DistrictAllocation | null
  onClose: () => void
}

export default function DetailPanel({
  district,
  scenario,
  allocation,
  onClose,
}: DetailPanelProps) {
  const { t, locale } = useI18n()
  const displayName = locale === 'yue' ? district.name_tc : district.name

  return (
    <div className="flex flex-col h-full bg-canvas text-ink overflow-y-auto">

      {/* ── Header band ─────────────────────────────────────────── */}
      <div className="relative shrink-0 px-6 pt-6 pb-5 hairline overflow-hidden">
        {scenario && (
          <div className="absolute inset-0 bg-brand-mesh opacity-30 pointer-events-none" />
        )}

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="eyebrow">
              {scenario
                ? `${t(scenario.label_key)} · ${scenario.horizon_year}`
                : t('detail.profile')}
            </span>
            <h2 className="display-lg truncate">{displayName}.</h2>
            {locale !== 'yue' && (
              <span className="font-mono text-[11px] text-mute mt-0.5">
                {district.name_tc}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="
              shrink-0 w-8 h-8 rounded-full
              border border-hairline bg-canvas
              text-mute hover:text-ink hover:border-hairline-strong
              flex items-center justify-center
              transition-colors
            "
            aria-label={t('close')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Body sections ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 space-y-7">

        {/* Land-use donut — future when allocation available, else current */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="eyebrow">
              {allocation ? t('panel.future.title') : t('panel.land.title')}
            </p>
            <span
              className={`
                inline-flex items-center gap-1.5
                eyebrow
                ${district.land_source === 'estimated' ? 'text-warning-deep' : 'text-link-deep'}
              `}
            >
              <span
                className={`
                  w-1.5 h-1.5 rounded-full
                  ${district.land_source === 'estimated' ? 'bg-warning' : 'bg-link'}
                `}
              />
              {district.land_source === 'estimated' ? t('detail.land.estimated') : t('detail.land.source_2024')}
            </span>
          </div>
          <DonutChart land={allocation ? allocation.future : district.land} />
          <p className="text-[11px] text-mute mt-3 leading-snug">
            {t(`panel.land.source.${district.land_source}`)}
          </p>
        </section>

        {/* Trade list — what was given up */}
        {allocation && (
          <TradeList allocation={allocation} t={t} />
        )}

        {/* Demographics */}
        <section>
          <p className="eyebrow mb-3">{t('panel.demographics')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
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
