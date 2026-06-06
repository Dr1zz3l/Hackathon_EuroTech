# AGENTS.md

## Project Overview

We are building a two-day hackathon MVP for predicting sewage clogging, drainage overload, and flood-related city infrastructure issues during typhoons and heavy rainfall.

The target setting is cities such as Hong Kong and other cities in the Greater Bay Area.

The MVP should show a simple map-based mobile web interface where users can:

* Browse a city map
* Search for a location
* See estimated flood / sewage clogging risk
* Switch between English and Cantonese

The system will use available weather data, historical flood data, and open city datasets where possible.

---

## MVP Goal

Build a simple working prototype that demonstrates:

1. A frontend map interface
2. A backend API
3. A basic prediction or scoring method
4. A clear risk result shown to the user

The goal is not to build a perfect model. The goal is to show a credible end-to-end concept.

---

## Very Simple Repository Structure

The repository can start with this structure:

```text
.
├── AGENTS.md
├── README.md
├── frontend/
├── backend/
├── data/
└── docs/
```

### `frontend/`

Contains the mobile web UI.

Likely responsibilities:

* Map view
* Location search
* Risk display panel
* English / Cantonese language switch
* Calls to the backend API

### `backend/`

Contains the API and prediction logic.

Likely responsibilities:

* Receive location requests from the frontend
* Load or query weather and flood-related data
* Calculate a simple risk score
* Return results to the frontend

### `data/`

Contains any datasets used for the MVP.

Examples:

* Weather samples
* Historical flood records
* Open geospatial datasets
* Demo or mock data

Clearly mark whether data is real, sample, or synthetic.

### `docs/`

Contains notes for the team.

Examples:

* Architecture notes
* Data source notes
* Demo script
* Model assumptions

---

## Simple Architecture

```text
Frontend map UI
      |
      v
Backend API
      |
      v
Risk scoring logic
      |
      v
Weather / flood / open city data
```

The frontend asks the backend for the risk at a selected location.

The backend returns a result such as:

```json
{
  "risk_level": "high",
  "risk_score": 0.78,
  "top_factors": [
    "Heavy rainfall forecast",
    "Nearby historical flood records",
    "Low-lying urban area"
  ]
}
```

---

## Frontend Approach

The frontend should be simple and mobile-first.

Suggested features:

* Show a city map
* Let users search for a place
* Let users tap or select a location
* Show the estimated risk level
* Show a few reasons for the risk
* Support English and Cantonese text

Possible tools:

* React, Next.js, or Vite
* Mapbox, MapLibre, Leaflet, or Google Maps
* Simple JSON files for translations

---

## Backend Approach

The backend should expose a small API.

Suggested endpoints:

```text
GET /health
GET /api/risk?lat=22.3193&lng=114.1694
```

The `/api/risk` endpoint should return:

* Location
* Risk score
* Risk level
* Main contributing factors
* Data freshness if available

Possible tools:

* Python
* FastAPI
* pandas
* simple JSON / CSV files at first

---

## Prediction Approach

Start with a simple rule-based score.

Example:

```text
risk_score =
  rainfall_score
+ flood_history_score
+ location_risk_score
```

Possible factors:

* Current or forecasted rainfall
* Historical flood incidents nearby
* Low elevation
* Dense urban area
* Known flood-prone district
* Distance to coast, river, or drainage channel

For the MVP, a simple score is better than an unfinished machine learning model.

A possible risk scale:

|     Score | Risk     |
| --------: | -------- |
| 0.00–0.30 | Low      |
| 0.30–0.60 | Medium   |
| 0.60–0.80 | High     |
| 0.80–1.00 | Critical |

---

## Data Approach

Use whatever data is easiest to access during the hackathon.

Possible sources:

* Weather API or sample weather data
* Historical flood records
* OpenStreetMap
* Government open data
* Manually prepared demo locations
* Synthetic data for missing pieces

Do not pretend synthetic data is real. Label it clearly.

---

## Language Support

The UI should support:

* English
* Cantonese / Traditional Chinese

A simple approach:

```text
frontend/
└── i18n/
    ├── en.json
    └── yue.json
```

Use stable keys such as:

```json
{
  "risk.low": "Low risk",
  "risk.medium": "Medium risk",
  "risk.high": "High risk",
  "risk.critical": "Critical risk"
}
```

---

## Hackathon Priorities

Build in this order:

1. Basic frontend page
2. Map display
3. Backend `/api/risk` endpoint
4. Mock risk response
5. Connect frontend to backend
6. Add simple scoring logic
7. Add demo data
8. Add English / Cantonese switch
9. Polish the demo flow

Do not spend too much time on complex modeling before the full app works.

---

## Demo Plan

A good demo should show:

1. Open the mobile web app
2. Search for a location
3. Show predicted risk
4. Explain the top risk factors
5. Switch language
6. Compare with another location

Prepare a few demo locations in advance so the demo is reliable.

---

## Important Limitations

This is a hackathon prototype.

The app should not claim to be an official warning system. Risk scores are estimates based on limited data and simplified assumptions.

Use wording like:

* “Estimated risk”
* “Possible contributing factors”
* “Prototype prediction”
* “Not an official emergency warning”

---

## Guidance for Contributors

Keep the project simple.

Prioritize:

* A working demo
* Clear architecture
* Clear API response
* Understandable risk explanations
* Reliable mobile UI
* Honest data assumptions

Avoid:

* Overengineering
* Complex ML before the app works
* Unclear data sources
* Claims that the model cannot support

The best MVP is a simple, working, explainable map-based prototype.
