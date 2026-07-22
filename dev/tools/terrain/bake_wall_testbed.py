#!/usr/bin/env python3
"""Bake the wall-testbed island overlay consumed by the /debug/wall scene.

Assembles a 14x8-cell grass island with a walled contour (Cainos wall pieces
via the contour rules validated in render_wall_contour_preview.py) and two
interior water openings — 3x3 cells and 1x1 cell — into one transparent
overlay PNG. The runtime scene tiles water underneath, so hole interiors and
everything outside the island stay transparent. Art is 1:1 runtime pixels:
one 64px gameplay cell holds 2x2 floor tiles (32px) and 4x4 wall units (16px).
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_wall_contour_preview import (  # noqa: E402
    ExteriorPieces,
    InteriorPieces,
    TILESET,
    U,
    assemble_exterior,
    assemble_interior,
    floor_variants,
)

REPO = Path(__file__).resolve().parents[3]
OUT_ASSET = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain" / "wall-testbed-island.png"
OUT_PREVIEW = REPO / "assets" / "wall-contour-previews" / "testbed-island.png"

CELL = 64  # runtime px per gameplay cell
FLOOR_TILE = 32
SEED = 20260722

ISLAND_CELLS = (14, 8)
# Interior water openings in island-local cells: (cx, cy, w, h, face_rows).
HOLES = [
    (3, 2, 3, 3, 3),
    (9, 5, 1, 1, 2),
]


def main() -> None:
    sheet = Image.open(TILESET / "TX Tileset Wall.png").convert("RGBA")
    ext = ExteriorPieces(sheet)
    interior = InteriorPieces(sheet)
    rng = random.Random(SEED)

    island_w, island_h = ISLAND_CELLS[0] * CELL, ISLAND_CELLS[1] * CELL
    canvas = Image.new("RGBA", (island_w, island_h + 3 * U), (0, 0, 0, 0))

    grass = floor_variants(TILESET / "grass.png")
    flowers = floor_variants(TILESET / "flower.png")
    for ty in range(island_h // FLOOR_TILE):
        for tx in range(island_w // FLOOR_TILE):
            pos = (tx * FLOOR_TILE, ty * FLOOR_TILE)
            canvas.alpha_composite(rng.choice(grass), pos)
            if rng.random() < 0.08:
                canvas.alpha_composite(rng.choice(flowers), pos)

    for cx, cy, cw, ch, face_rows in HOLES:
        x, y = cx * CELL, cy * CELL
        w_px, h_px = cw * CELL, ch * CELL
        # The hole cells are water: punch the grass, then hang the inner face
        # into the opening. The structure adds one rim lane on each side and
        # the bottom rim lane below the opening, hugging the surrounding land.
        hole = Image.new("RGBA", (w_px, h_px), (0, 0, 0, 0))
        canvas.paste(hole, (x, y))
        structure = assemble_interior(interior, cw * 4 + 2, ch * 4 + 1, face_rows)
        canvas.alpha_composite(structure, (x - U, y))

    canvas.alpha_composite(assemble_exterior(ext, ISLAND_CELLS[0] * 4, ISLAND_CELLS[1] * 4 + 3), (0, 0))

    OUT_ASSET.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT_ASSET)
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", canvas.size, (58, 106, 138, 255))
    preview.alpha_composite(canvas)
    preview.save(OUT_PREVIEW)
    print(f"baked {OUT_ASSET.relative_to(REPO)} ({canvas.width}x{canvas.height})")


if __name__ == "__main__":
    main()
