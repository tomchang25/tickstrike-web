# Charge Enemy Line Threat and Landing

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

Status: Draft implementation spec

## Goal

Activate Charge as a Heavy enemy that aligns a locked line threat, detonates only that line, and moves to a legal landing cell after resolution. The behavior must remain inside the shared Tick and reservation contracts.

## Summary

Charge uses the authored five-cell line and Heavy Guard profile. It may commit when its current facing and position produce a legal line containing the player; otherwise it takes a deterministic one-cell movement or facing action toward a valid charge origin. Commitment freezes the attack footprint. At detonation, the player is damaged from the locked line and Charge moves to the farthest legal cell along that same line, if one exists, before entering recovery.

## Relational Context

- Child A owns the committed snapshot and movement arbitration; Charge supplies line eligibility and post-detonation landing behavior.
- Charge reads board legality and occupancy from World. Landing movement must use the same authoritative placement validation as ordinary movement.
- The authored Charge attack supplies damage, warning, recovery, line length, and attack kind. The role must not duplicate fallback tuning in presentation code.
- The line is locked at commitment. Player movement cannot redirect the charge or change its landing line.
- Presentation receives the existing attack commit, detonation, movement, and recovery events; it never performs the landing or damage mutation.

## Scope

### Included

- Charge role activation and Heavy Guard integration.
- Five-cell line geometry and commitment eligibility.
- Locked detonation and legal landing movement.
- Focused unit, event-order, and browser coverage.

### Excluded

- Collision damage to enemies, forced displacement, or Charge-specific physics.
- General pathfinding or multi-cell movement budgets.
- Waves, spawn placement, enemy levels, or changes to player Mobility.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/enemies/basic-enemy-actions.ts` | Medium | Add Charge line eligibility, geometry, and landing metadata to the shared action boundary. |
| `src/core/actions/enemy-phase.ts` | Medium | Resolve Charge detonation and post-detonation landing in the shared phase order. |
| `src/core/world/world.ts` | Medium | Validate and apply Charge landing while preserving terminal and occupancy invariants. |
| `src/core/events/combat-events.ts` | Small | Ensure Charge detonation and landing are observable as ordered semantic events. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Add deterministic Charge placement to the existing arena fixture. |
| `test/unit/core/enemies/charge-enemy-actions.test.ts` | Large | Assert line geometry, lock, landing, blockers, and recovery. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Charge telegraph, detonation, landing, and cleanup in the browser. |

## Execution Outline

1. Add pure line geometry and valid-origin tests, including all four cardinal facings and edge clipping.
2. Implement Charge decision and commitment through Child A's snapshot contract, preserving one action per enemy phase.
3. Add locked detonation and farthest-legal landing resolution with semantic event ordering.
4. Add Charge to the same deterministic fixture and verify presentation cleanup after landing, death, and reset.

## Implementation Notes

- A line starts one cell forward and has the authored length; it must not include the Charge origin.
- Charge cannot commit through an occupied or illegal blocking cell when calculating a legal line.
- Landing is derived from the committed line, not the player's live position. Choose the farthest legal cell in the locked direction, or remain in place when no landing cell is available.
- Damage resolves before landing movement, and the enemy enters recovery after both logical effects are complete.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Player is not on a valid line | Charge moves or turns toward a valid origin, or waits; it does not commit an invalid attack. |
| Player moves out of the locked line | Detonation misses damage but still resolves the attack lifecycle and landing. |
| Landing cells are blocked | Charge chooses the farthest legal cell before the blocker, or stays in place if none is legal. |
| Charge dies while telegraphing | The line, telegraph, reservation, and later landing are cleared. |
| Landing would overlap another entity | World rejects that landing and preserves occupancy without partial movement. |

## Acceptance Criteria

1. Charge commits only when its authored line can contain the player and the committed line remains stable through warning.
2. Detonation damages only the player cell contained in the locked line and never retargets from live state.
3. Charge lands at the farthest legal cell on its committed line, or remains safely in place when blocked.
4. Charge uses Heavy Guard and the same recovery, terminal cleanup, event, and presentation contracts as other enemies.
