# Small Enemy Sprite and State Animation

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Give the existing Thrust and Slash enemies the original Kappa sprite presentation and state-driven visual feedback before later Port 07 roles reuse the enemy presentation path. Preserve the Web runtime's deterministic enemy lifecycle while replacing only the generic rectangle presentation for these two small enemies.

## Summary

Thrust and Slash already share the same one-cell gameplay model, but the Web renderer still displays both as generic rounded rectangles. The Godot reference uses one 4x4 Kappa sheet for both enemies: direction selects the column, idle/move/prepare/commit selects the row, and Slash applies a four-colour purple palette replacement.

This child adds a reusable Pixi small-enemy sprite profile, loads packaged green and purple Kappa sheets, and routes existing semantic enemy events into sprite-local GSAP feedback. Thrust uses the source green sheet; Slash uses a pre-baked purple sheet generated from the reference material's exact source and target colors. World movement, terminal cleanup, attack timing, and all gameplay results remain unchanged.

The renderer keeps its generic enemy body as the fallback for unknown or not-yet-authored profiles. Later Port 07 enemies can add profiles and specialised feedback without creating another renderer, timeline, or core-state path.

## Relational Context

- `World`, `resolveEnemyPhase()`, and `CombatEvent` remain the sole owners of enemy activity, facing, committed attacks, damage, stagger, recovery, terminal state, and event order. The new presentation code reads snapshots and events only; it must not add or mutate gameplay state.
- `GameRuntime` updates the renderer with the resolved snapshot before `PresentationDirector` plays that command's semantic events. Snapshot projection establishes resting facing, pose, and stagger tint; event feedback may temporarily override those local visuals and must settle to the snapshot-compatible resting state.
- `PixiGameRenderer` owns entity-view construction, asset loading, profile selection, and snapshot-to-sprite projection. It must select the initial A2 profiles from the live enemy `archetype` values `"thrust"` and `"slash"`; current `EntityState` does not carry the authored `presentation.id`, so the renderer must not invent a core/content lookup dependency for this child.
- `enemy-sprites.ts` owns the 4x4 Kappa frame mapping, nearest-neighbour texture configuration, profile palette identity, local sprite transform, tint, pose, and facing API. It must return no sprite for an unknown archetype so `PixiGameRenderer` retains the current generic graphics fallback.
- The entity root remains the owner of board-space position, knockback, water, generic guard feedback, and terminal removal. The small-enemy sprite root is its child and owns only local lean, squash, pop, pose, and tint feedback; never tween the same transform properties on both layers for the same effect.
- `PresentationDirector` remains the owner of GSAP timeline lifetime and its generation cancellation contract. It invokes small-enemy feedback through renderer accessors and tracks every resulting timeline through `timelineDone()` so reset, scenario replacement, and `isIdle` cannot leave an orphaned animation.
- `enemy_moved` retains the existing entity-root cell motion and adds the reference move pose/lean on a sprite-backed small enemy. `enemy_attack_committed` uses the prepare pose, `enemy_attack_detonated` uses the commit cue even when the attack misses, `enemy_damaged` uses the reference damage flash, and stagger/interruption events clear or tint the local sprite without changing their core meaning.
- Sprite-backed small enemies use reference-like local feedback instead of the current duplicate generic root pulse for movement preparation, commit, damage, and death. Unknown-profile enemies retain the existing generic timelines. Existing telegraphs, HP/Guard bars, status text, facing marker, debug labels, impacts, and generic guard/protection feedback remain renderer/timeline responsibilities.
- The Godot `StateMachine`, scenes, signal wiring, `Node2D` hierarchy, and tween ownership are reference evidence only. Port its observable frame, palette, and feedback behavior into the existing Pixi/GSAP boundary; do not reproduce Godot lifecycle architecture.

## Scope

### Included

- Package the reference Kappa Green sheet and its Godot-palette-matched purple derivative under enemy-owned runtime assets.
- Add reusable Thrust/Slash small-enemy sprite profiles with cardinal frame selection and fixed green/purple sheets.
- Replace the two matching placeholder enemy bodies with sprites while preserving unknown-profile fallback rendering.
- Project existing enemy facing/activity snapshots and semantic events into small-enemy poses and feedback.
- Add unit and browser coverage for profile resolution, frames, palette distinction, animation settlement, and reset cleanup.

### Excluded

- Core enemy rules, content schema changes, new events, attack geometry, navigation, or timing changes.
- Ranged, Charge, Bomb, Mode, Boss, player, HUD, audio, VFX, or generic enemy-art work.
- New Godot-style state machines, pooling, scene inheritance, or persistent presentation state.
- Replacing the existing generic fallback for future enemy archetypes without an authored sprite profile.

## Files to Change

