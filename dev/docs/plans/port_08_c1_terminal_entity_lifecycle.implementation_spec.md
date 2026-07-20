# Terminal Entity Removal and Retained Pixi Ghosts

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

Status: Draft implementation spec

## Goal

Remove terminal combat entities from the canonical `World` at the accepted-command boundary while preserving their death, crush, water, self-destruct, and defeat visuals as presentation-owned Pixi ghosts. This removes terminal records from semantic snapshots without allowing animation timing to affect deterministic gameplay state.

## Summary

Today, `World` retains entities in `dead` or `drowning` phases after their rules have ended, while `PresentationDirector` eventually removes their Pixi views. The renderer must therefore keep a `despawnedPresentationIds` tombstone to stop later snapshots from recreating a completed terminal view. This child removes that split lifetime: after all rule phases for an accepted command have produced their events, the canonical world removes terminal entities before its snapshot is emitted.

Before projecting the terminal-free snapshot, `PresentationDirector` detaches the pre-existing Pixi view for each terminal event from the renderer. The director owns that detached view as a presentation-only ghost, plays the existing terminal timeline, and destroys it on completion or cancellation. No animation callback mutates `World`, no terminal event gains a sprite payload, and no terminal entity remains in the semantic mirror after the resolved command.

This child depends on Child C first establishing an encounter-completion decision based on living enemies and wave runtime exhaustion, rather than on retained terminal records. It preserves the player-visible terminal animations, keeps reset and scenario replacement orphan-free, and deletes the renderer tombstone mechanism.

## Relational Context

- Child C is a prerequisite. Its victory decision must work when a terminal enemy is absent from `WorldSnapshot.entities`: it reads living enemy state plus wave-runtime completion, including the legacy no-wave path, and never relies on `dead` or `drowning` entities remaining in the world map.
- Core owns terminal gameplay resolution. The existing `setPhase` transition still immediately releases occupancy, reservations, telegraphs, and active combat state; the accepted-command resolver removes the resulting terminal entities only after player, enemy, and Child C wave phases have finished producing their semantic events.
- `GameRuntime` receives the resolved event list before it publishes the resulting snapshot. It directs `PresentationDirector` to capture terminal views before `emit()` calls `renderer.updateSnapshot(snapshot)`; capture after the projection is incorrect because reconciliation would already have destroyed the source view.
- `PresentationDirector` owns every temporary terminal ghost in a private collection. It captures detached views, plays existing timelines against them, and destroys them after completion or cancellation; it never calls `World`, `removeEntity`, or any gameplay mutation.
- `PixiGameRenderer` owns only normal snapshot views. It provides a narrow detach handoff for an existing entity view, but it does not retain, enumerate, look up, or clean up terminal ghosts after handing them to `PresentationDirector`; the director may supply a derived terminal label to the renderer's browser-test dataset sink.
- Existing `enemy_died`, `enemy_crushed`, `enemy_entered_water`, and `player_died` events carry the entity id and terminal cell required to detach an existing view. `enemy_self_destructed` may accompany `enemy_died` for the same id, so capture and final destruction must deduplicate terminal ids rather than create or destroy two ghosts.
- Do not add a death-sprite payload to core events and do not reconstruct a new Pixi sprite from event data. The pre-resolution entity view is the visual source; event payloads remain semantic and framework-independent.
- SemanticMirror and TestbedPanel consume snapshots, not renderer ghosts. After this change a terminal entity disappears from their entity/status lists immediately after the accepted command; visual animation remains on the canvas until its timeline settles.
- Generation invalidation runs `PresentationDirector.cancel()` before `GameRuntime.loadScenario()` synchronizes the replacement world. Cancellation must destroy every director-owned ghost and clear position ownership so reset, scenario replacement, and runtime destruction cannot leave an orphan visual.

## Scope

### Included

- Purge entities represented by terminal combat events from `World` synchronously at the end of an accepted command, before the post-command snapshot is emitted.
- Detach pre-existing Pixi views into presentation-owned ghosts before snapshot reconciliation and destroy them when their terminal timelines settle or are cancelled.
- Remove `despawnedPresentationIds` and its same-presentation reset workaround.
- Update semantic-mirror, unit, and browser contracts so terminal entities disappear from snapshots while their terminal canvas presentation completes.

### Excluded

- Wave scheduling, spawn reservations, spawn telegraphs, and wave-phase orchestration from Children B and C.
- Any change to Child C's wave-aware victory or defeat policy.
- New terminal effects, sprite assets, audio, combat events, or event payload fields.
- Persisting combat-history records after an entity is removed.

## Files to Change

