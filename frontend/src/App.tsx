'use client'

/**
 * App.tsx — Agent B sole integrator.
 *
 * Owns all state and wiring. Imports:
 *   createScorer  from lib/scoring.ts   (Agent A — do not edit)
 *   SCENARIOS     from scenarios.ts     (Agent A — do not edit)
 *   District/…    from types.ts         (shared contract — do not edit)
 *
 * State: activeScenario, selectedDistrict, geojson, scorer
 */

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { I18nProvider } from './context/I18nContext'
import { createScorer } from './lib/scoring'
import { SCENARIOS } from './scenarios'
import type { District, Scenario, ScoreResult, Scorer } from './types'

import ScenarioPanel from './components/ScenarioPanel'
import DetailPanel from './components/DetailPanel'
import MapLegend from './components/MapLegend'
import LanguageToggle from './components/LanguageToggle'

// Leaflet touches `window`, so the map must never render on the server.
const MapView = dynamic(() => import('./components/MapView'), { ssr: false })

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
  const [geojson, setGeojson] = useState<DistrictCollection | null>(null)
  const [scorer, setScorer] = useState<Scorer | null>(null)
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ---- Load GeoJSON once at startup ----
  useEffect(() => {
    fetch('/districts.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DistrictCollection>
      })
      .then(data => {
        setGeojson(data)
        const districts = data.features.map(f => f.properties)
        setScorer(createScorer(districts))
      })
      .catch(err => setLoadError(String(err)))
  }, [])

  // ---- Score result for selected district under active scenario ----
  const scoreResult = useMemo<ScoreResult | null>(() => {
    if (!selectedDistrict || !activeScenario || !scorer) return null
    return scorer.score(selectedDistrict, activeScenario)
  }, [selectedDistrict, activeScenario, scorer])

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
        onSelect={setActiveScenario}
      />

      {/* Map + panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map — full width, with legend overlay */}
        <div className="relative flex-1">
          <MapView
            geojson={geojson}
            scorer={scorer}
            activeScenario={activeScenario}
            selectedDistrict={selectedDistrict}
            onSelectDistrict={setSelectedDistrict}
          />
          <MapLegend activeScenario={activeScenario} />

          {/* Active scenario description badge */}
          {activeScenario && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-400/90 text-slate-900 text-[11px] font-medium px-3 py-1 rounded-full shadow pointer-events-none whitespace-nowrap">
              {activeScenario.horizon_year} · {SCENARIOS.find(s => s.id === activeScenario.id)?.id.replace(/_/g, ' ')}
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
