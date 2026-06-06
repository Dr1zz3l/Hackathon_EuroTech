"""
build_adjacency.py
==================
Offline pre-computation of the 18-node district adjacency graph.

Two districts are neighbours when their polygons share a border (or
near-share — a 1e-7 degree buffer absorbs small coordinate gaps without
creating false positives across the water).

Output: frontend/public/adjacency.json
  { "Sham Shui Po": ["Yau Tsim Mong", "Kowloon City", "Wong Tai Sin", "Kwai Tsing"], ... }

Run:  .venv/bin/python scripts/build_adjacency.py
"""

import json
import pathlib
from shapely.geometry import shape

GEOJSON = pathlib.Path("frontend/public/districts.geojson")
OUTPUT  = pathlib.Path("frontend/public/adjacency.json")
BUFFER  = 1e-7   # degrees — absorbs tiny gaps, stays well within district boundaries


def main() -> None:
    data = json.loads(GEOJSON.read_text())
    features = data["features"]

    # Build (name → shapely geometry) mapping
    polys: dict[str, object] = {}
    for f in features:
        name = f["properties"]["name"]
        polys[name] = shape(f["geometry"]).buffer(BUFFER)

    names = list(polys.keys())
    adjacency: dict[str, list[str]] = {n: [] for n in names}

    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if polys[a].intersects(polys[b]):
                adjacency[a].append(b)
                adjacency[b].append(a)

    OUTPUT.write_text(json.dumps(adjacency, ensure_ascii=False, indent=2))

    # Summary
    print(f"Written to {OUTPUT}")
    print(f"{'District':<25} {'Neighbours'}")
    print("-" * 60)
    for name in sorted(names):
        neighbours = adjacency[name]
        print(f"  {name:<23} {len(neighbours):>2}  {', '.join(sorted(neighbours))}")

    total_edges = sum(len(v) for v in adjacency.values()) // 2
    print(f"\n{len(names)} districts, {total_edges} border edges")


if __name__ == "__main__":
    main()
