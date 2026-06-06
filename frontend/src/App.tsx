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
 * Left side: Chat panel (AI planner, wired) + Layers panel.
 * Right side: a single collapsible panel that toggles between
 *   "District" detail and a "Style" tab.
 *
 * Visual system: Vercel-inspired light canvas (public/DESIGN-vercel.md).
 *
 * Owns all state and wiring. Imports:
 *   createScorer    from lib/scoring.ts     (Agent A — do not edit)
 *   createAllocator from lib/reallocation.ts (Agent A — do not edit)
 *   SCENARIOS       from scenarios.ts        (Agent A — do not edit)
 *   District/…      from types.ts            (shared contract — do not edit)
 *
 * State: activeScenario, selectedDistrict, geojson, scorer, allocator,
 *        adjacency, mapMode, plannerMessage (LLM summary after a custom goal),
 *        layer/panel/sidebar state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { I18nProvider, useI18n } from './context/I18nContext'
import type { Locale } from './context/I18nContext'
import { createScorer } from './lib/scoring'
import { createAllocator, aggregateToDistricts } from './lib/reallocation'
import { SCENARIOS } from './scenarios'
import type {
  AdjacencyMap, AllocationResult, Allocator,
  District, Scenario, ScoreResult, Scorer,
} from './types'
import {
  buildSyntheticScenario, buildPlanSummaryPayload,
  parseGoal, summarizePlan, BASE_WEIGHTS,
} from './lib/llm'

import ScenarioPanel from './components/ScenarioPanel'
import ChatPanel, { type PlannerMessage } from './components/ChatPanel'
import DetailPanel from './components/DetailPanel'
import DetailEmptyState from './components/DetailEmptyState'
import MapLegend from './components/MapLegend'
import LanguageToggle from './components/LanguageToggle'
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

// ── GeoJSON feature type (mirrors gen_districts_geojson.py output) ──────────
interface DistrictFeature {
  type: 'Feature'
  properties: District
  geometry: GeoJSON.Geometry
}
interface DistrictCollection {
  type: 'FeatureCollection'
  features: DistrictFeature[]
}

// ── Default layer registry ───────────────────────────────────────────────────
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

// ── Right panel tabs ─────────────────────────────────────────────────────────
type RightTab = 'detail' | 'style'

// Suppress unused import — BASE_WEIGHTS is referenced transitively via llm helpers
void BASE_WEIGHTS

// ═══════════════════════════════════════════════════════════════════════════════
// Inner app
// ═══════════════════════════════════════════════════════════════════════════════

