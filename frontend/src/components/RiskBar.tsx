interface RiskBarProps {
  label: string
  value: number // 0–1
}

function riskColor(v: number) {
  if (v < 0.3) return 'bg-emerald-500'
  if (v < 0.6) return 'bg-amber-500'
  return 'bg-red-500'
}

function riskLabel(v: number) {
  if (v < 0.3) return 'Low'
  if (v < 0.6) return 'Medium'
  return 'High'
}

export function RiskBar({ label, value }: RiskBarProps) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-medium text-gray-700">{riskLabel(value)} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${riskColor(value)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
