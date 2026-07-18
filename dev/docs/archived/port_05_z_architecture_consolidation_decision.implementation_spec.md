# Post-Playable Architecture Consolidation

Parent Plan: `port_05_first_playable_tick_arena.md`

Status: Implemented and verified

## Goal

Consolidate the proven deterministic simulation boundary without changing combat behavior or adding speculative architecture. Make the command resolver easier to extend, remove redundant World API aliases, and prove that terminal presentation remains safe when a scenario is reset or replaced.

## Summary

Retain the existing Simulation Core plus Runtime Boundary shape. `World`, the command resolver, and pure action previews remain the framework-independent simulation; `GameRuntime` retains queueing, generation invalidation, scenario replacement, and presentation cancellation; Pixi/GSAP remains an event consumer. Do not introduce a `GameSimulation` wrapper, controller layer, event bus, or ECS.

Split the current resolver by its existing responsibilities: player command resolution, deterministic enemy-phase resolution, and assembly of the one accepted-command result stream. The resulting behavior, World mutation order, event types, event order, snapshots, and presentation timing must remain unchanged.

Remove World methods that only forward to the canonical operation. Add browser regression coverage that starts terminal presentation and immediately resets or replaces the scenario, proving the old generation cannot affect the replacement snapshot or visual state.

## Relational Context

- A scenario fixture constructs a new `World`; `GameRuntime.loadScenario()` is the only production path that installs that World, synchronizes the renderer, and publishes its snapshot. Content and scenarios initialize mutable state but never retain ownership after construction.
- `World` remains the sole owner of mutable deterministic gameplay state, including entities, occupancy, reservations, Telegraphs, Tick, outcome, and `lastEvents`. Its mutation methods enforce simulation invariants; React, Pixi, GSAP, and the runtime must not derive or mutate that state.
- `resolveCommand(world, command)` remains the only public command-to-gameplay boundary. It rejects commands after a terminal outcome, delegates player-verb evaluation, resolves the enemy phase after an accepted player action, evaluates the outcome, records the complete event sequence into World, and returns that same ordered sequence as `ActionResolution.events`.
- The extracted player-action module computes and applies only direct Move, Attack, Dash, and Smash behavior. It returns a rejection or direct gameplay events to the resolver; it must not advance Tick, resolve enemies, record events, evaluate encounter outcome, or call presentation.
- The extracted enemy-phase module owns the existing deterministic enemy status, recovery, decision, reservation, Telegraph, detonation, and event sequence. It mutates World only through World operations and returns events to the resolver; it does not publish snapshots, enqueue commands, or play feedback.
- `finishAccepted()` remains the sole accepted-command assembly point. The resulting order stays `command_resolved`, direct player events, enemy-phase events, optional `encounter_ended`, then `world_advanced`; `World.recordEvents()` receives the exact returned sequence.
- `previewAttack`, `previewDash`, and `previewSmash` remain read-only projections over `World` or `WorldSnapshot`. Pixi may use them for pointer feedback and the command path may use them for validation, but previews must not mutate World, advance Tick, or emit gameplay events.
- `GameRuntime` resolves gameplay synchronously, emits the resulting snapshot, then starts `PresentationDirector.play()` without making logical completion depend on timeline completion. It retains command queue, active-command rejection, generation, reset, destroy, and scenario-replacement ownership.
- `PresentationDirector` consumes only the resolver event stream. `PixiGameRenderer` continues to use `WorldSnapshot.lastEvents` to prevent animated entities from snapping to their final position while the matching feedback plays; this is the snapshot projection of the same event stream, not a second event contract.
- `PresentationDirector.cancel()` and generation checks remain authoritative during reset and replacement. A stale terminal completion must not remove an entity view or notify listeners for the new scenario.
- Do not add a `GameSimulation` facade around `World` and `resolveCommand`, a `GameController`, a `FeedbackController`, renderer substitution interfaces, compatibility aliases, or ECS components. Each would add an ownership surface without a demonstrated requirement.

## Scope

### Included

- Extract the existing player-verb and enemy-phase logic from the command resolver without changing its public result contract or simulation behavior.
- Remove the redundant `World.reserve()`, `World.claimReservation()`, and `World.resetEnemyGuard()` forwarding APIs, and migrate their in-repository callers to the canonical operation.
- Add browser coverage for reset and scenario replacement during a terminal feedback timeline.
- Preserve focused deterministic unit coverage and the browser-visible event, terminal, and idle contracts.

### Excluded

