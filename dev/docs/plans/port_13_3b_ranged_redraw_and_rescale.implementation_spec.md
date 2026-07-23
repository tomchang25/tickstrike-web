# Port 13.3b Ranged Base-Sheet Redraw and Shared-Scale Alignment

Parent Plan: `port_13_3_entity_visual_profiles.md`

## Goal

Make the ranged enemy render at the shared small-enemy scale with readable left/right silhouettes, per locked parity decision L2, by redrawing its base sprite sheet through a deterministic offline draft and removing its oversize scale override.

## Summary

Today the ranged enemy is the only role with a presentation scale override (5 versus the shared default 3.5, ~1.43x too large), and its side-facing frames are too thin to read. This change ships as one unit — rescale plus redraw — because shrinking the current art alone worsens readability, and redrawing at the oversize scale misstates the approved footprint.

The work: author a checked-in deterministic Pillow script that redraws the eye base sheet (same 64x64 four-direction, four-pose layout, same palette identity, binary alpha) with thicker side silhouettes and a body footprint matching the other small enemies at scale 3.5; stage previews for **human approval — a mandatory stop, the agent must not self-approve**; after approval replace the runtime base sheet, regenerate the drowning sheet from it via the already-approved `eye_drown` recipe, and get a **second human review** of the regenerated drown previews (new source means new visuals even under a frozen recipe); finally delete the scale override and update the one unit assertion that pins scale 5.

Landed result: the ranged enemy is visually the same size as Thrust/Slash/Charge/Bomb, readable in all four facings, its drowning animation regenerated and approved, with no gameplay or determinism change.

## Relational Context

- `src/content/enemies/features/enemy-feature.ts` `defineEnemyFeature` defaults `presentation.scale` to `DEFAULT_ENEMY_SPRITE_SCALE = 3.5`; `src/content/enemies/features/ranged.ts` is the only feature passing an explicit `scale: 5`. Deleting that line makes the profile fall through to the shared default — do not renumber the default or touch other features.
- The profile scale flows `ranged.ts` → registry → `createEnemyPresentation` → `SmallEnemyPresentation.body.scale` in `src/presentation/pixi/enemy-sprites.ts`. No presentation code change is needed for the rescale; it is content-only.
- `test/unit/presentation/pixi/enemy-sprites.test.ts` (around line 72) asserts the ranged body scale is `{x: 5, y: 5}`; it must instead assert the shared default so the test stops pinning a removed override.
- The base sheet contract (owned by `dev/standards/sprite_animation_asset_standard.md`): 64x64, columns Down/Up/Left/Right, rows = the four poses that `POSE_ROWS` in `enemy-sprites.ts` maps (idle/move/prepareAttack/commitCue), binary alpha only, nearest-neighbor scaling, no ImageGen/diffusion — every visual decision lives in a checked-in script.
- The checked-in drowning assets `src/content/enemies/assets/ranged_enemy-entered_water-4dir-x8.{png,animation.json,manifest.json}` are generated from the base sheet by recipe `eye_drown` (status `approved`, config `dev/tools/sprite-animation/configs/eye_drown.json`) via `dev/tools/sprite-animation/cli.py` and `catalog.json` target `ranged_enemy`. The manifest records the source-sheet hash, so replacing the base sheet **requires** regenerating and re-copying all three files together or the manifest lies about its source.
- `ranged.ts` imports `frame_durations_ms` from the drown `animation.json`; the `eye_drown` config is untouched, so timing stays identical and no runtime code changes.
- The `eye_split` recipe (status `draft`) consumes the same source but belongs to child 13.4 — do not generate, promote, or ship it here.
- Before touching the pipeline, the executing agent reads `dev/workflows/sprite_animation_authoring.md`, `dev/skills/sprite_animation_authoring.md`, and the asset standard, per the project startup triggers.
- Wrong shapes to avoid: hand-editing the PNG with no checked-in script; scaling old pixels instead of redrawing the thin side frames; changing the palette identity; keeping `scale: 5` and shrinking the art to compensate; regenerating the drown sheet with a substitute recipe.

## Scope

### Included

