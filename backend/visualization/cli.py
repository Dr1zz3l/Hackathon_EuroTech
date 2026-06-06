import argparse
from pathlib import Path

from .terrain_loader import DTM_PATH, load_dtm
from .viewer import TerrainViewer


def run_viewer(
    dtm_path: Path = DTM_PATH,
    downsample_factor: int = 10,
    z_scale: float = 2.0,
) -> None:
    print(f"Loading DTM (downsample ×{downsample_factor})...")
    terrain = load_dtm(dtm_path, downsample_factor=downsample_factor)
    print(f"Grid: {terrain.elevation.shape[1]}×{terrain.elevation.shape[0]}, {terrain.pixel_size_m:.0f} m/pixel")

    viewer = TerrainViewer(terrain, z_scale=z_scale)
    viewer.show()
    print("Viewer open. Close the window to exit.")
    viewer.plotter.app.exec()


def main() -> None:
    parser = argparse.ArgumentParser(description="HK 3D Terrain Viewer")
    parser.add_argument("--downsample", type=int, default=10, help="Downsample factor (default 10 → 50 m/pixel)")
    parser.add_argument("--zscale", type=float, default=2.0, help="Vertical exaggeration (default 2.0)")
    parser.add_argument("--dtm", type=Path, default=DTM_PATH, help="Path to DTM GeoTIFF")
    args = parser.parse_args()
    run_viewer(args.dtm, args.downsample, args.zscale)


if __name__ == "__main__":
    main()
