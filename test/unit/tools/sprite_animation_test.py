from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageOps

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CLI = REPOSITORY_ROOT / "dev/tools/sprite-animation/cli.py"


class SpriteAnimationToolTest(unittest.TestCase):
    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CLI), *arguments],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_generates_column_direction_x8_sheet_and_validates_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "thrust_enemy",
                "--effect",
                "entered_water",
                "--output",
                str(output),
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)

            stem = "thrust_enemy-entered_water-4dir-x8"
            sheet_path = output / f"{stem}.png"
            metadata_path = output / f"{stem}.animation.json"
            manifest_path = output / f"{stem}.manifest.json"
            with Image.open(sheet_path) as sheet:
                self.assertEqual(sheet.size, (64, 128))

            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["output_layout"]["column_order"], ["down", "up", "left", "right"])
            self.assertEqual(metadata["output_layout"]["row_role"], "animation_frame")
            self.assertFalse(metadata["timing"]["loop"])

            validated = self.run_cli(
                "validate",
                "--sheet",
                str(sheet_path),
                "--metadata",
                str(metadata_path),
                "--manifest",
                str(manifest_path),
            )
            self.assertEqual(validated.returncode, 0, validated.stderr)

            metadata["output_layout"]["column_order"] = ["up", "down", "left", "right"]
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            rejected = self.run_cli(
                "validate",
                "--sheet",
                str(sheet_path),
                "--metadata",
                str(metadata_path),
                "--manifest",
                str(manifest_path),
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("invalid direction column order", rejected.stderr)

    def test_preview_is_optional_and_generates_review_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "ranged_enemy",
                "--effect",
                "entered_water",
                "--output",
                str(output),
                "--preview",
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)

            preview = output / "preview"
            self.assertTrue((preview / "ranged_enemy-entered_water-4dir-x8-preview-1x.gif").is_file())
            self.assertTrue((preview / "ranged_enemy-entered_water-4dir-x8-preview-8x.gif").is_file())
            self.assertTrue(
                (preview / "ranged_enemy-entered_water-4dir-x8-contact-sheet-x8.png").is_file()
            )

    def test_prepare_animation_declares_looping_timing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "bomb_enemy",
                "--effect",
                "self_destruct_prepare",
                "--output",
                str(output),
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            metadata_path = output / "bomb_enemy-self_destruct_prepare-4dir-x8.animation.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertTrue(metadata["timing"]["loop"])

    def test_charge_execute_mirrors_right_frames_into_left(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "charge_enemy",
                "--effect",
                "charge_execute",
                "--output",
                str(output),
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            sheet_path = output / "charge_enemy-charge_execute-4dir-x8.png"
            with Image.open(sheet_path) as opened_sheet:
                sheet = opened_sheet.convert("RGBA")
                for row in range(8):
                    top = row * 16
                    left = sheet.crop((32, top, 48, top + 16))
                    right = sheet.crop((48, top, 64, top + 16))
                    self.assertEqual(left.tobytes(), ImageOps.mirror(right).tobytes())

    def test_missing_effect_does_not_substitute_another_recipe(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            generated = self.run_cli(
                "generate",
                "--target",
                "bomb_enemy",
                "--effect",
                "split",
                "--output",
                temporary_directory,
            )
            self.assertNotEqual(generated.returncode, 0)
            self.assertIn("no approved split recipe", generated.stderr)

    def test_batch_resolves_all_targets_before_writing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "thrust_enemy",
                "--target",
                "bomb_enemy",
                "--effect",
                "split",
                "--output",
                str(output),
            )
            self.assertNotEqual(generated.returncode, 0)
            self.assertEqual(list(output.iterdir()), [])

    def test_generates_all_runtime_water_targets_in_one_batch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory)
            generated = self.run_cli(
                "generate",
                "--target",
                "slash_enemy",
                "--target",
                "thrust_enemy",
                "--target",
                "charge_enemy",
                "--target",
                "ranged_enemy",
                "--target",
                "bomb_enemy",
                "--effect",
                "entered_water",
                "--output",
                str(output),
            )
            self.assertEqual(generated.returncode, 0, generated.stderr)
            self.assertEqual(len(list(output.glob("*-entered_water-4dir-x8.png"))), 5)


if __name__ == "__main__":
    unittest.main()
