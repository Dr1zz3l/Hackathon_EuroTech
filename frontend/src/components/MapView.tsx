import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'
import { useMapContext } from '../context/MapContext'

const HK_CENTER: LatLngExpression = [22.3193, 114.1694]
const HK_BOUNDS: LatLngBoundsExpression = [
  [22.155, 113.835],
  [22.562, 114.442],
]

const PIN_SVG = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#ef4444"/>
  <circle cx="14" cy="14" r="5.5" fill="white"/>
</svg>`

function MapCapture() {
  const leafletMap = useMap()
  const { setMap } = useMapContext()

  useEffect(() => {
    setMap(leafletMap)

    // Dismiss search / keyboard when user taps the map
    const dismiss = () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }
    leafletMap.on('click', dismiss)
    return () => { leafletMap.off('click', dismiss) }
  }, [leafletMap, setMap])

  return null
}

function SelectedMarker() {
  const { selectedLocation } = useMapContext()

  const icon = useMemo(
    () =>
      L.divIcon({
        html: PIN_SVG,
        className: '',
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
      }),
    [],
  )

  if (!selectedLocation) return null
  return <Marker position={selectedLocation} icon={icon} />
}

export function MapView() {
  return (
    <div className="absolute inset-0 z-0">
      <MapContainer
        center={HK_CENTER}
        zoom={12}
        minZoom={10}
        maxZoom={18}
        maxBounds={HK_BOUNDS}
        maxBoundsViscosity={0.85}
        zoomControl={false}
        attributionControl={true}
        className="w-full h-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
        <MapCapture />
        <SelectedMarker />
      </MapContainer>
    </div>
  )
}
