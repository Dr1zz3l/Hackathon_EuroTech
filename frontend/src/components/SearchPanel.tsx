import { useState, useEffect, useRef } from 'react'
import { useI18n } from '../context/I18nContext'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

const QUICK_PICKS = [
  { key: 'place.central' },
  { key: 'place.mongkok' },
  { key: 'place.tst' },
  { key: 'place.causewaybay' },
  { key: 'place.wanchai' },
  { key: 'place.kowloon' },
] as const

function SearchIcon() {
  return (
    <svg
      className="w-5 h-5 text-gray-400 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-500"
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function SearchPanel() {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        const data: NominatimResult[] = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 350)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, locale])

  const showResults = isFocused && query.trim().length >= 2

  const primaryName = (displayName: string) => displayName.split(',')[0].trim()
  const secondaryName = (displayName: string) =>
    displayName.split(',').slice(1, 3).join(',').trim()

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-3xl shadow-[0_-2px_20px_rgba(0,0,0,0.10)]">
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
            type="search"
            inputMode="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
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

        {/* Content: results when searching, quick picks otherwise */}
        {showResults ? (
          <div className="mt-3 max-h-52 overflow-y-auto -mx-1">
            {isSearching && (
              <div className="text-center text-gray-400 text-sm py-4">{t('search.searching')}</div>
            )}
            {!isSearching && results.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-4">{t('search.noResults')}</div>
            )}
            {results.map(result => (
              <button
                key={result.place_id}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 active:bg-gray-100 rounded-xl text-left touch-manipulation"
              >
                <div className="shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <PinIcon />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {primaryName(result.display_name)}
                  </div>
                  {secondaryName(result.display_name) && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {secondaryName(result.display_name)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* Quick pick chips */
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {QUICK_PICKS.map(({ key }) => (
              <button
                key={key}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setQuery(t(key))}
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
