import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hide the floating dev indicator so the map's bottom-left stays clean.
  // Production builds never show it; this only affects `next dev`.
  devIndicators: false,
}

export default nextConfig
