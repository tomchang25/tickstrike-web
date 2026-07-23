# Charge Enemy Rework: Uniform Side Push, Displacement Interrupt, Claimed Targets

Parent Plan: none (standalone spec)

## Goal

Rework the Charge enemy's attack so its collision rules are uniform and legible: everyone on the path is pushed sideways, any pushed enemy loses its windup and drops into recovery, two chargers never claim the same target cell, and simultaneous detonations resolve in a deterministic commit-order sequence instead of implicit entity-list order.

## Summary

The current Charge detonation knocks the final-cell occupant forward while side-pushing everyone else, and when two chargers detonate the same tick their interaction is decided by entity-list iteration order with no cancellation — the source of the reported mutual-charge timing bugs.

This change makes four behavior edits and one ordering edit:

- **Farthest reposition origin.** When a charger cannot attack and must reposition, it now prefers the reachable charge origin farthest from the player (longest run-up), instead of the current "distance ≥ 2 preferred" split. An already-legal attack line still commits immediately, so the charger never retreats when it can attack — this prevents kiting stalemates.
- **Uniform side push.** The forward target knockback is removed. The final-cell occupant is damaged and pushed sideways exactly like every other path occupant, continuing the existing right/left alternation. A final-cell occupant that cannot be pushed (both sides blocked) takes double damage in place and the charger stops short at the last free path cell, preserving today's cornered punish and landing fallback.
- **Displacement interrupts.** Every enemy actually displaced by a charge push is interrupted: its telegraph and committed attack are cancelled — including an attack due to detonate later this same tick — and it resets to `recovering` with its authored recovery duration. Staggered enemies keep their stagger (the punish window is not shortened). This single rule resolves the mutual-charge question: whoever detonates first shoves the other charger off its line and cancels its attack.
- **Claimed target cells.** A charger will not commit or live-retarget a charge whose final cell equals another charger's committed final cell. Since a charge always ends on the player's cell, this serializes chargers: one telegraphs, the other repositions or waits until the claim clears.
- **Commit-order detonation.** Telegraphing enemies resolve in ascending attack-commit tick (stamped at commit), tie-broken by the existing stable entity order. "The one who wound up first hits first" is the player-facing rule; today's behavior only changes when enemies with different warning durations detonate on the same tick.

Landed result: two chargers crossing paths produce a deterministic, readable outcome — the earlier-committed charge fires, the other charger is shoved aside into recovery — and no entity is ever knocked forward.

## Requirements

1. A repositioning charger always walks toward the farthest reachable legal charge origin (water and unreachable cells excluded); an existing legal attack line still commits an attack immediately.
2. Detonation pushes every living occupant on the charge path — including the final cell's occupant — sideways with the existing right/left alternation; forward knockback no longer exists.
3. The final-cell occupant always takes the attack damage; when it cannot be pushed to either side it takes double damage in place and the charger lands on the last free path cell (or its origin), as today.
4. Any enemy displaced by a charge push is reset to `recovering` with its authored recovery duration, its telegraph and committed attack cancelled even when its detonation was due the same tick; staggered enemies are exempt; the player and dead entities are unaffected by this rule.
5. Two charge enemies never hold committed attacks ending on the same cell; both initial targeting and warning-time retargeting respect the claim.
6. When multiple telegraphing enemies detonate on the same tick, the one whose attack was committed on an earlier tick resolves first; ties preserve today's stable entity order, keeping same-seed runs deterministic.

## Relational Context

