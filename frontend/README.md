# Frontend

Mobile-first web UI for flood and sewage risk prediction.

## Getting started

```bash
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173
```

Open on a phone via your local IP (printed in the terminal) or use browser DevTools → Toggle device toolbar.

## Commands

```bash
npm run dev        # start dev server with hot reload
npm run build      # type-check + production build
npm run preview    # serve production build locally
```

## Stack

- **React 18** + TypeScript
- **Vite 6** — dev server and bundler
- **react-leaflet 4** — map component (CartoDB Voyager tiles, no API key needed)
- **Tailwind CSS 3** — utility-first styling

## Structure

```
src/
├── App.tsx                      # root — I18nProvider > MapProvider > AppContent
├── main.tsx                     # React entry point
├── index.css                    # Tailwind directives + global resets
├── types.ts                     # shared Place type
├── context/
│   ├── I18nContext.tsx          # locale state + t() helper
│   └── MapContext.tsx           # Leaflet map instance, selected location, panel state
├── hooks/
│   └── useRecentSearches.ts     # localStorage-backed recent searches (max 5)
├── i18n/
│   ├── en.json                  # English strings
│   └── yue.json                 # Cantonese strings
└── components/
    ├── MapView.tsx              # Leaflet map, HK bounds, MapCapture, SelectedMarker
    ├── HamburgerMenu.tsx        # top-left button (empty, ready for sidebar)
    ├── LanguageSelector.tsx     # top-right EN / 粵 flag toggle
    ├── MyLocationButton.tsx     # GPS crosshair button, fades when panel expands
    └── SearchPanel.tsx          # animated bottom panel — search, recents, quick picks
```

## Search panel behaviour

| State | Panel height | Content shown |
|---|---|---|
| Default | `14rem` (compact) | Quick-pick location chips |
| Focused, empty query, no recents | `65dvh` (expanded) | Quick-pick chips |
| Focused, empty query, has recents | `65dvh` | Recent searches + "Clear all" |
| Focused, typing (≥ 2 chars) | `65dvh` | Live Nominatim results |

Selecting a result: flies the map to the location with a 1.2 s animation, drops a red pin, saves to recents, and collapses the panel.

Tapping the map dismisses the keyboard and collapses the panel.

## Adding new strings

Add a key to both `src/i18n/en.json` and `src/i18n/yue.json`, then call `t('your.key')` inside any component.
