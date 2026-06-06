import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import { buildings } from '../data/buildings'
import { useBuilding } from '../context/BuildingContext'
import type { Building, Recommendation } from '../types'

const ENTITY_COLORS: Record<Recommendation, Cesium.Color> = {
  maintain: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.75),
  monitor: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.75),
  decommission: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.75),
}

const ENTITY_COLORS_SELECTED: Record<Recommendation, Cesium.Color> = {
  maintain: Cesium.Color.fromCssColorString('#059669').withAlpha(1.0),
  monitor: Cesium.Color.fromCssColorString('#d97706').withAlpha(1.0),
  decommission: Cesium.Color.fromCssColorString('#dc2626').withAlpha(1.0),
}

/** Create a rectangular polygon footprint (4 corners) around a centroid. */
function footprintHierarchy(lat: number, lng: number, footprintM2: number): Cesium.PolygonHierarchy {
  const side = Math.sqrt(footprintM2)
  const R = 6_371_000
  const dLat = (side / 2 / R) * (180 / Math.PI)
  const dLng = (side / 2 / R) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180)
  return new Cesium.PolygonHierarchy(
    Cesium.Cartesian3.fromDegreesArray([
      lng - dLng, lat - dLat,
      lng + dLng, lat - dLat,
      lng + dLng, lat + dLat,
      lng - dLng, lat + dLat,
    ]),
  )
}

export function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const entityMapRef = useRef<Map<string, Cesium.Entity>>(new Map())
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)
  const initialized = useRef(false)

  const { select } = useBuilding()

  useEffect(() => {
    if (initialized.current || !containerRef.current) return
    initialized.current = true

    const token = import.meta.env.VITE_CESIUM_TOKEN as string | undefined
    if (token) Cesium.Ion.defaultAccessToken = token

    // ── Viewer ──────────────────────────────────────────────────────────────
    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    })
    viewerRef.current = viewer

    // ── Base imagery: OpenStreetMap (no token required) ───────────────────
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
        credit: new Cesium.Credit('© OpenStreetMap contributors'),
      }),
    )

    // ── OSM 3D Buildings from CesiumIon (requires token) ─────────────────
    if (token) {
      Cesium.Cesium3DTileset.fromIonAssetId(96188)
        .then(tileset => { viewer.scene.primitives.add(tileset) })
        .catch(() => console.warn('Could not load OSM 3D Buildings — check your VITE_CESIUM_TOKEN'))
    }

    // ── Portfolio building entities ───────────────────────────────────────
    buildings.forEach((b: Building) => {
      const entity = viewer.entities.add({
        id: b.id,
        name: b.name,
        polygon: {
          hierarchy: footprintHierarchy(b.lat, b.lng, b.footprint_m2),
          extrudedHeight: b.height_m,
          height: 0,
          material: ENTITY_COLORS[b.recommendation],
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
          outlineWidth: 1,
        },
      })
      entityMapRef.current.set(b.id, entity)
    })

    // ── Fly to Hong Kong ──────────────────────────────────────────────────
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(114.17, 22.33, 18_000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2,
    })

    // ── Click handler ─────────────────────────────────────────────────────
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((evt: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(evt.position)

      if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
        const buildingId = picked.id.id as string
        const building = buildings.find(bld => bld.id === buildingId)
        if (building) {
          select(building)

          // Reset all entities to base color then highlight the selected one
          entityMapRef.current.forEach((ent, id) => {
            const bld = buildings.find(bx => bx.id === id)!
            if (ent.polygon) {
              ent.polygon.material = new Cesium.ColorMaterialProperty(
                id === buildingId
                  ? ENTITY_COLORS_SELECTED[bld.recommendation]
                  : ENTITY_COLORS[bld.recommendation],
              )
            }
          })
          return
        }
      }

      // Clicked elsewhere — deselect
      select(null)
      entityMapRef.current.forEach((ent, id) => {
        const bld = buildings.find(bx => bx.id === id)!
        if (ent.polygon) {
          ent.polygon.material = new Cesium.ColorMaterialProperty(ENTITY_COLORS[bld.recommendation])
        }
      })
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      handler.destroy()
      viewer.destroy()
    }
  }, [select])

  return (
    <div ref={containerRef} className="flex-1 h-screen" />
  )
}
