import numpy as np
import pyvista as pv

from .terrain_loader import TerrainArray

_FILL_ELEV = -30.0


def build_terrain_mesh(terrain: TerrainArray, z_scale: float = 2.0) -> pv.StructuredGrid:
    rows, cols = terrain.elevation.shape

    x_off = (terrain.x - terrain.x[0, 0]).astype(np.float64)
    y_off = (terrain.y - terrain.y[0, 0]).astype(np.float64)

    elev = terrain.elevation.copy()
    valid = np.isfinite(elev).astype(np.uint8)
    elev = np.where(valid, elev, _FILL_ELEV)

    x3d = x_off.reshape(rows, cols, 1)
    y3d = y_off.reshape(rows, cols, 1)
    z3d = (elev * z_scale).reshape(rows, cols, 1)

    grid = pv.StructuredGrid(x3d, y3d, z3d)
    grid.point_data["elevation"] = elev.ravel(order="F").astype(np.float32)
    grid.point_data["valid_mask"] = valid.ravel(order="F")

    cell_valid = (
        valid[:-1, :-1] & valid[1:, :-1] & valid[:-1, 1:] & valid[1:, 1:]
    ).ravel(order="F")
    ghost = np.zeros(grid.n_cells, dtype=np.uint8)
    ghost[cell_valid == 0] = 1  # vtkDataSetAttributes DUPLICATECELL = hidden
    grid.cell_data["vtkGhostType"] = ghost

    return grid
