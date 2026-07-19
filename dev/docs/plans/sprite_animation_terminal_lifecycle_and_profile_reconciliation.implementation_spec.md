# Sprite Animation Terminal Lifecycle And Profile Reconciliation

Parent Plan: none (standalone spec)

## Goal

Make authored terminal sprite animations obey their declared end state, and ensure a Pixi entity view changes presentation assets when a deterministic scenario reuses its entity ID with a different presentation profile.

## Summary

The current entered-water sheets play correctly, but a recipe declaring `despawn` can settle back to the base idle sprite and leave its Pixi view visible. Separately, switching between water scenarios reuses `enemy-water`; Pixi caches the view by entity ID and does not replace its existing Ranged, Kappa, Skull, or Lantern presentation when the semantic `presentationId` changes.

This fix gives terminal animation playback one explicit presentation owner from first frame through completion, then applies its declared end state exactly once. It also reconciles view identity against `presentationId`, recreating only the presentation view whose authored profile no longer matches the current snapshot. Gameplay state remains authoritative in core; this work changes only transient Pixi realization and scenario correctness.

## Requirements

1. A terminal animation with `end_state: "despawn"` must hold its final authored frame for its declared duration, then remove its Pixi view without changing the core entity's terminal phase.
2. Scenario replacement must not retain a prior entity's texture, palette, timing metadata, action state, or terminal frame when the same entity ID has a different `presentationId` in the new snapshot.
3. Normal movement, damage, stagger, reset, and scenario replacement must not interrupt terminal playback except through the Director's explicit cancellation path.
4. Browser tests must prove the water animation becomes visible, reaches its final frame, removes the terminal view for a despawn recipe, and renders the correct profile after switching water scenarios.

## Relational Context

- `World` owns semantic terminal phase and retains the drowning entity for harness and gameplay inspection; Pixi removal must never mutate that state.
- `GameRuntime` projects the terminal snapshot before `PresentationDirector.play()` and serializes later commands until the Director settles; the Director owns the transient timeline and terminal visual lifetime.
- `PresentationDirector` receives `enemy_entered_water` with `from` and `waterCell`; it derives animation direction from that movement vector and must be the only owner that advances terminal animation frames and destroys the matching view.
- `EnemyPresentation` owns texture slicing and current visual frame but must not create an independent terminal GSAP lifecycle or let normal action cleanup reset an active terminal frame.
- `PixiGameRenderer.projectSnapshot()` currently keys `entityViews` only by entity ID. It must compare the existing presentation profile with the snapshot's `presentationId` before reusing a view; changing harness IDs merely hides the general renderer bug and is not an acceptable fix.
- `removeEntityView()` must refresh browser presentation observability after destruction so an e2e assertion cannot read a stale profile label.
- Reset and scenario replacement call `PresentationDirector.cancel()` before renderer projection; cancellation clears transient terminal presentation without treating it as normal completion.

## Scope

### Included

- Terminal entered-water playback ownership and `despawn` completion.
- Entity-view reconciliation when snapshot presentation identity changes.
- Focused unit, scenario, and Playwright coverage for both failures.

### Excluded

- New terminal effects, new enemy roles, or changes to core drowning rules.
- Palette replacement or changes to the generated pixel assets.
- Persisting corpses or making drowning entities logically despawn.

## Files To Change

| File                                                            | Change Size | Purpose                                                                            |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `src/presentation/pixi/enemy-sprites.ts`                        | Medium      | Separate terminal frame state from normal action state.                            |
| `src/presentation/timelines/PresentationDirector.ts`            | Medium      | Own terminal timing, final-frame hold, cancellation, and view removal.             |
| `src/presentation/pixi/PixiGameRenderer.ts`                     | Medium      | Recreate stale profile views and refresh presentation observability after removal. |
| `src/harness/scenarios/enemy-water-animations.scenario.ts`      | Small       | Preserve same-ID profile-switch coverage.                                          |
| `test/unit/presentation/pixi/enemy-sprites.test.ts`             | Medium      | Assert terminal state isolation and profile frame selection.                       |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Medium      | Assert final-frame timing, one-time removal, and cancellation.                     |
| `test/e2e/testbed.spec.ts`                                      | Medium      | Assert water despawn and scenario profile reconciliation in Chromium.              |

## Execution Outline

1. Define a terminal visual state contract in the enemy presentation and add focused unit coverage before changing Director timing.
2. Move entered-water frame scheduling and terminal completion into the Director's tracked entity timeline, then verify cancellation and removal behavior.
3. Reconcile `entityViews` against snapshot presentation identity during projection and cover water-scenario switching with the same entity ID.
4. Run unit and Chromium checks against all five authored water profiles.

## Implementation Notes

- Frame timing must come from the imported generated animation metadata; do not duplicate durations as presentation constants.
- `despawn` applies only to the Pixi view. The semantic mirror may continue to show `drowning` after visual removal.
- The final frame is frame 7 in the canonical 64x128 layout and must remain visible for frame 7's authored duration before removal.
- Recreating a stale view must destroy the old root, remove position ownership, add the new root to `actorLayer`, and preserve the current snapshot position without replaying a gameplay event.

## Edge Cases

| Case                                            | Expected Handling                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reset or scenario replacement during frame 0-7  | Cancel the terminal timeline, destroy/reset the old presentation through existing cancellation, and never remove a view from the new generation. |
| Terminal entity has no authored presentation    | Retain the existing generic water fallback and its cleanup behavior.                                                                             |
| Same entity ID retains the same presentation ID | Reuse the existing view; do not recreate it or restart a visual state unnecessarily.                                                             |
| Same entity ID changes from Ranged to Bomb      | Destroy Eye presentation and create Lantern presentation before projection completes.                                                            |

## Acceptance Criteria

1. Every authored water profile visibly plays its direction-specific x8 animation and holds its final frame before disappearing.
2. After a despawn water animation settles, the semantic entity remains `drowning` while its Pixi view and canvas presentation entry are absent.
3. Reset and scenario replacement leave no pending timeline, stale texture, or orphan root.
4. Switching between `water-ranged` and every other water scenario renders the newly selected enemy profile rather than retaining Eye artwork.
5. Focused unit tests and Playwright assertions pass for the terminal lifecycle and profile reconciliation behavior.
