import { useBuilding } from '../context/BuildingContext'
import { buildings } from '../data/buildings'
import { RecommendationBadge, ConditionBadge, PriorityDot } from './StatusBadge'
import { RiskBar } from './RiskBar'
import type { BuildingType } from '../types'

const TYPE_LABELS: Record<BuildingType, string> = {
  residential_public: 'Public Residential',
  residential_private: 'Private Residential',
  commercial: 'Commercial',
  mixed: 'Mixed Use',
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  )
}

function EmptyState() {
  const counts = {
    maintain: buildings.filter(b => b.recommendation === 'maintain').length,
    monitor: buildings.filter(b => b.recommendation === 'monitor').length,
    decommission: buildings.filter(b => b.recommendation === 'decommission').length,
  }
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Building Portfolio</h1>
        <p className="text-sm text-gray-500 mt-0.5">Hong Kong — {buildings.length} assets tracked</p>
      </div>
      <div className="px-6 py-5 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Portfolio Summary</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 rounded-xl p-3">
            <div className="text-2xl font-bold text-emerald-700">{counts.maintain}</div>
            <div className="text-xs text-emerald-600 mt-0.5">Maintain</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-2xl font-bold text-amber-700">{counts.monitor}</div>
            <div className="text-xs text-amber-600 mt-0.5">Monitor</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <div className="text-2xl font-bold text-red-700">{counts.decommission}</div>
            <div className="text-xs text-red-600 mt-0.5">Decommission</div>
          </div>
        </div>
      </div>
      <div className="px-6 pb-4">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-3xl mb-2">🏙️</div>
          <p className="text-sm text-gray-500">Click any highlighted building on the map to view its portfolio details</p>
        </div>
      </div>
    </div>
  )
}

function BuildingDetail() {
  const { selected, select } = useBuilding()
  if (!selected) return null

  const b = selected
  const age = new Date().getFullYear() - b.built_year
  const totalCost = b.maintenance_items.reduce((s, i) => s + i.estimatedCost_HKD, 0)
  const fmt = new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 0 })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">{b.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{b.address}</p>
          </div>
          <button
            onClick={() => select(null)}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <RecommendationBadge value={b.recommendation} />
          <ConditionBadge value={b.structural_condition} />
        </div>
        {b.recommendation === 'decommission' && b.decommission_year && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <span className="font-semibold">Target decommission: {b.decommission_year}</span>
            <p className="text-xs mt-0.5 text-red-500">Residents to be rehoused before demolition</p>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">

        {/* Key stats */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Building Info</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCell label="Year built" value={b.built_year} />
            <StatCell label="Building age" value={`${age} years`} />
            <StatCell label="Floors" value={b.floors} />
            <StatCell label="Height" value={`${b.height_m} m`} />
            <StatCell label="Type" value={TYPE_LABELS[b.type]} />
            <StatCell label="District" value={b.district} />
            {b.units > 0 && <StatCell label="Units" value={b.units} />}
            {b.resident_count > 0 && <StatCell label="Residents" value={b.resident_count.toLocaleString()} />}
            {b.resident_avg_age > 0 && <StatCell label="Avg. resident age" value={`${b.resident_avg_age} yrs`} />}
            <StatCell label="Last inspection" value={b.last_inspection} />
          </div>
        </div>

        {/* Risk scores */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Risk Assessment</p>
          <div className="space-y-3 bg-gray-50 rounded-xl p-3">
            <RiskBar label="Flood risk" value={b.flood_risk} />
            <RiskBar label="Earthquake risk" value={b.earthquake_risk} />
          </div>
        </div>

        {/* Maintenance */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
              Maintenance Items ({b.maintenance_items.length})
            </p>
            <span className="text-xs text-gray-500">{fmt.format(totalCost)} total</span>
          </div>
          {b.maintenance_items.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No outstanding maintenance items.</p>
          ) : (
            <div className="space-y-2">
              {b.maintenance_items.map(item => (
                <div key={item.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.category} · Due {item.dueDate}</p>
                    </div>
                    <PriorityDot priority={item.priority} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 font-medium">{fmt.format(item.estimatedCost_HKD)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        {b.notes && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Notes</p>
            <p className="text-xs text-gray-600 leading-relaxed">{b.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const { selected } = useBuilding()
  return (
    <aside className="w-[380px] shrink-0 h-screen border-r border-gray-200 bg-white overflow-hidden flex flex-col shadow-lg z-10">
      {selected ? <BuildingDetail /> : <EmptyState />}
    </aside>
  )
}
