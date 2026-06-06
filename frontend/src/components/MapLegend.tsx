'use client'

/**
 * MapLegend — Vercel card-marketing chrome.
 * Floats bottom-left over the map: white canvas card, hairline border, mono eyebrow.
 * Shows land-use swatches (default mode) or a brand-aligned score ramp (scenario mode).
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
}

export default function MapLegend({ activeScenario }: MapLegendProps) {
  const { t } = useI18n()

  return (
    <div
      className="
        absolute bottom-4 left-4 z-[1000]
        bg-canvas rounded-lg shadow-card-md
        p-4 min-w-[200px]
        pointer-events-none
      "
    >
      {activeScenario ? (
        <>
          <p className="eyebrow mb-2.5">{t('map.legend.viability')}</p>
          {/* Brand-aligned gradient ramp: link → warning → error */}
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
