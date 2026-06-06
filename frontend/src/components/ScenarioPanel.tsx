/**
 * ScenarioPanel — row of 4 scenario buttons + a "default view" clear button.
 * Clicking a button sets it active and triggers a map recolour.
 */

import type { Scenario } from '../types'
import { SCENARIOS } from '../scenarios'
import { useI18n } from '../context/I18nContext'

interface ScenarioPanelProps {
  activeScenario: Scenario | null
  onSelect: (scenario: Scenario | null) => void
}

const SCENARIO_ICONS: Record<string, string> = {
  green_hk_2050:     '🌿',
  industrial_growth: '🏭',
  education_hub:     '🎓',
  urban_renewal:     '🏗',
}

export default function ScenarioPanel({ activeScenario, onSelect }: ScenarioPanelProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-slate-900/90 backdrop-blur border-b border-slate-700">
      {/* Clear / default button */}
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          activeScenario === null
            ? 'bg-slate-200 text-slate-900'
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
      >
        {t('scenario.none.label')}
      </button>

      {SCENARIOS.map(scenario => {
        const isActive = activeScenario?.id === scenario.id
        return (
          <button
            key={scenario.id}
            onClick={() => onSelect(isActive ? null : scenario)}
            title={t(scenario.description_key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isActive
                ? 'bg-amber-400 text-slate-900 shadow-md'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <span>{SCENARIO_ICONS[scenario.id]}</span>
            <span>{t(scenario.label_key)}</span>
            {isActive && (
              <span className="text-slate-600 text-xs">
                {scenario.horizon_year}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
