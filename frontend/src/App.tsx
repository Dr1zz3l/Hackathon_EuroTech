/**
 * App.tsx — Agent B sole integrator.
 *
 * Owns all state and wiring. Imports:
 *   createScorer  from lib/scoring.ts   (Agent A — do not edit)
 *   SCENARIOS     from scenarios.ts     (Agent A — do not edit)
 *   District/…    from types.ts         (shared contract — do not edit)
 *
 * State: activeScenario, selectedDistrict, geojson, scorer, allocator, mapMode,
 *        plannerMessage (LLM summary prose after a custom goal)
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { I18nProvider, useI18n } from './context/I18nContext'
import type { Locale } from './context/I18nContext'
import { createScorer } from './lib/scoring'
import { createAllocator } from './lib/reallocation'
import { SCENARIOS } from './scenarios'
import type { AdjacencyMap, AllocationResult, Allocator, District, Scenario, ScoreResult, Scorer } from './types'
import {
  buildSyntheticScenario, buildPlanSummaryPayload,
  parseGoal, summarizePlan, BASE_WEIGHTS,
} from './lib/llm'

import MapView from './components/MapView'
import ScenarioPanel from './components/ScenarioPanel'
import GoalInput from './components/GoalInput'
import DetailPanel from './components/DetailPanel'
import MapLegend from './components/MapLegend'
import LanguageToggle from './components/LanguageToggle'

// ---------------------------------------------------------------------------
// GeoJSON feature type (mirrors gen_districts_geojson.py output)
// ---------------------------------------------------------------------------
interface DistrictFeature {
  type: 'Feature'
  properties: District
  geometry: GeoJSON.Geometry
}

interface DistrictCollection {
  type: 'FeatureCollection'
  features: DistrictFeature[]
}

// ---------------------------------------------------------------------------
// Inner app (needs I18nProvider above it)
// ---------------------------------------------------------------------------

function AppInner() {
  const { locale, t } = useI18n()

  const [geojson, setGeojson] = useState<DistrictCollection | null>(null)
  const [adjacency, setAdjacency] = useState<AdjacencyMap | null>(null)
  const [scorer, setScorer] = useState<Scorer | null>(null)
  const [allocator, setAllocator] = useState<Allocator | null>(null)
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 'future' = dominant future land use (default); 'viability' = score ramp. */
  const [mapMode, setMapMode] = useState<'future' | 'viability'>('future')

  /** LLM planner reply shown below the goal input box. */
  const [plannerMessage, setPlannerMessage] = useState<{
    rationale: string
    prose: string | null
    loading: boolean
    /** Merged WeightSet that Haiku produced — used for the weight breakdown display. */
    weights: import('./types').WeightSet | null
    /** Keys that Haiku explicitly overrode (vs. kept at the 0.25 default). */
    overriddenKeys: Set<string>
  } | null>(null)

  // District array used for area-weighted city_delta and TC names in LLM summary
  const [districts, setDistricts] = useState<District[]>([])

  // ---- Load GeoJSON + adjacency in parallel at startup ----
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

  // ---- Score result for selected district under active scenario ----
  const scoreResult = useMemo<ScoreResult | null>(() => {
    if (!selectedDistrict || !activeScenario || !scorer) return null
    return scorer.score(selectedDistrict, activeScenario)
  }, [selectedDistrict, activeScenario, scorer])

  // ---- Reallocation result for the active scenario ----
  const allocationResult = useMemo<AllocationResult | null>(() => {
    if (!activeScenario || !allocator || !scorer) return null
    return allocator.allocate(activeScenario, scorer)
  }, [activeScenario, allocator, scorer])

  // ---- LLM goal handler (orchestrates parse → scenario → allocate → summarize) ----
  const handleGoal = useCallback(async (text: string) => {
    if (!scorer || !allocator) throw new Error('Data not loaded yet')

    // 1. Ask the LLM to parse the goal
    const parsed = await parseGoal(text, locale as Locale)

    // 2. Build synthetic scenario and activate it immediately (map recolours)
    const scenario = buildSyntheticScenario(parsed)
    setActiveScenario(scenario)
    setMapMode('future')

    // Determine which weight keys Haiku explicitly overrode (vs. kept at default)
    const overriddenKeys = new Set(
      (Object.entries(parsed.weight_overrides) as [string, number | null | undefined][])
        .filter(([, v]) => v != null)
        .map(([k]) => k)
    )

    // Show rationale + weights immediately; prose loading
    const msgBase = { rationale: parsed.rationale, weights: scenario.weights, overriddenKeys }
    setPlannerMessage({ ...msgBase, prose: null, loading: true })

    // 3. Compute allocation synchronously (don't depend on useMemo render cycle)
    const allocation = allocator.allocate(scenario, scorer)

    if (!allocation) {
      // No goal_delta — shouldn't happen for custom, but degrade gracefully
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
  }, [scorer, allocator, locale])

  // Clear planner message when a preset scenario is selected
  const handleSelectPreset = useCallback((s: Scenario | null) => {
    setActiveScenario(s)
    setPlannerMessage(null)
  }, [])

  // ---- Loading / error states ----
  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-red-400 p-8 text-center">
        <div>
          <p className="font-semibold">Failed to load district data</p>
          <p className="text-sm mt-1 text-slate-400">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!geojson || !scorer) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400">
        Loading…
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0 z-10">
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">
            HK District Viability
          </h1>
          <p className="text-[10px] text-slate-500 leading-tight">
            Smart City Planning · 18 Districts
          </p>
        </div>
        <LanguageToggle />
      </header>

      {/* Scenario buttons */}
      <ScenarioPanel
        activeScenario={activeScenario}
        onSelect={handleSelectPreset}
      />

      {/* Free-text goal input (Stage 2 LLM) */}
      <GoalInput onGoal={handleGoal} />

      {/* Planner reply — rationale + summary prose */}
      {plannerMessage && (
        <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0 space-y-1">
          <p className="text-[10px] text-amber-400 leading-snug italic">
            {plannerMessage.rationale}
          </p>
          {/* Weight breakdown — shows how Haiku tuned the scoring weights */}
          {plannerMessage.weights && (() => {
            const w = plannerMessage.weights
            const WEIGHT_KEYS: (keyof typeof BASE_WEIGHTS)[] = ['displacement', 'age', 'headroom', 'area']
            if (w.renewal != null) (WEIGHT_KEYS as string[]).push('renewal')
            const total = WEIGHT_KEYS.reduce((s, k) => s + (w[k as keyof typeof w] ?? 0), 0)
            const SHORT: Record<string, string> = {
              displacement: 'displ', age: 'age', headroom: 'headrm', area: 'area', renewal: 'renew',
            }
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] text-slate-500 shrink-0 uppercase tracking-wide">
                  Haiku weights
                </span>
                {WEIGHT_KEYS.map(k => {
                  const raw = w[k as keyof typeof w] ?? 0
                  const pct = total > 0 ? Math.round((raw / total) * 100) : 0
                  const isSet = plannerMessage.overriddenKeys.has(k)
                  return (
                    <span
                      key={k}
                      title={`${k}: ${raw.toFixed(3)} (${pct}%)${isSet ? ' — tuned by Haiku' : ' — default'}`}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isSet
                          ? 'bg-amber-400/25 text-amber-300 ring-1 ring-amber-400/40'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {SHORT[k]} {pct}%{isSet ? ' ✦' : ''}
                    </span>
                  )
                })}
              </div>
            )
          })()}
          {plannerMessage.loading ? (
            <p className="text-[10px] text-slate-500 animate-pulse">
              {t('planner.summary.loading')}
            </p>
          ) : plannerMessage.prose ? (
            <p className="text-[10px] text-slate-300 leading-relaxed">
              {plannerMessage.prose}
            </p>
          ) : null}
        </div>
      )}

      {/* Map + panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map — full width, with legend overlay */}
        <div className="relative flex-1">
          <MapView
            geojson={geojson}
            scorer={scorer}
            activeScenario={activeScenario}
            allocationResult={allocationResult}
            mapMode={mapMode}
            selectedDistrict={selectedDistrict}
            onSelectDistrict={setSelectedDistrict}
            adjacency={adjacency}
          />
          <MapLegend
            activeScenario={activeScenario}
            mapMode={mapMode}
            onToggleMapMode={() => setMapMode(m => m === 'future' ? 'viability' : 'future')}
          />

          {/* Active scenario description badge */}
          {activeScenario && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-400/90 text-slate-900 text-[11px] font-medium px-3 py-1 rounded-full shadow pointer-events-none whitespace-nowrap">
              {activeScenario.horizon_year} ·{' '}
              {activeScenario.custom_label
                ?? SCENARIOS.find(s => s.id === activeScenario.id)?.id.replace(/_/g, ' ')
                ?? activeScenario.id}
            </div>
          )}
        </div>

        {/* Detail panel — slide in from right when a district is selected */}
        {selectedDistrict && (
          <div className="w-72 shrink-0 border-l border-slate-700 overflow-hidden">
            <DetailPanel
              district={selectedDistrict}
              scenario={activeScenario}
              scoreResult={scoreResult}
              allocation={allocationResult?.byDistrict.get(selectedDistrict.name) ?? null}
              onClose={() => setSelectedDistrict(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root — wraps everything in the i18n provider
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  )
}
