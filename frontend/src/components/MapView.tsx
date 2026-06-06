'use client'

/**
 * MapView — 2D choropleth of Hong Kong's 18 districts + 211 STPU neighbourhoods.
 *
 * Visual system: Vercel light canvas (see public/DESIGN-vercel.md).
 *   - Carto Positron tiles (clean, near-white) sit on the canvas-soft body
 *   - Land-use palette re-keyed to brand gradient stops
 *   - Viability ramp: link-blue → warning amber → error red
 *   - Selected district stroked in link-blue; adjacency neighbours in dashed amber
 *
 * Zoom reveal:
 *   - Below zoom 12.5 → district choropleth (18 polygons)
 *   - At/above zoom 12.5 → neighbourhood choropleth (211 STPU polygons)
 *   - A Leaflet `zoomend` listener swaps layers at the threshold.
 *
 * Layer-state contract (atlas.co-style):
 *   - `districtsVisible/Opacity` and `basemapVisible/Opacity` drive live layer state
 *   - `paletteMode` switches between land-use colouring and the viability-score ramp
 *   - `mapMode` switches between future-projected land use and viability within a scenario
 *   - `allocationResult` + `mapMode='future'` triggers future land colouring + delta labels
 *   - `adjacency` highlights border-neighbours of the selected district
 *   - `apiRef` is filled with a handle the parent can call to imperative-zoom
 *   - `nbhdGeojson` / `nbhdScorer` / `nbhdAllocationResult` power the neighbourhood layer
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { AllocationResult, AdjacencyMap, District, LandUse, Scenario, ScoreResult, Scorer } from '../types'
import { useI18n } from '../context/I18nContext'

// ─── Zoom threshold ───────────────────────────────────────────────────────────

/** Below this zoom: show district layer. At/above: show neighbourhood layer. */
const NBHD_ZOOM = 12.5

// ─── Palette ──────────────────────────────────────────────────────────────────

const LAND_COLOURS: Record<string, string> = {
  residential:    '#ff0080',   // highlight-pink
  industrial:     '#7928ca',   // violet
  commercial:     '#f5a623',   // warning amber
  agricultural:   '#a3c644',   // olive/farmland
  recreational:   '#50e3c2',   // cyan (parks & open space)
  institutional:  '#0070f3',   // link blue (GIC)
  misc:           '#a1a1a1',   // hairline-strong grey
  infrastructure: '#6b7280',   // slate (roads/rail/airport/port)
  protected:      '#1d8a4e',   // forest green (country parks/wetlands/reservoirs)
}

function dominantLandColour(district: District): string {
  const land = district.land
  const key = (Object.keys(land) as (keyof typeof land)[]).reduce(
    (a, b) => (land[a] >= land[b] ? a : b)
  )
  return LAND_COLOURS[key] ?? '#a1a1a1'
}

function dominantLandColourFromUse(land: LandUse): string {
  const key = (Object.keys(land) as (keyof LandUse)[]).reduce(
    (a, b) => (land[a] >= land[b] ? a : b)
  )
  return LAND_COLOURS[key] ?? '#94a3b8'
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  allocationResult: AllocationResult | null
  /** 'future' = projected dominant land use (default); 'viability' = score ramp. */
  mapMode: 'future' | 'viability'
  selectedDistrict: District | null
  onSelectDistrict: (d: District) => void
  /** Adjacency graph — used to highlight border-neighbours of the selected district. */
  adjacency: AdjacencyMap | null
  /** Atlas-style layer state */
  districtsVisible: boolean
  districtsOpacity: number   // 0–1
  basemapVisible: boolean
  basemapOpacity: number     // 0–1
  paletteMode: PaletteMode
  /** Parent fills this with the imperative handle on mount */
  apiRef?: { current: MapApi | null }
  // ── Neighbourhood layer (optional — graceful degradation when absent) ─────────
  /** 211 STPU neighbourhood GeoJSON (loaded asynchronously). */
  nbhdGeojson?: DistrictCollection | null
  /** Scorer with norms computed over the 211 neighbourhood units. */
  nbhdScorer?: Scorer | null
  /** Flat QP allocation result over all 211 neighbourhoods. */
  nbhdAllocationResult?: AllocationResult | null
}

