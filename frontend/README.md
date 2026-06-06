# Frontend — HK Building Portfolio Manager

Desktop web app for managing the building portfolio of Hong Kong using a 3D map.

## Quick start

```bash
# 1. Get a free CesiumIon token (for 3D buildings)
#    https://cesium.com/ion/ → Account → Access Tokens
#    Asset ID 96188 (OSM 3D Buildings) is free for all accounts.

# 2. Create your .env file
cp .env.example .env
# Edit .env and paste your token as VITE_CESIUM_TOKEN=...

# 3. Install and run
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The app works **without a token** — OSM imagery and the coloured portfolio entities still render;
only the CesiumIon OSM 3D Buildings background tileset is disabled.

## Commands

```bash
npm run dev      # dev server with hot reload
npm run build    # type-check + production build
npm run preview  # serve the production build locally
```

## Stack

| Layer | Choice |
|---|---|
| UI framework | React 18 + TypeScript |
| Bundler | Vite 5 |
| 3D map | Cesium.js + vite-plugin-cesium |
| Base imagery | OpenStreetMap (no key) |
| 3D buildings | CesiumIon Asset 96188 — OSM Buildings (free account) |
| Styling | Tailwind CSS 3 |

## Structure

```
src/
├── vite-env.d.ts              # ImportMeta env types
├── main.tsx                   # entry — imports Cesium CSS
├── App.tsx                    # BuildingProvider + Sidebar + CesiumMap
├── index.css                  # Tailwind directives + global reset
├── types.ts                   # Building, MaintenanceItem, Recommendation, etc.
├── data/
│   └── buildings.ts           # 20 synthetic HK portfolio buildings
├── context/
│   └── BuildingContext.tsx    # selected building state
└── components/
    ├── CesiumMap.tsx           # Cesium viewer, entity creation, click handler
    ├── Sidebar.tsx             # Left panel — empty state + building detail
    ├── RiskBar.tsx             # Flood / earthquake risk progress bar
    └── StatusBadge.tsx        # RecommendationBadge, ConditionBadge, PriorityDot
```

## How it works

1. `CesiumMap` creates a Cesium `Viewer` with OSM imagery as the base layer.
2. If `VITE_CESIUM_TOKEN` is set, it streams the OSM 3D Buildings tileset from CesiumIon (Asset 96188) as background context.
3. Each of the 20 portfolio buildings is added as a coloured `Entity` with an extruded rectangular footprint:
   - **Green** → Maintain
   - **Amber** → Monitor
   - **Red** → Decommission
4. Clicking an entity populates `BuildingContext` with the selected building.
5. `Sidebar` reads context and renders building details, risk bars, and the maintenance item list.

## Adding real building data

Replace or extend `src/data/buildings.ts` with real records that conform to the `Building` type in `src/types.ts`. All coordinates are `lat`/`lng` in WGS-84 decimal degrees; `footprint_m2` is used to size the rectangular placeholder footprint.
