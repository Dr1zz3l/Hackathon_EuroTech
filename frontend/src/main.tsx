import { createRoot } from 'react-dom/client'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './index.css'
import App from './App'

// Cesium reads this global to locate its worker scripts
// vite-plugin-cesium sets it automatically; this is a belt-and-suspenders fallback.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).CESIUM_BASE_URL = '/cesium/'

createRoot(document.getElementById('root')!).render(<App />)
