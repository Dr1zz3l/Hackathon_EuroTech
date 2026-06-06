'use client'

/**
 * ScenarioPanel — Vercel tab-ghost row.
 *
 * Centered row of pill-sm (64 px radius) ghost pills.
 * Active pill polarity-flipped to ink-primary (the brand's single CTA tone).
 * No emoji — clean type, per the brand voice.
 */

import type { Scenario } from '../types'
import { SCENARIOS } from '../scenarios'
import { useI18n } from '../context/I18nContext'

interface ScenarioPanelProps {
  activeScenario: Scenario | null
  onSelect: (scenario: Scenario | null) => void
}

export default function ScenarioPanel({ activeScenario, onSelect }: ScenarioPanelProps) {
  const { t } = useI18n()

  return (
    <div className="shrink-0 bg-canvas hairline">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">

        {/* Mono eyebrow on the left — the "technical layer" voice */}
        <span className="eyebrow hidden md:inline shrink-0">
          Scenario · choose a planning goal
        </span>

        {/* Centered pill row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Default-view pill */}
          <button
            onClick={() => onSelect(null)}
            className={`
              h-9 px-4 rounded-[64px] text-[13px] font-medium tracking-body-sm
              transition-colors whitespace-nowrap
              ${activeScenario === null
                ? 'bg-ink text-canvas shadow-hairline-inset'
                : 'bg-canvas text-body hover:text-ink hover:bg-canvas-soft'}
            `}
          >
            {t('scenario.none.label')}
          </button>

          {/* Hairline separator */}
          <span className="w-px h-5 bg-hairline mx-1 shrink-0" />

          {SCENARIOS.map(scenario => {
            const isActive = activeScenario?.id === scenario.id
            return (
              <button
                key={scenario.id}
                onClick={() => onSelect(isActive ? null : scenario)}
                title={t(scenario.description_key)}
                className={`
                  h-9 px-4 rounded-[64px] text-[13px] font-medium tracking-body-sm
                  inline-flex items-center gap-2 transition-colors whitespace-nowrap
                  ${isActive
                    ? 'bg-ink text-canvas shadow-hairline-inset'
                    : 'bg-canvas text-body hover:text-ink hover:bg-canvas-soft'}
                `}
              >
                <span>{t(scenario.label_key)}</span>
                <span
                  className={`
                    font-mono text-[10px] tracking-[0.05em]
                    ${isActive ? 'text-mute' : 'text-mute'}
                  `}
                >
                  {scenario.horizon_year}
                </span>
              </button>
            )
          })}
        </div>

        {/* Right-side state pill — mirrors the eyebrow weight */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <span
            className={`
              eyebrow inline-flex items-center gap-1.5
              ${activeScenario ? 'text-link' : 'text-mute'}
            `}
          >
            <span
              className={`
                w-1.5 h-1.5 rounded-full
                ${activeScenario ? 'bg-link' : 'bg-hairline-strong'}
              `}
            />
            {activeScenario ? 'Scenario active' : 'Default view'}
          </span>
        </div>
      </div>
    </div>
  )
}
