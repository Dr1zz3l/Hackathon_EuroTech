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
import type { MapCommand } from './lib/chat'
import {
  type DynamicLayer, validateAddLayer, describeLayer, rampCssGradient,
} from './lib/dynamicLayers'

import ScenarioPanel from './components/ScenarioPanel'
import ChatPanel, { type PlannerMessage } from './components/ChatPanel'
import DetailPanel from './components/DetailPanel'
import DetailEmptyState from './components/DetailEmptyState'
import MapLegend from './components/MapLegend'
import LanguageToggle from './components/LanguageToggle'
import LayersPanel, { type AppLayer } from './components/LayersPanel'
import StylingPanel, { type PaletteMode } from './components/StylingPanel'
import ForecastPanel from './components/ForecastPanel'
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
    level: 'district',
  },
  {
    id: 'neighbourhoods',
    label_key: 'layer.neighbourhoods',
    subtitle_key: 'layer.neighbourhoods.subtitle',
    visible: true,
    opacity: 1.0,
    capabilities: { download: true, style: false },
    swatch: 'neighbourhoods',
    level: 'neighbourhood',
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
type RightTab = 'detail' | 'forecast' | 'style'

// Loose name normaliser — must match MapView.normName so assistant-supplied
// names (districts or coded STPU names like "Kwun Tong · 294") resolve to cells.
function normCellName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[-·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Suppress unused import — BASE_WEIGHTS is referenced transitively via llm helpers
void BASE_WEIGHTS

// Heat-ramp preview for the dynamic-layer swatch in the Layers panel.
const HEAT_SWATCH = 'linear-gradient(90deg, #0070f3, #50e3c2, #f5a623, #ff0080, #ee0000)'

/** Project an agent-created DynamicLayer into the Layers-panel row model. */
function dynamicToAppLayer(d: DynamicLayer): AppLayer {
  const swatchStyle =
    d.type === 'bubble'  ? d.color :
    d.type === 'heatmap' ? HEAT_SWATCH :
    rampCssGradient()
  return {
    id: d.id,
    label_key: '',
    subtitle_key: '',
    label: d.label,
    subtitle: describeLayer(d),
    visible: d.visible,
    opacity: d.opacity,
    capabilities: { download: false, style: false, remove: true },
    swatch: 'dynamic',
    swatchStyle,
    // No `level`: dynamic overlays render in their own pane at every zoom, so
    // they are never greyed by the district↔neighbourhood active level.
  }
}

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
  // Agent-driven forecast request (target/horizon) — bumped nonce re-triggers it.
  const [forecastReq, setForecastReq] = useState<{ target?: string; horizon?: number; nonce: number } | undefined>(undefined)

  // ── Layer state ──────────────────────────────────────────────────────────────
  const [layers,        setLayers]        = useState<AppLayer[]>(DEFAULT_LAYERS)
  const [styleLayerId,  setStyleLayerId]  = useState<string>('districts')
  const [paletteMode,   setPaletteMode]   = useState<PaletteMode>('land')
  // Agent-created analytical overlays (heatmap / choropleth / bubble).
  const [dynamicLayers, setDynamicLayers] = useState<DynamicLayer[]>([])
  const dynIdRef = useRef(0)
  // Unified top-to-bottom ordering of every layer row (base + dynamic). New
  // dynamic layers are inserted at the top; drag-and-drop reorders this list.
  const [layerOrder, setLayerOrder] = useState<string[]>(() => DEFAULT_LAYERS.map(l => l.id))
  // Which granularity the map is currently showing (zoom-driven). Drives the
  // Layers sidebar's active/greyed state.
  const [activeLevel,   setActiveLevel]   = useState<'district' | 'neighbourhood'>('district')

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
  // Agent-created layers carry a `dyn-` id prefix and live in their own state.
  const isDynId = (id: string) => id.startsWith('dyn-')

  const setLayerVisible = useCallback((id: string, visible: boolean) => {
    if (isDynId(id)) {
      setDynamicLayers(prev => prev.map(l => (l.id === id ? { ...l, visible } : l)))
    } else {
      setLayers(prev => prev.map(l => (l.id === id ? { ...l, visible } : l)))
    }
  }, [])

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    if (isDynId(id)) {
      setDynamicLayers(prev => prev.map(l => (l.id === id ? { ...l, opacity } : l)))
    } else {
      setLayers(prev => prev.map(l => (l.id === id ? { ...l, opacity } : l)))
    }
  }, [])

  const deleteLayer = useCallback((id: string) => {
    if (isDynId(id)) {
      setDynamicLayers(prev => prev.filter(l => l.id !== id))
      setLayerOrder(prev => prev.filter(x => x !== id))
    }
  }, [])

  // Drag-and-drop: move `draggedId` to just before/after `targetId`.
  const reorderLayers = useCallback((draggedId: string, targetId: string, place: 'before' | 'after') => {
    if (draggedId === targetId) return
    setLayerOrder(prev => {
      const without = prev.filter(x => x !== draggedId)
      const idx = without.indexOf(targetId)
      if (idx === -1) return prev
      without.splice(place === 'before' ? idx : idx + 1, 0, draggedId)
      return without
    })
  }, [])

  const zoomToLayer = useCallback((id: string) => {
    // Dynamic overlays don't have their own camera target — frame the data at
    // the granularity they were built for.
    const dyn = dynamicLayers.find(l => l.id === id)
    if (dyn) {
      mapApi.current?.zoomToLayer(dyn.granularity === 'neighbourhood' ? 'neighbourhoods' : 'districts')
      return
    }
    mapApi.current?.zoomToLayer(id)
  }, [dynamicLayers])

  // ── Assistant-driven map control (highlight / zoom) ──────────────────────────
  const handleMapCommand = useCallback((cmd: MapCommand) => {
    const api = mapApi.current
    if (!api) return
    if (cmd.name === 'highlight_map') {
      const names = cmd.input.districts ?? []
      api.highlightDistricts(names, cmd.input.color)
      // Surface the primary highlighted cell's profile in the right sidebar,
      // so a tool-driven highlight reads like a selection. Resolve against both
      // the 18 districts and the 211 STPU neighbourhoods.
      if (names.length > 0) {
        const target = normCellName(names[0])
        const cell =
          districts.find(d => normCellName(d.name) === target) ??
          nbhds.find(d => normCellName(d.name) === target) ??
          null
        if (cell) {
          setSelectedDistrict(cell)
          // Don't yank away from an active Forecast view (show_forecast often
          // also highlights the same cell); otherwise surface the Detail tab.
          setRightTab(prev => (prev === 'forecast' ? prev : 'detail'))
          setRightOpen(true)
        }
      }
    } else if (cmd.name === 'zoom_to') {
      api.zoomToDistrict(cmd.input.district)
    } else if (cmd.name === 'add_layer') {
      const id = `dyn-${++dynIdRef.current}`
      const { layer } = validateAddLayer(cmd.input, id, nbhdGeojson != null)
      if (layer) {
        setDynamicLayers(prev => [...prev, layer])
        setLayerOrder(prev => [id, ...prev])   // new layers go to the top
        setLayersOpen(true)                    // reveal the stack
      }
    } else if (cmd.name === 'show_forecast') {
      // Resolve the area, select it, and open the Forecast tab with the params.
      const target = cmd.input.unit ? normCellName(cmd.input.unit) : ''
      const cell = target
        ? (districts.find(d => normCellName(d.name) === target) ??
           nbhds.find(d => normCellName(d.name) === target) ?? null)
        : null
      if (cell) {
        setSelectedDistrict(cell)
        setForecastReq({
          target: cmd.input.target,
          horizon: cmd.input.horizon_years,
          nonce: Date.now(),
        })
        setRightTab('forecast')
        setRightOpen(true)
      }
    } else if (cmd.name === 'remove_layer') {
      const { id, label, all } = cmd.input
      // Compute the surviving dynamic layers, then prune layerOrder to match.
      setDynamicLayers(prev => {
        let kept = prev
        if (all || (!id && !label)) kept = []
        else if (id) kept = prev.filter(l => l.id !== id)
        else if (label) {
          const target = label.trim().toLowerCase()
          kept = prev.filter(l => l.label.trim().toLowerCase() !== target)
        }
        const keptIds = new Set(kept.map(l => l.id))
        setLayerOrder(order => order.filter(x => !isDynId(x) || keptIds.has(x)))
        return kept
      })
    }
  }, [districts, nbhds, nbhdGeojson])

  const openStyleForLayer = useCallback((id: string) => {
    setStyleLayerId(id)
    setRightTab('style')
    setRightOpen(true)
  }, [])

  const downloadLayer = useCallback((id: string) => {
    const source =
      id === 'districts' ? geojson :
      id === 'neighbourhoods' ? nbhdGeojson :
      null
    if (!source) return
    const fname = id === 'neighbourhoods' ? 'hk-neighbourhoods.geojson' : 'hk-districts.geojson'
    const blob = new Blob([JSON.stringify(source, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    a.click()
    URL.revokeObjectURL(url)
  }, [geojson, nbhdGeojson])

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
  const districtsLayer     = layers.find(l => l.id === 'districts')!
  const neighbourhoodLayer = layers.find(l => l.id === 'neighbourhoods')!
  const basemapLayer       = layers.find(l => l.id === 'basemap')!

  // Resolve the unified `layerOrder` (top→bottom) into concrete rows for the
  // panel, and into the dynamic-overlay list (top→bottom) the map stacks.
  const { panelLayers, orderedDynamicLayers } = useMemo(() => {
    const baseById = new Map(layers.map(l => [l.id, l]))
    const dynById = new Map(dynamicLayers.map(d => [d.id, d]))
    const rows: AppLayer[] = []
    const dyn: DynamicLayer[] = []
    for (const id of layerOrder) {
      const base = baseById.get(id)
      if (base) { rows.push(base); continue }
      const d = dynById.get(id)
      if (d) { rows.push(dynamicToAppLayer(d)); dyn.push(d) }
    }
    return { panelLayers: rows, orderedDynamicLayers: dyn }
  }, [layerOrder, layers, dynamicLayers])

  // ── Error state ───────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-canvas-soft p-8">
        <div className="max-w-md text-center bg-canvas rounded-lg p-8 shadow-card-lg">
          <p className="eyebrow text-error mb-3">{t('app.error.title')}</p>
          <p className="display-md mb-2">{t('app.error.message')}</p>
          <p className="text-sm text-mute font-mono">{loadError}</p>
        </div>
      </div>
    )
  }

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (!geojson || !scorer) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-canvas-soft">
        <span className="eyebrow">{t('app.loading.districts')}</span>
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
            <span className="eyebrow">{t('app.subtitle')}</span>
            <span className="display-sm">{t('app.title')}</span>
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
          onMapCommand={handleMapCommand}
        />

        {/* Left: layers panel */}
        <LayersPanel
          open={layersOpen}
          onToggle={() => setLayersOpen(o => !o)}
          layers={panelLayers}
          activeLevel={activeLevel}
          onSetVisible={setLayerVisible}
          onZoomTo={zoomToLayer}
          onOpenStyle={openStyleForLayer}
          onDownload={downloadLayer}
          onDelete={deleteLayer}
          onReorder={reorderLayers}
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
            onActiveLevelChange={setActiveLevel}
            nbhdVisible={neighbourhoodLayer.visible}
            nbhdGeojson={nbhdGeojson}
            nbhdScorer={nbhdScorer}
            nbhdAllocationResult={nbhdAllocationResult}
            dynamicLayers={orderedDynamicLayers}
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
                  onClick={() => setRightTab('forecast')}
                  className={`
                    h-7 px-3 rounded-full
                    text-[12px] font-medium tracking-body-sm
                    inline-flex items-center gap-1.5
                    transition-colors
                    ${rightTab === 'forecast'
                      ? 'bg-canvas text-ink shadow-hairline-inset'
                      : 'text-mute hover:text-ink'}
                  `}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M1.5 9.5L5 6l2.5 2.5L12.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M9.5 3.5h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('panel.right.tab.forecast')}
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
              ) : rightTab === 'forecast' ? (
                <ForecastPanel district={selectedDistrict} requested={forecastReq} />
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
