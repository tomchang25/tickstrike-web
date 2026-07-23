from __future__ import annotations

import argparse
import importlib
import json
import platform
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps, __version__ as pillow_version

from compiler import (
    DIRECTIONS,
    compose_sheet,
    load_source_frames,
    read_json,
    sha256_file,
    sha256_rgba,
    validate_config,
    validate_sheet,
)
from preview import create_previews
from recipes import RECIPES

TOOL_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = TOOL_ROOT.parents[2]
CATALOG_PATH = TOOL_ROOT / "catalog.json"
CONFIG_DIRECTORY = TOOL_ROOT / "configs"


def resolve_target(target: str, effect: str) -> tuple[Path, str]:
    catalog = read_json(CATALOG_PATH)
    entry = catalog["targets"].get(target)
    if entry is None:
        raise ValueError(f"Unknown target: {target}")
    recipe_id = entry["effects"].get(effect)
    if recipe_id is None:
        raise ValueError(
            f"{target} has no approved {effect} recipe. Create and review a draft recipe first."
        )
    return REPOSITORY_ROOT / entry["source"], recipe_id


def build_metadata(target: str, effect: str, config: dict, sheet: Image.Image) -> dict:
    return {
        "schema_version": 1,
        "target": target,
        "effect": effect,
        "cell_size": [16, 16],
        "source_layout": {
            "columns": 4,
            "rows": 4,
            "column_role": "direction",
            "column_order": list(DIRECTIONS),
            "row_role": "source_animation_frame",
        },
        "output_layout": {
            "size": list(sheet.size),
            "columns": 4,
            "rows": config["frames_per_direction"],
            "column_role": "direction",
            "column_order": list(DIRECTIONS),
            "row_role": "animation_frame",
        },
        "timing": {"frame_durations_ms": config["frame_durations_ms"], "loop": config["loop"]},
        "anchor": config["anchor"],
        "overflow_policy": config["overflow_policy"],
        "effect_coordinate_space": config["effect_coordinate_space"],
        "left_right_policy": (
            "mirror_right_to_left"
            if config.get("mirror_left_from_right", False)
            else "direction_authored"
        ),
        "end_state": config["end_state"],
        "recipe_status": config["recipe_status"],
        "alpha": "binary 0/255",
    }


