#!/usr/bin/env python3
"""Bake the walled-contour terrain atlas consumed by the runtime TerrainPainter.

Packs the two canonical Cainos wall structures (exterior enclosure, interior
opening) verbatim plus the borderless floor tile variants into one packaged
sheet. The TypeScript painter slices 16px wall pieces from the canonical
structures with the same unit layout validated in
render_wall_contour_preview.py, so the piece rules live in one place per
language and the atlas itself stays an untouched copy of the source art.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_wall_contour_preview import A_ORIGIN, B_ORIGIN, TILESET, U, floor_variants  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain"

FLOOR_TILE = 32
MANIFEST_FILE = "wall-terrain.json"
ATLAS_FILE = "wall-terrain.png"

EXTERIOR_SIZE = (6 * U, 8 * U)
INTERIOR_SIZE = (8 * U, 7 * U)
EXTERIOR_AT = (0, 0)
INTERIOR_AT = (96, 0)
GRASS_ROW_Y = 128
FLOWER_ROW_Y = 160
ATLAS_WIDTH = 512


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    wall_sheet_path = TILESET / "TX Tileset Wall.png"
    grass_path = TILESET / "grass.png"
    flower_path = TILESET / "flower.png"
    sheet = Image.open(wall_sheet_path).convert("RGBA")
    grass = floor_variants(grass_path)
    flowers = floor_variants(flower_path)
    if len(grass) * FLOOR_TILE > ATLAS_WIDTH or len(flowers) * FLOOR_TILE > ATLAS_WIDTH:
        raise SystemExit("Floor variant rows exceed the atlas width.")

    atlas = Image.new("RGBA", (ATLAS_WIDTH, FLOWER_ROW_Y + FLOOR_TILE), (0, 0, 0, 0))
    ax, ay = A_ORIGIN
    atlas.alpha_composite(sheet.crop((ax, ay, ax + EXTERIOR_SIZE[0], ay + EXTERIOR_SIZE[1])), EXTERIOR_AT)
    bx, by = B_ORIGIN
    atlas.alpha_composite(sheet.crop((bx, by, bx + INTERIOR_SIZE[0], by + INTERIOR_SIZE[1])), INTERIOR_AT)
    for index, tile in enumerate(grass):
        atlas.alpha_composite(tile, (index * FLOOR_TILE, GRASS_ROW_Y))
    for index, tile in enumerate(flowers):
        atlas.alpha_composite(tile, (index * FLOOR_TILE, FLOWER_ROW_Y))

    OUT.mkdir(parents=True, exist_ok=True)
    atlas_path = OUT / ATLAS_FILE
    atlas.save(atlas_path)

    manifest = {
        "generator": "dev/tools/terrain/bake_wall_terrain.py",
        "unit": U,
        "floor_tile": FLOOR_TILE,
        "exterior_origin": {"x": EXTERIOR_AT[0], "y": EXTERIOR_AT[1]},
        "interior_origin": {"x": INTERIOR_AT[0], "y": INTERIOR_AT[1]},
        "grass_variants": {"y": GRASS_ROW_Y, "count": len(grass)},
        "flower_variants": {"y": FLOWER_ROW_Y, "count": len(flowers)},
        "sources": {
            path.name: {"sha256": sha256(path)} for path in (wall_sheet_path, grass_path, flower_path)
        },
        "outputs": {ATLAS_FILE: sha256(atlas_path)},
    }
    (OUT / MANIFEST_FILE).write_bytes((json.dumps(manifest, indent=2) + "\n").encode("ascii"))
    print(f"baked {atlas_path.relative_to(REPO)} ({atlas.width}x{atlas.height})")


if __name__ == "__main__":
    main()
