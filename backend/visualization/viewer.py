from __future__ import annotations

import numpy as np
import pyvista as pv
from pyvistaqt import BackgroundPlotter

from .layers import ScalarLayer, elevation_layer
from .mesh_builder import build_terrain_mesh
from .terrain_loader import TerrainArray


class TerrainViewer:
    def __init__(
        self,
        terrain: TerrainArray,
        z_scale: float = 2.0,
        window_title: str = "HK Flood Risk — Terrain Viewer",
    ) -> None:
        self._terrain = terrain
        self._mesh = build_terrain_mesh(terrain, z_scale=z_scale)
        self._z_scale = z_scale
        self._active_layers: dict[str, pv.Actor] = {}
        self._base_actor: pv.Actor | None = None

        self.plotter = BackgroundPlotter(title=window_title)

    def show(self, layer: ScalarLayer | None = None) -> None:
        if layer is None:
            layer = elevation_layer(self._terrain.elevation)
        self._render_base(layer)
        self.plotter.reset_camera()
        self.plotter.show_axes()

    def _render_base(self, layer: ScalarLayer) -> None:
        scalars = layer.data.ravel(order="F").astype(np.float32)
        mesh_copy = self._mesh.copy(deep=False)
        mesh_copy.point_data[layer.name] = scalars

        clim = layer.clim or (float(np.nanmin(layer.data)), float(np.nanmax(layer.data)))

        if self._base_actor is not None:
            self.plotter.remove_actor(self._base_actor)

        scalar_bar_label = f"{layer.label} [{layer.unit}]" if layer.unit else layer.label
        self._base_actor = self.plotter.add_mesh(
            mesh_copy,
            scalars=layer.name,
            cmap=layer.cmap,
            clim=clim,
            opacity=layer.opacity,
            nan_opacity=layer.nan_opacity,
            scalar_bar_args={"title": scalar_bar_label, "n_labels": 5},
            show_scalar_bar=True,
            lighting=True,
            smooth_shading=True,
        )

    def add_layer(self, layer: ScalarLayer) -> None:
        if layer.name in self._active_layers:
            self.plotter.remove_actor(self._active_layers[layer.name])

        scalars = layer.data.ravel(order="F").astype(np.float32)
        mesh_copy = self._mesh.copy(deep=False)
        mesh_copy.point_data[layer.name] = scalars
        clim = layer.clim or (float(np.nanmin(layer.data)), float(np.nanmax(layer.data)))
        scalar_bar_label = f"{layer.label} [{layer.unit}]" if layer.unit else layer.label

        actor = self.plotter.add_mesh(
            mesh_copy,
            scalars=layer.name,
            cmap=layer.cmap,
            clim=clim,
            opacity=layer.opacity,
            nan_opacity=0.0,
            scalar_bar_args={"title": scalar_bar_label},
        )
        self._active_layers[layer.name] = actor

    def remove_layer(self, name: str) -> None:
        if name in self._active_layers:
            self.plotter.remove_actor(self._active_layers.pop(name))

    def add_buildings(
        self,
        west_lon: float,
        south_lat: float,
        east_lon: float,
        north_lat: float,
    ) -> None:
        from .buildings import load_buildings_for_area, buildings_to_mesh

        print("Loading buildings...")
        buildings = load_buildings_for_area(west_lon, south_lat, east_lon, north_lat)
        print(f"  {len(buildings)} buildings found in area")
        if not buildings:
            return

        mesh = buildings_to_mesh(buildings, self._terrain, z_scale=self._z_scale)
        if mesh is None:
            print("  No valid building geometry to render")
            return

        self.plotter.add_mesh(
            mesh,
            color="lightgray",
            opacity=0.85,
            lighting=True,
            show_edges=False,
        )
        print("  Buildings added to viewer")

    def animate_flood(
        self,
        depth_frames: list[np.ndarray],
        interval_ms: int = 100,
    ) -> None:
        from .layers import flood_depth_layer

        frame_idx = [0]

        def _next_frame() -> None:
            i = frame_idx[0] % len(depth_frames)
            self.add_layer(flood_depth_layer(depth_frames[i]))
            frame_idx[0] += 1

        self.plotter.add_timer_event(
            max_steps=len(depth_frames),
            duration=interval_ms,
            callback=_next_frame,
        )