- `resolveEnemyPhase` (`src/core/actions/enemy-phase.ts`) owns detonation iteration and must stay role-free: the ordering change is a role-agnostic sort of telegraphing enemies by commit tick, never a charge-specific branch. The interrupt rule lives in the charge behavior module, not in the phase.
- The detonation loop re-reads each enemy via `context.getEntity` and skips any whose `activity` is no longer `"telegraphing"` — this existing guard is what makes "interrupt cancels a same-tick detonation" work with no extra bookkeeping. Do not restructure it.
- `recoveringAtStart` is snapshotted before detonations, so an enemy interrupted into `recovering` this phase does not tick its recovery down until the next phase. This is the intended full-duration recovery, not a bug.
- `CombatOperations` (`src/core/world/combat-operations.ts`) is the sole owner of the enemy activity state machine; the new interrupt capability lands there (clearing reservation, telegraph, and committed attack together, mirroring the existing stagger transition) and is reached through `context.combat` per the facade-freeze rule — no new `World` facade method.
- `CombatOperations` has no clock; stamping the commit tick requires extending `CombatWorldAccess` with a current-tick read supplied by `World`'s adapter. `CommittedAttack.warningTicks` is remaining-count and cannot recover commit order.
- The detonation policy runs against the staged transaction view and `transaction.commit()` applies moves and damage atomically; the interrupt calls must happen after commit (the displaced entities' final cells are then live), before event construction, in the charge behavior's resolve step.
- `EnemyDecisionContext` (`src/core/enemies/enemy-behavior.ts`) is deliberately narrow; the claim check adds one role-agnostic read — the committed attacks of other telegraphing enemies — built by `enemy-phase` from `listEntities`. The charge behavior filters by role and final cell itself.
- `chargeLiveRetarget` validates geometry only; the claim check on retarget belongs in `chargeEnemyBehavior.retarget`, which has the full `EnemyPhaseContext` and can read other entities directly.
- `entity_displaced.cause` (`src/core/events/combat-events.ts`) loses `"charge_target_knockback"`; every charge push emits `"charge_side_push"`. `normalizeMotionEvents` in the presentation director consumes only the event type, so this is type-level cleanup, but the follow-up knockback-feel spec depends on the reduced vocabulary.
- Committed attacks appear in determinism golden fixtures (`test/unit/determinism/__golden__/charge-enemy.json`); the new optional commit-tick field and any event-order change alter goldens, which must be regenerated deliberately and reviewed line by line, never refreshed to make tests pass.
- Interrupted enemies reuse the existing `telegraph_changed` (cleared) and `enemy_recovering` events; no new event type.

## Scope

### Included

- Farthest-origin reposition preference, uniform side-push detonation policy, displacement interrupt, target-cell claims, and commit-order detonation sorting.
- Commit-tick stamp on committed attacks and the tick read on the combat subsystem's world access.
- Unit, scenario, and golden coverage for the new rules.

### Excluded

- A shared forced-displacement contract across Smash/spawn/Charge (stays in `TODO.md` Future Draft); this interrupt rule is charge-push-only.
- Presentation changes (separate spec: `charge_knockback_feel.implementation_spec.md`).
- Fixing the pre-existing broken e2e harness (`TODO.md` Bug tier); the charge e2e spec is not a gate here.
- Player state effects from displacement (the player has no windup to cancel).

## Files to Change

| File                                              | Change Size | Purpose                                                                                     |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                         | Small       | Optional commit-tick field on `CommittedAttack`                                             |
| `src/core/world/combat-operations.ts`             | Medium      | Stamp commit tick; new displacement-interrupt capability; `CombatWorldAccess` tick read     |
| `src/core/world/world.ts`                         | Small       | Supply the current tick through the combat world-access adapter                             |
| `src/core/enemies/enemy-behavior.ts`              | Small       | `EnemyDecisionContext` gains the other-committed-attacks read                               |
| `src/core/actions/enemy-phase.ts`                 | Medium      | Sort detonations by commit tick; supply the new decide-context read                         |
| `src/core/enemies/behaviors/charge-enemy.ts`      | Large       | Farthest-origin ordering; detonation policy rewrite; claim checks; post-commit interrupts   |
| `src/core/events/combat-events.ts`                | Small       | Drop the `charge_target_knockback` cause                                                    |
| `test/unit/core/enemies/charge-enemy-actions.test.ts` | Large   | Rewrite coverage for the new policy, interrupts, claims, and ordering                       |
| `test/unit/harness/charge-enemy.scenario.test.ts` | Medium      | Scenario updates for the new detonation results                                             |
| `test/unit/determinism/__golden__/charge-enemy.json` | Medium   | Deliberate regeneration after behavior review                                               |

## Execution Outline

1. Add the optional commit-tick field to `CommittedAttack`, the tick read to `CombatWorldAccess` (wired in `World`'s adapter), and the stamp in `commitEnemyAttack`. Run existing tests — nothing behavioral changes yet.
2. Add the interrupt capability to `CombatOperations` with focused unit coverage: enemy in each activity state, staggered exemption, recovering-timer refresh, dead/player no-op.
3. Sort the detonation loop in `enemy-phase` by (commit tick, stable order). Run the determinism suite; review and regenerate goldens only if ordering actually shifts in the golden scenario.
4. Rewrite `chargeDetonationPolicy`: extend the side-push alternation over the full path including the final cell; final-cell occupant gets damage plus push, or double damage plus the existing landing fallback when unpushable; drop the forward-knockback branch and the `charge_target_knockback` cause.
5. After `transaction.commit()`, interrupt every displaced enemy via `context.combat` and append the cleared-telegraph and recovering events; update `chargeResolutionEvents` accordingly.
6. Reorder `chargeOriginCells`/`chargeMovementCandidates` to farthest-first (drop the primary/fallback split and `CHARGE_PREFERRED_MIN_RANGE` if nothing else consumes it).
7. Add the other-committed-attacks read to `EnemyDecisionContext` (built in `enemy-phase`), apply the claim filter in `decide`, and the claim guard in `retarget`.
8. Update the behavior unit tests and the scenario test; regenerate the charge golden deliberately and review the event-stream diff line by line; run `npm run verify`.

## Implementation Notes

- Interrupt semantics: alive enemy with an action, any activity except `staggered` → release reservation, clear telegraph, `activity: "recovering"`, `recoveryTicks` = the enemy's authored `enemyAction.recoveryTicks`, `committedAttack`/`restTicks` cleared. Already-recovering enemies get their timer refreshed to full. Return enough information (had-telegraph, recovery ticks, whether anything changed) for the caller to emit events; the capability itself emits nothing, matching the subsystem's existing style.
- The interrupt applies to entities with a staged move that committed (`displacements[].to` present, and the pushed final-cell occupant). Blocked-in-place occupants took damage but were not displaced — they keep their windup by design.
- Claim comparison is by committed final cell against the candidate path's final cell, role-filtered to charge. Stale claims (player moved, other charger could not retarget) compare unequal and correctly allow both.
- Event order within one resolution: keep the existing shape (detonated → blocked-damage → impact → displacements → interrupts' `telegraph_changed`/`enemy_recovering` → landed → telegraph cleared → recovering) so presentation batching stays stable; goldens will pin the final order.
- This change touches deterministic ordering and damage/displacement interleaving: per the repository model-tier rule it needs an Opus/Fable-class implementer or a reviewed same-seed event-sequence comparison; green tests alone are not sufficient evidence.

## Edge Cases

| Case                                                                    | Expected Handling                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Two chargers detonate the same tick, one standing on the other's path   | Earlier-committed charge resolves first; the other is pushed aside, cancelled, and recovers    |
| Head-on chargers, both committed the same tick                          | Stable entity order breaks the tie; outcome identical across same-seed runs                    |
| Final-cell occupant with both sides blocked                             | Double damage in place; charger lands on last free path cell or its origin                     |
| Displaced enemy was already recovering                                  | Recovery timer refreshed to its full authored duration                                         |
| Displaced enemy is staggered                                            | Stays staggered; no state change                                                               |
| Pushed final-cell occupant dies from the damage                         | Interrupt no-ops on the dead entity; landing on the freed cell proceeds                        |
| Earlier charge pushed some entity onto a later charge's committed path  | The later detonation resolves against live occupancy: pushes it aside or applies blocked rules |
| Both chargers want the player's current cell                            | First to decide claims it; the other repositions toward a far origin or waits                  |
| Charger in range at distance 1                                          | Attacks immediately; farthest-origin preference applies only when repositioning                |

## Acceptance Criteria

1. A charge enemy that cannot attack walks toward the farthest reachable charge origin rather than the nearest.
2. On detonation, every occupant along the charge path — including the final cell — is pushed sideways; nothing is ever knocked forward.
3. A cornered final-cell occupant takes double damage in place and the charger stops short of it.
4. Any enemy displaced by a charge loses its telegraph and committed attack — even one due to fire the same tick — and enters recovery at its full authored duration; staggered enemies are unaffected.
5. No two charge enemies ever display telegraphs ending on the same cell.
6. Simultaneous detonations resolve earlier-committed-first, and same-seed runs produce byte-identical event streams.
7. Unit and scenario suites pass, the regenerated determinism golden is reviewed and intentional, and canonical non-browser verification passes.
