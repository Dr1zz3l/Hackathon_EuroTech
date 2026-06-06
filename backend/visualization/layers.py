from dataclasses import dataclass, field

import numpy as np


@dataclass
class ScalarLayer:
    name: str
    data: np.ndarray
    cmap: str = "viridis"
    clim: tuple[float, float] | None = None
    opacity: float = 1.0
    nan_opacity: float = 0.0
    label: str = ""
    unit: str = ""
    animatable: bool = False


def elevation_layer(elevation: np.ndarray) -> ScalarLayer:
    valid = elevation[np.isfinite(elevation)]
    return ScalarLayer(
        name="elevation",
        data=elevation,
        cmap="terrain",
        clim=(float(valid.min()), float(valid.max())),
        label="Elevation",
        unit="m",
    )


def flood_depth_layer(depth: np.ndarray, water_level_m: float = 0.0) -> ScalarLayer:
    masked = np.where(depth > 0, depth, np.nan)
    max_depth = float(np.nanmax(masked)) if np.any(masked > 0) else 1.0
    return ScalarLayer(
        name="flood_depth",
        data=masked,
        cmap="Blues",
        clim=(0.0, max_depth),
        opacity=0.75,
        nan_opacity=0.0,
        label=f"Water Depth (level={water_level_m:.1f}m)",
        unit="m",
        animatable=True,
    )


def rainfall_intensity_layer(intensity_mm_per_hr: np.ndarray) -> ScalarLayer:
    return ScalarLayer(
        name="rainfall",
        data=intensity_mm_per_hr,
        cmap="YlGnBu",
        clim=(0.0, float(np.nanmax(intensity_mm_per_hr))),
        opacity=0.6,
        label="Rainfall Intensity",
        unit="mm/hr",
    )


def drainage_risk_layer(risk_score: np.ndarray) -> ScalarLayer:
    return ScalarLayer(
        name="drainage_risk",
        data=risk_score,
        cmap="RdYlGn_r",
        clim=(0.0, 1.0),
        opacity=0.7,
        label="Drainage Risk Score",
        unit="",
    )
