import { useState } from 'react'
import { useMapContext } from '../context/MapContext'

type Status = 'idle' | 'loading' | 'error'

export function MyLocationButton() {
  const { map } = useMapContext()
  const [status, setStatus] = useState<Status>('idle')

  const locate = () => {
    if (!navigator.geolocation || status === 'loading') return
    setStatus('loading')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map?.flyTo([coords.latitude, coords.longitude], 16, { duration: 1.2 })
        setStatus('idle')
      },
      () => {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2000)
      },
      { timeout: 8000, maximumAge: 30_000 },
    )
  }

  return (
    <button
      onClick={locate}
      className="flex items-center justify-center w-11 h-11 bg-white rounded-full shadow-lg touch-manipulation active:bg-gray-50 transition-colors"
      aria-label="Go to my location"
    >
      {status === 'loading' ? (
        <svg
          className="w-5 h-5 text-blue-500 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : status === 'error' ? (
        <svg
          className="w-5 h-5 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" strokeWidth={2} />
          <path strokeLinecap="round" strokeWidth={2} d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      )}
    </button>
  )
}