function AppInner() {
  const { locale, t } = useI18n()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [geojson,   setGeojson]   = useState<DistrictCollection | null>(null)
  const [adjacency, setAdjacency] = useState<AdjacencyMap | null>(null)
  const [scorer,    setScorer]    = useState<Scorer | null>(null)
  const [allocator, setAllocator] = useState<Allocator | null>(null)
  const [districts, setDistricts] = useState<District[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Neighbourhood-level data (loaded asynchronously; optional) ───────────────
  const [nbhdGeojson,   setNbhdGeojson]   = useState<DistrictCollection | null>(null)
  const [nbhds,         setNbhds]         = useState<District[]>([])
  const [nbhdScorer,    setNbhdScorer]    = useState<Scorer | null>(null)
  const [nbhdAllocator, setNbhdAllocator] = useState<Allocator | null>(null)

  // ── Scenario / selection state ───────────────────────────────────────────────
  const [activeScenario,   setActiveScenario]   = useState<Scenario | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)
  const [mapMode, setMapMode] = useState<'future' | 'viability'>('future')
  const [plannerMessage, setPlannerMessage] = useState<PlannerMessage | null>(null)

  // ── Sidebar / panel state ────────────────────────────────────────────────────
  const [chatOpen,   setChatOpen]   = useState(true)   // open by default — planner is wired
  const [layersOpen, setLayersOpen] = useState(true)
  const [rightOpen,  setRightOpen]  = useState(true)
  const [rightTab,   setRightTab]   = useState<RightTab>('detail')

  // ── Layer state ──────────────────────────────────────────────────────────────
  const [layers,        setLayers]        = useState<AppLayer[]>(DEFAULT_LAYERS)
  const [styleLayerId,  setStyleLayerId]  = useState<string>('districts')
  const [paletteMode,   setPaletteMode]   = useState<PaletteMode>('land')

  // ── Map imperative handle ────────────────────────────────────────────────────
  const mapApi = useRef<MapApi | null>(null)

  // ── Load GeoJSON + adjacency in parallel at startup ──────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/districts.geojson').then(r => {
        if (!r.ok) throw new Error(`districts.geojson: HTTP ${r.status}`)
        return r.json() as Promise<DistrictCollection>
      }),
      fetch('/adjacency.json').then(r => {
        if (!r.ok) throw new Error(`adjacency.json: HTTP ${r.status}`)
        return r.json() as Promise<AdjacencyMap>
      }),
    ])
      .then(([data, adj]) => {
        setGeojson(data)
        setAdjacency(adj)
        const ds = data.features.map(f => f.properties)
        setDistricts(ds)
        setScorer(createScorer(ds, adj))
        setAllocator(createAllocator(ds, adj))
      })
      .catch(err => setLoadError(String(err)))
  }, [])

  // ── Load neighbourhood GeoJSON asynchronously (graceful degradation) ─────────
  // Runs independently — a failure here leaves the app in district-only mode.
  useEffect(() => {
    fetch('/neighbourhoods.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`neighbourhoods.geojson: HTTP ${r.status}`)
        return r.json() as Promise<DistrictCollection>
      })
      .then(data => {
        setNbhdGeojson(data)
        const ns = data.features.map(f => f.properties)
        setNbhds(ns)
        setNbhdScorer(createScorer(ns))
        setNbhdAllocator(createAllocator(ns))
      })
      .catch(() => {
        // Neighbourhood data unavailable — map stays in district-only mode
      })
  }, [])

  // ── Switch palette automatically when a scenario activates ──────────────────
  useEffect(() => {
    setPaletteMode(activeScenario ? 'scenario' : 'land')
  }, [activeScenario])

  // ── Score for selected district/neighbourhood under active scenario ───────────
  const scoreResult = useMemo<ScoreResult | null>(() => {
    if (!selectedDistrict || !activeScenario) return null
    // Use the neighbourhood scorer when a neighbourhood is selected (finer norms)
    if (selectedDistrict.tpu_code && nbhdScorer) {
      return nbhdScorer.score(selectedDistrict, activeScenario)
    }
    if (!scorer) return null
    return scorer.score(selectedDistrict, activeScenario)
  }, [selectedDistrict, activeScenario, scorer, nbhdScorer])

  // ── Neighbourhood-level flat QP (211 units, source of truth) ─────────────────
  const nbhdAllocationResult = useMemo<AllocationResult | null>(() => {
    if (!activeScenario || !nbhdAllocator || !nbhdScorer) return null
    return nbhdAllocator.allocate(activeScenario, nbhdScorer)
  }, [activeScenario, nbhdAllocator, nbhdScorer])

  // ── District-level allocation: aggregated from neighbourhood QP when available,
  //    otherwise the standalone 18-district QP (fallback for district-only mode). ──
  const allocationResult = useMemo<AllocationResult | null>(() => {
    if (nbhdAllocationResult && nbhds.length > 0) {
      return aggregateToDistricts(nbhdAllocationResult, nbhds)
    }
    if (!activeScenario || !allocator || !scorer) return null
    return allocator.allocate(activeScenario, scorer)
  }, [nbhdAllocationResult, nbhds, activeScenario, allocator, scorer])

  // ── LLM goal handler ─────────────────────────────────────────────────────────
  // Orchestrates: parse-goal → synthetic scenario → reallocation → summarize-plan
  const handleGoal = useCallback(async (text: string) => {
    if (!scorer || !allocator) throw new Error('Data not loaded yet')

    // 1. Ask the LLM to parse the goal
    const parsed = await parseGoal(text, locale as Locale)

    // 2. Build synthetic scenario and activate it immediately (map recolours)
    const scenario = buildSyntheticScenario(parsed)
    setActiveScenario(scenario)
    setMapMode('future')

    // Determine which weight keys the LLM explicitly overrode
    const overriddenKeys = new Set(
      (Object.entries(parsed.weight_overrides) as [string, number | null | undefined][])
        .filter(([, v]) => v != null)
        .map(([k]) => k)
    )

    const msgBase = {
      rationale: parsed.rationale,
      weights: scenario.weights,
      overriddenKeys,
    }
    setPlannerMessage({ ...msgBase, prose: null, loading: true })

    // 3. Compute allocation synchronously (don't depend on useMemo render cycle)
    const allocation = allocator.allocate(scenario, scorer)

    if (!allocation) {
      setPlannerMessage({ ...msgBase, prose: null, loading: false })
      return
    }

    // 4. Build summary payload and call /api/summarize-plan
    try {
      const payload = buildPlanSummaryPayload(scenario, allocation, text, locale as Locale, districts)
      const prose = await summarizePlan(payload)
      setPlannerMessage({ ...msgBase, prose, loading: false })
    } catch {
      // Summarize failed — show rationale only, no prose
      setPlannerMessage({ ...msgBase, prose: null, loading: false })
    }
  }, [scorer, allocator, locale, districts])

  // ── Clear planner message when a preset scenario is selected ─────────────────
  const handleSelectPreset = useCallback((s: Scenario | null) => {
    setActiveScenario(s)
    setPlannerMessage(null)
  }, [])

  // ── Layer mutation helpers ───────────────────────────────────────────────────
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

  // ── District selection — auto-open Detail tab ────────────────────────────────
  const handleSelectDistrict = useCallback((d: District) => {
    setSelectedDistrict(d)
    setRightTab('detail')
    setRightOpen(true)
  }, [])

  // ── Resolve current layer state for MapView ──────────────────────────────────
  const districtsLayer = layers.find(l => l.id === 'districts')!
  const basemapLayer   = layers.find(l => l.id === 'basemap')!

  // ── Error state ───────────────────────────────────────────────────────────────
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

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (!geojson || !scorer) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-canvas-soft">
        <span className="eyebrow">Loading districts…</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-canvas-soft text-ink">

      {/* ── Nav bar ──────────────────────────────────────────────────── */}
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

      {/* ── Scenario rail ────────────────────────────────────────────── */}
      <ScenarioPanel
        activeScenario={activeScenario}
        onSelect={handleSelectPreset}
      />

      {/* ── Body: sidebars + map + right panel ───────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: AI planner (chat) panel */}
        <ChatPanel
          open={chatOpen}
          onToggle={() => setChatOpen(o => !o)}
          onGoal={handleGoal}
          plannerMessage={plannerMessage}
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
            allocationResult={allocationResult}
            mapMode={mapMode}
            selectedDistrict={selectedDistrict}
            onSelectDistrict={handleSelectDistrict}
            adjacency={adjacency}
            districtsVisible={districtsLayer.visible}
            districtsOpacity={districtsLayer.opacity}
            basemapVisible={basemapLayer.visible}
            basemapOpacity={basemapLayer.opacity}
            paletteMode={paletteMode}
            apiRef={mapApi}
            nbhdGeojson={nbhdGeojson}
            nbhdScorer={nbhdScorer}
            nbhdAllocationResult={nbhdAllocationResult}
          />
          <MapLegend
            activeScenario={activeScenario}
            mapMode={mapMode}
            onToggleMapMode={() => setMapMode(m => m === 'future' ? 'viability' : 'future')}
          />

          {/* Active scenario description badge */}
          {activeScenario && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
              <span
                className="
                  inline-flex items-center gap-1.5
                  bg-canvas/90 backdrop-blur
                  border border-hairline
                  shadow-card
                  text-[11px] font-medium tracking-body-sm text-ink
                  px-3 py-1 rounded-full
                  whitespace-nowrap
                "
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#0070f3' }}
                />
                {activeScenario.horizon_year} ·{' '}
                {activeScenario.custom_label
                  ?? SCENARIOS.find(s => s.id === activeScenario.id)?.id.replace(/_/g, ' ')
                  ?? activeScenario.id}
              </span>
            </div>
          )}
        </div>

        {/* Right panel */}
        {rightOpen ? (
          <aside className="w-[360px] shrink-0 h-full bg-canvas border-l border-hairline flex flex-col">

            {/* Tabs */}
            <div className="shrink-0 hairline flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-1 p-0.5 rounded-full bg-canvas-soft-2">
                <button
                  onClick={() => setRightTab('detail')}
                  className={`
                    h-7 px-3 rounded-full
                    text-[12px] font-medium tracking-body-sm
                    transition-colors
                    ${rightTab === 'detail'
                      ? 'bg-canvas text-ink shadow-hairline-inset'
                      : 'text-mute hover:text-ink'}
                  `}
                >
                  {t('panel.right.tab.detail')}
                </button>
                <button
                  onClick={() => setRightTab('style')}
                  className={`
                    h-7 px-3 rounded-full
                    text-[12px] font-medium tracking-body-sm
                    inline-flex items-center gap-1.5
                    transition-colors
                    ${rightTab === 'style'
                      ? 'bg-canvas text-ink shadow-hairline-inset'
                      : 'text-mute hover:text-ink'}
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
                    allocation={
                      selectedDistrict.tpu_code
                        // Neighbourhood selected → look up in the flat neighbourhood QP result
                        ? (nbhdAllocationResult?.byDistrict.get(selectedDistrict.name) ?? null)
                        // District selected → look up in the aggregated district result
                        : (allocationResult?.byDistrict.get(selectedDistrict.name) ?? null)
                    }
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
          /* Collapsed rail */
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

// ═══════════════════════════════════════════════════════════════════════════════
// Root
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}
