from __future__ import annotations

import argparse
import hashlib
import shutil
from pathlib import Path

from PIL import Image


CELL_SIZE = 16
SHEET_SIZE = CELL_SIZE * 4
REDRAW_SIZE = 12
APPROVED_SHEET_SHA256 = "3f29b6fa7887e656ebc9dc506c3b4523a2a0a23b65988f36b1ad235b7736c1c9"


def source_frame(sheet: Image.Image, column: int, row: int) -> Image.Image:
    left = column * CELL_SIZE
    top = row * CELL_SIZE
    return sheet.crop((left, top, left + CELL_SIZE, top + CELL_SIZE))


def redraw_frame(source: Image.Image) -> Image.Image:
    frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    reduced = source.resize((REDRAW_SIZE, REDRAW_SIZE), Image.Resampling.NEAREST)
    offset = (CELL_SIZE - REDRAW_SIZE) // 2
    frame.alpha_composite(reduced, (offset, offset))
    return frame


def is_iris_color(color: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = color
    return bool(alpha) and red >= green + 35 and red >= blue + 35


def redraw_side_frame(front: Image.Image, back: Image.Image, facing: str) -> Image.Image:
    reduced_front = front.resize((REDRAW_SIZE, REDRAW_SIZE), Image.Resampling.NEAREST)
    reduced_back = back.resize((REDRAW_SIZE, REDRAW_SIZE), Image.Resampling.NEAREST)
    iris_pixels = [
        (x, y)
        for y in range(REDRAW_SIZE)
        for x in range(REDRAW_SIZE)
        if is_iris_color(reduced_front.getpixel((x, y)))
    ]
    if not iris_pixels:
        raise ValueError("Could not find the Eye iris palette in a front-facing frame.")

    iris_left = min(x for x, _ in iris_pixels)
    iris_right = max(x for x, _ in iris_pixels)
    iris_top = min(y for _, y in iris_pixels)
    iris_bottom = max(y for _, y in iris_pixels)
    iris = reduced_front.crop((iris_left, iris_top, iris_right + 1, iris_bottom + 1))
    iris = iris.resize((3, iris.height), Image.Resampling.NEAREST)
    side = reduced_back.copy()
    target_left = 2 if facing == "left" else REDRAW_SIZE - 5
    for y in range(iris.height):
        for x in range(iris.width):
            target = (target_left + x, iris_top + y)
            color = iris.getpixel((x, y))
            if color[3] and side.getpixel(target)[3]:
                side.putpixel(target, color)

    frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    offset = (CELL_SIZE - REDRAW_SIZE) // 2
    frame.alpha_composite(side, (offset, offset))
    return frame


def redraw_sheet(source_path: Path) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    if source.size != (SHEET_SIZE, SHEET_SIZE):
        raise ValueError(f"Expected a 64x64 source sheet, received {source.size}: {source_path}")

    result = Image.new("RGBA", (SHEET_SIZE, SHEET_SIZE), (0, 0, 0, 0))
    for row in range(4):
        front = source_frame(source, 0, row)
        back = source_frame(source, 1, row)
        frames = (
            redraw_frame(front),
            redraw_frame(back),
            redraw_side_frame(front, back, "left"),
            redraw_side_frame(front, back, "right"),
        )
        for column, frame in enumerate(frames):
            result.alpha_composite(frame, (column * CELL_SIZE, row * CELL_SIZE))
    alpha_values = {value for value, count in enumerate(result.getchannel("A").histogram()) if count}
    if not alpha_values.issubset({0, 255}):
        raise ValueError(f"Redraw contains non-binary alpha values: {sorted(alpha_values)}")
    return result


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Draft the smaller, round-sided Eye base sheet.")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()

    source_path = arguments.source.resolve()
    approved_source = sha256_file(source_path) == APPROVED_SHEET_SHA256
    sheet = Image.open(source_path).convert("RGBA") if approved_source else redraw_sheet(source_path)
    output_directory = arguments.output.resolve()
    preview_directory = output_directory / "preview"
    output_directory.mkdir(parents=True, exist_ok=True)
    preview_directory.mkdir(parents=True, exist_ok=True)

    output_sheet = output_directory / "eye-sprite-sheet.png"
    if approved_source:
        shutil.copyfile(source_path, output_sheet)
    else:
        sheet.save(output_sheet)
    sheet.save(preview_directory / "eye-base-sheet-1x.png")
    sheet.resize((SHEET_SIZE * 8, SHEET_SIZE * 8), Image.Resampling.NEAREST).save(
        preview_directory / "eye-base-sheet-8x.png",
    )


if __name__ == "__main__":
    main()
