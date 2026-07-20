# Wave Phase Orchestration on the Accepted-Tick Boundary

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

Status: Draft implementation spec

> Promoted from `port_08_c_wave_phase_orchestration.sketch.md` and re-verified against the landed
> Child A modules (`src/core/waves/`) and the landed Child B world surface (`World.waveRuntime`,
> `setWave`, `installPendingSpawnBatch`, `decrementPendingSpawnBatchWarning`,
> `clearPendingSpawnBatch`, `purposePriority`'s `"spawn"` bucket at `-1`, `Telegraph.remainingTicks`,
> `WorldSnapshot.waveRuntime`). Corrections to the sketch are called out inline: the wave phase needs
> an **authored-content context** that `World` cannot hold, per-slot `livingCount` needs an explicit
> **entity attribution** rule the sketch never named, and the victory gate must **replace** rather
> than merely suppress the terminal-enemy scan so Child C1 does not break it.

## Goal

Run the authored wave schedule once per accepted player action, on the same command boundary the
enemy phase already uses: advance the pending warning, spawn its batch at expiry through the
existing `World.spawn`, admit the next atomic batch when the arena has room, advance the wave when
it is cleared, and decide encounter victory from wave exhaustion instead of from terminal entities.

## Summary

Children A and B landed the two halves this child joins. A is pure decision logic with no `World`
dependency: `expandSlotQueue`, `createInitialSlotStates`, `evaluateSlotEligibility`,
`selectAtomicBatch`, `planGroupCells`, `projectEnemyLevel`, `projectGuardValue`. B is the world's
state and claim vocabulary: a cloned-on-read `waveRuntime` record, `"spawn"` reservations that win
arbitration against active-step movement, `"spawning"` telegraphs carrying `remainingTicks`, and a
snapshot projection of all three. Neither side decides _when_. This child is that glue and nothing
more — no new scheduling, placement, or level rules.

A new `resolveWavePhase(world, context)` in `src/core/actions/wave-phase.ts` sits beside
`enemy-phase.ts` and is called from `finishAccepted` after `resolveEnemyPhase`, so enemy deaths
resolved this tick are already visible to the clear/eligibility checks. It performs four ordered
steps per accepted tick — refresh per-slot living counts, resolve the pending warning, admit the
next batch, advance the wave — and returns `CombatEvent[]` plus a `victoryReady` flag.

**The sketch's one structural gap: the wave phase needs authored content, and neither `World` nor
`finishAccepted` has any.** Turning a `QueueMember` (`{ enemyId, level }`) into a
`SpawnEntityInput` requires the actor catalog (enemy definition, guard definition, attack shape
resolution) and the wave catalog (progression profile, wave definitions, spawn groups). `World`
must not hold them — B pinned `World` as a state store, and `src/core` imports `src/core/content`
schema _types_ but never the `src/content` catalog _values_. So this child adds a `WavePhaseContext`
parameter threaded `TestScenario -> GameRuntime -> resolveCommand -> resolveWavePhase`. Every
existing scenario omits it, so the wave phase is a no-op and every existing fixture is untouched.
The context's `buildEnemySpawnInput` implementation lives under `src/content/`, where catalog
imports belong, and is the shared helper Child D's wave scenario reuses.

**The sketch's second gap: `SlotState.livingCount` has no source.** A's `SlotState` carries a
per-slot `livingCount` that `conditionMet` reads, but nothing in A or B attributes a living enemy to
the slot that produced it. This child pins entity-id encoding as that attribution: wave-spawned
enemies are named `wave-<waveNumber>-slot-<slotIndex>-t<tick>-<index>`, and each tick the phase
recomputes every slot's `livingCount` by counting non-terminal enemies whose id carries that wave and
slot. This needs no new type, survives clone-on-read, and — because it counts living entities rather
than absent dead ones — keeps working after Child C1 removes terminal entities from the world.

Success is: a wave-driven world admits, warns, spawns, clears, and advances across accepted ticks
with no stale reservation or telegraph; a legacy fixture world behaves exactly as it does today; and
an empty board between a cleared group and the next warning is never read as victory.

## Relational Context

- `finishAccepted` (`src/core/actions/action-resolver.ts:14`) is the only accepted-command path.
  Rejected commands return early from `resolveCommand` and never reach it, so a plain per-call
  decrement of the pending batch already satisfies "warnings advance only on accepted world ticks" —
  no tick-parity bookkeeping is needed.
- `resolveEnemyPhase` (`src/core/actions/enemy-phase.ts`) is the shape to mirror: a single exported
  function taking `World` and returning `CombatEvent[]`. `resolveWavePhase` differs only in taking a
  context and returning a small result object instead of a bare array, because the victory gate needs
  one bit back.
