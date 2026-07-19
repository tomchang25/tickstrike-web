# Deterministic Tick Arena Foundation

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Implemented and verified

## Goal

Implement the deterministic foundation for the single Tick Arena integration point. This merged spec replaces the former six `port_02` child specs with one executable handoff covering arena geometry, canonical world state, occupancy, reservations, telegraphs, seeded replay, player-clocked advancement, Pixi projection, and reset safety.

## Summary

The current runtime has separate prototype assumptions across board construction, world occupancy, action timing, presentation cleanup, and scenario reset. Consolidate those concerns behind one renderer-independent world and one runtime boundary before adding the player and enemy Tick behavior.

The resulting foundation must support the first fixed scenario: one player and three enemy fixtures on a twelve-by-twelve board. It must also provide the stable state and event seams needed by later Move, Normal Attack, Dash, enemy state-machine, Telegraph, wave, and reward work without implementing those later rules here.

## Relational Context

- Core model values own cells, terrain, footprints, phases, reservations, telegraphs, seeds, and snapshots without importing React, PixiJS, GSAP, DOM, or browser APIs.
- The immutable arena owns dimensions, terrain, bounds, walkability, distance, direction, iteration, and footprint queries. The mutable world consumes it and owns entities, player position, occupancy, reservations, telegraphs, tick state, and event order.
- World spawn, movement, terminal transitions, and snapshot construction are atomic. Presentation receives terminal state but never removes or mutates canonical entities.
- Reservation callers submit explicit claims to the world. Telegraph sources are separate semantic state and do not become occupancy or movement authority merely because they are visible.
- Scenarios provide a root seed and deterministic initial setup. Named streams derive from the root seed independently of stream creation order; reset recreates the original seed and initial stream positions.
- The runtime owns world identity, scenario identity, command serialization, reset/replacement cancellation, and listener notification. Core owns outcomes and tick advancement. Presentation owns Pixi objects and GSAP timelines only.
- A generation captured by a command or timeline may affect only the matching world and presentation generation. Stale completion after reset or scenario replacement is a no-op.

## Scope

### Included

- Immutable cell helpers for equality, stable keys, addition, cardinal direction, Manhattan distance, Chebyshev distance, deterministic iteration, and explicit footprints.
- A twelve-by-twelve shipped arena with land cells `(1..10, 1..10)` and sea perimeter cells; `(6,6)` is the deterministic player start.
- Canonical entities, one-player ownership, explicit footprints, active occupancy, terminal phases, atomic spawn/move/transition behavior, copied snapshots, and immediate terminal occupancy release.
- Reservation owner, purpose, active-step metadata, stable registration index, all-or-nothing arbitration, replacement, loss cleanup, and deterministic priority.
- Source-owned Telegraph phases and semantic cleanup; overlapping sources remain independent and Telegraph visibility does not itself reserve a cell.
- Stable root-seed normalization, named stream derivation, bounded integers, unit values, weighted picks, deterministic unique selection, scenario seed injection, and reset replay.
- One player-clocked world-advance boundary with accepted/rejected results, deterministic event ordering, and foundation phases available for later enemy and spawn work.
- Runtime generation identity, stale command rejection, queue clearing, presentation cancellation, twelve-by-twelve Pixi projection, semantic reset/idle state, and Playwright reset coverage.

### Excluded

- Full Move, Wait, Normal Attack, aim, Speed, cooldown, Dash, enemy AI, enemy damage, waves, rewards, class selection, and advanced combat rules.
- Terrain mutation, connected-land algorithms, obstacles, per-wave terrain changes, drowning rules, and forced displacement.
- Attack footprint generation, Guard, Defense, Stagger, Protection, pathfinding, population caps, spawn placement algorithms, and authored content selection.
- Production art, audio, HUD, browser persistence, route migration, service workers, and release packaging.
- Godot scenes, nodes, autoloads, signals as universal plumbing, pooling, `queue_free`, or scene-owned gameplay lifecycle.

## Files to Change

