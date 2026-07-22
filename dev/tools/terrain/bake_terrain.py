#!/usr/bin/env python3
"""Deterministic offline bake for the Tick Arena terrain atlas (port_13 children 13.2b / 13.2b.1).

Authored sources (user-owned pixel art, checked in):

  - src/presentation/pixi/assets/terrain/grass-tile-base.png : N opaque 32px grass fill variants;
    variant 0 must be the pure flat tile. Its flat colour is the canonical ground tone.
  - src/presentation/pixi/assets/terrain/grass-texture.png   : 32px transparent motif slots in two
    rows (row 0 = light marks, row 1 = heavier marks); empty slots are allowed and skipped.

Vendored sources: TilesetField.png (shore fringe silhouette), TilesetWater.png (open-water tile).

Baked outputs (packaged runtime assets):

  - land-autotile.png : N variant blocks side by side; each block is a 16-tile dual-grid land atlas
    (4x4 grid of 64px tiles, tile index = 4-corner land mask). All blocks share the same silhouette
    and shore fringe; only the flat grass body carries the variant's texture, so any two variants
    meet seamlessly and the fringe is never overdrawn by texture.
  - water.png         : one open-water base tile, 32px.
  - terrain-atlas.json: manifest (layout, mask bits, overlay selection weights, per-row non-empty
    motif slots, source hashes) — the runtime reads selection data from here.

The overlay itself is NOT baked: the runtime scatters grass-texture motifs over sub-tiles whose base
variant is the flat one (per manifest weights), which structurally prevents pattern stacking.

All ops are nearest-neighbour Pillow with binary alpha; no ImageGen.
Run: `python dev/tools/terrain/bake_terrain.py`.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[3]
TILESETS = REPO / "assets" / "Ninja Adventure - Asset Pack" / "Backgrounds" / "Tilesets"
OUT = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain"

SRC = 16  # vendored source tile size
SUB = 32  # sub-tile size: one authored variant/motif slot; one gameplay cell = 2x2 sub-tiles
CELL = 2 * SUB
FRINGE_RADIUS = 2  # grass pixels within this many px of in-tile water keep their fringe rim

# TilesetField light-green family: rows 3-5, cols 0-2 form the 3x3-minimal grass shape.
FIELD_GREEN_ROW = 3

# Runtime overlay selection per flat fill sub-tile, over 10 buckets.
OVERLAY_NONE_BUCKETS = 6  # 60% stay flat
OVERLAY_ROW_BUCKETS = [3, 1]  # 30% row 0, 10% row 1


def tile(img: Image.Image, cx: int, cy: int) -> Image.Image:
    return img.crop((cx * SRC, cy * SRC, cx * SRC + SRC, cy * SRC + SRC))


def x2(img: Image.Image) -> Image.Image:
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


def mode_rgb(img: Image.Image) -> tuple[int, int, int]:
    px = img.load()
    counts: Counter = Counter()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 200:
                counts[(r, g, b)] += 1
    return counts.most_common(1)[0][0]


def flatten_grass(piece: Image.Image, flat: tuple[int, int, int]) -> Image.Image:
    """Keep only the rim within FRINGE_RADIUS of a water (in-tile transparent) pixel; flatten the rest."""
    p = piece.load()
    out = piece.copy()
    o = out.load()
    for y in range(SRC):
        for x in range(SRC):
            if p[x, y][3] < 128:
                continue
            near_water = False
            for dy in range(-FRINGE_RADIUS, FRINGE_RADIUS + 1):
                for dx in range(-FRINGE_RADIUS, FRINGE_RADIUS + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < SRC and 0 <= ny < SRC and p[nx, ny][3] < 128:
                        near_water = True
                        break
                if near_water:
                    break
            if not near_water:
                o[x, y] = (flat[0], flat[1], flat[2], p[x, y][3])
    return out


DIRECTION_KEYS = ["NW", "N", "NE", "W", "F", "E", "SW", "S", "SE"]
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


def build_variant_atlas(pieces: dict[str, Image.Image]) -> Image.Image:
    atlas = Image.new("RGBA", (4 * CELL, 4 * CELL), (0, 0, 0, 0))
    for mask in range(16):
        tl, tr, bl, br = bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)
        out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        quads = [
            (tl, tr, bl, "E", "S", 0, 0),
            (tr, tl, br, "W", "S", SUB, 0),
            (bl, br, tl, "E", "N", 0, SUB),
            (br, bl, tr, "W", "N", SUB, SUB),
        ]
        for cell, hland, vland, hdir, vdir, ox, oy in quads:
            key = quadrant_key(cell, hland, vland, hdir, vdir)
            if key is not None:
                out.alpha_composite(pieces[key], (ox, oy))
        atlas.alpha_composite(out, ((mask % 4) * CELL, (mask // 4) * CELL))
    return atlas


def find_open_water(water_sheet: Image.Image) -> Image.Image:
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
    return x2(best[1])


def motif_slots(texture: Image.Image, row: int) -> list[int]:
    """Indices of non-empty 32px motif slots in the given row of grass-texture.png."""
    slots = []
    for i in range(texture.width // SUB):
        m = texture.crop((i * SUB, row * SUB, i * SUB + SUB, (row + 1) * SUB))
        px = m.load()
        if any(px[x, y][3] > 128 for y in range(SUB) for x in range(SUB)):
            slots.append(i)
    return slots


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    field_path = TILESETS / "TilesetField.png"
    water_path = TILESETS / "TilesetWater.png"
    tile_base_path = OUT / "grass-tile-base.png"
    texture_path = OUT / "grass-texture.png"
    field = Image.open(field_path).convert("RGBA")
    water = Image.open(water_path).convert("RGBA")
    tile_base = Image.open(tile_base_path).convert("RGBA")
    texture = Image.open(texture_path).convert("RGBA")

    if tile_base.height != SUB or tile_base.width % SUB != 0:
        raise SystemExit(f"bake_terrain: grass-tile-base.png must be Nx{SUB} of {SUB}px variants")
    variants = [tile_base.crop((i * SUB, 0, i * SUB + SUB, SUB)) for i in range(tile_base.width // SUB)]
    flat = mode_rgb(variants[0])

    r0, r1, r2 = FIELD_GREEN_ROW, FIELD_GREEN_ROW + 1, FIELD_GREEN_ROW + 2
    raw_pieces = {
        "NW": tile(field, 0, r0), "N": tile(field, 1, r0), "NE": tile(field, 2, r0),
        "W": tile(field, 0, r1), "F": tile(field, 1, r1), "E": tile(field, 2, r1),
        "SW": tile(field, 0, r2), "S": tile(field, 1, r2), "SE": tile(field, 2, r2),
    }
    fringe = {k: x2(flatten_grass(v, flat)) for k, v in raw_pieces.items()}

    def variant_pieces(variant: Image.Image) -> dict[str, Image.Image]:
        vpx = variant.load()
        out: dict[str, Image.Image] = {}
        for key, piece in fringe.items():
            pc = piece.copy()
            pp = pc.load()
            for y in range(SUB):
                for x in range(SUB):
                    r, g, b, a = pp[x, y]
                    if a < 128:
                        continue
                    if (r, g, b) == flat:  # grass body -> variant texture; fringe rim kept
                        pp[x, y] = vpx[x, y]
            out[key] = pc
        return out

    sheet = Image.new("RGBA", (len(variants) * 4 * CELL, 4 * CELL), (0, 0, 0, 0))
    for i, variant in enumerate(variants):
        sheet.alpha_composite(build_variant_atlas(variant_pieces(variant)), (i * 4 * CELL, 0))
    sheet.save(OUT / "land-autotile.png")

    find_open_water(water).save(OUT / "water.png")

    row_slots = [motif_slots(texture, row) for row in range(texture.height // SUB)]
    if len(row_slots) != len(OVERLAY_ROW_BUCKETS):
        raise SystemExit(
            f"bake_terrain: grass-texture.png has {len(row_slots)} rows; expected {len(OVERLAY_ROW_BUCKETS)}"
        )

    manifest = {
        "generator": "dev/tools/terrain/bake_terrain.py",
        "cell_size": CELL,
        "sub_tile_size": SUB,
        "flat_tone": list(flat),
        "land_autotile": {
            "file": "land-autotile.png",
            "tile_size": CELL,
            "variant_count": len(variants),
            "variant_stride": 4 * CELL,
            "grid": [4, 4],
            "mask_bits": {"TL": 1, "TR": 2, "BL": 4, "BR": 8},
            "note": "variant blocks side by side; within a block, tile index equals the 4-corner land mask",
        },
        "water": {"file": "water.png", "tile_size": SUB},
        "overlay": {
            "file": "grass-texture.png",
            "tile_size": SUB,
            "buckets": 10,
            "none_buckets": OVERLAY_NONE_BUCKETS,
            "row_buckets": OVERLAY_ROW_BUCKETS,
            "row_slots": row_slots,
            "note": "runtime scatters motifs only on fill sub-tiles whose base variant is 0 (flat)",
        },
        "sources": {
            "field": {"file": field_path.name, "sha256": sha256(field_path)},
            "water": {"file": water_path.name, "sha256": sha256(water_path)},
            "grass_tile_base": {"file": "grass-tile-base.png", "sha256": sha256(tile_base_path)},
            "grass_texture": {"file": "grass-texture.png", "sha256": sha256(texture_path)},
        },
        "outputs": {name: sha256(OUT / name) for name in ("land-autotile.png", "water.png")},
    }
    (OUT / "terrain-atlas.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"bake_terrain: {len(variants)} variants, flat={flat}, rows={[len(s) for s in row_slots]} -> {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
