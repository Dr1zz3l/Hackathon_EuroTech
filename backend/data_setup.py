import io
import re
import time
import urllib.request
import zipfile
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

# Directories
BUILDINGS_DIR = DATA_DIR / "buildings"
POPULATION_DIR = DATA_DIR / "population"
DISTRICTS_DIR = DATA_DIR / "districts"
RASTER_LAND_UTIL_DIR = DATA_DIR / "raster_land_utilization"

# File paths
BUILDING_AGE_PATH = BUILDINGS_DIR / "building_age.csv"
POP_CENS_STPU_PATH = POPULATION_DIR / "census_stpu.geojson"
POP_CENS_STPU_2016_PATH = POPULATION_DIR / "census_stpu_2016.geojson"
POP_CENS_STPU_2011_PATH = POPULATION_DIR / "census_stpu_2011.geojson"
DISTRICT_BOUNDARIES_PATH = DISTRICTS_DIR / "district_boundaries.geojson"

# URLs
POP_CENS_STPU = "https://static.csdi.gov.hk/csdi-webpage/download/d5c837b46e55558b8d5fd5c18523a6ea/geojson"
POP_CENS_STPU_2016 = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=censtatd_rcd_1629267205229_40996&format=geojson&layer_name=STPUG_16BC"
POP_CENS_STPU_2011 = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=censtatd_rcd_1629267205229_97980&format=geojson&layer_name=STPUG_11C"
BUILDING_AGE_URL = "https://static.csdi.gov.hk/csdi-webpage/download/0e55c533715b5da3ae0ca6e6024e90b4/csv"
DISTRICT_BOUNDARIES_URL = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=had_rcd_1634523272907_75218&format=geojson&layer_name=DCD"
RASTER_GRID_LAND_UTILIZATION_URL = "https://static.csdi.gov.hk/csdi-webpage/download/ac678c4e9c2d5f018e3964c39a1cbc0c/geotiff"


def _make_request(url: str) -> urllib.request.Request:
    # Fix any bare % not followed by two hex digits to avoid urllib parse errors
    safe_url = re.sub(r"%(?![0-9A-Fa-f]{2})", "%25", url)
    return urllib.request.Request(safe_url, headers={"User-Agent": "Mozilla/5.0"})


def _fetch(url: str, retries: int = 5, backoff: float = 3.0) -> bytes:
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            buf = io.BytesIO()
            with urllib.request.urlopen(_make_request(url), timeout=60) as resp:
                downloaded = 0
                while chunk := resp.read(1024 * 1024):
                    buf.write(chunk)
                    downloaded += len(chunk)
                    print(f"\r  {downloaded / 1e6:.1f} MB...", end="", flush=True)
            print()
            return buf.getvalue()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                wait = backoff * attempt
                print(f"\n  attempt {attempt} failed ({exc}), retrying in {wait:.0f}s...")
                time.sleep(wait)
    raise RuntimeError(f"download failed after {retries} attempts") from last_exc


def _download_to_file(url: str, dest_path: Path, label: str) -> None:
    """Download url to dest_path. Auto-extracts the matching file from a zip archive."""
    if dest_path.exists():
        print(f"{label} already present: {dest_path}")
        return

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {label} ...")
    data = _fetch(url)

    if zipfile.is_zipfile(io.BytesIO(data)):
        ext = dest_path.suffix.lower()
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            matches = [n for n in zf.namelist() if n.lower().endswith(ext)]
            src_name = matches[0] if matches else zf.namelist()[0]
            with zf.open(src_name) as src:
                dest_path.write_bytes(src.read())
    else:
        dest_path.write_bytes(data)

    print(f"{label} saved: {dest_path}")


def _download_to_dir(url: str, dest_dir: Path, label: str, check_glob: str = "*") -> None:
    """Download a zip url and extract all files to dest_dir."""
    if list(dest_dir.glob(check_glob)):
        print(f"{label} already present in {dest_dir}")
        return

    dest_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {label} ...")
    data = _fetch(url)

    buf = io.BytesIO(data)
    with zipfile.ZipFile(buf) as zf:
        zf.extractall(dest_dir)

    print(f"{label} extracted to: {dest_dir}")


def download_population_census() -> None:
    """Download 2011/2016/2021 STPU census GeoJSONs (neighbourhood boundaries + demographics)."""
    _download_to_file(POP_CENS_STPU, POP_CENS_STPU_PATH, "population census (STPU 2021)")
    _download_to_file(POP_CENS_STPU_2016, POP_CENS_STPU_2016_PATH, "population census (STPU 2016)")
    _download_to_file(POP_CENS_STPU_2011, POP_CENS_STPU_2011_PATH, "population census (STPU 2011)")


def download_building_age() -> None:
    """Download Buildings Dept CSV used for the urban-renewal ageing_building_share term."""
    _download_to_file(BUILDING_AGE_URL, BUILDING_AGE_PATH, "building age")


def download_district_boundaries() -> None:
    """Download HAD 18-district polygon GeoJSON."""
    _download_to_file(DISTRICT_BOUNDARIES_URL, DISTRICT_BOUNDARIES_PATH, "district boundaries")


def download_raster_land_utilization() -> None:
    """Download Planning Dept LUMHK 2024 10 m raster GeoTIFF (BLU.tif)."""
    _download_to_dir(RASTER_GRID_LAND_UTILIZATION_URL, RASTER_LAND_UTIL_DIR, "raster land utilization", "*.tif")


def setup() -> None:
    """Download all raw data required by the build pipeline.

    Safe to re-run — each download is skipped if the file already exists.
    After this completes, run:
        uv run python build_data.py               # → districts.geojson
        uv run python build_neighbourhoods.py     # → neighbourhoods.geojson
        uv run python build_population_history.py # → population_history.csv + census_panel.json
    """
    DATA_DIR.mkdir(exist_ok=True)
    download_raster_land_utilization()
    download_district_boundaries()
    download_building_age()
    download_population_census()
