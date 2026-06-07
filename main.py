"""Raw-data downloader for the HK District Viability build pipeline.

Downloads all source datasets from CSDI / Planning Dept into data/.
Safe to re-run — each download is skipped if the file already exists.

Usage:
    uv run python main.py

After downloading, run the build scripts to regenerate the committed GeoJSON files:
    uv run python build_data.py               # → frontend/public/districts.geojson
    uv run python build_neighbourhoods.py     # → frontend/public/neighbourhoods.geojson
    uv run python build_population_history.py # → data/population/population_history.csv
"""

from backend.data_setup import setup


def main() -> None:
    setup()


if __name__ == "__main__":
    main()
