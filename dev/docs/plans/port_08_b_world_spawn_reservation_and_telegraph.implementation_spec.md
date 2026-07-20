# World Wave Runtime State, Spawn Reservations, and Spawning Telegraphs

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

> Re-verified against the landed Child A modules and the current `World`/`GameRuntime`/model code. Corrections from the original draft: there is no `World.reset()` method (see "World reset" below), the exact `purposePriority` fix is now spelled out, `updateEncounterOutcome()`'s false-victory risk is confirmed as a real current mechanism (not hypothetical), and the wave-runtime record's field names are pinned to Child A's actual exports (`src/core/waves/wave-scheduler.ts`, `src/core/waves/wave-inputs.ts`).

## Goal

Give the deterministic world the state and claim vocabulary that authored waves drive through: a world-owned wave runtime record, spawn-purpose reservations that block movement, spawning-phase telegraphs that carry a visible countdown, and a snapshot projection of all three — without changing existing occupancy, attack-reservation, or attack-telegraph behavior.

## Summary

Child A landed at `src/core/waves/` as three pure modules with no `World`/presentation dependency: `wave-scheduler.ts` (`SlotState`, `QueueMember`, `AdmittedBatch`, `expandSlotQueue`, `createInitialSlotStates`, `evaluateSlotEligibility`, `selectAtomicBatch`), `enemy-spawn-planner.ts` (`planGroupCells`, `SpawnPlacementResult`), `enemy-level-progression.ts` (`projectEnemyLevel`, `projectGuardValue`), and `wave-inputs.ts` (`WaveWorldView`, `RandomUnitSource`). This child installs the concrete world surface that logic needs at runtime, following the same clone-on-read pattern `World` already uses for entities, reservations, telegraphs, and `armedSmashTarget`.

**World reset, precisely.** `World` has no `reset()` method today. `GameRuntime.reset()` (`src/runtime/GameRuntime.ts:51`) just calls `loadScenario(this.scenario)` again, which discards the old `World` and constructs a brand-new one via `scenario.createWorld(scenario.seed)`. So "reset on reload" for the new `waveRuntime` field needs no special-cased clearing logic — it is simply whatever the constructor initializes it to (`undefined`) on the fresh instance. Do not add a `World.reset()` method as part of this child; there is no existing precedent for one and it is not needed.

**Child A's `WaveWorldView` is already satisfiable.** Its shape (`width`, `height`, `playerCell`, `livingEnemyCount`, `isArenaLegal(cell)`, `isOccupied(cell)`, `isReserved(cell)`) maps directly onto `World`'s existing public surface: `arena.width`/`arena.height`, `playerCell` getter, `isLegalCell(cell)`, `isOccupied(cell)`, and `isReserved(cell)` (already present — see below). `livingEnemyCount` is a simple count Child C derives from `listEntities()`/`listActiveEntities()`; this child does not need to add a dedicated accessor for it. The adapter that assembles a `WaveWorldView` from `World` is Child C's glue, not new `World` surface.

Three additions to `World`:

