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
  mapMode: 'future' | 'viability'
  onToggleMapMode: () => void
}

export default function MapLegend({ activeScenario, mapMode, onToggleMapMode }: MapLegendProps) {
  const { t } = useI18n()

  return (
    <div className="absolute bottom-6 left-3 z-[1000] bg-slate-900/90 backdrop-blur rounded-lg p-3 text-xs text-white shadow-lg">
      {activeScenario ? (
        <>
          {/* Mode toggle — only shown when a scenario is active */}
          <div className="flex gap-1 mb-2 pointer-events-auto">
            <button
              onClick={onToggleMapMode}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                mapMode === 'future'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {t('map.mode.future')}
            </button>
            <button
              onClick={onToggleMapMode}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                mapMode === 'viability'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {t('map.mode.viability')}
            </button>
          </div>

          {mapMode === 'viability' ? (
            <>
              <p className="font-semibold text-slate-300 mb-1.5 pointer-events-none">
                {t('map.legend.viability')}
              </p>
              <div
                className="w-28 h-2.5 rounded-full mb-1"
                style={{
                  background: 'linear-gradient(to right, #93c5fd, #fde68a, #ef4444)',
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 pointer-events-none">
                <span>{t('map.legend.low')}</span>
                <span>{t('map.legend.high')}</span>
              </div>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-300 mb-1.5 pointer-events-none">
                {t('map.legend.future')}
              </p>
              <div className="space-y-1 pointer-events-none">
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
        </>
      ) : (
        <>
          <p className="font-semibold text-slate-300 mb-1.5 pointer-events-none">
            {t('map.legend.title')}
          </p>
          <div className="space-y-1 pointer-events-none">
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
