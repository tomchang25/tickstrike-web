# World Wave Runtime State, Spawn Reservations, and Spawning Telegraphs

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

> Draft implementation spec. Authored after reading the live `World`, but it consumes the Child A modules that do not exist yet and rides on decisions Child A finalizes. Re-verify every claim against the codebase after A lands before executing.

## Goal

Give the deterministic world the state and claim vocabulary that authored waves drive through: a world-owned wave runtime record, spawn-purpose reservations that block movement, spawning-phase telegraphs that carry a visible countdown, and a snapshot projection of all three — without changing existing occupancy, attack-reservation, or attack-telegraph behavior.

## Summary

Child A produced pure scheduling/placement/level logic that operates on a readonly world-view and emits plain data. This child installs the concrete world surface that logic needs at runtime, following the same clone-on-read, reset-with-scenario pattern `World` already uses for entities, reservations, telegraphs, and `armedSmashTarget`.

Three additions to `World`:

- **Wave runtime state.** A single optional `waveRuntime` record (current wave number, per-slot queues and latch/`hasEverSpawned` flags, and the pending admitted batch with its remaining warning ticks). Owned by `World`, cloned on read, reset when the scenario reloads. `World` is the authority; Child C reads and advances it but does not hold its own copy.
- **Spawn reservations.** Reuse the existing reservation system with `purpose: "spawn"` (already a literal in `ReservationPurpose`). Spawn reservations must make `isWalkable` false for their cells so enemy and player movement cannot enter a warned cell, and they must lose arbitration to nothing that would let a mover displace them mid-warning. No new reservation map — this is priority tuning plus a spawn owner-id convention.
- **Spawning telegraphs.** Reuse the telegraph map with a `"spawning"` phase (already allowed by the open `TelegraphPhase` union) and add an optional `remainingTicks` to `Telegraph` so the label pipeline has a countdown source that does not depend on an enemy's `committedAttack`. Attack telegraphs are unaffected; `remainingTicks` is simply absent for them.

The snapshot gains a `waveRuntime` projection (or the pending-batch/wave-number fields presentation needs) so Child D can render the current wave and Child C/tests can assert scheduler progress. No enemy, guard, movement, or combat rule changes here.

Success is: `World` can hold a wave runtime record that survives clone-on-read and resets on reload; a `"spawn"` reservation blocks movement into its cells and is not stolen by a moving enemy; a `"spawning"` telegraph carries a decrementing `remainingTicks`; and all three appear in the snapshot — with the existing world/reservation/telegraph tests still green.

## Relational Context

- `World` (`src/core/world/world.ts`) is the single authority for wave runtime state, reservations, and telegraphs. Child C calls `World` methods to advance the wave and to spawn; it must not keep a parallel copy of queue/latch state. This mirrors how `armedSmashTarget` is world-owned and exposed only through accessors.
- Reservation arbitration lives in `compareReservations`/`purposePriority` (`src/core/world/world.ts`). Today priority is movement-active-step (0) > attack/attack_intent (1) > other (2); `"spawn"` currently falls into the `other` bucket (2), which means an active movement step could out-prioritize a spawn claim. Spawn reservations must not be displaceable by a mover during their warning, so `purposePriority` must rank a held spawn claim above ordinary movement into that cell. State the intended ordering explicitly in code; do not leave spawn in the default bucket.
- `isWalkable(cell)` (`src/core/world/world.ts`) already returns false for any reserved cell, so a `"spawn"` reservation blocks movement through the existing predicate with no new check — verify this still holds after any priority change. `requestMovementReservations` rejects cells that are occupied but arbitrates against existing reservations by priority; confirm a held spawn reservation defeats a movement claim on the same cell.
- Spawn reservations use a synthetic owner id namespace (for example a per-batch `spawn:<n>` id), not an entity id, because no entity exists during the warning. `releaseReservation(ownerId)` and `reservationAt(cell)` already key by owner string, so this needs no structural change — only a naming convention Child C and B agree on.
- `Telegraph` (`src/core/model/types.ts`) is `{ sourceId, phase, cells }`. Adding optional `remainingTicks` is additive; `setTelegraph` (`src/core/world/world.ts`) must accept and store it, and `cloneTelegraph` must copy it. Spawn telegraphs use a synthetic `sourceId` (no backing entity), so the renderer's current `entitiesById.get(sourceId)?.committedAttack?.warningTicks` lookup would find nothing — that is exactly why `remainingTicks` is added. Presentation consumption is Child D; this child only produces the field.
- `snapshot()` (`src/core/world/world.ts`) deep-clones everything it returns. The new `waveRuntime` projection must follow the same clone discipline so callers cannot mutate world state through the snapshot. `WorldSnapshot` (`src/core/model/types.ts`) gains the projection field.
- `spawn(input: SpawnEntityInput)` (`src/core/world/world.ts`) already validates footprint/occupancy/reservation and sets `activity: "ready"` for enemies. Wave-spawned enemies must go through this same `spawn`; this child does not add a second spawn path. If a spawned cell is still covered by that batch's own spawn reservation, the reservation must be released immediately before (or as part of) spawning so `spawn`'s reservation check does not reject its own cell — decide and document which side releases.
- `updateEncounterOutcome()` (`src/core/world/world.ts`) declares victory when all enabled enemies are terminal. With waves, an empty board mid-run (between a cleared group and the next warning) must not be read as victory by Child C's flow. This child does not change `updateEncounterOutcome`; it only exposes the wave state Child C needs to gate that decision. Note the interaction so Child C owns the gate.

## Scope

### Included

