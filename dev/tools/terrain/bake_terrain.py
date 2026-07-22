#!/usr/bin/env python3
"""Deterministic offline bake for the Tick Arena terrain atlas (port_13 child 13.2b).

Reads three vendored Ninja Adventure tilesets and emits packaged runtime assets:

  - land-autotile.png : 16-tile dual-grid land atlas (4-corner bitmask), 64px tiles, 4x4 grid.
  - water.png         : one open-water base tile, 32px.
  - grass-texture.png : same-tone interior grass variants, 32px each, laid out in one row.
  - terrain-atlas.json: manifest (layout, mask bit order, params, source hashes) for reproducibility.

Design is validated in port_13_2_terrain_refs/island_grass_target.png. All ops are nearest-neighbour
Pillow with binary alpha; no ImageGen. Run: `python dev/tools/terrain/bake_terrain.py`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
TILESETS = REPO / "assets" / "Ninja Adventure - Asset Pack" / "Backgrounds" / "Tilesets"
OUT = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain"

SRC = 16  # source tile size
SUB = 32  # rendered sub-tile size (source x2); one gameplay cell = 2x2 sub-tiles = 64px
TUFT_SOFTEN = 0.55  # blend of each floor tuft toward the plain fill, to keep detail subtle
# TilesetField light-green family: rows 3-5, cols 0-2 form the 3x3-minimal grass patch.
FIELD_GREEN_ROW = 3
# TilesetFloor row 12: col 0 plain fill, cols 1-4 tuft variants (single consistent tone).
FLOOR_TEXTURE_ROW = 12
FLOOR_TEXTURE_COLS = [0, 1, 2, 3, 4]


def tile(img: Image.Image, cx: int, cy: int) -> Image.Image:
    return img.crop((cx * SRC, cy * SRC, cx * SRC + SRC, cy * SRC + SRC))


def mean_rgb(img: Image.Image) -> tuple[int, int, int]:
    px = img.load()
    op = rs = gs = bs = 0
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 200:
                op += 1
                rs += r
                gs += g
                bs += b
    return (rs // op, gs // op, bs // op)


def recolor_to(img: Image.Image, target: tuple[int, int, int]) -> Image.Image:
    """Shift every pixel by (target - source mean), preserving internal variation and alpha."""
    m = mean_rgb(img)
    dr, dg, db = target[0] - m[0], target[1] - m[1], target[2] - m[2]
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (max(0, min(255, r + dr)), max(0, min(255, g + dg)), max(0, min(255, b + db)), a)
    return out


def x2(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.NEAREST)


def find_open_water(water_sheet: Image.Image) -> Image.Image:
    """The most uniform fully-opaque cyan tile is the open-water fill."""
    best = None
    for cy in range(water_sheet.height // SRC):
        for cx in range(water_sheet.width // SRC):
            t = tile(water_sheet, cx, cy)
            px = t.load()
            opaque = True
            rs = gs = bs = 0
            for y in range(SRC):
                for x in range(SRC):
                    r, g, b, a = px[x, y]
                    if a < 250:
                        opaque = False
                        break
                    rs += r
                    gs += g
                    bs += b
                if not opaque:
                    break
            if not opaque:
                continue
            r, g, b = rs // (SRC * SRC), gs // (SRC * SRC), bs // (SRC * SRC)
            if not (b > r + 20 and g > r + 10 and b > 120):
                continue
            var = sum(
                (px[x, y][0] - r) ** 2 + (px[x, y][1] - g) ** 2 + (px[x, y][2] - b) ** 2
                for y in range(SRC)
                for x in range(SRC)
            )
            if best is None or var < best[0]:
                best = (var, t)
    if best is None:
        raise SystemExit("bake_terrain: no open-water tile found in TilesetWater")
    return best[1]


# Dual-grid quadrant selection: for a quadrant whose cell is `cell` land, with the in-tile
# horizontal neighbour `hland` and vertical neighbour `vland`, and water-facing directions
# `hdir`/`vdir`, pick the source key. Validated in the terrain preview.
_CORNER = {("E", "S"): "SE", ("W", "S"): "SW", ("E", "N"): "NE", ("W", "N"): "NW"}


def quadrant_key(cell: bool, hland: bool, vland: bool, hdir: str, vdir: str) -> str | None:
    if not cell:
        return None
    if hland and vland:
        return "F"
    if (not hland) and vland:
        return hdir
    if hland and not vland:
        return vdir
    return _CORNER[(hdir, vdir)]


def build_dualgrid_tile(mask: int, pieces: dict[str, Image.Image]) -> Image.Image:
    """One 64px dual-grid tile for a 4-corner mask (bit0 TL, bit1 TR, bit2 BL, bit3 BR)."""
    tl, tr, bl, br = bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)
    out = Image.new("RGBA", (2 * SUB, 2 * SUB), (0, 0, 0, 0))
    quads = [
        (tl, tr, bl, "E", "S", 0, 0),  # top-left quadrant, cell TL
        (tr, tl, br, "W", "S", SUB, 0),  # top-right, cell TR
        (bl, br, tl, "E", "N", 0, SUB),  # bottom-left, cell BL
        (br, bl, tr, "W", "N", SUB, SUB),  # bottom-right, cell BR
    ]
    for cell, hland, vland, hdir, vdir, ox, oy in quads:
        key = quadrant_key(cell, hland, vland, hdir, vdir)
        if key is not None:
            out.alpha_composite(x2(pieces[key], SUB), (ox, oy))
    return out


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    field_path = TILESETS / "TilesetField.png"
    floor_path = TILESETS / "TilesetFloor.png"
    water_path = TILESETS / "TilesetWater.png"
    field = Image.open(field_path).convert("RGBA")
    floor = Image.open(floor_path).convert("RGBA")
    water = Image.open(water_path).convert("RGBA")

    # Light-green 3x3-minimal grass pieces for dual-grid edges/corners/fill.
    r0, r1, r2 = FIELD_GREEN_ROW, FIELD_GREEN_ROW + 1, FIELD_GREEN_ROW + 2
    pieces = {
        "NW": tile(field, 0, r0), "N": tile(field, 1, r0), "NE": tile(field, 2, r0),
        "W": tile(field, 0, r1), "F": tile(field, 1, r1), "E": tile(field, 2, r1),
        "SW": tile(field, 0, r2), "S": tile(field, 1, r2), "SE": tile(field, 2, r2),
    }
    target_tone = mean_rgb(pieces["F"])

    # 16-tile dual-grid atlas, 4x4 grid of 64px tiles, index = mask.
    atlas = Image.new("RGBA", (4 * 2 * SUB, 4 * 2 * SUB), (0, 0, 0, 0))
    for mask in range(16):
        t = build_dualgrid_tile(mask, pieces)
        atlas.alpha_composite(t, ((mask % 4) * 2 * SUB, (mask // 4) * 2 * SUB))
    atlas.save(OUT / "land-autotile.png")

    # Water base tile at 32px.
    x2(find_open_water(water), SUB).save(OUT / "water.png")

    # Same-tone interior grass variants: plain fill + softened tufts, recoloured to the edge tone.
    plain = recolor_to(tile(floor, FLOOR_TEXTURE_COLS[0], FLOOR_TEXTURE_ROW), target_tone)
    variants = [plain] + [
        Image.blend(recolor_to(tile(floor, c, FLOOR_TEXTURE_ROW), target_tone), plain, TUFT_SOFTEN)
        for c in FLOOR_TEXTURE_COLS[1:]
    ]
    strip = Image.new("RGBA", (SUB * len(variants), SUB), (0, 0, 0, 0))
    for i, v in enumerate(variants):
        strip.alpha_composite(x2(v, SUB), (i * SUB, 0))
    strip.save(OUT / "grass-texture.png")

    manifest = {
        "generator": "dev/tools/terrain/bake_terrain.py",
        "cell_size": 2 * SUB,
        "sub_tile_size": SUB,
        "land_autotile": {
            "file": "land-autotile.png",
            "tile_size": 2 * SUB,
            "grid": [4, 4],
            "count": 16,
            "mask_bits": {"TL": 1, "TR": 2, "BL": 4, "BR": 8},
            "index": "tile index equals the 4-corner land mask; atlas col = mask % 4, row = mask // 4",
        },
        "water": {"file": "water.png", "tile_size": SUB},
        "grass_texture": {"file": "grass-texture.png", "tile_size": SUB, "count": len(variants), "layout": "row"},
        "target_tone": list(target_tone),
        "tuft_soften": TUFT_SOFTEN,
        "sources": {
            "field": {"file": field_path.name, "sha256": sha256(field_path)},
            "floor": {"file": floor_path.name, "sha256": sha256(floor_path)},
            "water": {"file": water_path.name, "sha256": sha256(water_path)},
        },
        "outputs": {
            name: sha256(OUT / name)
            for name in ("land-autotile.png", "water.png", "grass-texture.png")
        },
    }
    (OUT / "terrain-atlas.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"bake_terrain: wrote atlas ({target_tone=}) to {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
