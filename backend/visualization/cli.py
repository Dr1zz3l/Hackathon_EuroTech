import argparse
from pathlib import Path

from .terrain_loader import DTM_PATH, load_dtm, load_dtm_area
from .viewer import TerrainViewer

# Wong Tai Sin / Lion Rock default crop
DEFAULT_AREA = (114.1850, 22.3350, 114.2050, 22.3550)  # W, S, E, N (WGS84)


def run_viewer(
    dtm_path: Path = DTM_PATH,
    downsample_factor: int = 10,
    z_scale: float = 2.0,
    area: tuple[float, float, float, float] | None = None,
    show_buildings: bool = False,
) -> None:
    if area is not None:
        w, s, e, n = area
        print(f"Cropping to bbox W={w} S={s} E={e} N={n} ...")
        terrain = load_dtm_area(w, s, e, n, path=dtm_path)
        print(f"Grid: {terrain.elevation.shape[1]}×{terrain.elevation.shape[0]}, {terrain.pixel_size_m:.0f} m/pixel (native res)")
    else:
        print(f"Loading full DTM (downsample ×{downsample_factor})...")
        terrain = load_dtm(dtm_path, downsample_factor=downsample_factor)
        print(f"Grid: {terrain.elevation.shape[1]}×{terrain.elevation.shape[0]}, {terrain.pixel_size_m:.0f} m/pixel")

    viewer = TerrainViewer(terrain, z_scale=z_scale)
    viewer.show()

    if show_buildings and area is not None:
        viewer.add_buildings(*area)
    elif show_buildings:
        print("Note: --buildings only applies when --area is set (or default area mode)")

    print("Viewer open. Close the window to exit.")
    viewer.plotter.app.exec()


def main() -> None:
    parser = argparse.ArgumentParser(description="HK 3D Terrain Viewer")
    parser.add_argument("--downsample", type=int, default=10, help="Downsample factor for full map (default 10 → 50 m/pixel)")
    parser.add_argument("--zscale", type=float, default=2.0, help="Vertical exaggeration (default 2.0)")
    parser.add_argument("--dtm", type=Path, default=DTM_PATH, help="Path to DTM GeoTIFF")
    parser.add_argument(
        "--area", nargs=4, type=float, metavar=("W", "S", "E", "N"),
        help="Crop to WGS84 bbox instead of loading full map (e.g. --area 114.185 22.335 114.205 22.355)",
    )
    parser.add_argument("--buildings", action="store_true", help="Overlay building footprints (requires --area or default area mode)")
    args = parser.parse_args()
    area = tuple(args.area) if args.area else None
    run_viewer(args.dtm, args.downsample, args.zscale, area=area, show_buildings=args.buildings)


if __name__ == "__main__":
    main()
