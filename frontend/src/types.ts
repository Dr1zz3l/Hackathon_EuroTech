export type Recommendation = 'maintain' | 'monitor' | 'decommission'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type Condition = 'good' | 'fair' | 'poor' | 'critical'
export type BuildingType = 'residential_public' | 'residential_private' | 'commercial' | 'mixed'

export interface MaintenanceItem {
  id: string
  priority: Priority
  category: string
  description: string
  estimatedCost_HKD: number
  dueDate: string
}

export interface Building {
  id: string
  name: string
  address: string
  district: string
  type: BuildingType
  built_year: number
  floors: number
  height_m: number
  units: number
  resident_count: number
  resident_avg_age: number
  lat: number
  lng: number
  footprint_m2: number
  flood_risk: number        // 0–1
  earthquake_risk: number   // 0–1
  structural_condition: Condition
  last_inspection: string   // ISO date
  recommendation: Recommendation
  decommission_year?: number
  maintenance_items: MaintenanceItem[]
  notes?: string
}
