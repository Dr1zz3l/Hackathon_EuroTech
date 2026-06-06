import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Building } from '../types'

interface BuildingContextType {
  selected: Building | null
  select: (b: Building | null) => void
}

const BuildingContext = createContext<BuildingContextType | null>(null)

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Building | null>(null)
  return (
    <BuildingContext.Provider value={{ selected, select: setSelected }}>
      {children}
    </BuildingContext.Provider>
  )
}

export function useBuilding() {
  const ctx = useContext(BuildingContext)
  if (!ctx) throw new Error('useBuilding must be used inside BuildingProvider')
  return ctx
}
