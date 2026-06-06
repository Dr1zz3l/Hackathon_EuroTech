/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Land-use palette (also used in the donut)
        land: {
          residential: '#f87171', // red-400
          industrial:  '#a78bfa', // violet-400
          commercial:  '#fb923c', // orange-400
          green:       '#4ade80', // green-400
          educational: '#60a5fa', // blue-400
          other:       '#94a3b8', // slate-400
        },
        // Viability score ramp (cool → warm)
        score: {
          low:    '#93c5fd', // blue-300
          mid:    '#fde68a', // amber-200
          high:   '#ef4444', // red-500
        },
      },
    },
  },
  plugins: [],
}
