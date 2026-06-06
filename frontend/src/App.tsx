import { I18nProvider } from './context/I18nContext'
import { MapView } from './components/MapView'
import { HamburgerMenu } from './components/HamburgerMenu'
import { LanguageSelector } from './components/LanguageSelector'
import { SearchPanel } from './components/SearchPanel'

export default function App() {
  return (
    <I18nProvider>
      {/* Full-screen container — map fills it, other elements overlay */}
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

        {/* Bottom panel — overlays bottom ~⅓ of the screen */}
        <SearchPanel />
      </div>
    </I18nProvider>
  )
}