| File                                                            | Change Size | Purpose                                                                                                                      |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/core/actions/action-resolver.ts`                           | Medium      | Finalize terminal entity removal after all accepted-command rule phases and before snapshot publication.                     |
| `src/runtime/GameRuntime.ts`                                    | Small       | Capture terminal presentation views before emitting the terminal-free snapshot.                                              |
| `src/presentation/pixi/PixiGameRenderer.ts`                     | Medium      | Hand an existing entity view to presentation and remove tombstone behavior without retaining terminal state.                 |
| `src/presentation/timelines/PresentationDirector.ts`            | Large       | Own detached ghosts, terminal timelines, completion cleanup, cancellation cleanup, and terminal-view lookup.                 |
| `test/unit/core/actions/action-resolver.test.ts`                | Medium      | Assert resolved commands remove terminal entities without breaking completion behavior supplied by Child C.                  |
| `test/unit/presentation/pixi/PixiGameRenderer.test.ts`          | Medium      | Cover retained ghost survival across a terminal-free projection and deterministic cleanup.                                   |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Medium      | Cover terminal ghost playback, duplicate self-destruct terminal events, and cancellation cleanup.                            |
| `test/unit/runtime/GameRuntime.test.ts`                         | Medium      | Assert retention occurs before post-command snapshot listeners observe entity removal.                                       |
| `test/e2e/testbed.spec.ts`                                      | Large       | Assert terminal entities leave semantic/UI state while death and water visuals complete, reset cleanly, and leave no orphan. |

## Execution Outline

1. Rebase this draft onto landed B and C work. Verify C's completion predicate handles final-wave victory and legacy encounters without inspecting retained terminal entities; promote this draft only after that precondition holds.
2. In the accepted-command path, identify terminal ids from the completed semantic event batch and remove the corresponding world entities after the player, enemy, and wave phases have completed. Preserve event ordering and record the original terminal events before publishing the snapshot.
3. Add the renderer/director detach handoff, then change runtime ordering so the director captures terminal views before the terminal-free projection. Route all terminal animation and water motion lookups through the director-owned ghost while it exists.
4. Delete tombstone state and make terminal cleanup idempotent across normal completion, cancellation, reset, scenario replacement, and renderer destruction.
5. Update unit and browser assertions from terminal `phase` visibility to snapshot absence plus canvas-visible terminal animation. Run focused core, runtime, renderer, presentation, and browser coverage.

## Implementation Notes

- The terminal purge is a deterministic command-finalization operation, not a GSAP callback. Direct `World` tests may still inspect an entity immediately after calling `setPhase` or `applyDamage`; the removal contract applies when the accepted-command resolver completes its full transaction.
- Collect terminal ids from the final event batch, not by deleting every non-alive entity indiscriminately. This preserves an explicit event-to-presentation handoff and avoids silently removing a terminal fixture that has no terminal event in the current command.
- Renderer detachment moves the existing view out of its snapshot-owned collection before reconciliation and returns an opaque terminal-view handle. Normal `sync`, `updateSnapshot`, enemy-presentation dataset refresh, and snapshot entity reconciliation must never enumerate terminal ghosts.
- `PresentationDirector` keeps terminal handles in a private id-keyed collection and resolves terminal timeline lookups from it before querying the renderer for a live view. Once released, the director destroys the root exactly once and removes the handle.
- For water, the terminal handle retains the original enemy presentation so `beginEnteredWater` and authored frame progression continue to use its loaded sprite sheet. The semantic snapshot has no drowning entity during this animation.
- Preserve existing position reservation behavior for terminal motion. Releasing a motion owner after its entity was removed is a no-op reconciliation, not an error.
- Do not restore `despawnedPresentationIds` under another name. The snapshot cannot recreate a removed entity, so terminal suppression is no longer needed.

## Edge Cases

| Case                                                                 | Expected Handling                                                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enemy enters water after a nonfatal hit in the same accepted command | Detach one original view into the director, animate the authored water sequence, then destroy one ghost; the entity is absent from the emitted snapshot.                  |
| Bomb self-destruct emits both self-destruct and death events         | The director captures and releases the entity view once while still presenting the explosion effect.                                                                      |
| Player dies                                                          | Remove the player from the canonical snapshot, detach its view through the defeat timeline, then destroy it without affecting the encounter result UI.                    |
| Reset or scenario replacement during a terminal timeline             | Generation cancellation destroys the director-owned ghost before the replacement snapshot projects; no prior-scene view, position reservation, or dataset entry survives. |
| A terminal entity has no terminal event in the current command       | Do not purge it through this path; direct world manipulation remains observable to focused core tests until an explicit lifecycle event is introduced.                    |

## Acceptance Criteria

1. After an accepted command resolves a death, crush, water entry, self-destruct, or player death, its semantic snapshot and UI entity lists no longer contain the terminal entity.
2. The canvas still presents every existing terminal animation from the original entity view, including the authored water sheet, until that timeline completes.
3. Reset, scenario replacement, renderer destruction, and interrupted terminal animation leave no director-owned ghost, position reservation, transient effect, or stale enemy-presentation entry behind.
4. Encounter completion remains correct for legacy encounters and authored waves without depending on terminal entities remaining in the world.
5. A removed terminal entity cannot be recreated by a later snapshot projection, and no renderer tombstone state remains.
