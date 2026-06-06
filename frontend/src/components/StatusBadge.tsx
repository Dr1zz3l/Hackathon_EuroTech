import type { Recommendation, Condition, Priority } from '../types'

const RECOMMENDATION_STYLES: Record<Recommendation, string> = {
  maintain: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  monitor: 'bg-amber-100 text-amber-800 border border-amber-300',
  decommission: 'bg-red-100 text-red-800 border border-red-300',
}

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  maintain: 'Maintain',
  monitor: 'Monitor',
  decommission: 'Decommission',
}

const CONDITION_STYLES: Record<Condition, string> = {
  good: 'bg-emerald-100 text-emerald-700',
  fair: 'bg-amber-100 text-amber-700',
  poor: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'text-gray-500',
  medium: 'text-amber-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
}

const PRIORITY_DOTS: Record<Priority, string> = {
  low: 'bg-gray-400',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-600',
}

export function RecommendationBadge({ value }: { value: Recommendation }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${RECOMMENDATION_STYLES[value]}`}>
      {value === 'maintain' && '✓'}
      {value === 'monitor' && '◎'}
      {value === 'decommission' && '⚠'}
      {RECOMMENDATION_LABELS[value]}
    </span>
  )
}

export function ConditionBadge({ value }: { value: Condition }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${CONDITION_STYLES[value]}`}>
      {value}
    </span>
  )
}

export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium capitalize ${PRIORITY_STYLES[priority]}`}>
      <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[priority]}`} />
      {priority}
    </span>
  )
}
