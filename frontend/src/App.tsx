import { I18nProvider } from './context/I18nContext'
import { MapProvider, useMapContext } from './context/MapContext'
import { MapView } from './components/MapView'
import { HamburgerMenu } from './components/HamburgerMenu'
import { LanguageSelector } from './components/LanguageSelector'
import { SearchPanel } from './components/SearchPanel'
import { MyLocationButton } from './components/MyLocationButton'

// Inner component so it can consume MapContext (which is provided by the wrapper below)
function AppContent() {
  const { isPanelExpanded } = useMapContext()

  return (
    <div className="relative w-full overflow-hidden" style={{ height: '100dvh' }}>
      {/* Map layer — full screen background */}
      <MapView />

      {/* Top overlay: hamburger (left) + language selector (right) */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-4 pointer-events-none">
        <div className="pointer-events-auto">
          <HamburgerMenu />
        </div>
        <div className="pointer-events-auto">
          <LanguageSelector />
        </div>
      </div>

      {/* My location button — fades out when the search panel is expanded */}
      <div
        className="absolute right-4 bottom-56 z-20 pointer-events-auto transition-opacity duration-200"
        style={{ opacity: isPanelExpanded ? 0 : 1, pointerEvents: isPanelExpanded ? 'none' : 'auto' }}
      >
        <MyLocationButton />
      </div>

      {/* Bottom search panel */}
      <SearchPanel />
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <MapProvider>
        <AppContent />
      </MapProvider>
    </I18nProvider>
  )
}
