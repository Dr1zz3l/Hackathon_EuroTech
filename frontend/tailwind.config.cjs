/** @type {import('tailwindcss').Config} */
/**
 * Vercel-inspired design tokens — see public/DESIGN-vercel.md.
 *
 * The system is built on:
 *   - ink (#171717) primary on near-white canvas (#fafafa / #ffffff)
 *   - hairline borders (#ebebeb), stacked subtle shadows (never single heavy drops)
 *   - Geist sans + Geist Mono (loaded as CSS variables in layout.tsx)
 *   - Aggressive negative tracking on display sizes
 *   - The multi-stop brand gradient as the ONLY decoration, at hero scale only
 */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      colors: {
        // Surface ladder
        canvas:     '#ffffff',
        'canvas-soft':   '#fafafa',
        'canvas-soft-2': '#f5f5f5',
        // Ink
        ink:    '#171717',
        body:   '#4d4d4d',
        mute:   '#888888',
        // Hairlines
        hairline:          '#ebebeb',
        'hairline-strong': '#a1a1a1',
        // Brand accents
        link:        '#0070f3',
        'link-deep': '#0761d1',
        'link-soft': '#d3e5ff',
        cyan:        '#50e3c2',
        'cyan-deep': '#29bc9b',
        violet:      '#7928ca',
        'violet-deep': '#4c2889',
        pink:        '#ff0080',
        magenta:     '#eb367f',
        // Semantic
        warning:      '#f5a623',
        'warning-soft': '#ffefcf',
        'warning-deep': '#ab570a',
        error:        '#ee0000',
        'error-soft': '#f7d4d6',
        'error-deep': '#c50000',
        success:      '#0070f3',
        // Gradient stops (referenced by name in components)
        'g-blue':    '#007cf0',
        'g-teal':    '#00dfd8',
        'g-violet':  '#7928ca',
        'g-pink':    '#ff0080',
        'g-coral':   '#ff4d4d',
        'g-amber':   '#f9cb28',
        // Land-use palette — keyed to the brand gradient stops
        land: {
          residential:    '#ff0080', // highlight-pink
          industrial:     '#7928ca', // violet
          commercial:     '#f5a623', // warning amber
          agricultural:   '#a3c644', // olive/farmland
          recreational:   '#50e3c2', // cyan (parks & open space)
          institutional:  '#0070f3', // link blue (GIC)
          misc:           '#a1a1a1', // hairline-strong grey
          infrastructure: '#6b7280', // slate (roads/rail/airport/port)
          protected:      '#1d8a4e', // forest green (country parks/wetlands/reservoirs)
        },
      },
      letterSpacing: {
        // Aggressive negative tracking — non-negotiable per the spec
        'display-xl':  '-0.05em',  // ≈ -2.4 px at 48 px
        'display-lg':  '-0.04em',  // ≈ -1.28 px at 32 px
        'display-md':  '-0.04em',  // ≈ -0.96 px at 24 px
        'display-sm':  '-0.03em',  // ≈ -0.6 px at 20 px
        'body-sm':     '-0.02em',  // ≈ -0.28 px at 14 px
      },
      borderRadius: {
        // Vercel-named scale
        'pill-sm': '64px',
        pill:      '100px',
      },
      boxShadow: {
        // Stacked subtle shadows — never single heavy drops
        // Level 2 — subtle drop (default card chrome)
        'card':  '0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.06)',
        // Level 3 — soft stack (feature cards)
        'card-md': '0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.06)',
        // Level 4 — float (pricing, panels)
        'card-lg': '0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.06)',
        // Level 5 — modal
        'modal': '0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.06)',
        // Inset hairline ring only (Level 1)
        'hairline-inset': 'inset 0 0 0 1px rgba(0,0,0,0.08)',
      },
      backgroundImage: {
        // Brand mesh — used at hero scale only, never miniaturised
        'brand-mesh':
          'radial-gradient(at 0% 0%, rgba(0, 124, 240, 0.45) 0px, transparent 50%), \
           radial-gradient(at 100% 0%, rgba(255, 0, 128, 0.40) 0px, transparent 50%), \
           radial-gradient(at 50% 100%, rgba(80, 227, 194, 0.35) 0px, transparent 50%), \
           radial-gradient(at 100% 100%, rgba(249, 203, 40, 0.30) 0px, transparent 50%)',
        'brand-mesh-soft':
          'radial-gradient(at 0% 0%, rgba(0, 124, 240, 0.18) 0px, transparent 50%), \
           radial-gradient(at 100% 0%, rgba(255, 0, 128, 0.16) 0px, transparent 50%), \
           radial-gradient(at 50% 100%, rgba(80, 227, 194, 0.14) 0px, transparent 50%), \
           radial-gradient(at 100% 100%, rgba(249, 203, 40, 0.12) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
}