def generate_target(
    target: str,
    effect: str,
    source_path: Path,
    recipe_id: str,
    config_path: Path,
    config: dict,
    output_dir: Path,
    preview: bool,
) -> None:
    source_frames = load_source_frames(source_path)
    recipe = RECIPES[recipe_id]
    frames = {
        direction: [
            recipe(source_frames[direction][source_pose], direction, frame, config)
            for frame, source_pose in enumerate(config["source_pose_sequence"])
        ]
        for direction in DIRECTIONS
    }
    if config.get("mirror_left_from_right", False):
        frames["left"] = [ImageOps.mirror(frame) for frame in frames["right"]]
    sheet = compose_sheet(frames)
    checks = validate_sheet(sheet, config)

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{target}-{effect}-4dir-x8"
    sheet_path = output_dir / f"{stem}.png"
    metadata_path = output_dir / f"{stem}.animation.json"
    manifest_path = output_dir / f"{stem}.manifest.json"
    sheet.save(sheet_path)
    metadata = build_metadata(target, effect, config, sheet)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    recipe_module = importlib.import_module(f"recipes.{recipe_id}")
    manifest = {
        "schema_version": 1,
        "tool": "tickstrike-sprite-animation",
        "python_version": platform.python_version(),
        "pillow_version": pillow_version,
        "imagemagick_available": shutil.which("magick") is not None,
        "source": str(source_path.relative_to(REPOSITORY_ROOT)),
        "config": str(config_path.relative_to(REPOSITORY_ROOT)),
        "recipe": str(Path(recipe_module.__file__).resolve().relative_to(REPOSITORY_ROOT)),
        "source_sha256": sha256_file(source_path),
        "config_sha256": sha256_file(config_path),
        "recipe_sha256": sha256_file(Path(recipe_module.__file__).resolve()),
        "output_rgba_sha256": sha256_rgba(sheet),
        "validation": checks,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {sheet_path}")
    if preview:
        create_previews(sheet_path, metadata, output_dir / "preview", stem)


def generate(arguments: argparse.Namespace) -> None:
    plans = []
    for target in arguments.target:
        source_path, recipe_id = resolve_target(target, arguments.effect)
        config_path = CONFIG_DIRECTORY / f"{recipe_id}.json"
        config = read_json(config_path)
        validate_config(config)
        if recipe_id not in RECIPES:
            raise ValueError(f"Recipe implementation is missing: {recipe_id}")
        plans.append((target, source_path, recipe_id, config_path, config))

    output_dir = Path(arguments.output).resolve()
    for target, source_path, recipe_id, config_path, config in plans:
        generate_target(
            target,
            arguments.effect,
            source_path,
            recipe_id,
            config_path,
            config,
            output_dir,
            arguments.preview,
        )


def validate(arguments: argparse.Namespace) -> None:
    sheet_path = Path(arguments.sheet).resolve()
    metadata_path = Path(arguments.metadata).resolve()
    manifest_path = Path(arguments.manifest).resolve()
    metadata = read_json(metadata_path)
    manifest = read_json(manifest_path)
    output_layout = metadata["output_layout"]
    if output_layout["size"] != [64, 128]:
        raise ValueError("Output metadata must declare a 64x128 x8 sheet.")
    if output_layout["columns"] != 4 or output_layout["rows"] != 8:
        raise ValueError("Output metadata must declare four direction columns and eight frame rows.")
    if output_layout["column_role"] != "direction" or output_layout["row_role"] != "animation_frame":
        raise ValueError("Output metadata has transposed direction and animation axes.")
    if output_layout["column_order"] != list(DIRECTIONS):
        raise ValueError("Output metadata has an invalid direction column order.")
    if metadata["alpha"] != "binary 0/255":
        raise ValueError("Output metadata must declare binary alpha.")
    if len(metadata["timing"]["frame_durations_ms"]) != 8:
        raise ValueError("Output metadata must contain eight frame durations.")
    config = {"frames_per_direction": metadata["output_layout"]["rows"]}
    with Image.open(sheet_path) as opened_sheet:
        sheet = opened_sheet.convert("RGBA")
    checks = validate_sheet(sheet, config)
    rgba_hash = sha256_rgba(sheet)
    if manifest["output_rgba_sha256"] != rgba_hash:
        raise ValueError("Output RGBA hash does not match the manifest.")
    for path_key, hash_key in (("source", "source_sha256"), ("config", "config_sha256"), ("recipe", "recipe_sha256")):
        input_path = REPOSITORY_ROOT / manifest[path_key]
        if not input_path.is_file() or sha256_file(input_path) != manifest[hash_key]:
            raise ValueError(f"{path_key} input hash does not match the manifest.")
    print(f"Valid {sheet_path}: {', '.join(checks)}")


def preview(arguments: argparse.Namespace) -> None:
    sheet_path = Path(arguments.sheet).resolve()
    metadata = read_json(Path(arguments.metadata).resolve())
    create_previews(sheet_path, metadata, Path(arguments.output).resolve(), sheet_path.stem)


def parser() -> argparse.ArgumentParser:
    command_parser = argparse.ArgumentParser(description="Generate deterministic pixel animation sheets.")
    commands = command_parser.add_subparsers(dest="command", required=True)
    generate_parser = commands.add_parser("generate")
    generate_parser.add_argument("--target", required=True, action="append")
    generate_parser.add_argument("--effect", required=True)
    generate_parser.add_argument("--output", required=True)
    generate_parser.add_argument("--preview", action="store_true")
    generate_parser.set_defaults(handler=generate)
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("--sheet", required=True)
    validate_parser.add_argument("--metadata", required=True)
    validate_parser.add_argument("--manifest", required=True)
    validate_parser.set_defaults(handler=validate)
    preview_parser = commands.add_parser("preview")
    preview_parser.add_argument("--sheet", required=True)
    preview_parser.add_argument("--metadata", required=True)
    preview_parser.add_argument("--output", required=True)
    preview_parser.set_defaults(handler=preview)
    return command_parser


def main() -> None:
    arguments = parser().parse_args()
    try:
        arguments.handler(arguments)
    except (KeyError, ValueError, OSError) as error:
        print(f"sprite-animation: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