- `World.updateEncounterOutcome()` (`src/core/world/world.ts:349`) declares victory when
  `enabledEnemies.length > 0 && enabledEnemies.every(isTerminalPhase)`. B confirmed this misfires the
  moment a wave's first group clears, because `setPhase(id, "dead")` leaves the entity in the map.
  This child changes the method to accept an optional wave gate. **The gate replaces the terminal
  scan, it does not merely suppress it** — Child C1 removes terminal entities entirely, at which
  point `enabledEnemies.length` drops to zero and a suppression-only design would never declare
  victory at all. The defeat branch (player not `alive`) is untouched and always runs first.
- `World.spawn` (`world.ts:242`) throws when any footprint cell carries a reservation, regardless of
  owner. B pinned that the batch's own spawn reservation is released before spawning; this child owns
  that release. It happens once per batch, after repair planning and before the first `spawn` call.
- `World.requestReservation` (`world.ts:1132`) releases every `lostOwners` reservation when a claim
  is granted. With `"spawn"` at priority `-1` a spawn claim defeats everything, so a careless request
  could silently release an enemy's `attack_intent` mid-warning. `planGroupCells` already excludes
  reserved cells through `WaveWorldView.isReserved`, so a granted spawn claim must come back with an
  empty `lostOwners`; a non-empty one is an invariant violation, not a normal outcome.
- `World.random` is a `RandomStreams` (`src/core/random/random-streams.ts:15`) keyed by domain string.
  The wave phase takes `world.random.get("waves")` and adapts it to A's `RandomUnitSource` as
  `() => stream.nextUnit()`. This domain is reserved for waves; port_09 rewards must use their own.
- Child A's `WaveWorldView` (`src/core/waves/wave-inputs.ts`) maps onto `World` with no new world
  surface: `arena.width`/`arena.height`, `playerCell`, `isLegalCell`, `isOccupied`, `isReserved`,
  and a `livingEnemyCount` this child derives from `listActiveEntities()`.
- `GameRuntime.drainCommands` (`src/runtime/GameRuntime.ts:119`) calls `resolveCommand(world, command)`.
  It gains one argument sourced from the loaded scenario. `GameRuntime.reset()` reloads the scenario,
  which builds a fresh `World` with `waveRuntime` undefined and re-reads the scenario's context, so
  reset needs no wave-specific teardown.
- Child D owns the wave scenario that installs the initial runtime via `World.setWave` and supplies
  the context, plus the spawn-telegraph rendering. This child ships the seam and covers it with unit
  tests against a hand-built context; it registers no scenario.
- Child C1 depends on this child's completion predicate being terminal-entity-independent. The
  `victoryReady` design above satisfies that precondition.

## Scope

### Included

- `src/core/actions/wave-phase.ts`: `resolveWavePhase(world, context)` implementing the four ordered
  steps, plus the `WaveWorldView` adapter, the spawn/telegraph owner-id convention, and the
  wave-enemy id encode/parse helpers.
- `WavePhaseContext`: authored catalogs, `waveFor(waveNumber)`, and `buildEnemySpawnInput(...)`.
- `src/content/wave-enemy-spawn.ts`: the catalog-backed `buildEnemySpawnInput` implementation,
  applying Child A's level projection to HP, attack damage, defense, and guard.
- New wave `CombatEvent` variants in `src/core/events/combat-events.ts`.
- The optional wave gate on `World.updateEncounterOutcome`.
- Threading the context through `TestScenario`, `GameRuntime`, and `resolveCommand`.
- Unit coverage for the phase, the spawn-input helper, the victory gate, and the legacy no-op path.

### Excluded

- Rendering the spawn telegraph, the wave-number readout, the wave scenario, and browser acceptance
  (Child D).
- The Endless template. This child's `waveFor` seam is where D plugs it in; C returns `undefined`
  past the last demo wave and treats the run as complete.
- Terminal entity removal and retained Pixi ghosts (Child C1).
- Any change to Child A's scheduling/placement/level logic or Child B's world state operators.
- Enemy combat, guard, movement, and attack-telegraph behavior.

## Files to Change

