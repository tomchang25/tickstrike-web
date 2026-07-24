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
5. An interrupted enemy emits the existing `enemy_attack_interrupted` event so its running prepare-action animation is cleared, not left looping.
6. Two charge enemies never hold committed attacks ending on the same cell; both initial targeting and warning-time retargeting respect the claim.
7. When multiple telegraphing enemies detonate on the same tick, the one whose attack was committed on an earlier tick resolves first; ties preserve today's stable entity order, keeping same-seed runs deterministic.

## Relational Context

- `resolveEnemyPhase` (`src/core/actions/enemy-phase.ts`) owns detonation iteration and must stay role-free: the ordering change is a role-agnostic sort of telegraphing enemies by commit tick, never a charge-specific branch. The interrupt rule lives in the charge behavior module, not in the phase.
- The detonation loop re-reads each enemy via `context.getEntity` and skips any whose `activity` is no longer `"telegraphing"` — this existing guard is what makes "interrupt cancels a same-tick detonation" work with no extra bookkeeping. Do not restructure it.
- `recoveringAtStart` is snapshotted before detonations, so an enemy that was **not** already recovering — the common case, a telegraphing victim — is interrupted into `recovering` without ticking down this phase, and keeps its full authored duration. An enemy that **was** already recovering is in that snapshot, so its refreshed timer is decremented once later in the same phase and it effectively serves `recoveryTicks - 1`. Both outcomes are accepted; do not "fix" the asymmetry by moving the snapshot, which would change unrelated recovery timing across every role.
- `CombatOperations` (`src/core/world/combat-operations.ts`) is the sole owner of the enemy activity state machine; the new interrupt capability lands there (clearing reservation, telegraph, and committed attack together, mirroring the existing `applyDirectionalHit` stagger transition) and is reached through `context.combat` per the facade-freeze rule — no new `World` facade method.
- The commit tick needs no new subsystem plumbing: `EnemyPhaseContext extends WorldView`, which already exposes `readonly tick`, and `action-resolver` calls `world.advancePlayerAction()` (which increments the tick) before `resolveEnemyPhase`. `enemy-phase` is the only production caller of `commitEnemyAttack`, so it stamps `context.tick` onto the payload it already builds with `committedAttackFromDecision`. `CombatWorldAccess` and `World`'s adapter stay untouched. `CommittedAttack.warningTicks` is remaining-count and cannot recover commit order.
- Directly-committed attacks from the harness and unit tests (`world.commitEnemyAttack`, e.g. `src/harness/scenarios/mobility-combat.scenario.ts`) carry no commit tick. The sort must treat an absent stamp as earliest so those keep today's stable entity-order behavior, and the field stays optional.
- The detonation policy runs against the staged transaction view and `transaction.commit()` applies moves, then damage, then puts the resolving charger into recovery at its staged landing. `chargeDetonationPolicy` receives only the transaction, not the phase context, so the interrupt calls belong in `chargeEnemyBehavior.resolveAttack` after `resolveChargeAttack` returns — the returned `displacements` already name every entity that actually moved. Keep the policy free of `context`.
- `EnemyDecisionContext` (`src/core/enemies/enemy-behavior.ts`) is deliberately narrow; the claim check adds one role-agnostic read — the committed attacks of other telegraphing enemies — built by `enemy-phase` from `listEntities`. The charge behavior filters by role and final cell itself.
- `chargeLiveRetarget` validates geometry only; the claim check on retarget belongs in `chargeEnemyBehavior.retarget`, which has the full `EnemyPhaseContext` and can read other entities directly.
- `entity_displaced.cause` (`src/core/events/combat-events.ts`) loses `"charge_target_knockback"`; every charge push emits `"charge_side_push"`. `normalizeMotionEvents` in the presentation director consumes only the event type, so this is type-level cleanup, but the follow-up knockback-feel spec depends on the reduced vocabulary.
- `enemy_attack_interrupted` already exists and is emitted by `player-actions` on a stagger burst. `GenericEnemyPresenter.attackInterrupted` clears the action presentation, which is what stops the prepare animation started by `enemy_attack_committed` (both landed after this spec was first written). The charge interrupt must emit it for the same reason; still no new event type.
- Committed attacks appear in determinism golden fixtures (`test/unit/determinism/__golden__/charge-enemy.json`) through `enemy_attack_committed.attack`, so the new commit-tick field alone rewrites goldens even before any ordering change. Regenerate with `npm run golden:update` deliberately and review line by line, never to make tests pass.
- Baseline: the `[enemy_balance]` timing nerf lands as its own change ahead of this spec (Bomb 5, Ranged 4/2, Charge 3/2), with the charge golden already regenerated against it. This spec assumes that baseline; do not re-derive the rework's golden diff from the pre-nerf stream.
- That nerf makes commit-order detonation matter far more than it did when this spec was written. Authored windups now span 2 (Thrust, Slash), 3 (Charge), 4 (Ranged), and 5 (Bomb), so same-tick detonations by enemies with different warning durations are common rather than incidental. Expect the ordering sort in step 3 to shift the golden event stream on its own, and review that shift as real behavior rather than noise.
- The nerf also lengthened the charge harness scenario by one command: `src/harness/scenarios/charge-enemy.scenario.ts` and its test now hold the Player in place with a fourth in-place command so the 3-tick windup still detonates at (4,3). That sequence stays valid here (this spec does not touch windup), but the scenario's doc comment, harness `description`, and test assertions all still describe forward "target knockback from (4,3) to (3,3)" and must be rewritten to the side push.
- Concretely for that scenario: the charger faces `{x:-1,y:0}`, so "right" is `{x:0,y:-1}`. The path `(8,3)…(4,3)` gives the blocker at index 0 a push to (8,2) (unchanged) and the final-cell Player at index 4 an even-parity push to (4,2) instead of (3,3). `enemy-side-blocker` is a `training-grunt` with no `enemyAction`, so the interrupt correctly no-ops on it.

