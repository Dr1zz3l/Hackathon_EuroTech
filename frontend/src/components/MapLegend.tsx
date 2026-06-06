'use client'

/**
 * MapLegend — Vercel card-marketing chrome.
 * Floats bottom-left over the map: white canvas card, hairline border, mono eyebrow.
 *
 * When a scenario is active: shows a future/viability pill toggle + the
 * appropriate legend (gradient ramp for viability; land-use swatches for future).
 * When no scenario: shows the dominant land-use swatches only.
 */

import type { Scenario } from '../types'
import { useI18n } from '../context/I18nContext'

const LAND_ENTRIES = [
  { key: 'residential', colour: '#ff0080' },
  { key: 'industrial',  colour: '#7928ca' },
  { key: 'commercial',  colour: '#f5a623' },
  { key: 'green',       colour: '#50e3c2' },
  { key: 'educational', colour: '#0070f3' },
  { key: 'other',       colour: '#a1a1a1' },
]

interface MapLegendProps {
  activeScenario: Scenario | null
  mapMode: 'future' | 'viability'
  onToggleMapMode: () => void
}

export default function MapLegend({ activeScenario, mapMode, onToggleMapMode }: MapLegendProps) {
  const { t } = useI18n()

  return (
    <div
      className="
        absolute bottom-4 left-4 z-[1000]
        bg-canvas rounded-lg shadow-card-md
        p-4 min-w-[200px]
      "
    >
      {activeScenario ? (
        <>
          {/* ── Future / Viability pill toggle ─────────────────── */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-canvas-soft-2 mb-3 pointer-events-auto">
            <button
              onClick={onToggleMapMode}
              className={`
                h-6 flex-1 rounded-full
                text-[10px] font-medium tracking-body-sm
                transition-colors
                ${mapMode === 'future'
                  ? 'bg-canvas text-ink shadow-hairline-inset'
                  : 'text-mute hover:text-ink'}
              `}
            >
              {t('map.mode.future')}
            </button>
            <button
              onClick={onToggleMapMode}
              className={`
                h-6 flex-1 rounded-full
                text-[10px] font-medium tracking-body-sm
                transition-colors
                ${mapMode === 'viability'
                  ? 'bg-canvas text-ink shadow-hairline-inset'
                  : 'text-mute hover:text-ink'}
              `}
            >
              {t('map.mode.viability')}
            </button>
          </div>

          {mapMode === 'viability' ? (
            <>
              {/* Viability score gradient ramp */}
              <p className="eyebrow mb-2.5">{t('map.legend.viability')}</p>
              <div
                className="w-full h-2 rounded-full mb-1.5"
                style={{
                  background: 'linear-gradient(to right, #0070f3, #f5a623, #ee0000)',
                }}
              />
              <div className="flex justify-between text-[11px] text-mute font-mono">
                <span>{t('map.legend.low')}</span>
                <span>{t('map.legend.high')}</span>
              </div>
            </>
          ) : (
            <>
              {/* Future projected land-use swatches */}
              <p className="eyebrow mb-2.5">{t('map.legend.future')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {LAND_ENTRIES.map(({ key, colour }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 shadow-hairline-inset"
                      style={{ background: colour }}
                    />
                    <span className="text-[12px] text-body leading-none">
                      {t(`land.${key}`)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Default: current dominant land-use swatches */}
          <p className="eyebrow mb-2.5">{t('map.legend.title')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {LAND_ENTRIES.map(({ key, colour }) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 shadow-hairline-inset"
                  style={{ background: colour }}
                />
                <span className="text-[12px] text-body leading-none">
                  {t(`land.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
