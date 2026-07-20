# Wave Scheduling, Placement, and Level Projection Core

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

## Goal

Add the deterministic decision core for authored waves — slot eligibility and atomic batch selection, spawn-cell placement per strategy, and enemy level/stat projection — as pure logic with no world, presentation, or runtime dependency. Later children wire this core into the running world; this child makes it correct and testable in isolation.

## Summary

This child ports the legacy `WaveController` scheduling decisions, `EnemySpawnPlanner` cell selection, and `EnemyLevelProgressionProfile` projection into three pure modules under a new `src/core/waves/` folder. It consumes the already-authored `waveCatalog` shape (`SpawnGroupDefinition`, `WaveDefinition`, `WaveGroupSlot`, `WaveProgressionProfile`) and the `actorCatalog` enemy/guard definitions, and produces plain data: an ordered per-slot spawn queue, an eligibility/admission decision, a placement result of exactly N cells or a failure, and a stat projection.

Nothing here mutates a `World`, reads a `WorldSnapshot`, imports presentation, or advances a tick. The scheduler is expressed against small readonly inputs (living-enemy positions, occupied/reserved cell predicates, the player cell, arena legality) that Child C will supply from `World`. Placement takes an injected deterministic number source so it is seedable without importing `RandomStreams` directly. Level projection is a pure function of `(enemyDefinition, guardDefinition, level, waveNumber, progressionProfile)`.

The result is three independently unit-tested modules with no wiring risk: given the same inputs they always produce the same queue, the same admitted batch, the same cells, and the same stats. Determinism is the whole point — encounter composition and reward rolls must never disturb each other, and a scenario seed must always reproduce the same run.

Success is: `waveCatalog` can be expanded into slot queues, a batch can be selected under a population cap, N legal cells can be placed for each strategy, and Level-N stats can be projected — all as pure functions, all covered by focused tests, with zero references to `World`, `GameRuntime`, or any Pixi module.

## Relational Context

- These modules are pure decision logic. They must not import `World` (`src/core/world/world.ts`), `WorldSnapshot`, `GameRuntime`, `RandomStreams`, or any `src/presentation/**` module. Child C owns the translation from `World` state into these modules' input shapes and back into world mutations.
- Placement and weighted-composition draws are deterministic but seed-driven. Rather than import `RandomStreams`, these modules accept an injected integer/float source (a small function type). Child C will back that source with `world.getRandomStream("waves")` — separate from the reward stream — but this child must not name or reach that stream itself.
- Input ownership: the scheduler reads authored `WaveContentCatalog` data (already validated and frozen by `createWaveContentCatalog` in `src/core/content/wave-schema.ts`) and treats it as immutable. It never re-validates or clones catalog data; validation already happened at catalog construction.
- Level projection reads `EnemyDefinition` and `GuardDefinition` from the actor content shape (`src/core/content/actor-schema.ts`) plus `WaveProgressionProfile` (`src/core/content/wave-schema.ts`). It returns a plain projection record; it does not build an `EnemyActionDefinition` or spawn anything. The existing `EnemyDefinition.hp`/`defense` and `GuardDefinition.base`/`lethalTierGain` are the Level-1 base values.
- The scheduler's output batch is data only: an ordered list of `{ enemyId, level }` members plus the resolved warning ticks and placement strategy for that batch. It does not choose cells; placement is a separate call so Child C can revalidate cells at warning expiry independently of batch selection.
- Cell types and helpers (`Cell`, `cellKey`, `sameCell`, `manhattanDistance`) come from `src/core/model/types.ts`. Arena legality is passed in as a predicate, not by importing `Arena`.

## Scope

### Included

- `src/core/waves/wave-scheduler.ts`: slot-queue expansion (fixed counts and weighted draws), slot eligibility with latching and the "predecessor must have spawned" rule, and earliest-eligible atomic batch selection under a population-headroom cap.
- `src/core/waves/enemy-spawn-planner.ts`: `player-ring`, `anchor-cluster`, and `scatter` cell selection returning exactly N distinct legal cells or an explicit failure.
- `src/core/waves/enemy-level-progression.ts`: two-segment growth curve, per-stat HP/damage/defense projection, and base-wave guard projection.
- A small shared input-type module (or co-located types) describing the readonly world-view the scheduler/planner consume.
- Focused unit tests for all three modules under `test/unit/core/waves/`.

### Excluded

- Any `World` mutation, reservation, telegraph, or snapshot change (Child B).
- The per-tick orchestration, event emission, and `action-resolver` hook (Child C).
- Presentation, scenario wiring, and browser acceptance (Child D).
- Endless-specific runtime cadence beyond expanding the endless template like any other wave.
- Changes to the authored catalog data or its validator.

## Files to Change

| File                                              | Change Size | Purpose                                                                                                       |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `src/core/waves/wave-scheduler.ts`                | Large       | Expand slots into queues, evaluate latched eligibility, and select the atomic batch under population headroom. |
| `src/core/waves/enemy-spawn-planner.ts`           | Medium      | Deterministic per-strategy cell selection returning exactly N legal cells or a typed failure.                 |
| `src/core/waves/enemy-level-progression.ts`       | Medium      | Pure two-segment growth curve plus HP/damage/defense/guard projection.                                        |
| `src/core/waves/wave-inputs.ts`                   | Small       | Readonly input types describing the world-view and seeded number source the core consumes.                    |
| `test/unit/core/waves/wave-scheduler.test.ts`     | Large       | Cover expansion, weighted determinism, latching, survivor thresholds, and atomic headroom rejection.          |
| `test/unit/core/waves/enemy-spawn-planner.test.ts`| Large       | Cover each strategy's legality, exact-count success, and failure when N cells are unavailable.                |
| `test/unit/core/waves/enemy-level-progression.test.ts` | Medium | Cover Level-1 identity, standard growth, lethal-tier onset, and guard base-wave tiers.                        |

