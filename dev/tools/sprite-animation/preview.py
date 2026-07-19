from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from compiler import CELL_SIZE


def run_magick(arguments: list[str]) -> None:
    try:
        subprocess.run(["magick", *arguments], check=True)
    except FileNotFoundError as error:
        raise RuntimeError("ImageMagick 7 is required to generate previews.") from error


def create_previews(sheet_path: Path, metadata: dict, output_dir: Path, stem: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    contact_sheet = output_dir / f"{stem}-contact-sheet-x8.png"
    run_magick([str(sheet_path), "-filter", "point", "-resize", "800%", str(contact_sheet)])

    sheet = Image.open(sheet_path).convert("RGBA")
    frame_count = metadata["output_layout"]["rows"]
    durations = metadata["timing"]["frame_durations_ms"]
    with tempfile.TemporaryDirectory(prefix="sprite-animation-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        frames = []
        for row in range(frame_count):
            frame_path = temporary_path / f"frame-{row:02d}.png"
            sheet.crop((0, row * CELL_SIZE, CELL_SIZE * 4, (row + 1) * CELL_SIZE)).save(frame_path)
            frames.extend(["-delay", str(max(1, round(durations[row] / 10))), str(frame_path)])
        preview_1x = output_dir / f"{stem}-preview-1x.gif"
        preview_8x = output_dir / f"{stem}-preview-8x.gif"
        run_magick(["-dispose", "background", *frames, "-loop", "0", str(preview_1x)])
        run_magick([str(preview_1x), "-filter", "point", "-resize", "800%", str(preview_8x)])
