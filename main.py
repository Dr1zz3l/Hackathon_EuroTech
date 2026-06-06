import argparse

from backend.data_setup import setup
from backend.visualization.cli import DEFAULT_AREA, run_viewer


def main() -> None:
    parser = argparse.ArgumentParser(description="HK Flood Risk — Backend")
    parser.add_argument("--backend-vis", action="store_true", help="Open 3D terrain viewer")
    parser.add_argument("--downsample", type=int, default=10, help="Viewer downsample factor for full map (default 10 → 50 m/pixel)")
    parser.add_argument("--zscale", type=float, default=2.0, help="Viewer vertical exaggeration (default 2.0)")
    parser.add_argument(
        "--area", nargs=4, type=float, metavar=("W", "S", "E", "N"),
        default=list(DEFAULT_AREA),
        help="WGS84 bbox to crop (default: Wong Tai Sin / Lion Rock)",
    )
    parser.add_argument("--full-map", action="store_true", help="View full HK map instead of cropped area")
    parser.add_argument("--buildings", action="store_true", help="Overlay building footprints on the terrain")
    args = parser.parse_args()

    setup()

    if args.backend_vis:
        area = None if args.full_map else tuple(args.area)
        run_viewer(downsample_factor=args.downsample, z_scale=args.zscale, area=area, show_buildings=args.buildings)


if __name__ == "__main__":
    main()