## Scope

### Included

- Farthest-origin reposition preference, uniform side-push detonation policy, displacement interrupt, target-cell claims, and commit-order detonation sorting.
- Commit-tick stamp on committed attacks, applied where the enemy phase already builds the commit payload.
- Unit, scenario, and golden coverage for the new rules.

### Excluded

- A shared forced-displacement contract across Smash/spawn/Charge (stays in `TODO.md` Future Draft); this interrupt rule is charge-push-only.
- Presentation changes (separate spec: `charge_knockback_feel.implementation_spec.md`), and recovery/stagger overlay VFX (owned by port 13.4).
- The `[enemy_balance]` enemy action-timing nerf itself; it lands as its own change and is this spec's baseline, not its content.
- Ranged targeting/facing behavior; any change there is its own item with its own unit-test and golden review.
- Fixing the pre-existing broken e2e harness (`TODO.md` Bug tier); the charge e2e spec is not a gate here.
- Player state effects from displacement (the player has no windup to cancel).

## Files to Change

| File                                                  | Change Size | Purpose                                                                                    |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `src/core/model/types.ts`                             | Small       | Optional `commitTick` field on `CommittedAttack`                                           |
| `src/core/world/combat-operations.ts`                 | Medium      | New displacement-interrupt capability on the activity state machine                        |
| `src/core/enemies/enemy-behavior.ts`                  | Small       | `EnemyDecisionContext` gains the other-committed-attacks read                              |
| `src/core/actions/enemy-phase.ts`                     | Medium      | Stamp the commit tick; sort detonations by commit tick; supply the new decide-context read |
| `src/core/enemies/behaviors/charge-enemy.ts`          | Large       | Farthest-origin ordering; detonation policy rewrite; claim checks; post-commit interrupts  |
| `src/core/events/combat-events.ts`                    | Small       | Drop the `charge_target_knockback` cause                                                   |
| `test/unit/core/enemies/charge-enemy-actions.test.ts` | Large       | Rewrite coverage for the new policy, interrupts, claims, and ordering                      |
| `src/harness/scenarios/charge-enemy.scenario.ts`      | Small       | Doc comment and harness `description` still describe forward target knockback              |
| `test/unit/harness/charge-enemy.scenario.test.ts`     | Medium      | Scenario updates for the new detonation results (the case name still says "knockback")     |
| `test/unit/determinism/__golden__/charge-enemy.json`  | Medium      | Deliberate regeneration after behavior review                                              |

`src/core/world/world.ts` is deliberately not in this list: the commit tick comes from the phase context, so neither the `World` facade nor `CombatWorldAccess` changes.

## Execution Outline

