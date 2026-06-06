import { useState, useCallback } from 'react'
import type { Place } from '../types'

const MAX = 5
const KEY = 'hkflood_recent'

export function useRecentSearches() {
  const [recents, setRecents] = useState<Place[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Place[]
    } catch {
      return []
    }
  })

  const push = useCallback((place: Place) => {
    setRecents(prev => {
      const next = [place, ...prev.filter(p => p.place_id !== place.place_id)].slice(0, MAX)
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setRecents([])
    localStorage.removeItem(KEY)
  }, [])

  return { recents, push, clear }
}
