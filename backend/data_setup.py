import io
import urllib.request
import zipfile
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DTM_DIR = DATA_DIR / "dtm"
BUILDINGS_DIR = DATA_DIR / "buildings"
BUILDINGS_PATH = BUILDINGS_DIR / "buildings.geojson"

DTM_URL = "https://static.csdi.gov.hk/csdi-webpage/download/43f9ca1bf5695d98885c767185b0afe1/geotiff"
POP_CENS_DCD = "https://static.csdi.gov.hk/csdi-webpage/download/b14f9a883e8d5b0eaf864f1aaa12c38d/geojson"
POP_CENS_LTPU = "https://static.csdi.gov.hk/csdi-webpage/download/ed8911d0b40a564d87bed46fc00773fa/geojson"
POP_CENS_STPU = "https://static.csdi.gov.hk/csdi-webpage/download/d5c837b46e55558b8d5fd5c18523a6ea/geojson"
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

def download_dtm():
    dtm_files = list(DTM_DIR.glob("*.tif"))
    if dtm_files:
        print(f"DTM already present: {dtm_files[0]}")
        return

    DTM_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading DTM from {DTM_URL} ...")
    with urllib.request.urlopen(DTM_URL) as response:
        data = response.read()

    print("Extracting ...")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        zf.extractall(DTM_DIR)

    extracted = list(DTM_DIR.glob("*.tif"))
    print(f"Done. Extracted to: {extracted}")


def download_buildings():
    if BUILDINGS_PATH.exists():
        print(f"Buildings already present: {BUILDINGS_PATH}")
        return

    BUILDINGS_DIR.mkdir(parents=True, exist_ok=True)
    print("Downloading Building GeoJSON (this may take a minute) ...")
    req = urllib.request.Request(BUILDINGS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response, open(BUILDINGS_PATH, "wb") as f:
        downloaded = 0
        while chunk := response.read(1024 * 1024):
            f.write(chunk)
            downloaded += len(chunk)
            print(f"\r  {downloaded / 1e6:.1f} MB downloaded...", end="", flush=True)
    print(f"\nBuildings saved: {BUILDINGS_PATH}")


def setup():
    DATA_DIR.mkdir(exist_ok=True)
    download_dtm()
    download_buildings()
