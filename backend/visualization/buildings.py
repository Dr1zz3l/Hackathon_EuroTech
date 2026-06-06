from pathlib import Path

import fiona
import numpy as np
import pyvista as pv
from pyproj import Transformer

from .terrain_loader import TerrainArray

BUILDINGS_PATH = Path(__file__).parent.parent.parent / "data" / "buildings" / "buildings.geojson"

_DEFAULT_HEIGHT_M = 15.0  # ~5 floors, typical HK mid-rise fallback


def _building_height(props: dict) -> float:
    try:
        top = props.get("TopHeight")
        base = props.get("BaseHeight")
        if top is not None and base is not None:
            return float(top) - float(base)
    except (TypeError, ValueError):
        pass
    try:
        storeys = props.get("Storeys")
        if storeys:
            return float(storeys) * 3.5
    except (TypeError, ValueError):
        pass
    return _DEFAULT_HEIGHT_M


def _sample_elevation(terrain: TerrainArray, easting: float, northing: float) -> float:
    col = int(round((easting - terrain.x[0, 0]) / terrain.pixel_size_m))
    row = int(round((terrain.y[0, 0] - northing) / terrain.pixel_size_m))
    col = max(0, min(col, terrain.x.shape[1] - 1))
    row = max(0, min(row, terrain.x.shape[0] - 1))
    elev = terrain.elevation[row, col]
    return float(elev) if np.isfinite(elev) else 0.0


def load_buildings_for_area(
    west_lon: float,
    south_lat: float,
    east_lon: float,
    north_lat: float,
    path: Path = BUILDINGS_PATH,
) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Buildings file not found: {path}. Run main.py to download.")

    buildings = []
    with fiona.open(str(path)) as src:
        for feature in src.filter(bbox=(west_lon, south_lat, east_lon, north_lat)):
            geom_type = feature["geometry"]["type"]
            if geom_type not in ("Polygon", "MultiPolygon"):
                continue
            buildings.append({
                "geometry": feature["geometry"],
                "properties": dict(feature.get("properties") or {}),
            })
    return buildings


def buildings_to_mesh(
    buildings: list[dict],
    terrain: TerrainArray,
    z_scale: float = 2.0,
) -> pv.PolyData | None:
    if not buildings:
        return None

    to_hk80 = Transformer.from_crs("EPSG:4326", "EPSG:2326", always_xy=True)
    origin_x = float(terrain.x[0, 0])
    origin_y = float(terrain.y[0, 0])

    meshes: list[pv.PolyData] = []

    for b in buildings:
        geom = b["geometry"]
        props = b["properties"]
        height_m = _building_height(props)

        # Collect exterior rings (handles both Polygon and MultiPolygon)
        if geom["type"] == "Polygon":
            rings = [geom["coordinates"][0]]
        else:
            rings = [poly[0] for poly in geom["coordinates"]]

        for ring in rings:
            coords = list(ring)
            # Drop duplicate closing vertex
            if len(coords) > 1 and coords[0] == coords[-1]:
                coords = coords[:-1]
            if len(coords) < 3:
                continue

            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            eastings, northings = to_hk80.transform(lons, lats)

            # Sample terrain at centroid
            cen_e = float(np.mean(eastings))
            cen_n = float(np.mean(northings))
            base_z = _sample_elevation(terrain, cen_e, cen_n) * z_scale

            sx = np.array(eastings) - origin_x
            sy = np.array(northings) - origin_y
            sz = np.full(len(sx), base_z)

            pts = np.column_stack([sx, sy, sz])
            n = len(pts)
            faces = np.hstack([[n], np.arange(n)])

            try:
                poly = pv.PolyData(pts, faces=faces)
                poly = poly.triangulate()
                extruded = poly.extrude([0.0, 0.0, height_m * z_scale], capping=True)
                meshes.append(extruded.extract_surface(algorithm="dataset_surface"))
            except Exception:
                continue

    if not meshes:
        return None

    combined = meshes[0]
    for m in meshes[1:]:
        combined = combined.merge(m)
    return combined
