'use client'

/**
 * StylingPanel — the new "Style" tab on the right panel.
 *
 *   - Layer selector at the top (segmented buttons, one per styleable layer)
 *   - Fill-opacity slider (0–100) with mono live readout
 *   - Palette mode toggle: Land use ↔ Viability score
 *     (the score palette is meaningful only when a scenario is active —
 *      we still let the user pick it; the map respects whatever scenario
 *      state happens to be active. UX-wise this matches atlas's "you can
 *      configure styles even when the layer is hidden / inactive.")
 *   - Reset to default button at the bottom
 */

import { useI18n } from '../context/I18nContext'
import type { AppLayer } from './LayersPanel'

export type PaletteMode = 'land' | 'scenario'

interface StylingPanelProps {
  layers: AppLayer[]
  activeLayerId: string
  onSetActiveLayer: (id: string) => void
  onSetOpacity: (id: string, opacity: number) => void
  paletteMode: PaletteMode
  onSetPaletteMode: (mode: PaletteMode) => void
  onReset: () => void
}

export default function StylingPanel({
  layers,
  activeLayerId,
  onSetActiveLayer,
  onSetOpacity,
  paletteMode,
  onSetPaletteMode,
  onReset,
}: StylingPanelProps) {
  const { t } = useI18n()
  // Only layers that declare a style capability are configurable here.
  const styleable = layers.filter(l => l.capabilities.style)
  const active =
    styleable.find(l => l.id === activeLayerId) ?? styleable[0] ?? layers[0]
  const opacityPct = Math.round(active.opacity * 100)

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-7">

      {/* ── Layer selector ────────────────────────────────────── */}
      <section>
        <p className="eyebrow mb-2.5">{t('styling.layer')}</p>
        <div className="flex flex-col gap-1">
          {styleable.map(l => {
            const isActive = l.id === active.id
            return (
              <button
                key={l.id}
                onClick={() => onSetActiveLayer(l.id)}
                className={`
                  w-full px-3 h-10 rounded-md
                  inline-flex items-center gap-2
                  text-[13px] font-medium tracking-body-sm
                  transition-colors
                  ${
                    isActive
                      ? 'bg-ink text-canvas'
                      : 'bg-canvas text-ink border border-hairline hover:border-hairline-strong'
                  }
                `}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 shadow-hairline-inset"
                  style={{
                    background:
                      l.swatch === 'districts'
                        ? 'linear-gradient(135deg, #50e3c2 0%, #0070f3 50%, #ff0080 100%)'
                        : '#e5e5e5',
                  }}
                />
                <span className="flex-1 text-left truncate">
                  {t(l.label_key)}
                </span>
                {!l.visible && (
                  <span
                    className={`
                      eyebrow text-[9px]
                      ${isActive ? 'text-canvas-soft-2' : 'text-mute'}
                    `}
                  >
                    {t('sidebar.layers.hidden')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <div className="hairline" />

      {/* ── Opacity slider ────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <p className="eyebrow">{t('styling.opacity')}</p>
          <span className="font-mono tabular-nums text-[13px] text-ink">
            {opacityPct}<span className="text-mute">%</span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacityPct}
          onChange={e => onSetOpacity(active.id, Number(e.target.value) / 100)}
          style={{ ['--val' as string]: `${opacityPct}%` }}
          className="vercel-slider w-full"
          aria-label={t('styling.opacity')}
        />
      </section>

      {/* ── Palette mode — only meaningful for districts ──────── */}
      {active.id === 'districts' && (
        <>
          <div className="hairline" />
          <section>
            <p className="eyebrow mb-2.5">{t('styling.palette')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSetPaletteMode('land')}
                className={`
                  flex flex-col items-start gap-2 p-3 rounded-md
                  border transition-colors text-left
                  ${
                    paletteMode === 'land'
                      ? 'border-ink bg-canvas-soft'
                      : 'border-hairline bg-canvas hover:border-hairline-strong'
                  }
                `}
              >
                <div className="flex gap-0.5 w-full">
                  {['#ff0080', '#7928ca', '#f5a623', '#50e3c2', '#0070f3', '#a1a1a1'].map(c => (
                    <span key={c} className="flex-1 h-1.5 rounded-sm" style={{ background: c }} />
                  ))}
                </div>
                <span className="text-[12px] font-medium tracking-body-sm text-ink">
                  {t('styling.palette.land')}
                </span>
              </button>

              <button
                onClick={() => onSetPaletteMode('scenario')}
                className={`
                  flex flex-col items-start gap-2 p-3 rounded-md
                  border transition-colors text-left
                  ${
                    paletteMode === 'scenario'
                      ? 'border-ink bg-canvas-soft'
                      : 'border-hairline bg-canvas hover:border-hairline-strong'
                  }
                `}
              >
                <div
                  className="w-full h-1.5 rounded-sm"
                  style={{
                    background: 'linear-gradient(to right, #0070f3, #f5a623, #ee0000)',
                  }}
                />
                <span className="text-[12px] font-medium tracking-body-sm text-ink">
                  {t('styling.palette.scenario')}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-mute mt-2.5 leading-snug">
              {paletteMode === 'land'
                ? t('styling.palette.land.help')
                : t('styling.palette.scenario.help')}
            </p>
          </section>
        </>
      )}

      <div className="flex-1" />

      <div className="hairline" />
      <button
        onClick={onReset}
        className="
          h-9 rounded-pill border border-hairline bg-canvas
          text-[13px] font-medium tracking-body-sm text-ink
          hover:bg-canvas-soft hover:border-hairline-strong
          transition-colors
        "
      >
        {t('styling.reset')}
      </button>
    </div>
  )
}
