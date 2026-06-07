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

import { useCallback, useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.heat'   // augments L with L.heatLayer (true smooth heatmap)
import type { AllocationResult, AdjacencyMap, District, LandUse, Scenario, ScoreResult, Scorer } from '../types'
import { useI18n } from '../context/I18nContext'
import {
  type DynamicLayer,
  metricValue,
  formatMetricValue,
  rampColor,
  HEAT_GRADIENT,
} from '../lib/dynamicLayers'

// ─── Zoom threshold ───────────────────────────────────────────────────────────

/** Below this zoom: show district layer. At/above: show neighbourhood layer. */
const NBHD_ZOOM = 12.5

// ─── Palette ──────────────────────────────────────────────────────────────────

/** Default assistant-highlight colour (link-blue) and normaliser for name matching. */
const HIGHLIGHT_COLOR = '#0070f3'
function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[-·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Return the sub-layers of a GeoJSON layer whose feature name is in `wanted`. */
function collectMatches(
  layer: L.GeoJSON | null,
  wanted: Set<string>,
): L.Layer[] {
  if (!layer) return []
  const out: L.Layer[] = []
  layer.eachLayer((l) => {
    const f = (l as L.GeoJSON & { feature?: GeoJSON.Feature }).feature
    const nm = (f?.properties as District | undefined)?.name
    if (nm && wanted.has(normName(nm))) out.push(l)
  })
  return out
}

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
  /** Highlight districts by name (assistant-driven). Empty array clears. */
  highlightDistricts: (names: string[], color?: string) => void
  /** Fit the camera to one district by name, or 'all' to reset to HK. */
  zoomToDistrict: (name: string) => void
  /** Clear all assistant highlights. */
  clearHighlights: () => void
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
  /** Fires when the zoom-driven active level changes (district ↔ neighbourhood). */
  onActiveLevelChange?: (level: 'district' | 'neighbourhood') => void
  // ── Neighbourhood layer (optional — graceful degradation when absent) ─────────
  /** Whether the neighbourhood (STPU) layer may be shown when zoomed in. */
  nbhdVisible?: boolean
  /** 211 STPU neighbourhood GeoJSON (loaded asynchronously). */
  nbhdGeojson?: DistrictCollection | null
  /** Scorer with norms computed over the 211 neighbourhood units. */
  nbhdScorer?: Scorer | null
  /** Flat QP allocation result over all 211 neighbourhoods. */
  nbhdAllocationResult?: AllocationResult | null
  /** Agent-created analytical overlays (heatmap / choropleth / bubble). */
  dynamicLayers?: DynamicLayer[]
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

// ─── Dynamic (agent-created) layer builder ────────────────────────────────────

/** Bbox-centre of a GeoJSON geometry, used for heat points + bubble anchors. */
function geometryCentre(geometry: GeoJSON.Geometry): L.LatLng {
  return L.geoJSON({ type: 'Feature', properties: {}, geometry } as GeoJSON.Feature)
    .getBounds()
    .getCenter()
}

/**
 * Turn a validated DynamicLayer spec + the matching FeatureCollection into a
 * single Leaflet layer (heat / choropleth / bubble). All children render in
 * the `dynamicPane` (z-index above the base choropleth). Returns null when no
 * feature carries the requested metric.
 */
function buildDynamicLeafletLayer(
  spec: DynamicLayer,
  fc: DistrictCollection,
): L.Layer | null {
  const entries = fc.features
    .map(f => ({ props: f.properties, geometry: f.geometry, value: metricValue(f.properties, spec.metric) }))
    .filter((e): e is { props: District; geometry: GeoJSON.Geometry; value: number } => e.value != null)
  if (entries.length === 0) return null

  const values = entries.map(e => e.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const norm = (v: number) => (v - min) / range

  // ── Choropleth: recolour the polygons themselves by the metric ──────────────
  if (spec.type === 'choropleth') {
    return L.geoJSON(fc as unknown as GeoJSON.GeoJsonObject, {
      pane: 'dynamicPane',
      style: (feature) => {
        const v = metricValue(feature?.properties as District, spec.metric)
        return {
          fillColor: rampColor(v == null ? 0 : norm(v)),
          fillOpacity: 0.8 * spec.opacity,
          color: '#ffffff',
          weight: spec.granularity === 'district' ? 1 : 0.4,
          opacity: 0.9 * spec.opacity,
        }
      },
      onEachFeature: (feature, lyr) => {
        const props = feature.properties as District
        const v = metricValue(props, spec.metric)
        lyr.bindTooltip(
          `${props.name}: ${v == null ? '—' : formatMetricValue(spec.metric, v)}`,
          { sticky: true, direction: 'top', offset: [0, -4] },
        )
      },
    })
  }

  // ── Bubble: proportional circle markers at unit centroids ───────────────────
  if (spec.type === 'bubble') {
    const group = L.layerGroup()
    entries.forEach(e => {
      const r = 4 + 22 * Math.sqrt(norm(e.value))
      const marker = L.circleMarker(geometryCentre(e.geometry), {
        pane: 'dynamicPane',
        radius: r,
        fillColor: spec.color,
        color: '#ffffff',
        weight: 1,
        fillOpacity: 0.7 * spec.opacity,
        opacity: 0.9 * spec.opacity,
      })
      marker.bindTooltip(
        `${e.props.name}: ${formatMetricValue(spec.metric, e.value)}`,
        { sticky: true, direction: 'top', offset: [0, -4] },
      )
      marker.addTo(group)
    })
    return group
  }

  // ── Heatmap: smooth weighted-centroid intensity surface (leaflet.heat) ──────
  const points = entries.map(e => {
    const c = geometryCentre(e.geometry)
    return [c.lat, c.lng, Math.max(0.05, norm(e.value))] as [number, number, number]
  })
  const radius = spec.granularity === 'neighbourhood' ? 30 : 58
  const heat = L.heatLayer(points, {
    radius,
    blur: Math.round(radius * 0.7),
    max: 1,
    minOpacity: 0.25,
    gradient: HEAT_GRADIENT,
  })

  // leaflet.heat's onAdd is deferred via map.whenReady and draws by calling
  // simpleheat → ctx.getImageData(0,0,w,h). When the map size is momentarily
  // 0×0 (React StrictMode mount→remount), w/h are 0 and getImageData throws an
  // IndexSizeError *asynchronously* (uncatchable around addTo). Guard the
  // instance's _redraw to no-op until the map has a real size; a later
  // invalidateSize() (in the render effect) repaints it cleanly.
  const h = heat as unknown as { _redraw?: () => void; _map?: L.Map }
  const origRedraw = h._redraw
  if (typeof origRedraw === 'function') {
    h._redraw = function (this: { _map?: L.Map }) {
      const s = this._map?.getSize()
      if (!s || s.x === 0 || s.y === 0) return
      origRedraw.call(this)
    }
  }
  return heat
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
  onActiveLevelChange,
  nbhdVisible = true,
  nbhdGeojson,
  nbhdScorer,
  nbhdAllocationResult,
  dynamicLayers,
}: MapViewProps) {
  const { locale } = useI18n()

  const containerRef     = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<L.Map | null>(null)
  const tileLayerRef     = useRef<L.TileLayer | null>(null)
  const geoLayerRef      = useRef<L.GeoJSON | null>(null)
  const nbhdLayerRef     = useRef<L.GeoJSON | null>(null)
  const boundsFitRef     = useRef<boolean>(false)
  // Agent-created overlays, keyed by spec id, so the render effect can tear
  // down and rebuild them when the dynamicLayers array changes.
  const dynLayersRef     = useRef<Map<string, L.Layer>>(new Map())

  // Live mirror of `districtsVisible` so the zoom-sync helper (registered once)
  // always reads the current value without re-binding listeners.
  const districtsVisibleRef = useRef(districtsVisible)
  districtsVisibleRef.current = districtsVisible

  // Same live-mirror trick for the neighbourhood layer's visibility and the
  // active-level callback, plus a memo of the last level reported so we only
  // notify the parent when the level actually flips.
  const nbhdVisibleRef = useRef(nbhdVisible)
  nbhdVisibleRef.current = nbhdVisible
  const activeLevelCbRef = useRef(onActiveLevelChange)
  activeLevelCbRef.current = onActiveLevelChange
  const lastLevelRef = useRef<'district' | 'neighbourhood' | null>(null)

  // Single source of truth for which level is shown. Both GeoJSON layers stay
  // mounted (in their own panes); visibility is driven purely by pane opacity,
  // so the district↔neighbourhood handoff is a CSS cross-fade and there are no
  // add/remove races during rapid zooming.
  const syncLevels = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const dPane = map.getPane('districtsPane')
    const nPane = map.getPane('nbhdPane')
    const zoom = map.getZoom()
    const hasNbhd = nbhdLayerRef.current !== null
    const showNbhd = zoom >= NBHD_ZOOM && hasNbhd && nbhdVisibleRef.current
    const showDist = districtsVisibleRef.current && !showNbhd
    if (dPane) {
      dPane.style.opacity = showDist ? '1' : '0'
      dPane.style.pointerEvents = showDist ? 'auto' : 'none'
    }
    if (nPane) {
      nPane.style.opacity = showNbhd ? '1' : '0'
      nPane.style.pointerEvents = showNbhd ? 'auto' : 'none'
    }
    // Report the active level to the parent (Layers sidebar) on change only.
    const level: 'district' | 'neighbourhood' = showNbhd ? 'neighbourhood' : 'district'
    if (level !== lastLevelRef.current) {
      lastLevelRef.current = level
      activeLevelCbRef.current?.(level)
    }
  }, [])

  // Assistant-driven highlight state. Held in a ref so it survives layer
  // rebuilds: the style callback reads it live, and resetStyle() re-applies it.
  const highlightRef = useRef<{ names: Set<string>; color: string }>({
    names: new Set(),
    color: HIGHLIGHT_COLOR,
  })

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
      // Fractional zoom snapping → buttery pinch/scroll zoom. The district↔
      // neighbourhood threshold (12.5) is still landed cleanly on 0.25 steps.
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    })

    // ── Cross-fade panes ───────────────────────────────────────────────────────
    // District and neighbourhood polygons each get their own pane so the swap at
    // the zoom threshold is an opacity cross-fade rather than an abrupt
    // remove/add. The CSS transition is on opacity only, leaving Leaflet's own
    // zoom transform animation untouched.
    map.createPane('districtsPane')
    map.createPane('nbhdPane')
    const dPane = map.getPane('districtsPane')!
    const nPane = map.getPane('nbhdPane')!
    dPane.style.transition = 'opacity 0.45s ease'
    nPane.style.transition = 'opacity 0.45s ease'
    dPane.style.zIndex = '400'
    nPane.style.zIndex = '410'

    // Agent-created analytical overlays sit above the base choropleth.
    // Choropleth + bubble layers live in dynamicPane (z 450). leaflet.heat,
    // however, renders into the (otherwise unused) overlay pane and removes its
    // canvas from there on teardown — so rather than reparent it (which breaks
    // its onRemove), we simply raise the overlay pane above the dynamic pane.
    map.createPane('dynamicPane')
    const dynPane = map.getPane('dynamicPane')!
    dynPane.style.zIndex = '450'
    map.getPanes().overlayPane.style.zIndex = '460'
    // Start the neighbourhood pane hidden so its 211 polygons don't flash in
    // on load before the first zoom-sync runs.
    dPane.style.opacity = '1'
    nPane.style.opacity = '0'

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

  // ── Zoom listener: cross-fade district ↔ neighbourhood layers at NBHD_ZOOM ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.on('zoomend', syncLevels)
    syncLevels()
    return () => { map.off('zoomend', syncLevels) }
  }, [syncLevels])

  // Re-sync pane visibility when the neighbourhood layer is toggled in the
  // Layers panel (the eye icon flips nbhdVisible).
  useEffect(() => {
    syncLevels()
  }, [nbhdVisible, syncLevels])

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
      pane: 'districtsPane',
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

        // Assistant highlight takes top visual precedence.
        const hl = highlightRef.current
        if (hl.names.has(normName(d.name))) {
          return {
            fillColor,
            fillOpacity: 0.9 * districtsOpacity,
            color: hl.color,
            weight: 4,
            dashArray: undefined,
          }
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
            // Lift the hovered polygon so its full outline reads above neighbours.
            l.bringToFront()
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            const sel = d.name === selectedDistrict?.name
              || d.name === selectedDistrict?.parent_district
            l.setStyle({
              fillOpacity: (sel ? 0.88 : 0.7) * districtsOpacity,
              weight: sel ? 2.5 : 1.25,
            })
            // Keep the selected outline on top after the hover ends.
            raiseHighlighted()
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

    // Raise the selected polygon (and any assistant highlights) so their full
    // outline draws on top of adjacent polygons instead of being clipped by
    // them. Defined here so the hover handlers above can re-assert it.
    function raiseHighlighted() {
      layer.eachLayer((l) => {
        const f = (l as L.GeoJSON & { feature?: GeoJSON.Feature }).feature
        const dd = f?.properties as District | undefined
        if (!dd) return
        const sel = dd.name === selectedDistrict?.name
          || dd.name === selectedDistrict?.parent_district
        const hot = highlightRef.current.names.has(normName(dd.name))
        if (sel || hot) (l as L.Path).bringToFront()
      })
    }

    // The layer stays mounted in its pane; cross-fade visibility is handled by
    // syncLevels() via pane opacity.
    layer.addTo(map)
    geoLayerRef.current = layer
    raiseHighlighted()
    syncLevels()

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
      pane: 'nbhdPane',
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

        // Assistant highlight takes top visual precedence.
        const hl = highlightRef.current
        if (hl.names.has(normName(d.name))) {
          return {
            fillColor,
            fillOpacity: 0.92 * districtsOpacity,
            color: hl.color,
            weight: 3.5,
            dashArray: undefined,
          }
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
            // Lift the hovered cell so its full outline reads above neighbours.
            l.bringToFront()
          },
          mouseout: (e) => {
            const l = e.target as L.Path
            const sel = d.name === selectedDistrict?.name
            l.setStyle({
              fillOpacity: (sel ? 0.90 : 0.72) * districtsOpacity,
              weight: sel ? 2.5 : 0.75,
            })
            // Keep the selected outline on top after the hover ends.
            raiseHighlighted()
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

    // Raise the selected cell (and assistant highlights) so its full outline
    // draws on top of adjacent cells. Defined here so the hover handlers can
    // re-assert it on mouseout.
    function raiseHighlighted() {
      layer.eachLayer((l) => {
        const f = (l as L.GeoJSON & { feature?: GeoJSON.Feature }).feature
        const dd = f?.properties as District | undefined
        if (!dd) return
        const sel = dd.name === selectedDistrict?.name
        const hot = highlightRef.current.names.has(normName(dd.name))
        if (sel || hot) (l as L.Path).bringToFront()
      })
    }

    // The layer stays mounted in its pane; cross-fade visibility is handled by
    // syncLevels() via pane opacity.
    layer.addTo(map)
    nbhdLayerRef.current = layer
    raiseHighlighted()
    syncLevels()

    return () => {
      nbhdDeltaMarkers.forEach(m => m.remove())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScenario, nbhdAllocationResult, mapMode, selectedDistrict,
    locale, nbhdGeojson, nbhdScorer, paletteMode, districtsOpacity,
  ])

  // ── React to districts visibility ───────────────────────────────────────────
  // Visibility is pane-opacity driven; just re-run the cross-fade sync.
  useEffect(() => {
    syncLevels()
  }, [districtsVisible, syncLevels])

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

  // ── Render agent-created dynamic layers ──────────────────────────────────────
  // Tear down and rebuild on every change to the specs array. Layer counts are
  // small (a handful), and rebuilding a heat/choropleth/bubble layer is cheap.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const store = dynLayersRef.current
    const specs = dynamicLayers ?? []

    const heatCanvasOf = (l: L.Layer) =>
      (l as unknown as { _canvas?: HTMLCanvasElement })._canvas

    // leaflet.heat has no opacity option — apply it on the canvas element.
    const setHeatOpacity = (layer: L.Layer, opacity: number) => {
      const c = heatCanvasOf(layer)
      if (c) c.style.opacity = String(opacity)
    }

    const heatEntries: { layer: L.Layer; opacity: number }[] = []

    // specs are ordered top→bottom (index 0 = top of the panel). Add them
    // bottom-first so the top layer paints last and stacks above the rest.
    for (const spec of [...specs].reverse()) {
      if (!spec.visible) continue
      const fc = spec.granularity === 'neighbourhood' ? nbhdGeojson : geojson
      if (!fc) continue
      const layer = buildDynamicLeafletLayer(spec, fc)
      if (!layer) continue
      // leaflet.heat's onAdd is deferred via map.whenReady, so wrap defensively.
      try { layer.addTo(map) } catch { /* see _redraw size guard in builder */ }
      store.set(spec.id, layer)
      if (spec.type === 'heatmap') {
        heatEntries.push({ layer, opacity: spec.opacity })
        setHeatOpacity(layer, spec.opacity)   // honour opacity if onAdd ran sync
      }
    }

    // After layout settles: set opacity on any heat canvas whose onAdd was
    // deferred, and nudge the map so heat layers recompute their size from a
    // non-zero map size and repaint. Guarded against a torn-down map.
    let raf = 0
    if (heatEntries.length) {
      raf = requestAnimationFrame(() => {
        if (mapRef.current !== map) return
        heatEntries.forEach(({ layer, opacity }) => setHeatOpacity(layer, opacity))
        try { map.invalidateSize(false) } catch { /* map gone */ }
      })
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      store.forEach(layer => { try { layer.remove() } catch { /* already removed */ } })
      store.clear()
    }
  }, [dynamicLayers, geojson, nbhdGeojson])

  // ── Imperative API handed back to the parent ────────────────────────────────
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      zoomToLayer: (id: string) => {
        const map = mapRef.current
        if (!map) return
        if (id === 'districts' && geoLayerRef.current) {
          map.fitBounds(geoLayerRef.current.getBounds(), { padding: [40, 40] })
        } else if (id === 'neighbourhoods') {
          // Zoom in past the threshold so the STPU layer cross-fades into view.
          const z = Math.max(map.getZoom(), NBHD_ZOOM + 0.5)
          map.setView(map.getCenter(), z, { animate: true })
        } else if (id === 'basemap') {
          map.setView([22.35, 114.13], 10, { animate: true })
        }
      },

      highlightDistricts: (names: string[], color?: string) => {
        const map = mapRef.current
        highlightRef.current = {
          names: new Set(names.map(normName)),
          color: color || HIGHLIGHT_COLOR,
        }
        // Re-apply styles on both layers so highlights survive across levels.
        geoLayerRef.current?.resetStyle()
        nbhdLayerRef.current?.resetStyle()
        if (names.length === 0) return

        const wanted = highlightRef.current.names
        const distMatches = collectMatches(geoLayerRef.current, wanted)
        const nbhdMatches = collectMatches(nbhdLayerRef.current, wanted)
        if (!map) return

        // Neighbourhood targets → frame them; fitBounds crosses the zoom
        // threshold, and syncLevels() cross-fades the STPU layer into view.
        if (nbhdMatches.length > 0) {
          nbhdMatches.forEach(l => (l as L.Path).bringToFront())
          const b = L.featureGroup(nbhdMatches).getBounds()
          if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 15 })
          return
        }

        // District targets → keep district layer, frame them.
        if (distMatches.length > 0) {
          distMatches.forEach(l => (l as L.Path).bringToFront())
          const b = L.featureGroup(distMatches).getBounds()
          if (b.isValid()) map.fitBounds(b, { padding: [60, 60], maxZoom: 12 })
        }
      },

      zoomToDistrict: (name: string) => {
        const map = mapRef.current
        if (!map) return
        const target = normName(name)
        if (target === 'all' || target === 'hong kong' || target === 'reset') {
          if (geoLayerRef.current) map.fitBounds(geoLayerRef.current.getBounds(), { padding: [40, 40] })
          else map.setView([22.35, 114.13], 10, { animate: true })
          return
        }
        // District match first, then neighbourhood (reveals the STPU layer).
        const distMatches = collectMatches(geoLayerRef.current, new Set([target]))
        if (distMatches.length > 0) {
          const b = L.featureGroup(distMatches).getBounds()
          if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 13 })
          return
        }
        const nbhdMatches = collectMatches(nbhdLayerRef.current, new Set([target]))
        if (nbhdMatches.length > 0) {
          // fitBounds crosses the zoom threshold; syncLevels() fades in the
          // STPU layer on zoomend.
          const b = L.featureGroup(nbhdMatches).getBounds()
          if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 15 })
        }
      },

      clearHighlights: () => {
        highlightRef.current = { names: new Set(), color: HIGHLIGHT_COLOR }
        geoLayerRef.current?.resetStyle()
        nbhdLayerRef.current?.resetStyle()
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
