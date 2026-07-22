#!/usr/bin/env python3
"""Validate 16px wall contour-tracing rules against the Cainos wall sheet.

Slices named pieces from the canonical example structures in
``assets/tileset/TX Tileset Wall.png`` (A: exterior enclosure, B: interior
opening), re-renders both examples from the sliced pieces to prove the layout
rules, then renders an arena-like floor-plus-wall preview for visual
comparison against the hand-built reference.
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[3]
TILESET = REPO / "assets" / "tileset"
OUT = REPO / "assets" / "wall-contour-previews"

U = 16  # wall piece unit
CELL = 32  # gameplay cell
SEED = 20260722

# Canonical structure origins on the sheet, in px.
A_ORIGIN = (32, 32)  # exterior enclosure, 6x8 units
B_ORIGIN = (144, 32)  # interior opening, 8x7 units


def units(sheet: Image.Image, origin: tuple[int, int], c: int, r: int, w: int = 1, h: int = 1) -> Image.Image:
    x, y = origin[0] + c * U, origin[1] + r * U
    return sheet.crop((x, y, x + w * U, y + h * U))


class ExteriorPieces:
    """Pieces for a wall ring enclosing a floor, south face outside."""

    def __init__(self, sheet: Image.Image) -> None:
        a = A_ORIGIN
        self.nw = units(sheet, a, 0, 0)
        self.ne = units(sheet, a, 5, 0)
        self.w = [units(sheet, a, 0, r) for r in range(1, 4)]
        self.e = [units(sheet, a, 5, r) for r in range(1, 4)]
        self.ledge_w = units(sheet, a, 0, 4)
        self.ledge_e = units(sheet, a, 5, 4)
        # All horizontal runs are sliced as contiguous strips: the rim stones
        # and bricks are 32px wide across two 16px lanes, so per-lane random
        # picks would split stones and open 1px joints.
        self.n_strip = units(sheet, a, 1, 0, 4, 1)
        self.ledge_strip = units(sheet, a, 1, 4, 4, 1)
        self.face_strip = units(sheet, a, 1, 5, 4, 2)
        self.face_w = units(sheet, a, 0, 5, 1, 2)
        self.face_e = units(sheet, a, 5, 5, 1, 2)
        self.bottom_w = units(sheet, a, 0, 7)
        self.bottom_e = units(sheet, a, 5, 7)
        self.bottom_strip = units(sheet, a, 1, 7, 4, 1)


class InteriorPieces:
    """Pieces for an opening cut into the floor, north face inside."""

    def __init__(self, sheet: Image.Image) -> None:
        b = B_ORIGIN
        self.w = [units(sheet, b, 0, r) for r in range(0, 6)]
        self.e = [units(sheet, b, 7, r) for r in range(0, 6)]
        self.sw = units(sheet, b, 0, 6)
        self.se = units(sheet, b, 7, 6)
        # Contiguous strips for the same stone/brick bond reason as above.
        # The inner face's leftmost column carries the west wall's baked
        # occlusion shadow, so the face splits into a left cap (placed once at
        # the run start; two columns to stay on the 32px brick period) and a
        # clean mid strip (64px, tiles without breaking the bond).
        self.ledge_strip = units(sheet, b, 1, 0, 6, 1)
        self.face_left = units(sheet, b, 1, 1, 2, 3)
        self.face_mid = units(sheet, b, 3, 1, 4, 3)
        self.bottom_strip = units(sheet, b, 1, 6, 6, 1)


def tile_strip(canvas: Image.Image, strip: Image.Image, x: int, y: int, width: int) -> None:
    """Tile a contiguous strip horizontally, cropping the final repeat."""
    cursor = 0
    while cursor < width:
        chunk = min(strip.width, width - cursor)
        canvas.alpha_composite(strip.crop((0, 0, chunk, strip.height)), (x + cursor, y))
        cursor += chunk


def assemble_exterior(pieces: ExteriorPieces, w: int, h: int) -> Image.Image:
    """Assemble an exterior ring of w x h units (h includes the 4 face rows)."""
    canvas = Image.new("RGBA", (w * U, h * U), (0, 0, 0, 0))
    ledge_r, face_r, bottom_r = h - 4, h - 3, h - 1
    tile_strip(canvas, pieces.n_strip, U, 0, (w - 2) * U)
    canvas.alpha_composite(pieces.nw, (0, 0))
    canvas.alpha_composite(pieces.ne, ((w - 1) * U, 0))
    for r in range(1, ledge_r):
        # Positional wrap keeps the vertical stone bond of the canonical run.
        canvas.alpha_composite(pieces.w[(r - 1) % len(pieces.w)], (0, r * U))
        canvas.alpha_composite(pieces.e[(r - 1) % len(pieces.e)], ((w - 1) * U, r * U))
    tile_strip(canvas, pieces.ledge_strip, U, ledge_r * U, (w - 2) * U)
    canvas.alpha_composite(pieces.ledge_w, (0, ledge_r * U))
    canvas.alpha_composite(pieces.ledge_e, ((w - 1) * U, ledge_r * U))
    tile_strip(canvas, pieces.face_strip, U, face_r * U, (w - 2) * U)
    canvas.alpha_composite(pieces.face_w, (0, face_r * U))
    canvas.alpha_composite(pieces.face_e, ((w - 1) * U, face_r * U))
    tile_strip(canvas, pieces.bottom_strip, U, bottom_r * U, (w - 2) * U)
    canvas.alpha_composite(pieces.bottom_w, (0, bottom_r * U))
    canvas.alpha_composite(pieces.bottom_e, ((w - 1) * U, bottom_r * U))
    return canvas


def assemble_interior(pieces: InteriorPieces, w: int, h: int, face_rows: int = 3) -> Image.Image:
    """Assemble an interior opening of w x h units (h includes the bottom rim).

    face_rows shortens the inner north face for small openings; the strip is
    cropped bottom-aligned so the face keeps its authored bottom edge.
    """
    canvas = Image.new("RGBA", (w * U, h * U), (0, 0, 0, 0))
    bottom_r = h - 1
    for r in range(0, bottom_r):
        canvas.alpha_composite(pieces.w[r % len(pieces.w)], (0, r * U))
        canvas.alpha_composite(pieces.e[r % len(pieces.e)], ((w - 1) * U, r * U))
    canvas.alpha_composite(pieces.sw, (0, bottom_r * U))
    canvas.alpha_composite(pieces.se, ((w - 1) * U, bottom_r * U))
    tile_strip(canvas, pieces.ledge_strip, U, 0, (w - 2) * U)
    crop_face = lambda strip: strip.crop((0, strip.height - face_rows * U, strip.width, strip.height))
    face_left = crop_face(pieces.face_left)
    canvas.alpha_composite(face_left, (U, 1 * U))
    tile_strip(canvas, crop_face(pieces.face_mid), U + face_left.width, 1 * U, (w - 2) * U - face_left.width)
    tile_strip(canvas, pieces.bottom_strip, U, bottom_r * U, (w - 2) * U)
    return canvas


def validate(name: str, canonical: Image.Image, rebuilt: Image.Image) -> Image.Image:
    diff = 0
    for (r1, g1, b1, a1), (r2, g2, b2, a2) in zip(canonical.getdata(), rebuilt.getdata()):
        if a1 == 0 and a2 == 0:
            continue
        if (r1, g1, b1, a1) != (r2, g2, b2, a2):
            diff += 1
    total = canonical.width * canonical.height
    print(f"{name}: {diff}/{total} px differ")
    board = Image.new("RGBA", (canonical.width * 2 + U, canonical.height), (255, 0, 255, 255))
    board.alpha_composite(canonical, (0, 0))
    board.alpha_composite(rebuilt, (canonical.width + U, 0))
    return board


def floor_variants(path: Path) -> list[Image.Image]:
    sheet = Image.open(path).convert("RGBA")
    tiles = []
    for y in range(0, sheet.height, CELL):
        for x in range(0, sheet.width, CELL):
            tile = sheet.crop((x, y, x + CELL, y + CELL))
            if tile.getbbox() is not None:
                tiles.append(tile)
    return tiles


def render_arena(ext: ExteriorPieces, interior: InteriorPieces) -> Image.Image:
    """Arena-like preview: grass floor, exterior ring, two interior openings."""
    rng = random.Random(SEED)
    ring_w, ring_h = 22, 28  # units; floor area is everything above the face rows
    margin = U
    canvas = Image.new("RGBA", (ring_w * U + margin * 2, ring_h * U + margin * 2), (255, 255, 255, 255))

    grass = floor_variants(TILESET / "grass.png")
    flowers = floor_variants(TILESET / "flower.png")
    floor_h_units = ring_h - 3  # grass runs under the ledge row, not the face
    for cy in range(0, (floor_h_units * U) // CELL + 1):
        for cx in range(0, (ring_w * U) // CELL + 1):
            x, y = margin + cx * CELL, margin + cy * CELL
            if y >= margin + floor_h_units * U:
                continue
            tile = rng.choice(grass)
            canvas.alpha_composite(tile, (x, y))
            if rng.random() < 0.08:
                canvas.alpha_composite(rng.choice(flowers), (x, y))
    # Trim overdraw outside the ring.
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((margin + ring_w * U, 0, canvas.width, canvas.height), fill=(255, 255, 255, 255))
    draw.rectangle((0, margin + floor_h_units * U, canvas.width, canvas.height), fill=(255, 255, 255, 255))

    holes = [
        (12, 4, 6, 6),  # cx, cy, w, h in units
        (4, 13, 8, 8),
    ]
    for hx, hy, hw, hh in holes:
        x, y = margin + hx * U, margin + hy * U
        # Void fills the interior lanes and stops at the bottom rim lane top;
        # the rim stones (solid in the top half of their lane) seal the seam.
        draw.rectangle((x + U, y, x + (hw - 1) * U - 1, y + (hh - 1) * U - 1), fill=(255, 255, 255, 255))
        canvas.alpha_composite(assemble_interior(interior, hw, hh), (x, y))

    canvas.alpha_composite(assemble_exterior(ext, ring_w, ring_h), (margin, margin))
    return canvas


def with_cell_grid(image: Image.Image) -> Image.Image:
    copy = image.copy()
    draw = ImageDraw.Draw(copy)
    for x in range(0, copy.width, CELL):
        draw.line((x, 0, x, copy.height), fill=(0, 80, 255, 120), width=1)
    for y in range(0, copy.height, CELL):
        draw.line((0, y, copy.width, y), fill=(0, 80, 255, 120), width=1)
    return copy


def main() -> None:
    sheet = Image.open(TILESET / "TX Tileset Wall.png").convert("RGBA")
    ext = ExteriorPieces(sheet)
    interior = InteriorPieces(sheet)
    OUT.mkdir(parents=True, exist_ok=True)

    canonical_a = sheet.crop((A_ORIGIN[0], A_ORIGIN[1], A_ORIGIN[0] + 6 * U, A_ORIGIN[1] + 8 * U))
    canonical_b = sheet.crop((B_ORIGIN[0], B_ORIGIN[1], B_ORIGIN[0] + 8 * U, B_ORIGIN[1] + 7 * U))
    validate("exterior 6x8", canonical_a, assemble_exterior(ext, 6, 8)).save(OUT / "validate-exterior.png")
    validate("interior 8x7", canonical_b, assemble_interior(interior, 8, 7)).save(OUT / "validate-interior.png")

    arena = render_arena(ext, interior)
    arena.save(OUT / "arena.png")
    with_cell_grid(arena).save(OUT / "arena-grid.png")
    arena.resize((arena.width * 2, arena.height * 2), Image.NEAREST).save(OUT / "arena-2x.png")


if __name__ == "__main__":
    main()
