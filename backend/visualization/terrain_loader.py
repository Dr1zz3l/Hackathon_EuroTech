from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import transform_bounds
from shapely.geometry import box

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


def load_dtm_area(
    west_lon: float,
    south_lat: float,
    east_lon: float,
    north_lat: float,
    path: Path = DTM_PATH,
) -> TerrainArray:
    """Crop DTM to a WGS84 bounding box without loading the full raster into memory."""
    with rasterio.open(path) as src:
        # Reproject bbox from WGS84 → DTM's native CRS (EPSG:2326)
        w, s, e, n = transform_bounds("EPSG:4326", src.crs, west_lon, south_lat, east_lon, north_lat)
        geom = box(w, s, e, n)

        data, out_transform = rasterio_mask(src, [geom], crop=True)
        crs_str = str(src.crs)

    elevation = data[0].astype(np.float32)
    elevation[elevation == NODATA] = np.nan

    rows, cols = elevation.shape
    col_grid, row_grid = np.meshgrid(np.arange(cols), np.arange(rows))
    xs, ys = out_transform * (col_grid + 0.5, row_grid + 0.5)

    pixel_size = abs(float(out_transform.a))
    origin = (float(xs.min()), float(ys.min()))

    return TerrainArray(
        elevation=elevation,
        x=xs.astype(np.float32),
        y=ys.astype(np.float32),
        crs=crs_str,
        pixel_size_m=pixel_size,
        origin=origin,
    )
