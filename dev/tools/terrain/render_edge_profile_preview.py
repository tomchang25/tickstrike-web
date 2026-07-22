#!/usr/bin/env python3
"""Render side-by-side review images for the candidate land edge profiles."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


REPO = Path(__file__).resolve().parents[3]
TERRAIN = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain"
OUT = REPO / "assets" / "arena-edge-profile-previews"

CELL = 64
WIDTH = 6 * CELL
HEIGHT = 160
EDGE_Y = 96
GRID = (52, 59, 76, 180)


def tiled(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    for y in range(0, size[1], image.height):
        for x in range(0, size[0], image.width):
            result.alpha_composite(image, (x, y))
    return result


def draw_grid(image: Image.Image) -> None:
    draw = ImageDraw.Draw(image)
    for x in range(0, WIDTH + 1, CELL):
        draw.line((x, 0, x, HEIGHT), fill=GRID, width=2)
    for y in range(0, HEIGHT + 1, CELL):
        draw.line((0, y, WIDTH, y), fill=GRID, width=2)


def water_shore(water: Image.Image, grass: Image.Image, shore: Image.Image) -> Image.Image:
    preview = tiled(water, (WIDTH, HEIGHT))
    preview.alpha_composite(tiled(grass, (WIDTH, EDGE_Y - CELL // 2)), (0, 0))
    for x in range(0, WIDTH, CELL):
        preview.alpha_composite(shore, (x, EDGE_Y - CELL // 2))
    draw_grid(preview)
    return preview


def stone_wall(
    water: Image.Image,
    grass: Image.Image,
    face: Image.Image,
    reflection: Image.Image,
) -> Image.Image:
    preview = tiled(water, (WIDTH, HEIGHT))
    preview.alpha_composite(tiled(grass, (WIDTH, EDGE_Y)), (0, 0))
    draw_grid(preview)
    crop_x = (face.width - WIDTH) // 2
    preview.alpha_composite(face.crop((crop_x, 0, crop_x + WIDTH, face.height)), (0, EDGE_Y))
    preview.alpha_composite(reflection.crop((crop_x, 0, crop_x + WIDTH, reflection.height)), (0, EDGE_Y + face.height + 2))
    return preview


def comparison(left: Image.Image, right: Image.Image) -> Image.Image:
    header = 24
    gap = 16
    image = Image.new("RGBA", (left.width + gap + right.width, header + HEIGHT), (12, 14, 19, 255))
    image.alpha_composite(left, (0, header))
    image.alpha_composite(right, (left.width + gap, header))
    draw = ImageDraw.Draw(image)
    draw.text((8, 7), "WATER SHORE", fill=(232, 238, 247, 255))
    draw.text((left.width + gap + 8, 7), "STONE WALL", fill=(232, 238, 247, 255))
    return image


def main() -> None:
    water = Image.open(TERRAIN / "water.png").convert("RGBA")
    base_sheet = Image.open(TERRAIN / "grass-tile-base.png").convert("RGBA")
    grass = base_sheet.crop((0, 0, 32, 32))
    autotile = Image.open(TERRAIN / "land-autotile.png").convert("RGBA")
    shore = autotile.crop((3 * CELL, 0, 4 * CELL, CELL))
    face = Image.open(TERRAIN / "arena-south-face.png").convert("RGBA")
    reflection = Image.open(TERRAIN / "arena-reflection.png").convert("RGBA")

    OUT.mkdir(parents=True, exist_ok=True)
    water_shore_image = water_shore(water, grass, shore)
    stone_wall_image = stone_wall(water, grass, face, reflection)
    water_shore_image.save(OUT / "water-shore.png")
    stone_wall_image.save(OUT / "stone-wall.png")
    comparison(water_shore_image, stone_wall_image).save(OUT / "comparison.png")


if __name__ == "__main__":
    main()