- Deterministic redraw script plus staged previews and two human approval gates.
- Replacement of the runtime base sheet and regeneration of the three drown asset files.
- Removal of the ranged scale override and the matching test update.

### Excluded

- Drop shadow (13.3a), split terminal animation and any 13.4 VFX, `eye_split` promotion, palette variants, gameplay/balance/determinism changes, other roles' sheets.

## Files to Change

| File                                                                           | Change Size  | Purpose                                                           |
| ------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| `dev/tools/sprite-animation/base_redraw/eye_base_sheet.py` (or sibling path)   | Medium (new) | Deterministic Pillow draft producing the redrawn 64x64 base sheet |
| `src/content/enemies/assets/eye-sprite-sheet.png`                              | Replace      | Approved redrawn base sheet                                       |
| `src/content/enemies/assets/ranged_enemy-entered_water-4dir-x8.png`            | Regenerate   | Drown sheet rebuilt from the new source                           |
| `src/content/enemies/assets/ranged_enemy-entered_water-4dir-x8.animation.json` | Regenerate   | Matching metadata                                                 |
| `src/content/enemies/assets/ranged_enemy-entered_water-4dir-x8.manifest.json`  | Regenerate   | Matching manifest with the new source hash                        |
| `src/content/enemies/features/ranged.ts`                                       | Small        | Delete the `scale: 5` override                                    |
| `test/unit/presentation/pixi/enemy-sprites.test.ts`                            | Small        | Assert the shared default scale instead of 5                      |

## Execution Outline

1. Read the three sprite-pipeline documents named above, then write the redraw script under `dev/tools/sprite-animation/`, generating to a staging directory below `tmp/` with 1x and 8x previews. Redraw goals: left/right silhouettes read at 3.5, body footprint matches the Kappa-class roles, all sixteen frames stay pose- and direction-correct.
2. **Stop for human approval of the redrawn base sheet previews.** Iterate on the script until approved; never continue past this gate unapproved.
3. After approval, replace `eye-sprite-sheet.png` with the approved output.
4. Regenerate the drown assets: `python dev/tools/sprite-animation/cli.py generate --target ranged_enemy --effect entered_water --output tmp/sprite-animation/ranged-entered-water --preview`, validate, and **stop for the second human review of the drown previews**.
5. After the second approval, copy the three generated files over the checked-in drown assets.
6. Delete `scale: 5` from `ranged.ts`; update the enemy-sprites test to expect the shared default.
7. Verify: `python test/unit/tools/sprite_animation_test.py`, targeted Vitest for enemy-sprites, then `npm run verify`. Capture a gameplay screenshot for the closeout record via a one-off Playwright Node script against the dev server (never Claude Browser tools).

## Implementation Notes

- The redraw script is a base-sheet author, not an effect recipe: it does not register in `catalog.json` or the recipe configs. Keep it deterministic (no randomness, no timestamps) so re-running reproduces the approved sheet byte-for-byte; note the intended output hash in the script or a sidecar once approved.
- Drawing over the existing sheet (thickening, re-proportioning) is fine as long as every operation is in the script; a fully from-scratch draw is also acceptable.
- Do not edit `eye_drown.json`; timing and anchor decisions are frozen with its approved status.
- The ranged Playwright spec is in the known-failing e2e set on this branch; do not gate this change on it, and do not attempt to fix it here.

## Edge Cases

| Case                                                 | Expected Handling                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Human rejects the base-sheet draft                   | Iterate the script and previews; nothing under `src/` changes until approval |
| Regenerated drown sheet validation fails             | Fix the script/source, regenerate; never hand-edit generated output          |
| Base sheet replaced but drown assets not regenerated | Forbidden intermediate state; steps 3–5 land in the same change              |

## Acceptance Criteria

1. The ranged enemy renders visually equal in size to the other small enemies and its left/right facings are readable at gameplay zoom.
2. Both the redrawn base sheet and the regenerated drowning sheet received explicit human visual approval before shipping.
3. The drowning animation still plays its full authored sequence with unchanged timing and terminal removal.
4. The same deterministic scenario produces the same accepted commands, damage, occupancy, and event stream as before.
5. Sprite-pipeline Python tests, unit tests, and the canonical non-browser verification pass.
