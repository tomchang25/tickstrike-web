# Shape-Driven Enemy Navigation and Enemy API Cleanup

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Align the shared enemy navigation contract with the reference implementation and remove the temporary basic-enemy compatibility surface. Enemies must derive attack positions from authored attack shapes, use deterministic grid search to reach those positions, and retry another movement candidate when a contested first step loses arbitration.

## Summary

The current Web decision helper uses a local chase-direction fallback and the previous port retains aliases for the former basic-enemy API. This child replaces that navigation policy with reference-aligned shape-derived attack origins and bounded deterministic BFS while keeping the Web-native one-Tick action boundary.

The file `basic-enemy-actions.ts` becomes `enemy-actions.ts`; all compatibility aliases for `BasicEnemyDecision`, `BasicEnemyDecisionContext`, `decideBasicEnemyAction`, and `BasicEnemyActionDefinition` are removed. Movement candidates are collected without mutating World state, contested first steps are arbitrated in rounds, and a losing enemy retries its next candidate in the same movement action before recording `enemy_waited`.

## Relational Context

- Authored enemy action offsets remain immutable content data. `enemy-actions.ts` transforms those offsets for each cardinal facing and derives enemy origin cells that can include the current player cell.
- `enemy-path-planner.ts` is stateless pure search. It reads explicit legality, traversal, and endpoint predicates supplied by the enemy decision boundary and never mutates World, reservations, entities, or presentation.
- `resolveEnemyPhase()` reads the post-player-action World snapshot, collects one decision per eligible enemy in stable entity order, then asks World to arbitrate only immediate movement claims. World remains authoritative for occupancy, reservations, placement, activity, and terminal cleanup.
- A movement path is a planning result, not a committed multi-Tick action. Only one cell may be applied for one enemy in one accepted player Tick; later Ticks replan from the new cell.
- Attack commitment continues through World and stores the locked cells, damage, warning, recovery, kind, role, and metadata. Player movement after commitment changes only hit membership, never the locked snapshot.
- Presentation consumes the resulting semantic events and final snapshots. It does not perform BFS, choose a winner, retry a path, or retain logical path state.
- The reference implementation's Godot state machine, signals, active path lifecycle, and scene ownership are not ported; only the observable shape-derived planning and deterministic reservation behavior are ported.

## Scope

### Included

- Remove the basic-enemy compatibility aliases and rename the shared action module.
- Derive attack-origin candidates from local attack offsets for every cardinal facing.
- Add deterministic bounded BFS for attack-origin and ordinary approach planning.
- Retry contested movement candidates within one movement arbitration phase.
- Preserve the shared one-action Tick, locked attack, event ordering, cleanup, and Thrust/Slash behavior.
- Add unit and browser regression coverage for shape-derived navigation, contention retry, and idle cleanup.

### Excluded

- Ranged, Charge, Bomb, Mode, or Boss-specific decisions.
- Multi-cell movement in one Tick, persistent path commitments, or general weighted pathfinding.
- Godot lifecycle, state-machine, signal, or scene inheritance patterns.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/enemies/basic-enemy-actions.ts` | Delete / Rename | Replace the basic-only module with `enemy-actions.ts`. |
| `src/core/enemies/enemy-actions.ts` | Large | Own role-neutral action geometry, attack-origin derivation, and movement candidate decisions. |
| `src/core/enemies/enemy-path-planner.ts` | Medium | Provide pure deterministic BFS and path reconstruction. |
| `src/core/model/types.ts` | Medium | Remove the BasicEnemyActionDefinition alias and expose role-neutral movement candidates. |
| `src/core/actions/enemy-phase.ts` | Large | Collect decisions, arbitrate movement in retry rounds, and apply one winner per enemy. |
| `src/core/world/world.ts` | Medium | Support atomic movement-round claims and preserve cleanup/invariant enforcement. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Use the renamed role-neutral action type without changing fixture identity. |
| `test/unit/core/enemies/enemy-actions.test.ts` | Rename / Large | Cover shape-derived origins, BFS candidates, and role-neutral actions. |
| `test/unit/core/world/reservations.test.ts` | Medium | Cover retry rounds, deterministic priority, atomic claims, and cleanup. |
| `test/unit/core/actions/action-resolver.test.ts` | Medium | Preserve one-action, rejection, lock, and event-order behavior. |
| `test/e2e/testbed.spec.ts` | Small | Preserve browser-visible Thrust/Slash behavior and presentation idle after movement/telegraph activity. |

## Execution Outline

1. Rename the shared action module and migrate every production and test import; remove all BasicEnemy compatibility aliases and update the role-neutral runtime type references.
2. Add pure attack-origin derivation and deterministic BFS that ranks reachable attack origins and returns immediate movement candidates while retaining ordinary approach fallback when no attack origin is reachable.
3. Refactor enemy decision collection to use the candidate paths without mutating World, then implement movement arbitration rounds where winners remain claimed until that round's applications complete and losers retry their next candidate.
4. Preserve attack commitment, terminal cleanup, event ordering, and renderer-facing snapshots; update deterministic unit fixtures and browser assertions.
5. Run the canonical unit/build checks and the full Playwright suite, then review for stale basic-enemy imports, aliases, reservations, and path state.

## Implementation Notes

- Attack-origin derivation must transform each local offset with the same cardinal rotation used for committed attack cells, then calculate `origin = playerCell - rotatedOffset`.
- BFS may traverse legal terrain as a planning hint, but the first step and final attack origin must pass the explicit current occupancy/reservation/player-cell predicates. Do not allow a planned path to bypass World validation during application.
- Rank paths deterministically by shortest path, then goal cell and first-step coordinates. Keep cardinal expansion order fixed so identical snapshots produce identical candidate lists.
- Retry must be bounded by the candidate list produced before movement application. Do not loop indefinitely or call a second enemy action after a loss.
- Movement events must remain in stable enemy decision order even if claims are applied in arbitration rounds. `command_resolved` remains first and `world_advanced` remains last.
- A movement loser that has no remaining valid candidate sets `lastDecision` to `wait` and emits exactly one `enemy_waited` event.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Current cell already covers the player with the authored shape | Commit one attack and do not plan movement. |
| Several attack origins are reachable | Select the deterministic shortest/ranked path and expose alternatives for contention retry. |
| First movement step loses arbitration | Keep the enemy in place and retry its next candidate within the same movement action. |
| Every candidate first step loses or is invalid | Remain in place, emit one `enemy_waited`, and leave no reservation. |
| Player cell changes after attack commitment | Preserve committed cells, damage, warning, recovery, kind, and metadata. |
| Enemy becomes terminal during pending activity | Release occupancy, reservations, telegraphs, and committed activity immediately. |

## Acceptance Criteria

1. The shared enemy API has no BasicEnemy compatibility aliases, and all callers use the renamed role-neutral module.
2. Thrust and Slash derive viable attack positions from their authored shapes and use deterministic BFS rather than fixed primary/side/reverse movement fallback.
3. Contested movement has deterministic winners, allows a losing enemy to retry another candidate in the same action, and leaves no duplicate occupancy or stale reservation.
4. Every eligible enemy still performs at most one action per accepted player Tick, while rejected commands perform none.
5. Locked attack snapshots, event order, terminal cleanup, Thrust/Slash behavior, and browser presentation idle state remain correct.
