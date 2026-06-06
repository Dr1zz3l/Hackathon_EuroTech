/**
 * MapView — 2D choropleth of Hong Kong's 18 districts.
 *
 * Two colour modes:
 *  - Default (no scenario): each district coloured by its dominant land category.
 *  - Scenario active: warm ramp (blue → yellow → red) over viability score.
 *
 * Agent B owns this file. Imports createScorer + types from Agent A's contract.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { AdjacencyMap, District, Scenario, ScoreResult, Scorer } from '../types'
import { useI18n } from '../context/I18nContext'

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const LAND_COLOURS: Record<string, string> = {
  residential: '#f87171',
  industrial:  '#a78bfa',
  commercial:  '#fb923c',
  green:       '#4ade80',
  educational: '#60a5fa',
  other:       '#94a3b8',
}

function dominantLandColour(district: District): string {
  const land = district.land
  const key = (Object.keys(land) as (keyof typeof land)[]).reduce(
    (a, b) => (land[a] >= land[b] ? a : b)
  )
  return LAND_COLOURS[key] ?? '#94a3b8'
}

/**
 * Interpolate between three colours for score in [0,1].
 * 0 → #93c5fd (blue-300), 0.5 → #fde68a (amber-200), 1 → #ef4444 (red-500)
 */
function scoreColour(score: number): string {
  const s = Math.max(0, Math.min(1, score))
  let r: number, g: number, b: number
  if (s < 0.5) {
    const t = s / 0.5
    r = Math.round(147 + (253 - 147) * t)
    g = Math.round(197 + (230 - 197) * t)
    b = Math.round(253 + (138 - 253) * t)
  } else {
    const t = (s - 0.5) / 0.5
    r = Math.round(253 + (239 - 253) * t)
    g = Math.round(230 + ( 68 - 230) * t)
    b = Math.round(138 + ( 68 - 138) * t)
  }
  return `rgb(${r},${g},${b})`
}

// ---------------------------------------------------------------------------
// GeoJSON feature type
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
// Props
// ---------------------------------------------------------------------------

interface MapViewProps {
  geojson: DistrictCollection
  scorer: Scorer
  activeScenario: Scenario | null
  selectedDistrict: District | null
  onSelectDistrict: (d: District) => void
  /** Adjacency graph — used to highlight border-neighbours of the selected district. */
  adjacency: AdjacencyMap | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MapView({
  geojson,
  scorer,
  activeScenario,
  selectedDistrict,
  onSelectDistrict,
  adjacency,
}: MapViewProps) {
  const { locale } = useI18n()
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.GeoJSON | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Precompute all scores when scenario changes
  const scoreMap = useRef<Map<string, ScoreResult>>(new Map())
  if (activeScenario) {
    geojson.features.forEach(f => {
      const d = f.properties
      scoreMap.current.set(d.name, scorer.score(d, activeScenario))
    })
  }

  // ---- Build map once ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [22.35, 114.10],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      opacity: 0.4,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // ---- Re-render GeoJSON layer when scenario / selection / locale changes ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }

    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const d = feature?.properties as District
        const isSelected = d.name === selectedDistrict?.name
        const isNeighbour = !isSelected
          && selectedDistrict !== null
          && adjacency !== null
          && (adjacency[selectedDistrict.name] ?? []).includes(d.name)

        const fillColor = activeScenario
          ? scoreColour(scoreMap.current.get(d.name)?.score ?? 0)
          : dominantLandColour(d)

        if (isSelected) {
          return { fillColor, fillOpacity: 0.9, color: '#1e293b', weight: 2.5, dashArray: undefined }
        }
        if (isNeighbour) {
          return { fillColor, fillOpacity: 0.75, color: '#fbbf24', weight: 2, dashArray: '5 4' }
        }
        return { fillColor, fillOpacity: 0.65, color: '#fff', weight: 1, dashArray: undefined }
      },
      onEachFeature: (feature, layer) => {
        const d = feature.properties as District
        const displayName = locale === 'yue' ? d.name_tc : d.name

        layer.bindTooltip(displayName, {
          permanent: false,
          sticky: true,
          className: 'bg-slate-800 text-white text-xs px-2 py-1 rounded shadow',
        })

        layer.on({
          click: () => onSelectDistrict(d),
          mouseover: (e) => {
            const l = e.target as L.Path
            l.setStyle({ fillOpacity: 0.85, weight: 2 })
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            l.setStyle({
              fillOpacity: d.name === selectedDistrict?.name ? 0.9 : 0.65,
              weight: d.name === selectedDistrict?.name ? 2.5 : 1,
            })
          },
        })
      },
    }).addTo(map)

    layerRef.current = layer
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScenario, selectedDistrict, locale, geojson, scorer, adjacency])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#0f172a' }}
    />
  )
}
