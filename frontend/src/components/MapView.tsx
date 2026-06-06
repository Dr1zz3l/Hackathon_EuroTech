import { MapContainer, TileLayer } from 'react-leaflet'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'

const HK_CENTER: LatLngExpression = [22.3193, 114.1694]
const HK_BOUNDS: LatLngBoundsExpression = [
  [22.155, 113.835],
  [22.562, 114.442],
]

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
      </MapContainer>
    </div>
  )
}