## Execution Outline

1. Add `wave-inputs.ts` with the readonly types: a world-view (player cell, arena-legal predicate, occupied predicate, reserved predicate, living-enemy count/positions) and a seeded number source function type. These are the seam Child C fills; defining them first keeps the other three modules dependency-free.
2. Implement `enemy-level-progression.ts` first — it has no world-view dependency — and unit-test the curve against authored `progressionProfile` values (Level 1 identity, a standard-only level, a lethal-tier level, guard at waves 1 / 20 / 25).
3. Implement `enemy-spawn-planner.ts`: one exported entry that dispatches on strategy and returns `{ cells }` or `{ failed: true }`. Test each strategy against a small hand-built world-view, including the exact-count failure path.
4. Implement `wave-scheduler.ts`: queue expansion (fixed + weighted using the injected source), a slot-state model carrying latched eligibility and a `hasEverSpawned` flag, and the earliest-eligible atomic batch selection. Test expansion determinism, each start condition, latching, and the headroom rejection that leaves the slot intact.
5. Run the unit suite for `test/unit/core/waves/**` and the type-check; confirm no import reaches `world.ts`, `GameRuntime`, `RandomStreams`, or presentation.

## Implementation Notes

- **Level formula.** `growth(level) = standardCoefficient * (level - 1)^standardExponent + lethalCoefficient * max(level - (lethalLevelStart - 1), 0)^lethalExponent`. With the authored `lethalLevelStart = 10`, the lethal term is zero below Level 10. HP and damage are `base * (1 + growth)` on their own curves; defense is `base + growth(level)` using the defense curve (added, not multiplied). Level 1 must reproduce the authored base exactly for every stat.
- **Guard projection.** Guard ignores level and offset. Using `guardGrowth` (`standardWaveLimit = 20`, `lethalTierCadence = 5`): guard equals the authored guard base until the standard wave limit, then adds `lethalTierGain` once per completed lethal tier past the limit. Define the tier count so wave 20 is still base tier and wave 21 begins the first added tier; hold this exact boundary because the legacy tier math is off-by-one sensitive.
- **Slot state and latching.** Each slot needs runtime state beyond the authored definition: its remaining queue, whether it has ever spawned, and whether it is latched eligible. Eligibility, once true, is never recomputed to false. `previous-group-cleared` and `previous-group-survivors-at-most` may only be satisfied after the predecessor slot's `hasEverSpawned` is true — an all-empty board before the predecessor spawns must not satisfy them. `immediate-overlap` is eligible from the start.
- **Atomic batch.** Consider only the earliest slot that is both eligible and has a non-empty remaining queue. The batch is that slot's entire remaining queue. Reject (spawn nothing, leave the queue untouched) when `remaining > populationCap - livingEnemyCount`. A later slot never bypasses a blocked earlier slot.
- **Weighted expansion.** For weighted groups, draw `weightedTotalCount` members from the entries by weight using the injected source. The draw must be a pure function of the source's sequence so the same seed reproduces the same composition. Fixed groups expand literally by `count` and ignore the source.
- **Planner determinism.** Enumerate candidate cells in a fixed deterministic order before consuming the seeded source, so the source only breaks ties/selects among an already-ordered candidate set. `player-ring`: Manhattan distance band around the player (short range), spread around the ring. `anchor-cluster`: pick an anchor at mid Manhattan distance, then take the nearest legal cells to it. `scatter`: legal land cells at large. A cell is legal when arena-legal, unoccupied, unreserved, and not the player's cell. Return failure when fewer than N legal cells exist — never return a short list.
- **No hidden globals.** Do not read `Date.now()` or `Math.random()`. All randomness flows through the injected source.

## Edge Cases

| Case                                                     | Expected Handling                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Weighted group with one entry                            | Every drawn member is that entry; still consumes the source deterministically.                           |
| Population cap smaller than a group's expanded size      | Batch is rejected every tick; queue stays intact. (Catalog validation already forbids this for authored waves, but the scheduler must not assume it.) |
| Predecessor slot never spawned yet, board is empty        | `cleared`/`survivors-at-most` slots remain ineligible until the predecessor's `hasEverSpawned` is true.  |
| Level 1 enemy                                            | Projection returns authored base HP, damage, and defense unchanged; guard equals base at wave 1.         |
| Level below lethal start                                 | Lethal growth term is exactly zero; only the standard term applies.                                      |
| Fewer than N legal cells for a strategy                  | Planner returns an explicit failure; it never returns fewer than N cells.                                 |
| Scatter on a board where only the player cell is free    | Failure; the player cell is never a legal spawn cell.                                                     |

## Acceptance Criteria

1. Slot queues expand deterministically: fixed groups by literal count, weighted groups by seeded draw that reproduces under the same source sequence.
2. Slot eligibility latches and never satisfies a cleared/survivor condition before the predecessor has actually spawned.
3. Batch selection is all-or-nothing under population headroom and never lets a later slot bypass a blocked earlier one.
4. Each placement strategy returns exactly N distinct legal cells or an explicit failure, never a partial list, and never the player's cell.
5. Level projection reproduces the authored base at Level 1, applies the two-segment growth to HP/damage/defense, and derives guard from the base wave with the correct tier boundary.
6. No module in `src/core/waves/**` imports `World`, `GameRuntime`, `RandomStreams`, or any presentation module.