- A `GameSimulation` class, ECS migration, controller hierarchy, event bus, replay/event sourcing, persistence, or renderer abstraction.
- Any change to combat formulas, command eligibility, Tick order, enemy decisions, Guard, Telegraph, Mobility, event types, event order, snapshots, UI layout, or presentation design.
- New scenarios, content, player classes, enemy roles, waves, rewards, or Port 06 behavior.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/actions/action-resolver.ts` | Medium | Retain the public command boundary and accepted-result assembly while delegating existing player and enemy responsibilities. |
| `src/core/actions/player-actions.ts` | Medium | Add the framework-independent direct player command resolver extracted from the current Move, Attack, Dash, and Smash logic. |
| `src/core/actions/enemy-phase.ts` | Medium | Add the framework-independent deterministic enemy-phase resolver extracted from the current resolver. |
| `src/core/world/world.ts` | Small | Remove forwarding-only aliases and retain the canonical World operations. |
| `test/unit/core/world/world.test.ts` | Small | Migrate reservation tests to the canonical World API. |
| `test/unit/core/combat/directional-hit.test.ts` | Small | Migrate reservation setup to the canonical World API. |
| `test/e2e/testbed.spec.ts` | Medium | Prove reset and scenario replacement cannot leak an in-flight terminal presentation into the replacement state. |

## Execution Outline

1. Extract direct player command handling into `player-actions.ts`, returning direct events or rejection data without changing validation, mutation, damage, or event payloads.
2. Extract deterministic enemy-phase resolution into `enemy-phase.ts`, then reduce `action-resolver.ts` to public command dispatch, terminal rejection, accepted-command ordering, World event recording, and the existing `ActionResolution` contract.
3. Remove the three forwarding World aliases and update the two reservation test callers to use `requestReservation()` directly.
4. Extend the browser harness coverage to issue a terminal command, immediately reset it, then independently replace it with another scenario before the old terminal timeline settles; assert each replacement snapshot, generation, visible entities, and eventual idle state are owned only by the replacement scenario.
5. Run the focused unit tests, full non-browser check, and Playwright acceptance suite after the extraction to prove unchanged deterministic behavior and lifecycle cleanup.

## Implementation Notes

- Player-action extraction needs an internal result shape for direct events and rejection data so `finishAccepted()` remains in `action-resolver.ts`; do not import the public `ActionResolution` back into the extracted module or create a circular runtime dependency.
- Preserve the current action dispatch order, including the special two-step Smash behavior and the fact that direct player events are computed before the enemy phase.
- Do not change `ActionResolution.events` or add another event field. Rejected commands continue to return `accepted: false`, `consumedTime: false`, a reason, and `events: []` without overwriting the prior World event record.
- `requestReservation()` is the one retained reservation mutation name. `resetEnemyCombatState()` remains the retained reset operation because it resets Guard and all coupled enemy combat state together.
- The terminal browser regression must call reset or scenario replacement before waiting for `isIdle`; waiting first would not exercise stale timeline cancellation. It must use the existing debug API and existing scenarios rather than a test-only runtime or scenario.
- Do not make runtime construction injectable solely to add a unit test. The existing browser integration point is the appropriate layer for renderer, GSAP, generation, and scenario-replacement behavior.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Rejected or terminal command | Return the existing rejection result, leave World state and recorded events unchanged, and do not enter player or enemy extracted logic. |
| Smash arm and release | Preserve the existing two accepted actions, locked target behavior, Tick advancement, and ordered events across the player-action extraction. |
| Enemy killed or interrupted before its turn | Preserve current entity filtering, reservation and Telegraph cleanup, and event order during enemy-phase extraction. |
| Reset while a terminal timeline is active | Cancel the old generation, restore the deterministic initial scenario snapshot, retain its entity views, and eventually report idle without a stale removal callback. |
| Scenario replacement while a terminal timeline is active | Cancel the old generation and show only the replacement scenario's snapshot and entity views; the old terminal callback must have no visible or listener effect. |

## Acceptance Criteria

1. The existing deterministic command sequences produce the same accepted or rejected results, World snapshots, Tick values, damage, enemy decisions, encounter outcomes, and ordered events after the resolver is split.
2. Every accepted command continues to expose exactly one complete ordered event stream, and the resulting World snapshot exposes an equal ordered `lastEvents` projection.
3. Player previews remain non-mutating, and presentation remains unable to change gameplay state, Tick progression, damage, or encounter outcomes.
4. The World exposes one canonical reservation request operation and one canonical enemy combat-state reset operation, with no forwarding aliases or remaining in-repository callers of the removed names.
5. Resetting or replacing a scenario during terminal feedback leaves the replacement deterministic snapshot and visual entities intact, cancels old feedback, and eventually reports an idle runtime.
6. Focused unit tests, the production build, and Playwright browser acceptance pass without adding a simulation facade, ECS, duplicate event contract, or presentation-owned gameplay state.
