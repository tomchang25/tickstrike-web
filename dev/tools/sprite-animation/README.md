# Sprite Animation Tool

This is an offline staging tool for deterministic four-direction, eight-frame pixel animation sheets. It does not import, package, or play runtime assets.

Install its Python dependency once:

```powershell
python -m pip install --user -r dev/tools/sprite-animation/requirements.txt
```

Generate a staging sheet:

```powershell
python dev/tools/sprite-animation/cli.py generate `
  --target thrust_enemy `
  --target slash_enemy `
  --effect entered_water `
  --output tmp/sprite-animation/thrust-entered-water `
  --preview
```

Validate the canonical output:

```powershell
python dev/tools/sprite-animation/cli.py validate `
  --sheet tmp/sprite-animation/thrust-entered-water/thrust_enemy-entered_water-4dir-x8.png `
  --metadata tmp/sprite-animation/thrust-entered-water/thrust_enemy-entered_water-4dir-x8.animation.json `
  --manifest tmp/sprite-animation/thrust-entered-water/thrust_enemy-entered_water-4dir-x8.manifest.json
```

The generated sheet is 64x128: direction columns are Down, Up, Left, and Right; rows are animation frames. Preview GIFs are optional review material only.

Repeat `--target` to generate a batch for one effect. Every target is resolved before the tool writes staging output, so a missing recipe fails the complete batch.
