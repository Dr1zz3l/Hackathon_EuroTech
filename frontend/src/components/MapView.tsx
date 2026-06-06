'use client'

/**
 * MapView — 2D choropleth of Hong Kong's 18 districts.
 *
 * Visual system: Vercel light canvas (see public/DESIGN-vercel.md).
 *   - Carto Positron tiles (clean, near-white) sit on the canvas-soft body
 *   - Land-use palette re-keyed to brand gradient stops (cyan / violet / pink / amber / link-blue / mute)
 *   - Viability ramp: link-blue → warning amber → error red
 *   - Selected district stroked in link-blue
 *
 * Layer-state contract (new — atlas.co-style):
 *   - `layers` prop carries per-layer visibility + opacity, keyed by id
 *     ('districts' or 'basemap'). MapView reads it and applies live.
 *   - `paletteMode` chooses between dominant-land-use colouring and the
 *     viability-score ramp (the latter still requires an active scenario).
 *   - `apiRef` is filled with a handle the parent can call to imperative-zoom
 *     a specific layer ('districts' = fit to GeoJSON bounds; 'basemap' = HK).
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { District, Scenario, ScoreResult, Scorer } from '../types'
import { useI18n } from '../context/I18nContext'

// ─── Palette ───────────────────────────────────────────────────────────────

const LAND_COLOURS: Record<string, string> = {
  residential: '#ff0080',
  industrial:  '#7928ca',
  commercial:  '#f5a623',
  green:       '#50e3c2',
  educational: '#0070f3',
  other:       '#a1a1a1',
}

function dominantLandColour(district: District): string {
  const land = district.land
  const key = (Object.keys(land) as (keyof typeof land)[]).reduce(
    (a, b) => (land[a] >= land[b] ? a : b)
  )
  return LAND_COLOURS[key] ?? '#a1a1a1'
}

/**
 * Viability score → colour ramp, brand-aligned.
 *   0   → link blue       (#0070f3)
 *   0.5 → warning amber   (#f5a623)
 *   1   → error red       (#ee0000)
 */
