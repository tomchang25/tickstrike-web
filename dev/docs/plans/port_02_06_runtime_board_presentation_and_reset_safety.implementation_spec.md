# Runtime Board Presentation and Reset Safety

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Expose the deterministic foundation through Pixi and the browser harness while making scenario replacement and reset safe against stale commands, GSAP timelines, callbacks, effects, and entity views.

## Summary

The current runtime replaces its world without invalidating the command promise chain or presentation timelines. The presentation director can remove canonical entities after animation, and the renderer is sized for the legacy ten-by-eight fixture. This draft gives each loaded world a generation, cancels and rejects pending work on reset or scenario replacement, clears the command queue, and makes presentation cleanup generation-aware.

Reset is explicitly Web-scenario reset: it recreates the deterministic initial world at tick `0` and the original scenario seed. A command already queued or in flight when reset/replacement begins is cancelled and rejected; it must never execute against the new world.

## Relational Context

- `GameRuntime` owns current world identity, scenario identity, listener notification, command queue, and reset/replacement cancellation.
- Core returns canonical snapshots and events; runtime passes them to presentation and never reimplements gameplay outcomes.
- `PresentationDirector` owns GSAP timelines and visual completion. It must cancel old timelines and never call world mutation methods.
- `PixiGameRenderer` owns Pixi display objects, board projection, entity views, telegraph/reservation overlays, and effects cleanup.
- `SemanticMirror` and debug API expose stable scenario state for Playwright; they must read runtime/core state rather than Pixi internals.
- A generation captured by a command or timeline may update only the matching world and presentation generation. Stale completion is a no-op after cancellation and cannot remove a same-ID view in the new scenario.
- Reset and load both invalidate prior work, reject pending commands, clear the queue, cancel presentation, recreate/sync the new scenario, and notify subscribers from the new snapshot.

## Scope

### Included

- Generation identity and stale-work guards.
- Command cancellation/rejection and queue clearing on reset/load.
- Deterministic reset to tick `0` and original seed.
- Twelve-by-twelve board Pixi projection and representative entity state.
- Terminal visual cleanup independent from core occupancy.
- Stable semantic selectors and Playwright acceptance for reset idleness.

### Excluded

- Production art, audio, HUD, input, waves, rewards, and later combat visuals.
- Browser persistence, route migration, and service-worker behavior.
- Any gameplay outcome decided by presentation.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/runtime/GameRuntime.ts` | Large | Own generation, cancellation, queue clearing, reset seed behavior, and stale command rejection. |
| `src/presentation/timelines/PresentationDirector.ts` | Large | Track/cancel timelines, clear effects, and guard completion by generation without mutating core. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Large | Project the shipped board, claims, terminal visuals, responsive viewport, and cleanup state. |
| `src/ui/SemanticMirror.tsx` | Medium | Expose board, generation, entity phase, and idle state to the browser harness. |
| `src/harness/types.ts` | Small | Carry deterministic scenario seed and foundation scenario metadata. |
| `src/harness/scenarios/` | Medium | Add a shipped foundation scenario with representative entity and reset-visible state. |
| `src/harness/debug-api.ts` | Small | Expose reset/idle or generation inspection needed by browser assertions. |
| `test/e2e/testbed.spec.ts` | Medium | Assert board, representative entity, reset determinism, cancellation, and no stale visual. |

## Execution Outline

1. Add runtime generation and cancellation state, including rejection of pending commands and replacement of the queue.
2. Add presentation cancellation and generation guards before changing board projection so stale timelines cannot affect new views.
3. Update Pixi and semantic mirrors for shipped terrain, claims, terminal state, and idle inspection.
4. Add the deterministic foundation scenario and Playwright reset/replacement coverage.

## Implementation Notes

- Reset/replacement must reject promises for queued or in-flight commands rather than resolving them as accepted or silently dropping their callers.
- Clearing the queue must not allow an old promise continuation to run against the new world; generation checks remain required for already-started callbacks.
- Cancellation must destroy effects and transient views owned by the old generation, not only change GSAP global time scale.
- Renderer sync must not recreate a terminal visual that has been intentionally retired for the current generation, and must never call back into core to retire it.
- Board projection may choose a responsive pixel scale, but cell identity and terrain remain snapshot-derived.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Reset during presentation | Old timelines are cancelled, effects cleared, pending commands rejected, and new tick is `0`. |
| Reset with same entity IDs | Old completion cannot remove or mutate the new generation's views. |
| Scenario load with queued commands | Queue is cleared and every stale command rejects before new-world commands can run. |
| Terminal entity visual | Core occupancy is already released; visual may finish only within its owning generation. |
| Runtime destroy | Timelines, effects, listeners, and Pixi resources are cleaned without callbacks into a destroyed runtime. |

## Acceptance Criteria

1. The browser scenario visibly presents the shipped twelve-by-twelve board, land/sea regions, player, and representative entity state.
2. Reset recreates the deterministic initial world at tick `0` and the original scenario seed.
3. Queued or in-flight commands are cancelled and rejected, and the queue is cleared on reset or scenario replacement.
4. Stale callbacks and timelines cannot mutate or remove state belonging to a newer world generation.
5. Terminal occupancy is released independently from visual lifetime.
6. Playwright reaches an idle state after reset with no stale callback, duplicate view, reservation marker, telegraph, pending effect, or orphan visual.
