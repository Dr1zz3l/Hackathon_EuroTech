import urllib.request
import zipfile
import io
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DTM_DIR = DATA_DIR / "dtm"

DTM_URL = "https://static.csdi.gov.hk/csdi-webpage/download/43f9ca1bf5695d98885c767185b0afe1/geotiff"


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


def setup():
    DATA_DIR.mkdir(exist_ok=True)
    download_dtm()