| File                                             | Change Size | Purpose                                                                                             |
| ------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| `src/core/actions/wave-phase.ts`                 | Large       | New: the four-step wave phase, world-view adapter, id conventions, and event emission.              |
| `src/core/events/combat-events.ts`               | Medium      | Add the wave event variants to the discriminated union.                                             |
| `src/core/actions/action-resolver.ts`            | Medium      | Accept the context, run the wave phase after the enemy phase, splice events, pass the victory gate. |
| `src/core/world/world.ts`                        | Small       | `updateEncounterOutcome` accepts an optional wave gate that replaces the terminal-enemy scan.       |
| `src/content/wave-enemy-spawn.ts`                | Medium      | New: catalog + level projection to `SpawnEntityInput`; shared with Child D's fixture.               |
| `src/harness/types.ts`                           | Small       | Optional `waveContext` on `TestScenario`.                                                           |
| `src/runtime/GameRuntime.ts`                     | Small       | Pass the loaded scenario's wave context into `resolveCommand`.                                      |
| `test/unit/core/actions/wave-phase.test.ts`      | Large       | New: countdown, expiry, repair/requeue, admission blocking, wave advance, run completion.           |
| `test/unit/core/actions/action-resolver.test.ts` | Medium      | Assert phase ordering, event splicing, and that a context-free world is unchanged.                  |
| `test/unit/core/world/world.test.ts`             | Small       | Assert the wave gate replaces the terminal scan and leaves defeat and legacy victory intact.        |
| `test/unit/content/wave-enemy-spawn.test.ts`     | Medium      | New: level projection reaches HP, damage, defense, and guard on the built spawn input.              |

## Execution Outline

1. Add the wave `CombatEvent` variants and the `updateEncounterOutcome` wave gate first, with a
   focused world test. Both are additive and let `wave-phase.ts` compile against settled shapes.
2. Build `src/content/wave-enemy-spawn.ts` and its test in isolation. It is a pure
   content-plus-projection function with no world dependency, so it is verifiable before any wiring
   and immediately fixes the `actionFor`/charge-tuning duplication Child D flagged.
3. Write `wave-phase.ts` against a hand-built `World` and context: the world-view adapter, the id
   conventions, then the four steps in order. Cover each step with unit tests before wiring.
4. Thread the context through `TestScenario`, `GameRuntime`, and `resolveCommand`, and call the
   phase from `finishAccepted`. Assert every existing scenario still resolves identically with no
   context.
5. Run the core, world, runtime, and harness unit suites plus the type-check. Existing
   action-resolver, world, and enemy-phase tests must be green without modification.

## Design

### Context

```ts
export interface WavePhaseContext {
  readonly groups: readonly SpawnGroupDefinition[];
  readonly progressionProfile: WaveProgressionProfile;
  /** The wave definition for a 1-based wave number, or undefined when the run is complete. */
  waveFor(waveNumber: number): WaveDefinition | undefined;
  buildEnemySpawnInput(request: WaveEnemySpawnRequest): SpawnEntityInput;
}

export interface WaveEnemySpawnRequest {
  readonly id: EntityId;
  readonly enemyId: string;
  readonly level: number;
  readonly waveNumber: number;
  readonly cell: Cell;
  readonly profile: WaveProgressionProfile;
}
```

`waveFor` is the Endless seam: this child returns `demoWaves[waveNumber - 1]`, and Child D changes it
to fall back to the endless template so it never returns `undefined`.

### Phase steps

`resolveWavePhase(world, context)` returns `{ events, victoryReady }`. It returns
`{ events: [], victoryReady: false }` immediately when `world.waveRuntime` is undefined. When a
runtime is installed but no context was supplied, it throws — that combination is a scenario
construction bug that would otherwise silently freeze the schedule. It also returns early with no
events when the player entity is missing or not `alive`, because placement has no origin and the
defeat branch owns that tick.

1. **Refresh living counts.** Recompute each slot's `livingCount` from non-terminal enemies attributed
   to that wave and slot, and write the slots back with `World.setWave(waveNumber, slots)`.
2. **Resolve the pending warning.** If a pending batch exists, `decrementPendingSpawnBatchWarning()`.
   If `remainingTicks` is still above zero, re-set the `"spawning"` telegraph with the new count and
   stop here — a batch is pending, so no admission this tick. At zero, revalidate, spawn, and clear.
3. **Admit.** With no pending batch, `evaluateSlotEligibility`, then `selectAtomicBatch`. On a batch,
   `planGroupCells`; on success reserve, telegraph, and install. `warningTicks` of zero spawns in the
   same step with no telegraph and no reservation.
4. **Advance.** When no batch is pending, every slot's `remainingQueue` is empty, and no enemy of this
   wave is alive, advance: `waveFor(waveNumber + 1)` gives the next wave, whose slots come from
   `createInitialSlotStates`. When it returns `undefined`, the run is complete and `victoryReady` is
   true.

Only one batch is in flight at a time. Step 3 runs only when step 2 left nothing pending, and step 4
runs only when step 3 admitted nothing, so at most one of admission or advancement happens per tick.