- **Wave runtime state.** A single optional `waveRuntime` record (current wave number, per-slot state matching Child A's `SlotState[]` shape verbatim, and the pending admitted batch with its remaining warning ticks). Owned by `World`, cloned on read. `World` is the authority; Child C reads and advances it but does not hold its own copy.
- **Spawn reservations.** Reuse the existing reservation system with `purpose: "spawn"` (already a literal in `ReservationPurpose`). Spawn reservations must make `isWalkable` false for their cells so enemy and player movement cannot enter a warned cell, and they must lose arbitration to nothing that would let a mover displace them mid-warning. No new reservation map — this is priority tuning plus a spawn owner-id convention.
- **Spawning telegraphs.** Reuse the telegraph map with a `"spawning"` phase (already allowed by the open `TelegraphPhase` union) and add an optional `remainingTicks` to `Telegraph` so the label pipeline has a countdown source that does not depend on an enemy's `committedAttack`. Attack telegraphs are unaffected; `remainingTicks` is simply absent for them.

The snapshot gains a `waveRuntime` projection (or the pending-batch/wave-number fields presentation needs) so Child D can render the current wave and Child C/tests can assert scheduler progress. No enemy, guard, movement, or combat rule changes here.

Success is: `World` can hold a wave runtime record that survives clone-on-read and starts undefined on every fresh instance; a `"spawn"` reservation blocks movement into its cells and is not stolen by a moving enemy; a `"spawning"` telegraph carries a decrementing `remainingTicks`; and all three appear in the snapshot — with the existing world/reservation/telegraph tests still green.

## Relational Context

- `World` (`src/core/world/world.ts`) is the single authority for wave runtime state, reservations, and telegraphs. Child C calls `World` methods to advance the wave and to spawn; it must not keep a parallel copy of queue/latch state. This mirrors how `armedSmashTarget` is world-owned and exposed only through accessors.
- Reservation arbitration lives in `compareReservations`/`purposePriority` (`src/core/world/world.ts:157`). Confirmed current numbers: `activeStep && (purpose === "movement" || purpose === "movement_step")` → priority `0`; `purpose === "attack" || purpose === "attack_intent"` → priority `1`; everything else (including `"spawn"` today) → priority `2`. Lower number wins arbitration (`compareReservations` returns `priorityA - priorityB`; a positive result means `a` loses). Since active-step movement is already priority `0`, `"spawn"` at `2` would lose to an active movement claim into the same cell — the opposite of what waves need. Fix: give `purpose === "spawn"` its own bucket that returns a number below `0` (e.g. `-1`), so a held spawn reservation beats active-step movement (and, incidentally, attack/attack_intent too, which is harmless since nothing currently contests a spawn-reserved cell with an attack reservation). Keep the existing `0`/`1`/`2` bucket boundaries for movement/attack untouched — attack-vs-movement ordering must not change.
- `isWalkable(cell)` (`src/core/world/world.ts:987`) already returns false for any reserved cell, so a `"spawn"` reservation blocks movement through the existing predicate with no new check — verify this still holds after the priority change. `requestMovementReservations` (`world.ts:1076`) rejects cells that are occupied but arbitrates against existing reservations by priority; confirm a held spawn reservation defeats a movement claim on the same cell once `purposePriority` is fixed.
- Spawn reservations use a synthetic owner id namespace (for example a per-batch `spawn:<n>` id), not an entity id, because no entity exists during the warning. `releaseReservation(ownerId)` and `reservationAt(cell)` already key by owner string, so this needs no structural change — only a naming convention Child C and B agree on.
- `Telegraph` (`src/core/model/types.ts:179`) is `{ sourceId, phase, cells }` today — confirmed no `remainingTicks` field yet. Adding it is additive; `setTelegraph` (`world.ts:1198`) must accept and store it, and `cloneTelegraph` (`world.ts:107`) must copy it. Spawn telegraphs use a synthetic `sourceId` (no backing entity), so the renderer's current `entitiesById.get(sourceId)?.committedAttack?.warningTicks` lookup would find nothing — that is exactly why `remainingTicks` is added. Presentation consumption is Child D; this child only produces the field.
- `snapshot()` (`src/core/world/world.ts:1312`) deep-clones everything it returns (arena arrays copied, `playerCell`/`armedSmashTarget` cloned via their getters, entities/reservations/telegraphs via their `list*()` methods, `lastEvents` via `structuredClone`). The new `waveRuntime` projection must follow the same clone discipline so callers cannot mutate world state through the snapshot. `WorldSnapshot` (`src/core/model/types.ts:194`) gains the projection field.
- `spawn(input: SpawnEntityInput)` (`src/core/world/world.ts:210`) already validates footprint/occupancy/reservation and sets `activity: "ready"` for enemies — confirmed it throws if any footprint cell has a reservation at all, regardless of owner (`this.reservationAt(cell)` truthy check, not owner-scoped). Wave-spawned enemies must go through this same `spawn`; this child does not add a second spawn path. If a spawned cell is still covered by that batch's own spawn reservation, the reservation must be released immediately before (or as part of) spawning so `spawn`'s reservation check does not reject its own cell — decide and document which side releases.
- `updateEncounterOutcome()` (`src/core/world/world.ts:317`) declares victory when `enabledEnemies.length > 0 && enabledEnemies.every(isTerminalPhase)`, where `enabledEnemies` is every entity in the map with `kind === "enemy" && enemyAction !== undefined`. Confirmed mechanism, not hypothetical: `setPhase(id, "dead")` marks an entity terminal but leaves it in the `entities` map (`removeEntity` deletes from the map but is never called anywhere in `src/`), so dead enemies keep counting toward `enabledEnemies`. This means as soon as the *first* wave's group is fully cleared, `updateEncounterOutcome()` already reads "all enabled enemies terminal" and declares victory today — well before the next slot/wave is due. This child does not change `updateEncounterOutcome`; it only exposes the wave state (whether a wave is still producing: remaining slot queues, a pending batch, or more waves after the current one) that Child C's `finishAccepted` hook must consult before trusting that victory read. Note the interaction so Child C owns the gate.

## Scope

### Included

- A world-owned optional `waveRuntime` record with accessor(s) and clone-on-read behavior, defaulting to `undefined` in the constructor (no separate reset method needed — see "World reset" above).
- Methods to install/advance/read the wave runtime record and its pending batch countdown (thin state operators; the decision logic stays in Child A's modules).
- `purposePriority` tuning so a held `"spawn"` reservation is not displaced by movement into its cells.
- Optional `remainingTicks` on `Telegraph`, threaded through `setTelegraph`, `cloneTelegraph`, and the snapshot.
- `WorldSnapshot` projection of wave runtime state and spawning telegraphs.
- Unit coverage for spawn-reservation blocking/arbitration, telegraph `remainingTicks` round-trip, and wave-runtime clone isolation/fresh-instance defaulting.

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
| `test/unit/core/world/world.test.ts`        | Medium      | Assert telegraph `remainingTicks` round-trips and wave runtime state clones and defaults to `undefined` on a fresh instance. |

## Execution Outline

1. Add the wave-runtime and telegraph type changes to `types.ts` first (additive `remainingTicks?`, the runtime record/projection, the snapshot field) so `world.ts` compiles against settled shapes.
2. Thread `remainingTicks` through `setTelegraph`/`cloneTelegraph`/`getTelegraph`/`listTelegraphs` and the snapshot; add a focused round-trip test. This is the smallest independent slice and de-risks the presentation source Child D depends on.
3. Give `purpose === "spawn"` its own priority bucket below `0` in `purposePriority` (see the concrete numbers above) so a held spawn reservation ranks above active-step movement into its cell; add reservation tests proving movement cannot enter a warned cell and cannot steal the claim. Keep the `0`/`1`/`2` movement/attack ordering unchanged.
4. Add the world-owned `waveRuntime` record with accessor and clone-on-read, defaulting to `undefined`; add thin operators to set the current wave, install a pending batch with warning ticks, decrement the countdown, and clear it. Keep all scheduling *decisions* out — these are state operators only.
5. Project wave runtime state and spawning telegraphs into `snapshot()` with full clone discipline; assert clone isolation and that a fresh `World` instance starts with no wave runtime.
6. Run the world and reservation unit suites plus the type-check; confirm existing attack-telegraph and movement-reservation tests are unchanged.

## Implementation Notes

- Keep decision logic out of `World`. The scheduler/planner/level modules from Child A decide *what* and *where*; `World` only stores the resulting state, blocks the cells, counts down the warning, and spawns. If a method here starts choosing cells or expanding queues, it belongs in Child A.
- The wave runtime record should carry enough to resume deterministically after clone: current wave number, a `SlotState[]` matching `src/core/waves/wave-scheduler.ts`'s exported `SlotState` shape field-for-field (`remainingQueue: QueueMember[]`, `eligible`, `hasEverSpawned`, `livingCount`), and the pending batch — an `AdmittedBatch` (`slotIndex`, `members`, `warningTicks`, `placementStrategy`) plus the target cells once `enemy-spawn-planner.ts`'s `planGroupCells` has placed them, and a decrementing `remainingTicks`. Reuse these exact type names/fields rather than inventing parallel ones, so Child C can hand state to Child A's functions and back without translation.
- `remainingTicks` is optional and meaningful only for `"spawning"` telegraphs. Do not set it for attack telegraphs; the renderer will keep using `committedAttack.warningTicks` for those (Child D reconciles the two sources).
- Spawn reservation owner ids must be distinct from entity ids and stable across the warning so the countdown and the eventual release target the same owner. Releasing a batch's spawn reservations must not touch attack or movement reservations.
- When a warned cell is revalidated at expiry (Child C drives this), `World` must expose enough to check live occupancy and the player cell — the existing `isOccupied`, `getOccupantAt`, `playerCell`, and `reservationAt` already cover it; confirm no new predicate is required. These same accessors (plus `isLegalCell` and `arena.width`/`arena.height`) are also exactly what Child C needs to assemble Child A's `WaveWorldView` for `planGroupCells` — no new `World` surface is needed for that either.
- Do not let the empty-board-between-groups state flip `updateEncounterOutcome()` to victory on its own. Confirmed today it *would* misfire the moment a wave's first group is fully cleared, because dead enemies are never removed from the entity map (see the Relational Context note above). This child leaves `updateEncounterOutcome` alone and documents that Child C must consult wave runtime state (remaining queues / pending batch / more waves to come) before treating an empty board as a win.

## Edge Cases

| Case                                                       | Expected Handling                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Movement claim targets a cell held by a spawn reservation  | Movement claim loses arbitration; the cell stays reserved and unwalkable.                                  |
| Spawn telegraph with `remainingTicks` of 1 then 0          | Decrements to 0; Child C resolves it. `remainingTicks` never goes negative.                                |
| Snapshot taken mid-warning                                 | Wave runtime, spawn reservations, and spawning telegraph appear as deep clones; mutating them is inert.    |
| Scenario reload during an active warning                   | `GameRuntime.reset()`/`loadScenario()` discards the old `World` and constructs a new one, so wave runtime, spawn reservations, and spawning telegraphs are all absent on the new instance — no explicit clearing logic in `World` itself. |
| Spawning onto a cell still covered by its own spawn reservation | The batch's spawn reservation is released before `spawn` validates that cell, so `spawn` does not reject it. |
| Attack telegraph drawn over a spawning cell                | Both telegraphs coexist by distinct `sourceId`; the spawn reservation's movement block is unaffected.      |

## Acceptance Criteria

1. `World` holds an optional wave runtime record that clones on read and defaults to `undefined` on every fresh instance (matching how a scenario reload already works via `GameRuntime.loadScenario`), with no scheduling decisions embedded in it.
2. A held `"spawn"` reservation makes its cells unwalkable and is not displaced by a movement claim, while attack-vs-movement arbitration is unchanged.
3. `Telegraph` carries an optional `remainingTicks` that round-trips through set/clone/snapshot and is absent for attack telegraphs.
4. The snapshot projects wave runtime state and spawning telegraphs under the same clone discipline as existing snapshot data.
5. All pre-existing world, reservation, and telegraph tests remain green.
