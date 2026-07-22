#!/usr/bin/env python3
"""Bake the static arena frame and reusable south-facing land-depth pieces."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


REPO = Path(__file__).resolve().parents[3]
NATURE = REPO / "assets" / "Ninja Adventure - Asset Pack" / "Backgrounds" / "Tilesets" / "TilesetNature.png"
OUT = REPO / "src" / "presentation" / "pixi" / "assets" / "terrain"

CELL = 64
COMPOSITION_WIDTH = 22 * CELL
COMPOSITION_HEIGHT = 14 * CELL
BOARD_ORIGIN = (2 * CELL, CELL)
BOARD_SIZE = (18 * CELL, 12 * CELL)

MANIFEST_FILE = "arena-decoration.json"
# The arena south face and its static reflection moved to the walled-contour
# terrain painter (bake_wall_terrain.py); their old baked outputs are retired.
LEGACY_FILES = (
    "decorative-frame.png",
    "decorative-frame.json",
    "land-depth.png",
    "arena-south-face.png",
    "arena-reflection.png",
)
ASSET_FILES = {
    "wall-top": "wall-top.png",
    "wall-bottom": "wall-bottom.png",
    "wall-left": "wall-left.png",
    "wall-right": "wall-right.png",
    "tree-green": "tree-green.png",
    "tree-shadow": "tree-shadow.png",
    "rock-grey": "rock-grey.png",
    "rock-reflection": "rock-reflection.png",
}

WATER_SHADOW = (44, 104, 108, 105)
WALL_CAP = (216, 231, 196, 255)
WALL_CAP_LIGHT = (238, 242, 214, 255)
WALL_CAP_DARK = (165, 198, 177, 255)
WALL_FACE = (103, 157, 151, 255)
WALL_FACE_LIGHT = (124, 177, 167, 255)
WALL_FACE_DARK = (67, 121, 121, 255)
WALL_DEEP = (44, 96, 100, 255)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def nearest_scale(image: Image.Image, factor: int) -> Image.Image:
    return image.resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST)


def draw_top_wall(frame: Image.Image) -> None:
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, COMPOSITION_WIDTH - 1, 19), fill=WALL_CAP)
    draw.rectangle((0, 0, COMPOSITION_WIDTH - 1, 3), fill=WALL_CAP_LIGHT)
    draw.rectangle((0, 18, COMPOSITION_WIDTH - 1, 21), fill=WALL_CAP_DARK)
    draw.rectangle((0, 22, COMPOSITION_WIDTH - 1, 55), fill=WALL_FACE)

    for x in range(0, COMPOSITION_WIDTH, 64):
        offset = 32 if (x // 64) % 2 else 0
        draw.rectangle((x + 8, 25, min(x + 27, COMPOSITION_WIDTH - 1), 28), fill=WALL_FACE_LIGHT)
        draw.rectangle((x + 42, 42, min(x + 57, COMPOSITION_WIDTH - 1), 45), fill=WALL_FACE_LIGHT)
        draw.line((x + offset, 22, x + offset, 37), fill=WALL_FACE_DARK, width=2)
        draw.line((x + 32 - offset, 38, x + 32 - offset, 53), fill=WALL_FACE_DARK, width=2)
    draw.line((0, 37, COMPOSITION_WIDTH - 1, 37), fill=WALL_FACE_DARK, width=2)
    draw.rectangle((0, 54, COMPOSITION_WIDTH - 1, 57), fill=WALL_DEEP)

    for x in range(0, COMPOSITION_WIDTH, 32):
        draw.line((x, 4, x, 18), fill=WALL_CAP_DARK, width=2)
        draw.point((x + 12, 9), fill=WALL_CAP_LIGHT)
        draw.point((x + 18, 13), fill=WALL_CAP_LIGHT)


def draw_side_walls(frame: Image.Image) -> None:
    draw = ImageDraw.Draw(frame)
    for left in (True, False):
        x0 = 0 if left else COMPOSITION_WIDTH - 48
        x1 = 47 if left else COMPOSITION_WIDTH - 1
        inner = x1 if left else x0
        draw.rectangle((x0, 0, x1, COMPOSITION_HEIGHT - 1), fill=WALL_CAP)
        if left:
            draw.rectangle((0, 0, 3, COMPOSITION_HEIGHT - 1), fill=WALL_CAP_LIGHT)
            draw.rectangle((44, 0, 47, COMPOSITION_HEIGHT - 1), fill=WALL_CAP_DARK)
            draw.line((48, 0, 48, COMPOSITION_HEIGHT - 1), fill=WALL_DEEP, width=3)
        else:
            draw.rectangle((COMPOSITION_WIDTH - 4, 0, COMPOSITION_WIDTH - 1, COMPOSITION_HEIGHT - 1), fill=WALL_CAP_LIGHT)
            draw.rectangle((COMPOSITION_WIDTH - 48, 0, COMPOSITION_WIDTH - 45, COMPOSITION_HEIGHT - 1), fill=WALL_CAP_DARK)
            draw.line((COMPOSITION_WIDTH - 51, 0, COMPOSITION_WIDTH - 51, COMPOSITION_HEIGHT - 1), fill=WALL_DEEP, width=3)
        for y in range(0, COMPOSITION_HEIGHT, 32):
            draw.line((x0 + 4, y, x1 - 4, y), fill=WALL_CAP_DARK, width=2)
            draw.point((inner - 14 if left else inner + 14, y + 12), fill=WALL_CAP_LIGHT)


def draw_bottom_wall(frame: Image.Image) -> None:
    draw = ImageDraw.Draw(frame)
    y0 = COMPOSITION_HEIGHT - 48
    draw.rectangle((0, y0, COMPOSITION_WIDTH - 1, COMPOSITION_HEIGHT - 1), fill=WALL_CAP)
    draw.rectangle((0, y0, COMPOSITION_WIDTH - 1, y0 + 4), fill=WALL_DEEP)
    draw.rectangle((0, y0 + 5, COMPOSITION_WIDTH - 1, y0 + 8), fill=WALL_CAP_DARK)
    draw.rectangle((0, COMPOSITION_HEIGHT - 4, COMPOSITION_WIDTH - 1, COMPOSITION_HEIGHT - 1), fill=WALL_CAP_LIGHT)
    for x in range(0, COMPOSITION_WIDTH, 32):
        draw.line((x, y0 + 9, x, COMPOSITION_HEIGHT - 5), fill=WALL_CAP_DARK, width=2)
        draw.point((x + 11, y0 + 22), fill=WALL_CAP_LIGHT)


def canopy_shadow(canopy: Image.Image) -> Image.Image:
    alpha = canopy.getchannel("A")
    flattened = alpha.resize((alpha.width, max(1, alpha.height // 2)), Image.Resampling.NEAREST)
    shadow = Image.new("RGBA", flattened.size, WATER_SHADOW)
    shadow.putalpha(flattened.point(lambda value: value * 72 // 255))
    return shadow


def clean_canopy(canopy: Image.Image) -> Image.Image:
    cleaned = canopy.copy()
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            red, green, blue, alpha = pixels[x, y]
            pale_source_shadow = (
                alpha > 0
                and red > 140
                and green > 150
                and blue > 120
                and max(red, green, blue) - min(red, green, blue) < 80
            )
            if pale_source_shadow:
                pixels[x, y] = (red, green, blue, 0)
    return cleaned


def build_decoration_assets(nature: Image.Image) -> dict[str, Image.Image]:
    walls = Image.new("RGBA", (COMPOSITION_WIDTH, COMPOSITION_HEIGHT), (0, 0, 0, 0))
    draw_top_wall(walls)
    draw_side_walls(walls)
    draw_bottom_wall(walls)

    tree = clean_canopy(nearest_scale(nature.crop((96, 0, 128, 32)), 3))
    rock = nature.crop((256, 80, 304, 128))
    rock_reflection = Image.new("RGBA", (rock.width, 16), (0, 0, 0, 0))
    reflection_draw = ImageDraw.Draw(rock_reflection)
    reflection_draw.ellipse((4, 0, rock.width - 5, 9), fill=WATER_SHADOW)
    reflection_draw.line((8, 12, rock.width - 12, 12), fill=(84, 151, 153, 100), width=3)

    return {
        "wall-top": walls.crop((0, 0, COMPOSITION_WIDTH, 58)),
        "wall-bottom": walls.crop((0, COMPOSITION_HEIGHT - 48, COMPOSITION_WIDTH, COMPOSITION_HEIGHT)),
        "wall-left": walls.crop((0, 58, 51, COMPOSITION_HEIGHT - 48)),
        "wall-right": walls.crop((COMPOSITION_WIDTH - 51, 58, COMPOSITION_WIDTH, COMPOSITION_HEIGHT - 48)),
        "tree-green": tree,
        "tree-shadow": canopy_shadow(tree),
        "rock-grey": rock,
        "rock-reflection": rock_reflection,
    }


def main() -> None:
    nature = Image.open(NATURE).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)

    assets = build_decoration_assets(nature)
    asset_paths: dict[str, Path] = {}
    for asset_id, image in assets.items():
        path = OUT / ASSET_FILES[asset_id]
        image.save(path)
        asset_paths[asset_id] = path
    for filename in LEGACY_FILES:
        legacy_path = OUT / filename
        if legacy_path.exists():
            legacy_path.unlink()

    manifest = {
        "generator": "dev/tools/terrain/bake_decorative_frame.py",
        "cell_size": CELL,
        "composition": {"width": COMPOSITION_WIDTH, "height": COMPOSITION_HEIGHT},
        "board_origin": {"x": BOARD_ORIGIN[0], "y": BOARD_ORIGIN[1]},
        "board_size": {"width": BOARD_SIZE[0], "height": BOARD_SIZE[1]},
        "assets": {
            asset_id: {
                "file": path.name,
                "width": assets[asset_id].width,
                "height": assets[asset_id].height,
            }
            for asset_id, path in asset_paths.items()
        },
        "sources": {"nature": {"file": NATURE.name, "sha256": sha256(NATURE)}},
        "outputs": {path.name: sha256(path) for path in asset_paths.values()},
    }
    (OUT / MANIFEST_FILE).write_bytes((json.dumps(manifest, indent=2) + "\n").encode("ascii"))


if __name__ == "__main__":
    main()
