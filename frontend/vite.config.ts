import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Proxy /api to the FastAPI LLM backend in development.
    // If the backend isn't running, the frontend falls back gracefully.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Don't fail the Vite dev server if the backend is unreachable —
        // the frontend handles 502s and timeouts itself.
      },
    },
  },
})
