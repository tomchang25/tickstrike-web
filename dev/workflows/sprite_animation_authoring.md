# Sprite Animation Authoring Workflow

Use this workflow when a request asks to create, change, regenerate, or batch-generate a pixel animation sheet.

## Input Resolution

1. Normalize each requested name to a catalog target ID and normalize the requested event to an effect ID.
2. Resolve the target's existing source sheet from `dev/tools/sprite-animation/catalog.json`.
3. Resolve the target effect to a recipe. Do not infer an unrelated recipe when the catalog has no mapping.
4. Read the sprite animation asset standard and skill before changing a recipe, config, or compiler.

For example, `thrust enemy` resolves to `thrust_enemy`, and `fall into water` resolves to `entered_water`. The catalog resolves compatible targets to a family-specific recipe; an unknown effect must fail rather than select an unrelated recipe.

## Drafting

When a recipe is missing, create a draft config and implementation. Preserve all visual decisions in those files. Do not output an untracked PNG as the sole result of the work.

When a recipe already exists, change the config when only timing, source poses, offsets, or other declared parameters differ. Change the recipe implementation only when the visual behavior itself changes. Do not promote a draft recipe without explicit human approval.

Unless the request explicitly requires different left- and right-facing art, author the right-facing frames and generate the left-facing frames as exact horizontal mirrors. Do not independently transform both sides when symmetry is the intended result.

## Generation

Generate to an explicit staging directory, normally below ignored `tmp/`:

```powershell
python dev/tools/sprite-animation/cli.py generate `
  --target thrust_enemy `
  --effect entered_water `
  --output tmp/sprite-animation/thrust-entered-water
```

Use `--preview` during authoring review. Do not use it for a normal deterministic rebuild unless previews are needed.

## Validation And Review

Run the CLI validation command against the generated sheet, metadata, and manifest. Inspect the 1x GIF for event readability and timing, then inspect the 8x GIF and contact sheet for pixel quality.

Reject the draft when it looks like a generic dissolve, a dragged sprite, an accidental palette change, or a direction-independent flipped copy where the source geometry differs. Keep the output in staging while correcting the recipe.

## Promotion Boundary

The outcome of this workflow is an approved recipe and reproducible staging output. It does not add a runtime asset, change Pixi playback, or alter terminal-event behavior. Those changes require a separate implementation slice with the applicable core, presentation, harness, unit, and browser verification.
