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
├── App.tsx                   # root layout (map + overlays + bottom panel)
├── main.tsx                  # React entry point
├── index.css                 # Tailwind directives + global resets
├── context/
│   └── I18nContext.tsx       # locale state + t() helper
├── i18n/
│   ├── en.json               # English strings
│   └── yue.json              # Cantonese strings
└── components/
    ├── MapView.tsx            # Leaflet map, Hong Kong bounds
    ├── HamburgerMenu.tsx      # top-left button (empty for now)
    ├── LanguageSelector.tsx   # top-right EN / 粵 flag toggle
    └── SearchPanel.tsx        # bottom panel with search + quick picks
```

## Adding new strings

Add a key to both `src/i18n/en.json` and `src/i18n/yue.json`, then call `t('your.key')` inside any component.
