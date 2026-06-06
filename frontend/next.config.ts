import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hide the floating dev indicator so the map's bottom-left stays clean.
  // Production builds never show it; this only affects `next dev`.
  devIndicators: false,
  // Proxy /api/* to the FastAPI LLM backend in development.
  // In production set NEXT_PUBLIC_API_BASE to the backend origin instead.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
}

export default nextConfig