function scoreColour(score: number): string {
  const s = Math.max(0, Math.min(1, score))
  let r: number, g: number, b: number
  if (s < 0.5) {
    const t = s / 0.5
    r = Math.round(  0 + (245 -   0) * t)
    g = Math.round(112 + (166 - 112) * t)
    b = Math.round(243 + ( 35 - 243) * t)
  } else {
    const t = (s - 0.5) / 0.5
    r = Math.round(245 + (238 - 245) * t)
    g = Math.round(166 + (  0 - 166) * t)
    b = Math.round( 35 + (  0 -  35) * t)
  }
  return `rgb(${r},${g},${b})`
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface DistrictFeature {
  type: 'Feature'
  properties: District
  geometry: GeoJSON.Geometry
}
interface DistrictCollection {
  type: 'FeatureCollection'
  features: DistrictFeature[]
}

/** Public API the parent can call imperatively. */
export interface MapApi {
  zoomToLayer: (id: string) => void
}

export type PaletteMode = 'land' | 'scenario'

interface MapViewProps {
  geojson: DistrictCollection
  scorer: Scorer
  activeScenario: Scenario | null
  selectedDistrict: District | null
  onSelectDistrict: (d: District) => void
  /** Atlas-style layer state */
  districtsVisible: boolean
  districtsOpacity: number   // 0–1
  basemapVisible: boolean
  basemapOpacity: number     // 0–1
  paletteMode: PaletteMode
  /** Parent fills this with the imperative handle on mount */
  apiRef?: { current: MapApi | null }
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function MapView({
  geojson,
  scorer,
  activeScenario,
  selectedDistrict,
  onSelectDistrict,
  districtsVisible,
  districtsOpacity,
  basemapVisible,
  basemapOpacity,
  paletteMode,
  apiRef,
}: MapViewProps) {
  const { locale } = useI18n()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const boundsFitRef = useRef<boolean>(false)

  // Precompute all scores when scenario changes — kept in a ref so we don't
  // re-render the entire layer just because of a scenario flick.
  const scoreMap = useRef<Map<string, ScoreResult>>(new Map())
  if (activeScenario) {
    geojson.features.forEach(f => {
      const d = f.properties
      scoreMap.current.set(d.name, scorer.score(d, activeScenario))
    })
  }

  // ── Build map once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [22.35, 114.13],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
      zoomSnap: 0.5,
    })

    // Carto Positron — clean near-white base, on-brand with the canvas
    const tile = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: basemapOpacity,
      }
    )
    if (basemapVisible) tile.addTo(map)

    mapRef.current = map
    tileLayerRef.current = tile

    return () => {
      map.remove()
      mapRef.current = null
      tileLayerRef.current = null
      geoLayerRef.current = null
      boundsFitRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Re-render GeoJSON layer when style inputs change ────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geoLayerRef.current) {
      geoLayerRef.current.remove()
      geoLayerRef.current = null
    }

    const useScoreRamp = paletteMode === 'scenario' && activeScenario != null

    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const d = feature?.properties as District
        const isSelected = d.name === selectedDistrict?.name
        const fillColor = useScoreRamp
          ? scoreColour(scoreMap.current.get(d.name)?.score ?? 0)
          : dominantLandColour(d)

        const baseOpacity = isSelected ? 0.88 : 0.7
        return {
          fillColor,
          fillOpacity: baseOpacity * districtsOpacity,
          color: isSelected ? '#0070f3' : '#ffffff',
          weight: isSelected ? 2.5 : 1.25,
        }
      },
      onEachFeature: (feature, layerObj) => {
        const d = feature.properties as District
        const displayName = locale === 'yue' ? d.name_tc : d.name

        layerObj.bindTooltip(displayName, {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -4],
        })

        layerObj.on({
          click: () => onSelectDistrict(d),
          mouseover: (e) => {
            const l = e.target as L.Path
            l.setStyle({ fillOpacity: 0.85 * districtsOpacity, weight: 2 })
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            const isSelected = d.name === selectedDistrict?.name
            l.setStyle({
              fillOpacity: (isSelected ? 0.88 : 0.7) * districtsOpacity,
              weight: isSelected ? 2.5 : 1.25,
            })
          },
        })
      },
    })

    if (districtsVisible) layer.addTo(map)
    geoLayerRef.current = layer

    // Fit to HK on first render only
    if (!boundsFitRef.current && districtsVisible) {
      map.fitBounds(layer.getBounds(), { padding: [24, 24] })
      boundsFitRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScenario, selectedDistrict, locale, geojson, scorer,
    paletteMode, districtsOpacity,
  ])

  // ── React to districts visibility ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const layer = geoLayerRef.current
    if (!map || !layer) return
    if (districtsVisible) {
      if (!map.hasLayer(layer)) layer.addTo(map)
    } else {
      if (map.hasLayer(layer)) layer.remove()
    }
  }, [districtsVisible])

  // ── React to basemap visibility ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const tile = tileLayerRef.current
    if (!map || !tile) return
    if (basemapVisible) {
      if (!map.hasLayer(tile)) tile.addTo(map)
    } else {
      if (map.hasLayer(tile)) tile.remove()
    }
  }, [basemapVisible])

  // ── React to basemap opacity ───────────────────────────────
  useEffect(() => {
    tileLayerRef.current?.setOpacity(basemapOpacity)
  }, [basemapOpacity])

  // ── Imperative API handed back to the parent ──────────────
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      zoomToLayer: (id: string) => {
        const map = mapRef.current
        if (!map) return
        if (id === 'districts' && geoLayerRef.current) {
          map.fitBounds(geoLayerRef.current.getBounds(), { padding: [40, 40] })
        } else if (id === 'basemap') {
          map.setView([22.35, 114.13], 10, { animate: true })
        }
      },
    }
    return () => {
      if (apiRef) apiRef.current = null
    }
  }, [apiRef])

  // Invalidate Leaflet's cached size when the container resizes (sidebars
  // collapsing/expanding will trigger this via ResizeObserver below).
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return
    const ro = new ResizeObserver(() => {
      mapRef.current?.invalidateSize()
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#f5f5f5' }}
    />
  )
}