### Expiry: revalidate, repair, requeue

At `remainingTicks === 0`, for each `(member, cell)` pair in authored order:

- The cell is still legal when it is not occupied, is not the player cell, and carries no reservation
  other than this batch's own. The batch's spawn reservation is still installed at this point, which
  is what keeps repair planning from choosing a cell another member already holds.
- An illegal cell asks `planGroupCells(strategy, 1, view, random)` for one strategy-consistent
  replacement. The view still reports the batch's own cells as reserved, so a replacement is always
  disjoint from the surviving ones.
- A member whose replacement fails is requeued to the **front** of its slot's `remainingQueue`, in
  authored order. Only unrepairable members requeue; the validly warned rest still spawn, per the
  sketch's favored reading of "replaced with a strategy-consistent alternative or requeued".

Then release the batch's spawn reservation and clear its telegraph **once**, spawn the survivors in
order, set the slot's `hasEverSpawned` when at least one member spawned, and
`clearPendingSpawnBatch()`. Release must precede the first `spawn` call because `spawn` rejects any
reserved footprint cell regardless of owner.

### Identifiers

| Thing                                            | Format                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| Spawn reservation owner and telegraph `sourceId` | `spawn:w<waveNumber>:s<slotIndex>:t<tick>`           |
| Wave-spawned enemy id                            | `wave-<waveNumber>-slot-<slotIndex>-t<tick>-<index>` |

Both are unique without new state because a slot cannot admit twice in one tick, and the world tick
is monotonic. The reservation and its telegraph share one id so release and clear target the same
owner. The enemy id is the sole source of slot attribution; parse it with an anchored regex and
ignore any enemy whose id does not match, so fixture enemies in a mixed world never count toward a
slot.

### Events

Appended to `src/core/events/combat-events.ts` in the existing discriminated-union style, spliced
into `completeEvents` after `enemyEvents` and before `encounter_ended`.

| Event                 | Payload                                                                          | When                                                     |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `wave_started`        | `waveNumber`                                                                     | A wave's slot states are installed, including wave 1.    |
| `wave_group_warned`   | `waveNumber`, `slotIndex`, `sourceId`, `cells`, `warningTicks`                   | A batch is admitted with a nonzero warning.              |
| `wave_group_spawned`  | `waveNumber`, `slotIndex`, `spawns: { entityId, cell, level }[]`                 | Members spawn, at expiry or immediately at zero warning. |
| `wave_group_requeued` | `waveNumber`, `slotIndex`, `memberCount`                                         | Repair failed for one or more members at expiry.         |
| `wave_group_deferred` | `waveNumber`, `slotIndex`, `reason: "population-headroom" \| "placement-failed"` | Admission was blocked this tick.                         |
| `wave_cleared`        | `waveNumber`                                                                     | A wave is exhausted, before the next `wave_started`.     |

`selectAtomicBatch` returns `undefined` for both "nothing schedulable" and "headroom too small", so
`wave_group_deferred` derives its reason: find the earliest eligible slot with remaining members
first; only if one exists and `selectAtomicBatch` still returned `undefined` is the reason
`"population-headroom"`. `"placement-failed"` comes from `planGroupCells` returning `{ failed: true }`.

### Victory gate

```ts
updateEncounterOutcome(waveGate?: { readonly victoryReady: boolean }): EncounterOutcome | undefined
```

The defeat branch is unchanged and still evaluated first. When `waveGate` is supplied, `victoryReady`
**replaces** the `enabledEnemies` terminal scan outright. When it is omitted, behavior is byte-for-byte
what it is today. `finishAccepted` supplies the gate only when `world.waveRuntime` is defined, so
legacy fixtures keep the terminal scan and wave worlds never consult it.

`victoryReady` is true only when the run is complete (`waveFor` returned `undefined`), no batch is
pending, and no enemy is alive. Endless never satisfies it, because Child D's `waveFor` never returns
`undefined`.

## Implementation Notes

- Keep the phase glue-only. Any code choosing cells, expanding queues, or projecting stats belongs in
  `src/core/waves/`; any code reading a catalog belongs in `src/content/`. If `wave-phase.ts` grows an
  `import` from `src/content`, the context seam has been bypassed.
- The `"waves"` random stream is world-owned and stateful across ticks, so determinism holds for a
  fixed seed plus a fixed accepted-command sequence. A failed `planGroupCells` still consumes draws
  (`planAnchorCluster` draws its anchor before testing candidate count), so a deferred tick advances
  the stream. That is deterministic and intended; do not add retry-without-consumption logic.
