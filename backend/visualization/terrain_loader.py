from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling

DTM_PATH = Path(__file__).parent.parent.parent / "data" / "dtm" / "Digital Terrain Model.tif"
NODATA = -9999


@dataclass
class TerrainArray:
    elevation: np.ndarray
    x: np.ndarray
    y: np.ndarray
    crs: str
    pixel_size_m: float
    origin: tuple[float, float]


def load_dtm(path: Path = DTM_PATH, downsample_factor: int = 10) -> TerrainArray:
    with rasterio.open(path) as src:
        out_h = src.height // downsample_factor
        out_w = src.width // downsample_factor
        data = src.read(1, out_shape=(out_h, out_w), resampling=Resampling.average)
        new_transform = src.transform * src.transform.scale(
            src.width / out_w,
            src.height / out_h,
        )
        crs_str = str(src.crs)

    elevation = data.astype(np.float32)
    elevation[elevation == NODATA] = np.nan

    cols = np.arange(out_w)
    rows = np.arange(out_h)
    col_grid, row_grid = np.meshgrid(cols, rows)
    xs, ys = new_transform * (col_grid + 0.5, row_grid + 0.5)

    pixel_size = abs(float(new_transform.a))
    origin = (float(xs.min()), float(ys.min()))

    return TerrainArray(
        elevation=elevation,
        x=xs.astype(np.float32),
        y=ys.astype(np.float32),
        crs=crs_str,
        pixel_size_m=pixel_size,
        origin=origin,
    )
