# Explicit Time Order 01: Linear Slot Resolution

Parent Plan: `explicit_time_order.md`

## Goal

Collapse the enemy phase's global passes into one linear pass: each living enabled enemy resolves everything — warning, detonation, statuses, recovery, rest, decision, movement — at its own slot in stable spawn order, making slot order the only intra-tick ordering truth and retiring commit-order detonation.

## Summary

Today `resolveEnemyPhase` runs five global sweeps: detonations (sorted by commit tick), status advancement, recovery, rest, then decisions plus a simultaneous-movement auction. Interrupts exposed the fact that these sweeps hide two different intra-tick orders (commit order for detonations, entity order for everything else). The parent plan's order bar can only display a truthful order once the logic holds exactly one.

This child restructures the phase into a single pass over the living enabled enemies in `listEntities()` order (Map insertion order = spawn order). At its slot, an enemy resolves from live state using today's per-enemy rules — only the cross-enemy interleaving changes:

- **Commit-order detonation retires.** Same-tick detonations resolve in slot order; `CommittedAttack.commitTick`, its stamp, and `byCommitOrder` are deleted. This deliberately supersedes the commit-order rule from `charge_enemy_rework.implementation_spec.md`.
- **The movement auction retires.** Sequential slots have no simultaneity: each mover walks its candidate list against live walkability at its slot and moves immediately; contested cells go to the earlier slot.
- **Statuses advance per enemy** via a new per-id `CombatOperations` capability replacing the global loop, with identical events.
- **Claims read live.** The static `standingCommitments` snapshot and the `decidedAttacksThisPhase` accumulator are replaced by reading other entities' committed attacks at each deciding slot, which also fixes stale claims after a same-tick interrupt.
- Transition semantics are preserved exactly: stagger→ready and rest→ready never act the same tick, recovery→ready decides at that same slot, and a same-tick interrupt victim serves its full authored recovery (n−1 when it was already recovering).

Landed result: the event stream groups per actor per slot, same-seed runs stay byte-identical, and goldens are regenerated in reviewable stages (ordering-rule change first, structural regrouping second).

## Relational Context

- `action-resolver` calls `world.advancePlayerAction()` (tick increments) and then `resolveEnemyPhase(world)`; the player's slot is the player round itself, so this child touches only the enemy phase.
- Canonical order is `listEntities()` order: the entity Map's insertion order, which is spawn order. `World.snapshot().entities` preserves the same order, so child 02 derives the bar from the existing snapshot — do not add an order field or any new snapshot surface.
- `resolveEnemyPhase` must stay role-free: the linear pass never adds a role-specific branch, and the behavior hooks (`decide`, `retarget`, `resolveAttack`) keep their signatures and call sites unchanged.
- The three phase-start snapshots (`readyAtStart`, `recoveringAtStart`, `restingAtStart`) carry the preserved transition semantics and survive the rework; the per-slot re-read guard (skip when the entity is dead or its activity no longer matches) is what makes an earlier slot's interrupt cancel a later same-tick detonation — keep both patterns.
- `CombatOperations.advanceEnemyStatuses` is a global loop (stagger countdown, stand-up with guard refill plus protection start, protection countdown). Its only production caller is the phase (via a `World` forwarder), so it is replaced by a per-id equivalent emitting identical events, not duplicated. The now-dead `World.advanceEnemyStatuses` forwarder goes with it; `knip` flags leftovers.
- `board.requestMovementReservations` likewise has the phase as its only production caller. Retiring the auction may orphan the multi-claim API and the `World` forwarder — delete what actually becomes dead, verify with `npm run check:unused` rather than assuming.
- `CommittedAttack.commitTick` (`src/core/model/types.ts`), the stamp in the phase's attack branch, and `byCommitOrder` are the only `src/` traces of commit ordering; goldens carry the field through `enemy_attack_committed.attack`, so removing it alone rewrites goldens before any ordering shift.
- The interleaving change is real approved behavior, not noise: an early-slot mover can now step onto a later slot's committed charge path and be pushed or damaged, and contested cells resolve by slot instead of auction policy. Review golden diffs (`charge-enemy`, `waves`, and any others that shift) line by line against the parent plan's rules; never regenerate to make tests pass.
- `PresentationDirector` consumes the recorded per-tick event stream in order; per-slot grouping changes batch composition. Treat director test diffs as review surface for child 02's playback assumptions, not as incidental churn.
- Baseline: the staged charge rework (uniform side push, displacement interrupt via `combat.interruptDisplacedEnemy`, claimed targets, commit-order detonation) lands before this child; this spec is written against that state.
- Per the repository model-tier rule this change touches deterministic ordering and damage/displacement interleaving: Opus/Fable-class implementer, one Execution Outline step per session with tests green before each commit, and a same-seed event-sequence review — green tests alone are not sufficient evidence.

## Scope

### Included

- Single linear slot pass over enemies in spawn order; retirement of the commit-order sort, the movement auction, and the static claim snapshot.
- Per-enemy status-advance capability in `CombatOperations`.
- Removal of `CommittedAttack.commitTick`.
- Unit, scenario, presentation, and golden coverage for the new ordering.

### Excluded

