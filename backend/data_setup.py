import io
import re
import time
import urllib.request
import zipfile
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

# Directories
DTM_DIR = DATA_DIR / "dtm"
BUILDINGS_DIR = DATA_DIR / "buildings"
POPULATION_DIR = DATA_DIR / "population"
LOTS_DIR = DATA_DIR / "lots"
DISTRICTS_DIR = DATA_DIR / "districts"
LAND_DIR = DATA_DIR / "land"
HOUSING_DIR = DATA_DIR / "housing"
LAND_UTIL_DIR = DATA_DIR / "land_utilization"
RASTER_LAND_UTIL_DIR = DATA_DIR / "raster_land_utilization"

# File paths
BUILDINGS_PATH = BUILDINGS_DIR / "buildings.geojson"
BUILDING_AGE_PATH = BUILDINGS_DIR / "building_age.csv"
POP_CENS_DCD_PATH = POPULATION_DIR / "census_dcd.geojson"
POP_CENS_LTPU_PATH = POPULATION_DIR / "census_ltpu.geojson"
POP_CENS_STPU_PATH = POPULATION_DIR / "census_stpu.geojson"
POP_CENS_STPU_2016_PATH = POPULATION_DIR / "census_stpu_2016.geojson"
POP_CENS_STPU_2011_PATH = POPULATION_DIR / "census_stpu_2011.geojson"
LOTS_PATH = LOTS_DIR / "lots.geojson"
DISTRICT_BOUNDARIES_PATH = DISTRICTS_DIR / "district_boundaries.geojson"
GOVT_LAND_ALLOC_PATH = LAND_DIR / "government_land_allocation.geojson"
GLA_CODE_PATH = LAND_DIR / "gla_code.geojson"
PUBLIC_RENTAL_HOUSING_PATH = HOUSING_DIR / "public_rental_housing.json"
PRH_ESTATES_PATH = HOUSING_DIR / "prh_estates.json"
HOS_COURTS_PATH = HOUSING_DIR / "hos_courts.json"
SHOPPING_CENTRES_PATH = HOUSING_DIR / "shopping_centres.json"
FLATTED_FACTORIES_PATH = HOUSING_DIR / "flatted_factories.json"
LAND_UTIL_EN_PATH = LAND_UTIL_DIR / "luhk2024_en.csv"
LAND_UTIL_TC_PATH = LAND_UTIL_DIR / "luhk2024_tc.csv"
LAND_UTIL_SC_PATH = LAND_UTIL_DIR / "luhk2024_sc.csv"

# URLs
DTM_URL = "https://static.csdi.gov.hk/csdi-webpage/download/43f9ca1bf5695d98885c767185b0afe1/geotiff"
POP_CENS_DCD = "https://static.csdi.gov.hk/csdi-webpage/download/b14f9a883e8d5b0eaf864f1aaa12c38d/geojson"
POP_CENS_LTPU = "https://static.csdi.gov.hk/csdi-webpage/download/ed8911d0b40a564d87bed46fc00773fa/geojson"
POP_CENS_STPU = "https://static.csdi.gov.hk/csdi-webpage/download/d5c837b46e55558b8d5fd5c18523a6ea/geojson"
POP_CENS_STPU_2016 = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=censtatd_rcd_1629267205229_40996&format=geojson&layer_name=STPUG_16BC"
POP_CENS_STPU_2011 = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=censtatd_rcd_1629267205229_97980&format=geojson&layer_name=STPUG_11C"
BUILDINGS_URL = (
    "https://portal.csdi.gov.hk/csdi-webpage/file-api"
    "?dataset_id=landsd_rcd_1637211194312_35158&format=geojson&layer_name=Building"
)
LOT_URL = "https://static.csdi.gov.hk/csdi-webpage/download/38b3fa389e8254679beb3646a6c20f80/geojson"
BUILDING_AGE_URL = "https://static.csdi.gov.hk/csdi-webpage/download/0e55c533715b5da3ae0ca6e6024e90b4/csv"
DISTRICT_BOUNDARIES_URL = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=had_rcd_1634523272907_75218&format=geojson&layer_name=DCD"
GOVERMENT_LAND_ALLOC_URL = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=landsd_rcd_1637218348584_91735&format=geojson&layer_name=GovernmentLandAllocation"
GLA_CODE_URL = "https://portal.csdi.gov.hk/csdi-webpage/file-api?dataset_id=landsd_rcd_1637218348584_91735&format=geojson&layer_name=CT_GLACode"
PUBLIC_RENTAL_HOUSING_URL = "https://data.housingauthority.gov.hk/psi/rest/export/ha_prhs/ha_prhs_a/en/json"

