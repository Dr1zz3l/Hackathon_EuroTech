import argparse

from backend.data_setup import setup
from backend.visualization.cli import run_viewer


def main() -> None:
    parser = argparse.ArgumentParser(description="HK Flood Risk — Backend")
    parser.add_argument("--backend-vis", action="store_true", help="Open 3D terrain viewer")
    parser.add_argument("--downsample", type=int, default=10, help="Viewer downsample factor (default 10 → 50 m/pixel)")
    parser.add_argument("--zscale", type=float, default=2.0, help="Viewer vertical exaggeration (default 2.0)")
    args = parser.parse_args()

    setup()

    if args.backend_vis:
        run_viewer(downsample_factor=args.downsample, z_scale=args.zscale)


if __name__ == "__main__":
    main()