| File                                                 | Purpose                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                            | Define cell, terrain, footprint, phase, reservation, Telegraph, seed, and snapshot values.                        |
| `src/core/world/arena.ts`                            | Provide immutable twelve-by-twelve geometry and terrain queries.                                                  |
| `src/core/world/world.ts`                            | Own entities, player cell, occupancy, reservations, Telegraphs, seed streams, tick state, and atomic transitions. |
| `src/core/actions/commands.ts`                       | Preserve command inputs and the consumed-time distinction used by the advance boundary.                           |
| `src/core/actions/action-resolver.ts`                | Route current accepted/rejected commands through world-owned transitions and advancement.                         |
| `src/core/events/combat-events.ts`                   | Carry stable command, world-advance, reservation, Telegraph, and terminal semantic events.                        |
| `src/core/random/random-stream.ts`                   | Implement environment-stable deterministic stream and selection primitives.                                       |
| `src/core/random/random-streams.ts`                  | Derive independent named domain streams from one root seed.                                                       |
| `src/runtime/GameRuntime.ts`                         | Own generation, cancellation, queue clearing, scenario reset, and presentation handoff.                           |
| `src/presentation/timelines/PresentationDirector.ts` | Cancel old timelines and guard completion without mutating core state.                                            |
| `src/presentation/pixi/PixiGameRenderer.ts`          | Project board, terrain, entities, terminal visuals, claims, Telegraphs, and cleanup.                              |
| `src/harness/types.ts`                               | Carry scenario seed and foundation metadata.                                                                      |
| `src/harness/fixtures/shipped-arena.ts`              | Create the fixed deterministic arena with one player and three fixtures.                                          |
| `src/harness/scenarios/empty-arena.scenario.ts`      | Use the shipped arena and stable seed for the browser scenario.                                                   |
| `src/harness/debug-api.ts`                           | Expose reset, generation, and idle inspection for browser assertions.                                             |
| `src/ui/SemanticMirror.tsx`                          | Expose stable board, generation, entity phase, Telegraph, and idle state.                                         |
| `test/unit/core/world/arena.test.ts`                 | Assert geometry, terrain, bounds, distances, directions, iteration, and footprints.                               |
| `test/unit/core/world/world.test.ts`                 | Assert spawn, movement, terminal release, occupancy, reservations, Telegraphs, copies, and reset state.           |
| `test/unit/core/random/random-stream.test.ts`        | Assert replay, bounds, weighted selection, invalid inputs, and stream isolation.                                  |
| `test/unit/core/actions/action-resolver.test.ts`     | Assert accepted/rejected results, tick count, event order, and pre-presentation logical state.                    |
| `test/e2e/testbed.spec.ts`                           | Assert the board, representative entities, reset determinism, cancellation, idle state, and stale-visual cleanup. |

## Execution Outline

1. Implement the immutable arena and cell operations first. Confirm twelve-by-twelve geometry, one hundred land cells, forty-four sea cells, `(6,6)` start, bounds, terrain, walkability, direction, distance, iteration, and footprint behavior.
2. Make the world own entity records, player position, footprints, occupancy, terminal phases, and copied snapshots. Convert spawn, movement, and phase transitions to atomic operations and remove presentation-side world mutation.
3. Add reservation and Telegraph values, stable registration, all-or-nothing arbitration, source cleanup, and semantic events. Preserve the priority order: active movement step, attack intent, shorter Manhattan distance to the published player cell, then earlier registration order.
4. Add the core-only seeded generator and named streams. Inject one explicit scenario seed and verify reset restores the original sequence without connecting waves or rewards.
5. Centralize accepted-action time advancement in one world-owned boundary. Rejected commands must not advance time. Emit command/result events first and world advancement last, leaving named foundation phases for later enemy and spawn work.
6. Add runtime generation and cancellation before changing presentation projection. Reset or scenario replacement must reject queued/in-flight commands, clear the queue, cancel old timelines, recreate tick `0` and the original seed, and notify subscribers from the new world.
7. Project the shipped board and representative entity state to Pixi and the semantic mirror. Add one Playwright scenario proving reset idleness and no stale callback, duplicate view, reservation marker, Telegraph, effect, or orphan visual.

