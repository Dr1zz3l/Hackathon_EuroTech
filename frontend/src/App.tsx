import { BuildingProvider } from './context/BuildingContext'
import { Sidebar } from './components/Sidebar'
import { CesiumMap } from './components/CesiumMap'

export default function App() {
  return (
    <BuildingProvider>
      <div className="flex h-screen overflow-hidden bg-gray-900">
        <Sidebar />
        <CesiumMap />
      </div>
    </BuildingProvider>
  )
}