| File                                                             | Change Size | Purpose                                                                                                                               |
| ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/content/enemies/assets/kappa-green-sprite-sheet.png`        | Small       | Package the verified source Kappa sheet for Vite runtime loading.                                                                     |
| `src/content/enemies/assets/kappa-purple-sprite-sheet.png`       | Small       | Package the offline Godot-palette-matched Slash sheet.                                                                                |
| `src/presentation/pixi/enemy-sprites.ts`                         | Large       | Own small-enemy profiles, frame selection, fixed palette identity, and local feedback surface.                                        |
| `src/presentation/pixi/PixiGameRenderer.ts`                      | Large       | Load the sheet, create/project sprite-backed enemy views, preserve fallback views, and expose sprite feedback to the director.        |
| `src/presentation/timelines/PresentationDirector.ts`             | Medium      | Route existing enemy events to sprite-local timelines while retaining generic fallback and terminal cleanup behavior.                 |
| `test/unit/presentation/pixi/enemy-sprites.test.ts`              | Medium      | Assert profile resolution, frame selection, palette setup, fallback, and visual reset behavior.                                       |
| `test/unit/presentation/timelines/PresentationDirector.test.ts`  | Medium      | Assert semantic enemy events select the expected local presentation feedback and all tracked timelines settle.                        |
| `test/e2e/testbed.spec.ts`                                       | Medium      | Assert the Tick Arena exposes both rendered small-enemy profiles, state transitions, palette distinction, and idle reset in Chromium. |
| `dev/docs/plans/port_07_complete_enemy_roster_and_navigation.md` | Small       | Register A2 in the ordered Port 07 child overview.                                                                                    |

## Execution Outline

1. Verify the asset dimensions and frame order against the Godot Kappa source, generate the purple derivative from the reference palette, and package both sheets beneath the enemy content owner before adding renderer imports.
2. Add the small-enemy sprite module with its two profile mappings, 4x4 directional/state frame selection, fixed palette identity, and reference-derived local feedback constants.
3. Extend `PixiGameRenderer` to load the sheet during mount, construct sprite-backed views for Thrust and Slash, project snapshot facing/activity into their resting visuals, and retain the existing graphics view for every unresolved archetype.
4. Extend `PresentationDirector` so existing movement, attack, damage, stagger, interruption, and death events choose the small-enemy local/root timelines when a matching sprite exists, while generic views retain their current behavior.
5. Add focused sprite and director tests, then extend the deterministic Tick Arena browser scenario to verify both profiles, their observable states and palette distinction, terminal/remount cleanup, and an idle presentation after each scenario reset.
6. Before promoting this draft, re-read the post-A/A1 live renderer, runtime, events, harness, and test seams; remap changed coordinates, remove the draft status, and update the parent link to the sole executable handoff.

## Implementation Notes

- Use the Godot frame layout exactly: columns are down, up, left, right; rows are idle, move, prepare attack, commit cue. Default to down when a sprite is first constructed, then immediately apply the entity's cardinal snapshot facing.
- Preserve nearest-neighbour scaling. Use a shared Web sprite scale sized to the existing 64-pixel cell and current actor footprint rather than copying Godot's raw world-scale value; the initial small-enemy scale is `3.5`.
- Reproduce the Godot local feedback values: move starts at `-2` pixels along facing and settles through `+7`, scale `(1.05, 0.95)`, horizontal lean `0.08`, with `0.08`/`0.10` seconds; prepare scales to `(1.12, 0.84)` over `0.12`; commit moves from prepare to `(1.2, 0.78)` over `0.06`, then neutral over `0.09`.
- Reproduce damage tint timing as white for `0.03`, red `#cc3333` for `0.06`, then base tint for `0.08`. Stagger transitions to `#4d80ff` over `0.20` and clears to base over `0.30`; a damage flash ending during stagger must settle back to the stagger tint.
- The purple runtime sheet must be generated from `small_enemy_sweep_palette.tres`: source colours `(0.337255,0.52549,0.298039)`, `(0.658824,0.631373,0.160784)`, `(0.329412,0.529412,0.537255)`, `(0.47451,0.721569,0.807843)` map respectively to `(0.66,0.38,0.95)`, `(0.42,0.16,0.72)`, `(0.24,0.06,0.48)`, `(0.9,0.78,1)`, using the reference threshold of `0.03` during offline generation. Runtime presentation must not perform palette filtering.
- Keep a small renderer-owned test projection for the active enemy profile and pose on the canvas dataset, parallel to the existing player profile/animation attributes. It must report only presentation state, never become an input to runtime behavior.
- For sprite-backed death, use the reference terminal feedback on the entity root: scale to zero, rotate one full turn, and fade over `0.5` seconds before the existing director-owned view removal. Do not delay the World terminal transition or occupancy cleanup.

## Edge Cases

| Case                                                                 | Expected Handling                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Unknown enemy archetype or unavailable sheet                         | Retain the current rounded-rectangle rendering and generic timelines without throwing or creating a blank sprite.              |
| Attack detonation misses the player                                  | Play the small-enemy commit cue, but create no impact effect, preserving the existing hit-only impact rule.                    |
| Guard break or interrupted telegraph occurs during prepare           | Cancel local action feedback, clear the prepared pose, then apply the current stagger/interruption snapshot state.             |
| Damage flash overlaps stagger                                        | The flash has temporary tint priority and settles to blue while staggered, otherwise the profile base tint.                    |
| Reset, scenario replacement, or terminal removal occurs mid-timeline | Generation cancellation kills the tracked timeline; local transforms/tint cannot survive onto a replacement or orphaned view.  |
| A later Port 07 archetype lacks an authored profile                  | It remains visible through the existing fallback until that child supplies a profile; this child must not map it to Kappa art. |

## Acceptance Criteria

1. Thrust and Slash render from the same directional four-by-four Kappa sheet in the Tick Arena, while every unmatched enemy remains visible through the existing fallback.
2. Thrust retains the source palette and Slash visibly uses the reference purple palette replacement.
3. Enemy facing, movement, telegraph commitment, detonation, damage, stagger, interruption, recovery, and death produce the specified sprite pose or feedback without changing gameplay events, attack timing, telegraphs, occupancy, or terminal cleanup.
4. World-space movement and terminal timelines do not fight sprite-local lean, squash, pop, or tint transforms, and no sprite feedback remains after the presentation reports idle.
5. Unit assertions verify profile/frame/fixed-sheet behavior and event routing; the browser harness verifies both enemy profiles, their observable pose transitions, palette distinction, reset behavior, and settled presentation state.
