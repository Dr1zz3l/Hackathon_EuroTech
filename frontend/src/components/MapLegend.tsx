'use client'

/**
 * MapLegend — Vercel card-marketing chrome.
 * Floats bottom-left over the map: white canvas card, hairline border, mono eyebrow.
 *
 * When a scenario is active: shows future-projected land-use swatches.
 * When no scenario: shows the dominant land-use swatches.
 */

import type { Scenario } from '../types'
import { useI18n } from '../context/I18nContext'

const LAND_ENTRIES = [
  { key: 'residential',    colour: '#ff0080' },
  { key: 'industrial',     colour: '#7928ca' },
  { key: 'commercial',     colour: '#f5a623' },
  { key: 'agricultural',   colour: '#a3c644' },
  { key: 'recreational',   colour: '#50e3c2' },
  { key: 'institutional',  colour: '#0070f3' },
  { key: 'misc',           colour: '#a1a1a1' },
  { key: 'infrastructure', colour: '#6b7280' },
  { key: 'protected',      colour: '#1d8a4e' },
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
      "
    >
      <p className="eyebrow mb-2.5">
        {activeScenario ? t('map.legend.future') : t('map.legend.title')}
      </p>
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
    </div>
  )
}
