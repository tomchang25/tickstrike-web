# Player-Clocked World Advance

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Concentrate world-time ownership behind one player-clocked boundary and make semantic event ordering explicit. Preserve the later batches' ability to add enemy phases without implementing their combat rules in Batch 2.

## Summary

The current action resolver increments the tick independently in Move and Smash branches, while runtime serializes commands and waits for presentation. This draft centralizes tick advancement in the core world boundary, emits deterministic ordered events, and makes logical resolution complete before presentation starts. Existing prototype action behavior is not expanded; only its time-advance ownership is rewired.

The confirmed Web reset rule is deterministic initial state: resetting a scenario recreates tick `0` and the original seed. Reset behavior is owned by the runtime child, but this clock spec defines the world state that reset must recreate.

## Relational Context

- Action resolution validates and applies command-specific state changes, then calls one world-owned player-clock boundary for a consumed action.
- `World` owns the tick counter and ordered phase execution; callers must not increment ticks directly.
- The core result carries semantic events in deterministic order; runtime forwards those events to presentation and never decides whether time advanced.
- Rejected commands preserve tick, world state, reservations, and the last accepted event state according to the existing snapshot contract.
- The boundary exposes a named phase sequence for later detonation, status, energy, and spawn-warning systems, but Batch 2 leaves those phases empty or foundation-only.
- Presentation completion cannot change the tick or canonical entity state.

## Scope

### Included

- One authoritative player-clocked world-advance boundary.
- Explicit accepted/rejected/time-consuming resolution result.
- Ordered semantic event emission including world advancement.
- Refactoring current accepted action branches to use the boundary.
- Unit coverage for tick count, rejection, event order, and pre-presentation logical state.

### Excluded

- Full Move, Wait, Normal Attack, aim, Speed, and cooldown grammar from Batch 3.
- Enemy detonation, status, energy actions, AI, waves, and spawn warning countdowns.
- Presentation cancellation and generation ownership, owned by child 06.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/actions/commands.ts` | Small | Preserve command inputs while exposing the consumed-time distinction required by resolution. |
| `src/core/actions/action-resolver.ts` | Large | Remove branch-local tick mutation and route accepted actions through the world boundary. |
| `src/core/world/world.ts` | Medium | Own tick advancement and ordered foundation phases. |
| `src/core/events/combat-events.ts` | Medium | Add command/time semantic events and stable ordering values. |
| `src/runtime/GameRuntime.ts` | Medium | Consume the core result without making presentation completion the time authority. |
| `test/unit/core/actions/action-resolver.test.ts` | Medium | Assert acceptance, rejection, tick count, and event order. |

## Execution Outline

1. Define the event order and time-consuming result contract before moving tick mutation.
2. Add the world-owned boundary and foundation phase pipeline.
3. Rewire every current accepted action branch and remove direct tick increments.
4. Update runtime emission and focused tests so logical state is observable before presentation playback.

## Implementation Notes

- A rejected command must not call the advance boundary.
- The foundation event order is command acceptance/result events first, world advancement last; later phases insert within the world boundary without changing command ownership.
- Keep unknown-actor behavior consistent with the current world error contract unless the command is already a valid structured rejection.
- Do not create Godot-style signal or node lifecycle abstractions; events are plain deterministic data.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Rejected destination | Tick and canonical state remain unchanged. |
| Accepted action with no later enemy phase | Tick advances once and emits the foundation world-advance event. |
| Presentation timeline delayed | Tick remains already resolved and does not wait to become true. |
| Multiple queued commands | Each accepted command resolves through the same boundary in queue order. |
| Scenario reset | New world starts at tick `0`; old queued commands are handled by runtime generation cancellation. |

## Acceptance Criteria

1. Tick advancement has one core owner and accepted time-consuming commands advance exactly once.
2. Rejected commands advance no time and leave canonical state unchanged.
3. Semantic events have stable deterministic order independent of listener or animation timing.
4. Core logical results are complete before presentation playback begins.
5. The boundary can later host enemy and spawn phases without importing renderer or browser dependencies.