1. Add the optional `commitTick` to `CommittedAttack` and stamp it in `enemy-phase`'s attack branch from `context.tick`, alongside the existing `committedAttackFromDecision` payload. Run existing tests, then regenerate goldens for the field alone so the stamp lands as its own reviewable diff.
2. Add the interrupt capability to `CombatOperations` with focused unit coverage: enemy in each activity state, staggered exemption, recovering-timer refresh, dead/player no-op.
3. Sort the detonation loop in `enemy-phase` by (`commitTick ?? -Infinity`, stable order) with a stable sort. Run the determinism suite; with the post-nerf windup spread (2/3/4/5) expect a real ordering shift in the `waves` and `rewards` goldens as well as `charge-enemy`, and review each reordered detonation against the "wound up first hits first" rule before regenerating.
4. Rewrite `chargeDetonationPolicy`: run the side-push alternation over the full `attack.cells` path including the final cell (index parity is unchanged for the earlier cells); the final-cell occupant takes damage plus a side push, or double damage plus the existing landing fallback when unpushable; drop the forward-knockback branch, the `from`/`to` fields on `ChargeImpactResult`, and the `charge_target_knockback` cause.
5. In `chargeEnemyBehavior.resolveAttack`, after `resolveChargeAttack` returns, interrupt every displacement with a committed `to` via `context.combat`, and pass the interrupt outcomes into `chargeResolutionEvents` so the events land in the specified order.
6. Reorder `chargeOriginCells`/`chargeMovementCandidates` to farthest-first (drop the primary/fallback split and `CHARGE_PREFERRED_MIN_RANGE`, whose only consumer is that split; keep `CHARGE_MIN_RANGE`).
7. Add the other-committed-attacks read to `EnemyDecisionContext` (built in `enemy-phase`'s `decideEnemyAction` call), apply the claim filter in `decide`, and the claim guard in `retarget`.
8. Update the behavior unit tests, the harness scenario source (doc comment and `description`), and the scenario test — the Player's post-detonation cell becomes (4,2), not (3,3). Regenerate the goldens deliberately, review the event-stream diff line by line, and run `npm run verify`.

## Implementation Notes

- Interrupt semantics: alive enemy with an action, any activity except `staggered` → release reservation, clear telegraph, `activity: "recovering"`, `recoveryTicks` = the enemy's authored `enemyAction.recoveryTicks`, `committedAttack`/`restTicks`/`staggerTicks` cleared. Already-recovering enemies get their timer refreshed to full at this layer (the phase then decrements it once — see the `recoveringAtStart` note above). The result is a discriminated union: the `changed: true` arm carries had-telegraph, had-committed-attack, and the applied recovery ticks, so callers that narrow on `changed` need no fallback; the capability itself emits nothing, matching the subsystem's existing style.
- The interrupt applies to entities with a staged move that committed (`displacements[].to` present, which now includes the pushed final-cell occupant). Blocked-in-place occupants took damage but were not displaced — they keep their windup by design.
- Claim comparison is by committed final cell against the candidate path's final cell, role-filtered to charge. Stale claims (player moved, other charger could not retarget) compare unequal and correctly allow both.
- Event order within one resolution: detonated → blocked-damage → impact → displacements → per-interrupt (`enemy_attack_interrupted`, `telegraph_changed` cleared, `enemy_recovering`) → landed → the charger's own `telegraph_changed` cleared → `enemy_recovering`. Keeping interrupts before the landing preserves presentation batching; goldens pin the final order.
- Emit `enemy_attack_interrupted` only when the interrupted enemy actually had a committed attack or telegraph, matching the guard `player-actions` already uses for the stagger-burst case.
- With the target now side-pushed, the common case is the player being shoved out of the charge lane rather than knocked further away; `charge_impact.outcome` keeps its `empty`/`normal`/`blocked` vocabulary and the presenter needs no change.
- This change touches deterministic ordering and damage/displacement interleaving: per the repository model-tier rule it needs an Opus/Fable-class implementer or a reviewed same-seed event-sequence comparison; green tests alone are not sufficient evidence.

## Edge Cases

| Case                                                                   | Expected Handling                                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Two chargers detonate the same tick, one standing on the other's path  | Earlier-committed charge resolves first; the other is pushed aside, cancelled, and recovers                                 |
| Head-on chargers, both committed the same tick                         | Stable entity order breaks the tie; outcome identical across same-seed runs                                                 |
| Committed attack with no commit-tick stamp (harness/test injection)    | Sorts as earliest, preserving today's stable entity order                                                                   |
| Final-cell occupant with both sides blocked                            | Double damage in place; charger lands on last free path cell or its origin                                                  |
| Displaced enemy was already recovering                                 | Timer refreshed to full, then decremented once this phase (it was in `recoveringAtStart`), so it serves `recoveryTicks - 1` |
| Displaced enemy is staggered                                           | Stays staggered; no state change, no interrupt event                                                                        |
| Interrupted enemy was mid prepare-action animation                     | `enemy_attack_interrupted` clears the action presentation; no lingering windup loop                                         |
| Pushed final-cell occupant dies from the damage                        | Interrupt no-ops on the dead entity; landing on the freed cell proceeds                                                     |
| Earlier charge pushed some entity onto a later charge's committed path | The later detonation resolves against live occupancy: pushes it aside or applies blocked rules                              |
| Both chargers want the player's current cell                           | First to decide claims it; the other repositions toward a far origin or waits                                               |
| Charger in range at distance 1                                         | Attacks immediately; farthest-origin preference applies only when repositioning                                             |

## Acceptance Criteria

1. A charge enemy that cannot attack walks toward the farthest reachable charge origin rather than the nearest.
2. On detonation, every occupant along the charge path — including the final cell — is pushed sideways; nothing is ever knocked forward.
3. A cornered final-cell occupant takes double damage in place and the charger stops short of it.
4. Any enemy displaced by a charge loses its telegraph and committed attack — even one due to fire the same tick — and enters recovery at its full authored duration (an enemy already recovering when it was pushed serves one tick less, per the `recoveringAtStart` note); staggered enemies are unaffected.
5. An interrupted enemy's prepare animation stops, driven by `enemy_attack_interrupted`.
6. No two charge enemies ever display telegraphs ending on the same cell.
7. Simultaneous detonations resolve earlier-committed-first, and same-seed runs produce byte-identical event streams.
8. Unit and scenario suites pass, the regenerated determinism golden is reviewed and intentional, and canonical non-browser verification passes.