- A world-owned optional `waveRuntime` record with accessor(s), clone-on-read, and reset-on-reload behavior.
- Methods to install/advance/read the wave runtime record and its pending batch countdown (thin state operators; the decision logic stays in Child A's modules).
- `purposePriority` tuning so a held `"spawn"` reservation is not displaced by movement into its cells.
- Optional `remainingTicks` on `Telegraph`, threaded through `setTelegraph`, `cloneTelegraph`, and the snapshot.
- `WorldSnapshot` projection of wave runtime state and spawning telegraphs.
- Unit coverage for spawn-reservation blocking/arbitration, telegraph `remainingTicks` round-trip, and wave-runtime clone/reset.

### Excluded

- Any decision about when to admit a batch, expand a queue, or project stats (Child A owns the logic; Child C calls it).
- The per-tick wave phase, event emission, and `action-resolver` hook (Child C).
- Rendering the spawn telegraph or wave number, and the wave-driven scenario (Child D).
- Changes to attack telegraphs, movement, guard, or combat resolution.

## Files to Change

| File                                        | Change Size | Purpose                                                                                                     |
| ------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `src/core/world/world.ts`                   | Large       | Add wave runtime state + accessors, spawn-reservation priority, telegraph `remainingTicks`, snapshot projection. |
| `src/core/model/types.ts`                   | Medium      | Add `remainingTicks?` to `Telegraph`, the wave runtime state/projection types, and the `WorldSnapshot` field. |
| `test/unit/core/world/reservations.test.ts` | Medium      | Assert a held `"spawn"` reservation blocks movement and is not displaced by a movement claim.               |
| `test/unit/core/world/world.test.ts`        | Medium      | Assert telegraph `remainingTicks` round-trips and wave runtime state clones and resets.                     |

## Execution Outline

1. Add the wave-runtime and telegraph type changes to `types.ts` first (additive `remainingTicks?`, the runtime record/projection, the snapshot field) so `world.ts` compiles against settled shapes.
2. Thread `remainingTicks` through `setTelegraph`/`cloneTelegraph`/`getTelegraph`/`listTelegraphs` and the snapshot; add a focused round-trip test. This is the smallest independent slice and de-risks the presentation source Child D depends on.
3. Tune `purposePriority` so a held `"spawn"` reservation ranks above ordinary movement into its cell; add reservation tests proving movement cannot enter a warned cell and cannot steal the claim. Keep attack-vs-movement ordering unchanged.
4. Add the world-owned `waveRuntime` record with accessor, clone-on-read, and reload reset; add thin operators to set the current wave, install a pending batch with warning ticks, decrement the countdown, and clear it. Keep all scheduling *decisions* out — these are state operators only.
5. Project wave runtime state and spawning telegraphs into `snapshot()` with full clone discipline; assert clone isolation and reset.
6. Run the world and reservation unit suites plus the type-check; confirm existing attack-telegraph and movement-reservation tests are unchanged.

## Implementation Notes

- Keep decision logic out of `World`. The scheduler/planner/level modules from Child A decide *what* and *where*; `World` only stores the resulting state, blocks the cells, counts down the warning, and spawns. If a method here starts choosing cells or expanding queues, it belongs in Child A.
- The wave runtime record should carry enough to resume deterministically after clone: current wave number, per-slot remaining queues, per-slot `latched`/`hasEverSpawned` flags, and the pending batch (members with levels, strategy, target cells once placed, and `remainingTicks`). Match Child A's slot-state shape exactly so Child C can hand state back and forth without translation.
- `remainingTicks` is optional and meaningful only for `"spawning"` telegraphs. Do not set it for attack telegraphs; the renderer will keep using `committedAttack.warningTicks` for those (Child D reconciles the two sources).
- Spawn reservation owner ids must be distinct from entity ids and stable across the warning so the countdown and the eventual release target the same owner. Releasing a batch's spawn reservations must not touch attack or movement reservations.
- When a warned cell is revalidated at expiry (Child C drives this), `World` must expose enough to check live occupancy and the player cell — the existing `isOccupied`, `getOccupantAt`, `playerCell`, and `reservationAt` already cover it; confirm no new predicate is required.
- Do not let the empty-board-between-groups state flip `updateEncounterOutcome()` to victory on its own. This child leaves that method alone and documents that Child C must consult wave runtime state before treating an empty board as a win.

## Edge Cases

| Case                                                       | Expected Handling                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Movement claim targets a cell held by a spawn reservation  | Movement claim loses arbitration; the cell stays reserved and unwalkable.                                  |
| Spawn telegraph with `remainingTicks` of 1 then 0          | Decrements to 0; Child C resolves it. `remainingTicks` never goes negative.                                |
| Snapshot taken mid-warning                                 | Wave runtime, spawn reservations, and spawning telegraph appear as deep clones; mutating them is inert.    |
| Scenario reload during an active warning                   | Wave runtime, spawn reservations, and spawning telegraphs are all cleared with the rest of world state.    |
| Spawning onto a cell still covered by its own spawn reservation | The batch's spawn reservation is released before `spawn` validates that cell, so `spawn` does not reject it. |
| Attack telegraph drawn over a spawning cell                | Both telegraphs coexist by distinct `sourceId`; the spawn reservation's movement block is unaffected.      |

## Acceptance Criteria

1. `World` holds an optional wave runtime record that clones on read and resets on scenario reload, with no scheduling decisions embedded in it.
2. A held `"spawn"` reservation makes its cells unwalkable and is not displaced by a movement claim, while attack-vs-movement arbitration is unchanged.
3. `Telegraph` carries an optional `remainingTicks` that round-trips through set/clone/snapshot and is absent for attack telegraphs.
4. The snapshot projects wave runtime state and spawning telegraphs under the same clone discipline as existing snapshot data.
5. All pre-existing world, reservation, and telegraph tests remain green.
