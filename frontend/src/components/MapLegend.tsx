/**
 * MapLegend — floats bottom-left on the map.
 * Shows land-use colour key (default mode) or a score ramp (scenario mode).
 */

import type { Scenario } from '../types'
import { useI18n } from '../context/I18nContext'

const LAND_ENTRIES = [
  { key: 'residential', colour: '#f87171' },
  { key: 'industrial',  colour: '#a78bfa' },
  { key: 'commercial',  colour: '#fb923c' },
  { key: 'green',       colour: '#4ade80' },
  { key: 'educational', colour: '#60a5fa' },
  { key: 'other',       colour: '#94a3b8' },
]

interface MapLegendProps {
  activeScenario: Scenario | null
}

export default function MapLegend({ activeScenario }: MapLegendProps) {
  const { t } = useI18n()

  return (
    <div className="absolute bottom-6 left-3 z-[1000] bg-slate-900/90 backdrop-blur rounded-lg p-3 text-xs text-white shadow-lg pointer-events-none">
      {activeScenario ? (
        <>
          <p className="font-semibold text-slate-300 mb-1.5">
            {t('map.legend.viability')}
          </p>
          {/* Gradient ramp */}
          <div
            className="w-28 h-2.5 rounded-full mb-1"
            style={{
              background: 'linear-gradient(to right, #93c5fd, #fde68a, #ef4444)',
            }}
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{t('map.legend.low')}</span>
            <span>{t('map.legend.high')}</span>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold text-slate-300 mb-1.5">
            {t('map.legend.title')}
          </p>
          <div className="space-y-1">
            {LAND_ENTRIES.map(({ key, colour }) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: colour }}
                />
                <span className="text-slate-300">{t(`land.${key}`)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
