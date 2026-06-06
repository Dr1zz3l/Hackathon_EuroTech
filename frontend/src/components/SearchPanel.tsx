import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../context/I18nContext'
import { useMapContext } from '../context/MapContext'
import { useRecentSearches } from '../hooks/useRecentSearches'
import type { Place } from '../types'

const QUICK_PICKS = [
  'place.central',
  'place.mongkok',
  'place.tst',
  'place.causewaybay',
  'place.wanchai',
  'place.kowloon',
] as const

const primaryName = (s: string) => s.split(',')[0].trim()
const secondaryName = (s: string) => s.split(',').slice(1, 3).join(',').trim()

function SearchIcon() {
  return (
    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  )
}

function PlaceRow({ icon, place, onSelect }: { icon: React.ReactNode; place: Place; onSelect: (p: Place) => void }) {
  const sub = secondaryName(place.display_name)
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={() => onSelect(place)}
      className="w-full flex items-center gap-3 px-2 py-3 hover:bg-gray-50 active:bg-gray-100 rounded-xl text-left touch-manipulation"
    >
      <div className="shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{primaryName(place.display_name)}</div>
        {sub && <div className="text-xs text-gray-500 truncate mt-0.5">{sub}</div>}
      </div>
    </button>
  )
}

export function SearchPanel() {
  const { t, locale } = useI18n()
  const { map, setSelectedLocation, setIsPanelExpanded } = useMapContext()
  const { recents, push, clear } = useRecentSearches()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep context in sync so App can react to panel state
  useEffect(() => {
    setIsPanelExpanded(isFocused)
  }, [isFocused, setIsPanelExpanded])

  // Live geocoding via Nominatim
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search')
        url.searchParams.set('q', `${query}, Hong Kong`)
        url.searchParams.set('format', 'json')
        url.searchParams.set('countrycodes', 'hk')
        url.searchParams.set('limit', '6')
        url.searchParams.set('addressdetails', '1')

        const res = await fetch(url.toString(), {
          headers: {
            'Accept-Language': locale === 'yue' ? 'zh-HK,zh;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
          },
        })
        const data: Place[] = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 350)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, locale])

  const handleSelectPlace = useCallback(
    (place: Place) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      const lat = parseFloat(place.lat)
      const lng = parseFloat(place.lon)
      map?.flyTo([lat, lng], 15, { duration: 1.2 })
      setSelectedLocation([lat, lng])
      push(place)
      setQuery(primaryName(place.display_name))
      setResults([])
      setIsSearching(false)
      setIsFocused(false)
      inputRef.current?.blur()
    },
    [map, setSelectedLocation, push],
  )

  const showRecents = isFocused && query.trim().length === 0 && recents.length > 0
  const showResults = isFocused && query.trim().length >= 2
  const showQuickPicks = !showRecents && !showResults

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-3xl shadow-[0_-2px_20px_rgba(0,0,0,0.10)] overflow-hidden"
      style={{
        maxHeight: isFocused ? '65dvh' : '14rem',
        transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-2">
        <div className="w-9 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="px-4 pb-4">
        {/* Section label */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 px-1">
          {t('search.explore')}
        </p>

        {/* Search bar */}
        <div className="flex items-center gap-3 bg-gray-100 rounded-2xl px-4 py-3">
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-base min-w-0"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query.length > 0 && (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setQuery('')}
              className="text-gray-400 shrink-0 touch-manipulation"
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>

        {/* Recent searches */}
        {showRecents && (
          <div className="mt-3 -mx-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {t('search.recent')}
              </span>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={clear}
                className="text-xs text-blue-500 touch-manipulation"
              >
                {t('search.clearAll')}
              </button>
            </div>
            {recents.map(place => (
              <PlaceRow key={place.place_id} icon={<ClockIcon />} place={place} onSelect={handleSelectPlace} />
            ))}
          </div>
        )}

        {/* Live search results */}
        {showResults && (
          <div className="mt-3 max-h-52 overflow-y-auto -mx-1">
            {isSearching && (
              <div className="text-center text-gray-400 text-sm py-4">{t('search.searching')}</div>
            )}
            {!isSearching && results.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">{t('search.noResults')}</div>
            )}
            {results.map(result => (
              <PlaceRow key={result.place_id} icon={<PinIcon />} place={result} onSelect={handleSelectPlace} />
            ))}
          </div>
        )}

        {/* Quick pick chips (default state) */}
        {showQuickPicks && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_PICKS.map(key => (
              <button
                key={key}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setQuery(t(key))
                  setIsFocused(true)
                  inputRef.current?.focus()
                }}
                className="shrink-0 px-4 py-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-200 rounded-full text-sm text-gray-700 font-medium touch-manipulation transition-colors"
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* iOS home indicator safe area */}
      <div className="safe-area-bottom" />
    </div>
  )
}