## Implementation Notes

- Use row-major terrain indexing consistent with snapshot and renderer loops; gameplay coordinates remain independent of pixel scale and canvas bounds.
- Out-of-bounds queries are false/non-walkable and never masquerade as in-bounds sea. Cardinal-only consumers reject diagonal and zero directions.
- Spawn and movement reject duplicate IDs, empty or duplicate footprints, invalid terrain, occupied cells, player conflicts, and partial multi-cell claims before mutation.
- A terminal entity remains queryable as terminal state but immediately leaves legal occupancy and active-entity queries. Its visual may finish only inside its owning generation.
- A reservation request replaces the requesting owner's old claim atomically. A losing multi-cell request acquires nothing; a winning request clears each losing owner's complete claim.
- Active movement claims outrank attack intent; distance and stable registration resolve remaining ties. Telegraph phase alone never reserves a cell.
- Stream derivation depends only on root seed and stable domain name, not stream creation order or consumption in another domain. Invalid random requests never use ambient randomness.
- A rejected command preserves tick, canonical state, reservations, Telegraphs, and the last accepted event state. Each accepted time-consuming command advances once, before presentation playback begins.
- Reset is deterministic Web-scenario reset. Commands already queued or in flight are cancelled and rejected rather than executed against the replacement world.
- Do not encode gameplay ownership in Pixi bounds, GSAP completion, React state, browser globals, scene nodes, or engine lifecycle callbacks.

## Edge Cases

| Case                                   | Expected Handling                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Negative or edge coordinate            | Bounds is false and terrain/walkability is non-walkable.                                            |
| Center cell                            | `(6,6)` is land and the deterministic player start.                                                 |
| Terminal entity still has a visual     | Its occupancy is released immediately; only its generation may finish the visual.                   |
| Multi-cell spawn with one invalid cell | Entire spawn is rejected and no cell is indexed.                                                    |
| Failed multi-cell reservation          | No partial ownership is retained.                                                                   |
| Two Telegraph sources mark one cell    | Both sources remain; projection resolves visible phase without changing claim legality.             |
| One overlapping source clears          | Only that source is removed.                                                                        |
| Same seed and domain                   | The same sequence is produced across world recreation.                                              |
| One stream is consumed heavily         | Other named streams keep their independent sequence.                                                |
| Empty weighted pool or invalid bounds  | A deterministic no-selection/failure result is returned; no ambient randomness is used.             |
| Rejected destination                   | Tick and canonical state remain unchanged.                                                          |
| Presentation timeline is delayed       | Logical state and tick are already resolved.                                                        |
| Reset during presentation              | Old timelines/effects are cancelled, pending commands reject, and the new world starts at tick `0`. |
| Reset with reused entity IDs           | Old completion cannot mutate or remove views in the new generation.                                 |
| Runtime destroy                        | Timelines, effects, listeners, Pixi resources, and callbacks are cleaned safely.                    |

## Acceptance Criteria

1. The fixed scenario deterministically produces a twelve-by-twelve board, one player, and three enemy fixtures with stable initial snapshots.
2. Geometry, terrain, bounds, walkability, directions, distances, footprints, occupancy, reservations, Telegraph ownership, and terminal release are renderer-independent and deterministic.
3. Invalid spawn, movement, and claim operations leave canonical state unchanged; terminal cells become reusable before visual cleanup completes.
4. Identical seed and command setup reproduce identical random outputs, world results, event order, and reset state; one named stream cannot perturb another.
5. Accepted time-consuming commands advance exactly once, rejected commands advance no time, and logical results complete before presentation playback.
6. Runtime reset or scenario replacement cancels and rejects stale commands, clears old claims/Telegraphs/timelines, and prevents old callbacks from affecting the new generation.
7. Pixi and the semantic browser mirror show the board, entities, terminal state, claims, and Telegraph projection without deciding gameplay outcomes.
8. The focused logic assertions and Playwright acceptance pass with no stale callback, duplicate view, reservation marker, Telegraph, pending effect, or orphan visual after reset.
