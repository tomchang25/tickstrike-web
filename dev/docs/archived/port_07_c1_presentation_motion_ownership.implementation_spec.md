# Presentation Motion Ownership and Sequential Displacement

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Make board-space movement presentation accurately reflect deterministic World outcomes when one command moves the same entity more than once. Charge side pushes, target knockback, landing, and existing movement effects must animate from their visual origin to their final logical position without transform conflicts or stale visuals.

## Summary

World already resolves movement atomically and immediately, which is required for deterministic occupancy and subsequent commands. The current presentation path then receives the final snapshot before it plays semantic events. It suppresses that final-position projection for only a partial list of movement events, while the director creates independent concurrent GSAP timelines for every event. A Charge result can therefore snap a displaced entity to its final cell or let two timelines write the same board-space `x` and `y` values.

This child establishes presentation-only position ownership. Before `GameRuntime` projects a resolved snapshot, `PresentationDirector` identifies every entity whose board position will animate and reserves its root position in `PixiGameRenderer`. The renderer continues to synchronize state, labels, telegraphs, facing, and health, but does not overwrite a reserved root's board position. The director builds one ordered board-motion track per entity, so two motions for one Player play consecutively while unrelated entities still move together. When each track settles or is cancelled, the renderer releases ownership and reconciles that root with the latest authoritative snapshot.

The result preserves immediate core state while showing Player `N -> N+1 -> N+2` when a normal move and Charge knockback occur in the same command. The same infrastructure covers existing moves, Dash, Smash knockback, water entry, Charge side displacement, and Charge landing rather than accumulating event-specific snapshot exceptions.

## Relational Context

- `World`, action resolution, and `CombatEvent` remain the sole authority for command outcomes, occupancy, logical cells, terminal phases, and semantic event order. This child reads their final snapshot and events only; presentation must never defer or mutate core placement.
- `GameRuntime` currently resolves a command, calls `emit()` (which updates `PixiGameRenderer`), and only then calls `PresentationDirector.play()`. The contract changes so the director reserves position ownership for the resolved event batch before `emit()`; it then plays exactly that batch after the final snapshot is projected.
- `PresentationDirector` owns semantic-event-to-motion conversion, GSAP lifetime, generation cancellation, and command-local choreography. It creates at most one board-space timeline per entity and appends that entity's motion steps in supplied event order; tracks for different entities may run concurrently.
- `PixiGameRenderer` owns entity-root board position, snapshot projection, and reconciliation. Its snapshot projection must skip only the board position of entities currently reserved by the director; it must still update all other view state immediately. It must not infer ownership by scanning `snapshot.lastEvents`.
- The changed renderer/director contract is `snapshot last-event whitelist -> per-entity ownership reserved before projection and released after the matching motion track`. The renderer must expose explicit reserve, release, and clear operations rather than allowing the director to mutate renderer-private view state.
- `actor_moved`, `player_dashed`, `enemy_moved`, `enemy_knocked`, `enemy_entered_water`, `entity_displaced`, and `charge_landed` are board-motion sources. Each contributes its event-provided `from` and `to` cells to the affected entity's track; non-position events retain their existing feedback behavior.
- Entity roots own board-space `x` and `y`. Player sprites and enemy presentation roots remain children that own local pose, lean, squash, rotation, and tint. Position choreography must not add a second writer for a child-local transform or use generic visual feedback to alter the board root's position.
- `GameRuntime` command serialization still waits for `PresentationDirector.play()` before processing the next queued command. Releasing a track must reconcile against the renderer's latest stored snapshot, so a completed animation cannot leave a view at an intermediate cell before the next command begins.
- `setGeneration()`, `cancel()`, scenario replacement, reset, terminal view removal, and renderer destruction must clear all position ownership and tracked timelines. No cancelled motion may block a later snapshot from placing its replacement entity.
- The semantic mirror remains a projection of immediate core state. Browser assertions may compare it with visual bounds, but it must not become a second presentation state owner.

## Scope

### Included

- Explicit presentation-only board-position ownership between runtime, director, and renderer.
- Per-entity sequential motion tracks for every current board-motion event.
- Charge side push, target knockback, and landing synchronization with existing Player and enemy movement presentation.
- Cancellation/reconciliation cleanup, focused unit coverage, and deterministic browser coverage of same-direction Player movement followed by Charge knockback.

### Excluded

- Changes to Charge targeting, damage, occupancy, collision, World transactions, or event payloads.
- New gameplay forced-displacement rules, chained pushes, collision damage, assets, audio, or visual redesign.
- Replacing non-position damage, guard, attack, or terminal feedback except where its timeline lifecycle must cooperate with position ownership.

## Files to Change