- All presentation and UI (order bar, pacing, highlights) — child 02.
- Speed/initiative or any reorder mechanic; spawn/wave-phase changes; player-side changes; balance numbers.
- The charge rework itself (baseline, not content).

## Files to Change

| File                                                             | Change Size | Purpose                                                                      |
| ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `src/core/actions/enemy-phase.ts`                                | Large       | Single linear slot pass; retire commit sort, movement auction, static claims |
| `src/core/world/combat-operations.ts`                            | Small       | Per-enemy status advance replacing the global loop                           |
| `src/core/world/world.ts`                                        | Small       | Drop forwarders orphaned by the phase rework                                 |
| `src/core/model/types.ts`                                        | Small       | Remove optional `commitTick`                                                 |
| `test/unit/core/actions/enemy-phase.test.ts`                     | Large       | Slot-order coverage replaces commit-order coverage                           |
| `test/unit/core/enemies/*-actions.test.ts`                       | Medium      | Interleaving and contested-cell expectations                                 |
| `test/unit/core/world/world.test.ts`                             | Small       | commitTick and forwarder traces                                              |
| `test/unit/harness/charge-enemy.scenario.test.ts`                | Small       | Ordering expectations                                                        |
| `test/unit/presentation/timelines/presentation-director.test.ts` | Medium      | Per-slot grouped event stream                                                |
| `test/unit/determinism/__golden__/*.json`                        | Medium      | Two-stage deliberate regeneration after review                               |

## Execution Outline

1. Retire commit-order detonation first, inside the old five-pass shape: remove the `commitTick` stamp, `byCommitOrder`, and the model field; sweep test traces; regenerate goldens. This isolates the ordering-rule change (same-tick detonations move to stable entity order — already the new slot order) from the later structural regrouping.
2. Add the per-id status-advance capability to `CombatOperations` with focused unit coverage (stagger countdown, stand-up with guard refill and protection start, protection countdown and end, no-op for non-guard/dead/player), asserting event parity with the global loop before it is removed.
3. Rewrite `resolveEnemyPhase` as the linear slot pass, preserving the phase-start snapshots and re-read guards; retire the movement auction and the static claim snapshot in the same step (they are load-bearing parts of the old shape and cannot survive it piecemeal); drop forwarders and APIs that `check:unused` confirms dead. Update phase, enemy, scenario, and director tests; regenerate goldens isolating the interleaving regrouping.
4. Full sweep: `npm run verify`, line-by-line review of both golden diffs against the parent plan's rules, same-seed event-sequence comparison documented in the closeout.

## Implementation Notes

- Slot resolution reads the enemy fresh at its slot and dispatches on its current activity: telegraphing → retarget, decrement warning, detonate at zero; staggered/protected → per-id status advance; recovering (only if in `recoveringAtStart`) → advance, and on reaching ready decide and act at this same slot; resting (only if in `restingAtStart`) → advance, no action this tick; ready (only if in `readyAtStart` or recovered this slot) → decide and act. Protection ticks down for any non-staggered activity holder, as the global loop does today.
- Movement at a slot: walk the decision's candidate list against live `isWalkable`, move on the first legal candidate, `enemy_waited` when none remain. No reservation round-trips.
- Deciding slots build `otherCommittedAttacks` from a live `listEntities()` read excluding the decider; this replaces both the static snapshot and the accumulator, and intentionally lets a same-tick interrupt free a claimed cell for a later decider.
- Event emission order within the phase is simply the slot visitation order; do not buffer or re-sort events per type — the per-slot grouping is the product.

## Edge Cases

| Case                                                                | Expected Handling                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Enemy killed at an earlier slot                                     | Its slot is skipped entirely by the re-read guard                                      |
| Telegraphing victim interrupted at an earlier slot, warning was due | No detonation; recovering at full authored duration; no recovery tick at its own slot  |
| Enemy already recovering when interrupted this tick                 | Timer refreshed, then ticked once at its own slot (serves n−1, charge rework contract) |
| Two movers target the same cell                                     | Earlier slot moves; the later one falls to its next candidate or waits                 |
| Early mover steps onto a later slot's committed charge path         | The later detonation resolves against live occupancy: pushes or damages the mover      |
| Stagger ends at the enemy's own slot                                | Stands up, protection starts; no action until next tick                                |
| Recovery ends at the enemy's own slot                               | Decides and acts at that same slot                                                     |
| Rest ends at the enemy's own slot                                   | No action until next tick                                                              |
| Enemy commits an attack at its slot                                 | Every later deciding slot sees the claim through the live read                         |

## Acceptance Criteria

1. Within a tick, each enemy's warning countdown, detonation, status advancement, decision, and movement all resolve at its single slot in stable spawn order, and the emitted event stream groups per actor in that order.
2. Same-tick detonations resolve in slot order and no commit-time ordering survives anywhere.
3. Transition semantics are preserved: stagger→ready and rest→ready never act in the same tick, recovery→ready acts at its own slot, and same-tick interrupt victims serve their full authored recovery (one less when already recovering).
4. Movement contention deterministically favors the earlier slot.
5. Unit, scenario, presentation, and determinism suites pass; both staged golden regenerations are reviewed and intentional; same-seed runs remain byte-identical.