- `livingEnemyCount` for headroom is arena-wide — every living enemy, not just this slot's — because
  `WaveDefinition.populationCap` caps the arena. Per-slot `livingCount` is the separate, attributed
  count that start conditions read. Do not conflate them.
- Recompute `livingCount` before eligibility every tick. `evaluateSlotEligibility` latches, so a stale
  count can only delay a latch, never revoke one, but a wave can stall permanently if step 1 is
  skipped on the tick a predecessor's last enemy dies.
- `buildEnemySpawnInput` rounds every projected stat with `Math.round`, flooring HP and guard at 1 so
  a projection can never produce a zero-HP enemy. It resolves the enemy's action exactly as
  `createFoundationArena` does today, including charge's line-shape `chargeTuning` and ranged's
  distance band; extracting that resolution is the point of the shared helper, and Child D replaces the
  fixture's inline copy with it.
- A granted spawn reservation must report an empty `lostOwners`. Assert it and throw on a non-empty
  result rather than proceeding — a spawn claim that displaced an attack reservation means placement
  planned onto a reserved cell, which is a real bug in the view adapter.
- Do not decrement and spawn in the same call as admission. A batch admitted on tick T with
  `warningTicks` 2 spawns on tick T+2; step ordering gives this for free because step 3 runs after
  step 2. `warningTicks` of zero is the one deliberate exception.
- `World.setWave` preserves any pending batch by design, so step 1's living-count writeback is safe
  mid-warning.

## Edge Cases

| Case                                                        | Expected Handling                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Accepted command in a world with no wave runtime            | Phase returns no events, no gate is passed, and `updateEncounterOutcome` behaves exactly as today.                              |
| Wave runtime installed but no context supplied              | Throw at resolve time; a silently frozen schedule is worse than a loud construction error.                                      |
| Rejected command                                            | Never reaches `finishAccepted`, so no warning ticks and no admission.                                                           |
| `warningTicks` of zero                                      | Spawns in the admission step with no telegraph and no reservation; still emits `wave_group_spawned`, never `wave_group_warned`. |
| Player steps onto a warned cell before expiry               | Impossible — the `"spawn"` reservation makes the cell unwalkable at priority `-1`. Revalidation still checks, defensively.      |
| A warned cell is occupied at expiry by a knocked-back enemy | That member gets one strategy-consistent replacement cell; the rest of the batch spawns normally.                               |
| No replacement cell exists for a warned member              | Only that member requeues to the front of its slot; `wave_group_requeued` fires and the batch's other members still spawn.      |
| Every member of a batch is unrepairable                     | The whole batch requeues, `hasEverSpawned` stays false, no `wave_group_spawned` fires, and the slot re-admits on a later tick.  |
| Population cap leaves no headroom                           | `wave_group_deferred` with `"population-headroom"`; no later slot bypasses the blocked one.                                     |
| Board empties between a cleared group and the next warning  | `victoryReady` is false (queues remain), so no victory. This is the sketch's headline risk and the reason for the gate.         |
| Final authored wave exhausted with no living enemies        | `wave_cleared`, `victoryReady` true, `encounter_ended` with `victory` in the same event batch.                                  |
| Player dies while a batch is pending                        | Defeat is decided first; the phase returns early, leaving the reservation and telegraph in place on a world that has ended.     |
| Scenario reset mid-warning                                  | `loadScenario` builds a fresh `World`, so runtime, reservation, and telegraph are all absent; no teardown code needed.          |
| Mixed world with fixture enemies and wave enemies           | Fixture ids fail the wave-id parse and count toward arena headroom but never toward a slot's `livingCount`.                     |
| Child C1 removes terminal entities                          | Living counts and `victoryReady` read only non-terminal entities, so both are unaffected.                                       |

## Acceptance Criteria

1. A wave phase runs once per accepted player action, after the enemy phase and before the outcome
   check, and is a no-op in every scenario that supplies no wave context.
2. Spawn warnings advance only on accepted ticks; at expiry surviving cells spawn through the existing
   `World.spawn` with the batch's reservation released and its telegraph cleared exactly once.
3. Group admission is all-or-nothing, a later slot never bypasses a blocked earlier slot, and only
   unrepairable members requeue.
4. An empty board between a cleared group and the next warning is not read as victory; victory is
   declared only when the authored waves are exhausted with no living enemy and no pending batch, and
   that decision does not depend on terminal entities remaining in the world.
5. Wave-spawned enemies carry the projected level's HP, damage, defense, and guard, and enter the
   existing enemy state machine in the `ready` activity.
6. The wave phase emits a stable event stream, and all pre-existing core, world, runtime, and harness
   tests remain green without modification.
