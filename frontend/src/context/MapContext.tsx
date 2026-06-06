import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Map as LeafletMap } from 'leaflet'

interface MapContextType {
  map: LeafletMap | null
  setMap: (map: LeafletMap) => void
  selectedLocation: [number, number] | null
  setSelectedLocation: (loc: [number, number] | null) => void
  isPanelExpanded: boolean
  setIsPanelExpanded: (v: boolean) => void
}

const MapContext = createContext<MapContextType | null>(null)

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null)
  const [isPanelExpanded, setIsPanelExpanded] = useState(false)

  return (
    <MapContext.Provider
      value={{ map, setMap, selectedLocation, setSelectedLocation, isPanelExpanded, setIsPanelExpanded }}
    >
      {children}
    </MapContext.Provider>
  )
}

export function useMapContext() {
  const ctx = useContext(MapContext)
  if (!ctx) throw new Error('useMapContext must be used within MapProvider')
  return ctx
}