| File                                                             | Change Size  | Purpose                                                                                                                                    |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/runtime/GameRuntime.ts`                                     | Medium       | Reserve the resolved batch's motion owners before snapshot projection and preserve generation-safe lifecycle ordering.                     |
| `src/presentation/timelines/PresentationDirector.ts`             | Large        | Normalize motion events, build ordered per-entity GSAP tracks, and release ownership after settlement or cancellation.                     |
| `src/presentation/pixi/PixiGameRenderer.ts`                      | Large        | Track renderer-owned board-position reservations, skip reserved position projection, and reconcile released roots to the current snapshot. |
| `src/harness/scenarios/charge-enemy.scenario.ts`                 | Medium       | Add a deterministic same-direction movement setup with a normal Charge target knockback and side displacement.                             |
| `test/unit/runtime/GameRuntime.test.ts`                          | Medium       | Assert motion ownership is reserved before renderer snapshot projection and cleared through command lifecycle invalidation.                |
| `test/unit/presentation/timelines/PresentationDirector.test.ts`  | Large        | Assert motion source normalization, same-entity sequencing, cross-entity concurrency, release, and cancellation cleanup.                   |
| `test/unit/presentation/pixi/PixiGameRenderer.test.ts`           | Medium (new) | Assert reserved roots retain their visual origin through snapshot projection and reconcile to the latest snapshot on release.              |
| `test/e2e/testbed.spec.ts`                                       | Large        | Verify Chromium-visible sequential Player displacement, Charge side/landing motion, final logical/visual agreement, and reset cleanup.     |
| `dev/docs/plans/port_07_complete_enemy_roster_and_navigation.md` | Small        | Register C1 in the ordered Port 07 child overview.                                                                                         |

## Execution Outline

1. Add focused renderer ownership tests and the renderer API that reserves board positions, skips only their positional snapshot projection, reconciles released views, and clears all reservations on cancellation paths.
2. Add the director's pure motion-event normalization and per-entity track construction, then route every current board-motion event through it while preserving existing non-position feedback and idle cleanup.
3. Change runtime command ordering so motion owners are reserved before `emit()` projects the resolved snapshot, and prove the ordering and generation invalidation through runtime tests.
4. Add the deterministic Charge motion scenario, then add browser assertions for intermediate visual motion, final logical/visual agreement, subsequent Player movement origin, and reset idle cleanup.
5. Run the focused unit and Playwright suites, then run the project-required verification for this presentation/runtime change.

## Implementation Notes

- Represent a motion step as an entity id, source cell, destination cell, and existing event-specific duration/easing. Preserve current visual timing unless a single shared duration is needed to make an existing source consistent; this child does not retune gameplay timing.
- Deduplicate ownership by entity id, not event. A Player with `actor_moved` followed by `entity_displaced` is reserved once and receives two consecutive steps. Do not merge those cells into one direct `N -> N+2` tween because the intermediate occupancy and motion are observable.
- Use each step's event-provided source and destination to initialize its tween. Do not derive a source from the final snapshot or a currently animated root, because independent World mutation has already advanced logical placement.
- Reserve only events that actually animate board position. A no-op Charge landing (`from === to`) may omit its root tween and reservation unless another motion event reserves that entity in the same batch.
- On normal track completion, release ownership only after its final tween completes, then project the latest stored snapshot cell. On cancellation, kill the track, clear every reservation, and immediately allow the next snapshot projection to own positions.
- Maintain terminal view-removal ordering: a terminal displacement still animates to its terminal destination before the director removes the view; cancellation must not retain the view or reservation.
- The deterministic C1 scenario starts with Charge committed at a leftward target path, then makes the Player move left on the detonation tick. The resulting batch must include Player normal movement followed by leftward target knockback, a separate side push, and Charge landing with a free forward destination.
- Browser coverage must use `getEntityBounds()` plus `isIdle()` and semantic-mirror logical cells. While presentation is active, the Player's visual bounds must be ahead of the final logical knockback cell; after idle, bounds must align with that cell, and the next upward move must begin from it. Do not use arbitrary sleeps.

## Edge Cases

| Case                                                                         | Expected Handling                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| One entity receives normal movement and forced displacement in one command   | Play event-order steps serially on one root; retain ownership until both settle.                                                                |
| Several entities move during Charge resolution                               | Play one track per entity concurrently without sharing root `x` or `y` writers.                                                                 |
| Snapshot changes HP, activity, telegraph, facing, or labels during ownership | Apply every non-position projection immediately; suppress only board position for the reserved root.                                            |
| Track is cancelled by reset or scenario replacement                          | Kill its GSAP timeline, clear all reservations, clear transient/local presentation state, and let the replacement snapshot position every root. |
| Terminal entity enters water or dies while moving                            | Keep its view through the matching terminal timeline, then remove it; no reservation or orphan view remains.                                    |
| A later command begins after presentation settles                            | The renderer has reconciled the prior final snapshot, so its new motion starts from the same cell shown by the semantic mirror.                 |

## Acceptance Criteria

1. A command that moves an entity normally and then displaces it shows each cell-to-cell motion in semantic-event order, with no instantaneous jump to the final cell or overlapping board-position animations.
2. Charge side displacement, target knockback, and Charge landing all animate from their declared source cells while the World immediately retains their final atomic occupancy and damage results.
3. Unrelated entities may move simultaneously, but no entity has more than one active writer for board-space position.
4. Snapshot updates preserve current HP, status, telegraph, and facing while a board motion is active, and each completed view reconciles exactly to the final logical cell before the next command begins.
5. Reset, scenario replacement, cancellation, terminal cleanup, and presentation idle leave no motion ownership, active timeline, transient visual, or stale entity view behind.
6. Focused unit assertions and a Chromium scenario demonstrate same-direction Player movement plus Charge knockback, intermediate visual motion, final visual/logical agreement, subsequent movement from the correct cell, and reset cleanup.
