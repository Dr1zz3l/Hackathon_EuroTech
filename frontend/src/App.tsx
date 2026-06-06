'use client'

/**
 * App.tsx — Agent B sole integrator.
 *
 * Layout (atlas.co-inspired):
 *
 *   ┌──────── nav bar ─────────────────────────────────────────────┐
 *   │ ┌── scenario rail ─────────────────────────────────────────┐ │
 *   │ │ [Chat]│[Layers]│       Map                  │[Right tab] │ │
 *   │ └──────────────────────────────────────────────────────────┘ │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Left side: two collapsible sidebars (chat placeholder + layers).
 * Right side: a single collapsible panel that toggles between
 *   "District" detail (existing) and a new "Style" tab.
 *
 * Visual system: Vercel-inspired light canvas (public/DESIGN-vercel.md).
 *
 * Owns all state and wiring. Imports:
 *   createScorer  from lib/scoring.ts   (Agent A — do not edit)
 *   SCENARIOS     from scenarios.ts     (Agent A — do not edit, imported indirectly via ScenarioPanel)
 *   District/…    from types.ts         (shared contract — do not edit)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { I18nProvider, useI18n } from './context/I18nContext'
import { createScorer } from './lib/scoring'
import type { District, Scenario, ScoreResult, Scorer } from './types'

import ScenarioPanel from './components/ScenarioPanel'
import DetailPanel from './components/DetailPanel'
import DetailEmptyState from './components/DetailEmptyState'
import MapLegend from './components/MapLegend'
import LanguageToggle from './components/LanguageToggle'
import ChatPanel from './components/ChatPanel'
import LayersPanel, { type AppLayer } from './components/LayersPanel'
import StylingPanel, { type PaletteMode } from './components/StylingPanel'
import { ChevronLeftIcon, ChevronRightIcon, SlidersIcon, LayersIcon } from './components/Icons'
import type { MapApi } from './components/MapView'

// Leaflet touches `window`, so the map must never render on the server.
const MapView = dynamic(() => import('./components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-canvas-soft-2">
      <span className="eyebrow">Loading map…</span>
    </div>
  ),
})

// ── GeoJSON feature type (mirrors gen_districts_geojson.py output) ─────────
interface DistrictFeature {
  type: 'Feature'
  properties: District
  geometry: GeoJSON.Geometry
}
interface DistrictCollection {
  type: 'FeatureCollection'
  features: DistrictFeature[]
}

// ── Default layer registry ─────────────────────────────────────────────────
const DEFAULT_LAYERS: AppLayer[] = [
  {
    id: 'districts',
    label_key: 'layer.districts',
    subtitle_key: 'layer.districts.subtitle',
    visible: true,
    opacity: 1.0,
    capabilities: { download: true, style: true },
    swatch: 'districts',
  },
  {
    id: 'basemap',
    label_key: 'layer.basemap',
    subtitle_key: 'layer.basemap.subtitle',
    visible: true,
    opacity: 1.0,
    capabilities: { download: false, style: true },
    swatch: 'basemap',
  },
]

// ── Right panel tabs ───────────────────────────────────────────────────────
type RightTab = 'detail' | 'style'

// ═══════════════════════════════════════════════════════════════════════════
// Inner app
// ═══════════════════════════════════════════════════════════════════════════

function AppInner() {
  const { t } = useI18n()

  // ── Data state ───────────────────────────────────────────────
  const [geojson, setGeojson] = useState<DistrictCollection | null>(null)
  const [scorer, setScorer] = useState<Scorer | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Scenario / selection state ───────────────────────────────
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)

  // ── Sidebar / panel state ────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false)        // closed by default — chat is a placeholder
  const [layersOpen, setLayersOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [rightTab, setRightTab] = useState<RightTab>('detail')

  // ── Layer state ──────────────────────────────────────────────
  const [layers, setLayers] = useState<AppLayer[]>(DEFAULT_LAYERS)
  const [styleLayerId, setStyleLayerId] = useState<string>('districts')
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('land')

  // ── Map imperative handle ───────────────────────────────────
  const mapApi = useRef<MapApi | null>(null)

  // ── Load GeoJSON once at startup ────────────────────────────
  useEffect(() => {
    fetch('/districts.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DistrictCollection>
      })
      .then(data => {
        setGeojson(data)
        setScorer(createScorer(data.features.map(f => f.properties)))
      })
      .catch(err => setLoadError(String(err)))
  }, [])

  // ── Switch palette automatically when a scenario activates ──
  // (The user can still override via the Style tab.)
  useEffect(() => {
    setPaletteMode(activeScenario ? 'scenario' : 'land')
  }, [activeScenario])

  // ── Score for selected district under active scenario ───────
  const scoreResult = useMemo<ScoreResult | null>(() => {
    if (!selectedDistrict || !activeScenario || !scorer) return null
    return scorer.score(selectedDistrict, activeScenario)
  }, [selectedDistrict, activeScenario, scorer])

  // ── Layer mutation helpers ──────────────────────────────────
  const setLayerVisible = useCallback((id: string, visible: boolean) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, visible } : l)))
  }, [])

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, opacity } : l)))
  }, [])

  const zoomToLayer = useCallback((id: string) => {
    mapApi.current?.zoomToLayer(id)
  }, [])

  const openStyleForLayer = useCallback((id: string) => {
    setStyleLayerId(id)
    setRightTab('style')
    setRightOpen(true)
  }, [])

  const downloadLayer = useCallback((id: string) => {
    if (id !== 'districts' || !geojson) return
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hk-districts.geojson'
    a.click()
    URL.revokeObjectURL(url)
  }, [geojson])

  const resetStyling = useCallback(() => {
    setLayers(prev => prev.map(l => {
      const def = DEFAULT_LAYERS.find(d => d.id === l.id)
      return def ? { ...l, opacity: def.opacity, visible: def.visible } : l
    }))
    setPaletteMode(activeScenario ? 'scenario' : 'land')
  }, [activeScenario])

  // ── Wrap district selection — auto-open Detail on click ─────
  const handleSelectDistrict = useCallback((d: District) => {
    setSelectedDistrict(d)
    setRightTab('detail')
    setRightOpen(true)
  }, [])

  // ── Resolve current layer state for MapView ─────────────────
  const districtsLayer = layers.find(l => l.id === 'districts')!
  const basemapLayer = layers.find(l => l.id === 'basemap')!

  // ── Error state ──────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-canvas-soft p-8">
        <div className="max-w-md text-center bg-canvas rounded-lg p-8 shadow-card-lg">
          <p className="eyebrow text-error mb-3">Error · data fetch</p>
          <p className="display-md mb-2">Failed to load district data.</p>
          <p className="text-sm text-mute font-mono">{loadError}</p>
        </div>
      </div>
    )
  }

  // ── Loading state ────────────────────────────────────────────
  if (!geojson || !scorer) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-canvas-soft">
        <span className="eyebrow">Loading districts…</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-canvas-soft text-ink">

      {/* ── Nav bar ───────────────────────────────────────────── */}
      <header className="relative shrink-0 h-16 bg-canvas hairline flex items-center justify-between px-6 z-20">
        <div className="absolute inset-0 bg-brand-mesh-soft opacity-50 pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-md shadow-hairline-inset"
            style={{
              background: 'linear-gradient(135deg, #007cf0 0%, #00dfd8 50%, #ff0080 100%)',
            }}
          />
          <div className="flex flex-col leading-tight">
            <span className="eyebrow">HK · Smart City · 18 Districts</span>
            <span className="display-sm">Hong Kong District Viability.</span>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <LanguageToggle />
        </div>
      </header>

      {/* ── Scenario rail ─────────────────────────────────────── */}
      <ScenarioPanel
        activeScenario={activeScenario}
        onSelect={setActiveScenario}
      />

      {/* ── Body: sidebars + map ──────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: chat panel */}
        <ChatPanel
          open={chatOpen}
          onToggle={() => setChatOpen(o => !o)}
        />

        {/* Left: layers panel */}
        <LayersPanel
          open={layersOpen}
          onToggle={() => setLayersOpen(o => !o)}
          layers={layers}
          onSetVisible={setLayerVisible}
          onZoomTo={zoomToLayer}
          onOpenStyle={openStyleForLayer}
          onDownload={downloadLayer}
        />

        {/* Map area */}
        <div className="relative flex-1 bg-canvas-soft-2">
          <MapView
            geojson={geojson}
            scorer={scorer}
            activeScenario={activeScenario}
            selectedDistrict={selectedDistrict}
            onSelectDistrict={handleSelectDistrict}
            districtsVisible={districtsLayer.visible}
            districtsOpacity={districtsLayer.opacity}
            basemapVisible={basemapLayer.visible}
            basemapOpacity={basemapLayer.opacity}
            paletteMode={paletteMode}
            apiRef={mapApi}
          />
          <MapLegend activeScenario={paletteMode === 'scenario' ? activeScenario : null} />
        </div>

        {/* Right panel */}
        {rightOpen ? (
          <aside className="w-[360px] shrink-0 h-full bg-canvas border-l border-hairline flex flex-col">

            {/* Tabs */}
            <div className="shrink-0 hairline flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-1 p-0.5 rounded-pill bg-canvas-soft-2">
                <button
                  onClick={() => setRightTab('detail')}
                  className={`
                    h-7 px-3 rounded-pill
                    text-[12px] font-medium tracking-body-sm
                    transition-colors
                    ${rightTab === 'detail' ? 'bg-canvas text-ink shadow-hairline-inset' : 'text-mute hover:text-ink'}
                  `}
                >
                  {t('panel.right.tab.detail')}
                </button>
                <button
                  onClick={() => setRightTab('style')}
                  className={`
                    h-7 px-3 rounded-pill
                    text-[12px] font-medium tracking-body-sm
                    inline-flex items-center gap-1.5
                    transition-colors
                    ${rightTab === 'style' ? 'bg-canvas text-ink shadow-hairline-inset' : 'text-mute hover:text-ink'}
                  `}
                >
                  <SlidersIcon size={12} />
                  {t('panel.right.tab.style')}
                </button>
              </div>

              <button
                onClick={() => setRightOpen(false)}
                aria-label={t('panel.right.collapse')}
                title={t('panel.right.collapse')}
                className="
                  shrink-0 w-7 h-7 rounded-md
                  text-mute hover:text-ink hover:bg-canvas-soft
                  inline-flex items-center justify-center
                  transition-colors
                "
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              {rightTab === 'detail' ? (
                selectedDistrict ? (
                  <DetailPanel
                    district={selectedDistrict}
                    scenario={activeScenario}
                    scoreResult={scoreResult}
                    onClose={() => setSelectedDistrict(null)}
                  />
                ) : (
                  <DetailEmptyState />
                )
              ) : (
                <StylingPanel
                  layers={layers}
                  activeLayerId={styleLayerId}
                  onSetActiveLayer={setStyleLayerId}
                  onSetOpacity={setLayerOpacity}
                  paletteMode={paletteMode}
                  onSetPaletteMode={setPaletteMode}
                  onReset={resetStyling}
                />
              )}
            </div>
          </aside>
        ) : (
          /* Collapsed rail — same shape as the left rails for consistency */
          <button
            onClick={() => setRightOpen(true)}
            aria-label={t('panel.right.expand')}
            title={t('panel.right.expand')}
            className="
              shrink-0 w-10 h-full bg-canvas border-l border-hairline
              flex flex-col items-center gap-3 pt-4
              text-mute hover:text-ink hover:bg-canvas-soft
              transition-colors
            "
          >
            <ChevronLeftIcon size={14} />
            {selectedDistrict ? <LayersIcon size={16} /> : <SlidersIcon size={16} />}
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}