PUBLIC_HOUSING_ESTATES_ESTATES_URL = "https://res.data.gov.hk/api/get-download-file?name=https%3A%2F%2Fwww.housingauthority.gov.hk%2Fdatagovhk%2Fprh-estates.json"
PUBLIC_HOUSING_ESTATES_COURTS_URL = "https://res.data.gov.hk/api/get-download-file?name=https%3A%2F%2Fwww.housingauthority.gov.hk%2Fdatagovhk%2Fhos-courts.json"
PUBLIC_HOUSING_ESTATES_SHOPPING_CENTRES_URL = "https://res.data.gov.hk/api/get-download-file?name=https%3A%2F%2Fwww.housingauthority.gov.hk%2Fdatagovhk%2Fshopping-centres.json"
PUBLIC_HOUSING_ESTATES_FLATTED_FACTORIES_URL = "https://res.data.gov.hk/api/get-download-file?name=https%3A%2F%2Fwww.housingauthority.gov.hk%2Fdatagovhk%2Fflatted-factory.json"

LAND_UTILIZATION_EN_URL = "https://www.pland.gov.hk/pland_en/info_serv/statistic/landu/csv/LUHK2024_English.csv"
LAND_UTILIZATION_TC_URL = "https://www.pland.gov.hk/pland_en/info_serv/statistic/landu/csv/LUHK2024_TC.csv"
LAND_UTILIZATION_SC_URL = "https://www.pland.gov.hk/pland_en/info_serv/statistic/landu/csv/LUHK2024_SC.csv"

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


def download_dtm():
    _download_to_dir(DTM_URL, DTM_DIR, "DTM", "*.tif")


def download_buildings():
    _download_to_file(BUILDINGS_URL, BUILDINGS_PATH, "buildings")


def download_population_census():
    _download_to_file(POP_CENS_DCD, POP_CENS_DCD_PATH, "population census (DCD)")
    _download_to_file(POP_CENS_LTPU, POP_CENS_LTPU_PATH, "population census (LTPU)")
    _download_to_file(POP_CENS_STPU, POP_CENS_STPU_PATH, "population census (STPU 2021)")
    _download_to_file(POP_CENS_STPU_2016, POP_CENS_STPU_2016_PATH, "population census (STPU 2016)")
    _download_to_file(POP_CENS_STPU_2011, POP_CENS_STPU_2011_PATH, "population census (STPU 2011)")


def download_lots():
    _download_to_file(LOT_URL, LOTS_PATH, "land lots")


def download_building_age():
    _download_to_file(BUILDING_AGE_URL, BUILDING_AGE_PATH, "building age")


def download_district_boundaries():
    _download_to_file(DISTRICT_BOUNDARIES_URL, DISTRICT_BOUNDARIES_PATH, "district boundaries")


def download_government_land():
    _download_to_file(GOVERMENT_LAND_ALLOC_URL, GOVT_LAND_ALLOC_PATH, "government land allocation")
    _download_to_file(GLA_CODE_URL, GLA_CODE_PATH, "GLA code")


def download_housing():
    _download_to_file(PUBLIC_RENTAL_HOUSING_URL, PUBLIC_RENTAL_HOUSING_PATH, "public rental housing")
    _download_to_file(PUBLIC_HOUSING_ESTATES_ESTATES_URL, PRH_ESTATES_PATH, "PRH estates")
    _download_to_file(PUBLIC_HOUSING_ESTATES_COURTS_URL, HOS_COURTS_PATH, "HOS courts")
    _download_to_file(PUBLIC_HOUSING_ESTATES_SHOPPING_CENTRES_URL, SHOPPING_CENTRES_PATH, "shopping centres")
    _download_to_file(PUBLIC_HOUSING_ESTATES_FLATTED_FACTORIES_URL, FLATTED_FACTORIES_PATH, "flatted factories")


def download_land_utilization():
    _download_to_file(LAND_UTILIZATION_EN_URL, LAND_UTIL_EN_PATH, "land utilization (EN)")
    _download_to_file(LAND_UTILIZATION_TC_URL, LAND_UTIL_TC_PATH, "land utilization (TC)")
    _download_to_file(LAND_UTILIZATION_SC_URL, LAND_UTIL_SC_PATH, "land utilization (SC)")


def download_raster_land_utilization():
    _download_to_dir(RASTER_GRID_LAND_UTILIZATION_URL, RASTER_LAND_UTIL_DIR, "raster land utilization", "*.tif")


def setup():
    DATA_DIR.mkdir(exist_ok=True)
    download_dtm()
    download_buildings()
    download_population_census()
    download_lots()
    download_building_age()
    download_district_boundaries()
    download_government_land()
    download_housing()
    download_land_utilization()
    download_raster_land_utilization()