// ─── Delta label builder (shared between district and neighbourhood layers) ───

function buildDeltaMarker(
  d: District,
  alloc: import('../types').DistrictAllocation | undefined,
  lyr: L.Layer,
  map: L.Map,
): L.Marker | null {
  if (!alloc) return null

  const delta = alloc.delta
  type Cat = keyof typeof delta
  const cats = Object.keys(delta) as Cat[]
  const gainCat = cats.reduce((a, b) => delta[a] >= delta[b] ? a : b)
  const lossCat = cats.reduce((a, b) => delta[a] <= delta[b] ? a : b)

  const gainPct = +(delta[gainCat] * 100).toFixed(1)
  const lossPct = +(delta[lossCat] * 100).toFixed(1)

  if (Math.abs(gainPct) < 0.1 && Math.abs(lossPct) < 0.1) return null

  const CAT_LABEL: Record<string, string> = {
    residential: 'Res', industrial: 'Ind', commercial: 'Com',
    agricultural: 'Agr', recreational: 'Rec', institutional: 'Ins',
    misc: 'Misc', infrastructure: 'Infra', protected: 'Prot',
  }

  const gainLine = gainPct >= 0.1
    ? `<div style="color:#16a34a;font-weight:600">+${gainPct}% ${CAT_LABEL[gainCat] ?? gainCat}</div>`
    : ''
  const lossLine = lossPct <= -0.1
    ? `<div style="color:#dc2626">${lossPct}% ${CAT_LABEL[lossCat] ?? lossCat}</div>`
    : ''
  const html = gainLine + lossLine
  if (!html) return null

  const pathLayer = lyr as unknown as L.Polygon
  const bounds = typeof pathLayer.getBounds === 'function' ? pathLayer.getBounds() : null
  const center = bounds ? bounds.getCenter() : null
  if (!center) return null

  const icon = L.divIcon({
    className: '',
    html: `<div style="
        transform:translate(-50%,-50%);
        display:inline-block;
        font-size:11px;line-height:1.4;text-align:center;
        font-family:ui-monospace,monospace;
        background:rgba(250,250,250,0.92);
        color:#111;
        padding:3px 6px;border-radius:4px;
        border:1px solid rgba(0,0,0,0.1);
        white-space:nowrap;pointer-events:none;
        box-shadow:0 1px 4px rgba(0,0,0,0.12);
      ">${html}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })

  void d  // suppress unused warning (name available for debugging)
  const marker = L.marker(center, { icon, interactive: false, zIndexOffset: 500 })
  marker.addTo(map)
  return marker
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapView({
  geojson,
  scorer,
  activeScenario,
  allocationResult,
  mapMode,
  selectedDistrict,
  onSelectDistrict,
  adjacency,
  districtsVisible,
  districtsOpacity,
  basemapVisible,
  basemapOpacity,
  paletteMode,
  apiRef,
  nbhdGeojson,
  nbhdScorer,
  nbhdAllocationResult,
}: MapViewProps) {
  const { locale } = useI18n()

  const containerRef     = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<L.Map | null>(null)
  const tileLayerRef     = useRef<L.TileLayer | null>(null)
  const geoLayerRef      = useRef<L.GeoJSON | null>(null)
  const nbhdLayerRef     = useRef<L.GeoJSON | null>(null)
  const boundsFitRef     = useRef<boolean>(false)

  // Precompute all scores at render time (ref keeps them off the re-render path)
  const scoreMap     = useRef<Map<string, ScoreResult>>(new Map())
  const nbhdScoreMap = useRef<Map<string, ScoreResult>>(new Map())

  if (activeScenario) {
    geojson.features.forEach(f => {
      const d = f.properties
      scoreMap.current.set(d.name, scorer.score(d, activeScenario))
    })
    if (nbhdGeojson && nbhdScorer) {
      nbhdGeojson.features.forEach(f => {
        const d = f.properties as District
        nbhdScoreMap.current.set(d.name, nbhdScorer.score(d, activeScenario))
      })
    }
  }

  // ── Build map once ──────────────────────────────────────────────────────────
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
      nbhdLayerRef.current = null
      boundsFitRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Zoom listener: swap district ↔ neighbourhood layers at NBHD_ZOOM ────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const onZoom = () => {
      const zoom = map.getZoom()
      const showNbhd = zoom >= NBHD_ZOOM && nbhdLayerRef.current !== null

      // District layer: only visible below the threshold
      if (geoLayerRef.current) {
        if (showNbhd) {
          if (map.hasLayer(geoLayerRef.current)) geoLayerRef.current.remove()
        } else if (districtsVisible) {
          if (!map.hasLayer(geoLayerRef.current)) geoLayerRef.current.addTo(map)
        }
      }

      // Neighbourhood layer: only visible at/above the threshold
      if (nbhdLayerRef.current) {
        if (showNbhd) {
          if (!map.hasLayer(nbhdLayerRef.current)) nbhdLayerRef.current.addTo(map)
        } else {
          if (map.hasLayer(nbhdLayerRef.current)) nbhdLayerRef.current.remove()
        }
      }
    }

    map.on('zoomend', onZoom)
    return () => { map.off('zoomend', onZoom) }
  // Re-wire whenever visibility prop changes so the closure is current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtsVisible])

  // ── Re-render district GeoJSON layer when any styling input changes ──────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geoLayerRef.current) {
      geoLayerRef.current.remove()
      geoLayerRef.current = null
    }

    const deltaMarkers: L.Marker[] = []

    const useScoreRamp = paletteMode === 'scenario' && activeScenario != null

    const layer = L.geoJSON(geojson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const d = feature?.properties as District
        // A neighbourhood is "selected" if its parent district name matches
        const isSelected = d.name === selectedDistrict?.name
          || d.name === (selectedDistrict?.parent_district)
        const isNeighbour = !isSelected
          && selectedDistrict !== null
          && adjacency !== null
          && !selectedDistrict.tpu_code  // only highlight adjacency at district level
          && (adjacency[selectedDistrict.name] ?? []).includes(d.name)

        let fillColor: string
        if (useScoreRamp) {
          fillColor = scoreColour(scoreMap.current.get(d.name)?.score ?? 0)
        } else if (mapMode === 'future' && allocationResult) {
          const alloc = allocationResult.byDistrict.get(d.name)
          fillColor = alloc
            ? dominantLandColourFromUse(alloc.future)
            : dominantLandColour(d)
        } else {
          fillColor = dominantLandColour(d)
        }

        if (isSelected) {
          return {
            fillColor,
            fillOpacity: 0.88 * districtsOpacity,
            color: '#0070f3',
            weight: 2.5,
            dashArray: undefined,
          }
        }
        if (isNeighbour) {
          return {
            fillColor,
            fillOpacity: 0.75 * districtsOpacity,
            color: '#fbbf24',
            weight: 2,
            dashArray: '5 4',
          }
        }
        return {
          fillColor,
          fillOpacity: 0.7 * districtsOpacity,
          color: '#ffffff',
          weight: 1.25,
          dashArray: undefined,
        }
      },
      onEachFeature: (feature, lyr) => {
        const d = feature.properties as District
        const displayName = locale === 'yue' ? d.name_tc : d.name

        lyr.bindTooltip(displayName, {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -4],
        })

        lyr.on({
          click: () => onSelectDistrict(d),
          mouseover: (e) => {
            const l = e.target as L.Path
            l.setStyle({ fillOpacity: 0.85 * districtsOpacity, weight: 2 })
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            const sel = d.name === selectedDistrict?.name
              || d.name === selectedDistrict?.parent_district
            l.setStyle({
              fillOpacity: (sel ? 0.88 : 0.7) * districtsOpacity,
              weight: sel ? 2.5 : 1.25,
            })
          },
        })

        // Delta labels for district layer (shown at low zoom)
        if (!useScoreRamp && activeScenario && mapMode === 'future' && allocationResult) {
          const alloc = allocationResult.byDistrict.get(d.name)
          const marker = buildDeltaMarker(d, alloc, lyr, map)
          if (marker) deltaMarkers.push(marker)
        }
      },
    })

    // Apply zoom-based visibility: districts shown only below the threshold
    const currentZoom = map.getZoom()
    const showAtThisZoom = currentZoom < NBHD_ZOOM
    if (districtsVisible && showAtThisZoom) layer.addTo(map)
    geoLayerRef.current = layer

    // Fit to HK bounds on first render only
    if (!boundsFitRef.current && districtsVisible) {
      map.fitBounds(layer.getBounds(), { padding: [24, 24] })
      boundsFitRef.current = true
    }

    return () => {
      deltaMarkers.forEach(m => m.remove())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScenario, allocationResult, mapMode, selectedDistrict,
    locale, geojson, scorer, adjacency, paletteMode, districtsOpacity,
  ])

  // ── Build neighbourhood GeoJSON layer ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !nbhdGeojson) return

    if (nbhdLayerRef.current) {
      nbhdLayerRef.current.remove()
      nbhdLayerRef.current = null
    }

    const nbhdDeltaMarkers: L.Marker[] = []
    const useScoreRamp = paletteMode === 'scenario' && activeScenario != null

    const layer = L.geoJSON(nbhdGeojson as unknown as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const d = feature?.properties as District
        const isSelected = d.name === selectedDistrict?.name

        let fillColor: string
        if (useScoreRamp) {
          fillColor = scoreColour(nbhdScoreMap.current.get(d.name)?.score ?? 0)
        } else if (mapMode === 'future' && nbhdAllocationResult) {
          const alloc = nbhdAllocationResult.byDistrict.get(d.name)
          fillColor = alloc
            ? dominantLandColourFromUse(alloc.future)
            : dominantLandColour(d)
        } else {
          fillColor = dominantLandColour(d)
        }

        if (isSelected) {
          return {
            fillColor,
            fillOpacity: 0.90 * districtsOpacity,
            color: '#0070f3',
            weight: 2.5,
            dashArray: undefined,
          }
        }
        return {
          fillColor,
          fillOpacity: 0.72 * districtsOpacity,
          color: '#ffffff',
          weight: 0.75,
          dashArray: undefined,
        }
      },
      onEachFeature: (feature, lyr) => {
        const d = feature.properties as District
        const displayName = locale === 'yue' ? d.name_tc : d.name

        lyr.bindTooltip(displayName, {
          permanent: false,
          sticky: true,
          direction: 'top',
          offset: [0, -4],
        })

        lyr.on({
          click: () => onSelectDistrict(d),
          mouseover: (e) => {
            const l = e.target as L.Path
            l.setStyle({ fillOpacity: 0.88 * districtsOpacity, weight: 1.5 })
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            const sel = d.name === selectedDistrict?.name
            l.setStyle({
              fillOpacity: (sel ? 0.90 : 0.72) * districtsOpacity,
              weight: sel ? 2.5 : 0.75,
            })
          },
        })

        // Delta labels for neighbourhood layer (shown at high zoom only)
        if (!useScoreRamp && activeScenario && mapMode === 'future' && nbhdAllocationResult) {
          const alloc = nbhdAllocationResult.byDistrict.get(d.name)
          const marker = buildDeltaMarker(d, alloc, lyr, map)
          if (marker) nbhdDeltaMarkers.push(marker)
        }
      },
    })

    // Apply zoom-based visibility: neighbourhood layer only at/above threshold
    const currentZoom = map.getZoom()
    if (currentZoom >= NBHD_ZOOM) layer.addTo(map)
    nbhdLayerRef.current = layer

    return () => {
      nbhdDeltaMarkers.forEach(m => m.remove())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScenario, nbhdAllocationResult, mapMode, selectedDistrict,
    locale, nbhdGeojson, nbhdScorer, paletteMode, districtsOpacity,
  ])

  // ── React to districts visibility ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    const layer = geoLayerRef.current
    if (!map || !layer) return
    if (districtsVisible) {
      // Only add if we're below the neighbourhood zoom threshold
      if (map.getZoom() < NBHD_ZOOM && !map.hasLayer(layer)) layer.addTo(map)
    } else {
      if (map.hasLayer(layer)) layer.remove()
    }
  }, [districtsVisible])

  // ── React to basemap visibility ─────────────────────────────────────────────
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

  // ── React to basemap opacity ────────────────────────────────────────────────
  useEffect(() => {
    tileLayerRef.current?.setOpacity(basemapOpacity)
  }, [basemapOpacity])

  // ── Imperative API handed back to the parent ────────────────────────────────
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

  // ── Invalidate Leaflet's cached size when sidebars expand/collapse ───────────
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
