from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

CELL_SIZE = 16
DIRECTIONS = ("down", "up", "left", "right")
TRANSPARENT = (0, 0, 0, 0)
INK = (20, 27, 27, 255)
WATER_DARK = (45, 91, 120, 255)
WATER_MID = (84, 135, 137, 255)
WATER_LIGHT = (121, 184, 206, 255)
FOAM = (227, 241, 245, 255)
STEAM = (242, 234, 241, 255)
CUT_DARK = (119, 32, 40, 255)
CUT_LIGHT = (239, 145, 79, 255)


def blank() -> Image.Image:
    return Image.new("RGBA", (CELL_SIZE, CELL_SIZE), TRANSPARENT)


def set_pixel(image: Image.Image, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < CELL_SIZE and 0 <= y < CELL_SIZE:
        image.putpixel((x, y), color)


def nearby_opaque(image: Image.Image, x: int, y: int, radius: int = 1) -> bool:
    for pixel_y in range(max(0, y - radius), min(CELL_SIZE, y + radius + 1)):
        for pixel_x in range(max(0, x - radius), min(CELL_SIZE, x + radius + 1)):
            if image.getpixel((pixel_x, pixel_y))[3]:
                return True
    return False


def tint_underwater(color: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    if not color[3] or color == INK:
        return color
    luminance = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
    if luminance > 190:
        return FOAM
    if luminance > 125:
        return WATER_LIGHT
    return WATER_MID


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_rgba(image: Image.Image) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def load_source_frames(path: Path) -> dict[str, list[Image.Image]]:
    sheet = Image.open(path).convert("RGBA")
    if sheet.size != (CELL_SIZE * 4, CELL_SIZE * 4):
        raise ValueError(f"Expected a 64x64 source sheet, received {sheet.size}: {path}")
    frames = {direction: [] for direction in DIRECTIONS}
    for row in range(4):
        for column, direction in enumerate(DIRECTIONS):
            left = column * CELL_SIZE
            top = row * CELL_SIZE
            frames[direction].append(sheet.crop((left, top, left + CELL_SIZE, top + CELL_SIZE)))
    return frames


def compose_sheet(frames: dict[str, list[Image.Image]]) -> Image.Image:
    frame_count = len(frames[DIRECTIONS[0]])
    sheet = Image.new("RGBA", (CELL_SIZE * 4, CELL_SIZE * frame_count), TRANSPARENT)
    for column, direction in enumerate(DIRECTIONS):
        for row, frame in enumerate(frames[direction]):
            sheet.alpha_composite(frame, (column * CELL_SIZE, row * CELL_SIZE))
    return sheet


def validate_config(config: dict) -> None:
    frame_count = config.get("frames_per_direction")
    if frame_count != 8:
        raise ValueError("This pipeline currently requires exactly eight frames per direction.")
    if not isinstance(config.get("loop"), bool):
        raise ValueError("loop must be a boolean.")
    if "mirror_left_from_right" in config and not isinstance(config["mirror_left_from_right"], bool):
        raise ValueError("mirror_left_from_right must be a boolean.")
    if len(config.get("source_pose_sequence", [])) != frame_count:
        raise ValueError("source_pose_sequence must contain one source pose per output frame.")
    if len(config.get("frame_durations_ms", [])) != frame_count:
        raise ValueError("frame_durations_ms must contain one duration per output frame.")
    if any(pose not in range(4) for pose in config["source_pose_sequence"]):
        raise ValueError("source_pose_sequence values must reference source rows 0 through 3.")
    if any(duration <= 0 for duration in config["frame_durations_ms"]):
        raise ValueError("frame durations must be positive.")


def validate_sheet(sheet: Image.Image, config: dict) -> list[str]:
    expected_size = (CELL_SIZE * 4, CELL_SIZE * config["frames_per_direction"])
    if sheet.size != expected_size:
        raise ValueError(f"Expected {expected_size} output sheet, received {sheet.size}.")
    alpha_values = set(sheet.getchannel("A").getdata())
    if not alpha_values.issubset({0, 255}):
        raise ValueError(f"Output contains non-binary alpha values: {sorted(alpha_values)}")
    return [f"size={sheet.size}", f"alpha={sorted(alpha_values)}"]
