# Shared Enemy Action and Navigation Contract

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

Status: Draft implementation spec

## Goal

Generalize the existing Thrust/Slash enemy action model so every authored enemy role can use one deterministic Tick lifecycle. Establish the shared locked-attack and contested-movement contracts before role-specific behavior is added.

## Summary

This child replaces the basic-only runtime boundary with a role-neutral runtime snapshot. Enemy content remains immutable authored data, while the World owns live activity, occupancy, reservations, telegraphs, countdowns, and terminal cleanup.

The enemy phase will make decisions in stable entity order, arbitrate movement claims before applying movement, and allow at most one completed action per enemy per accepted player Tick. Thrust and Slash must retain their current behavior and remain the first regression fixtures.

## Relational Context

- `resolveCommand()` remains the only command-to-gameplay boundary: accepted player commands resolve the player result, then the enemy phase; rejected commands do not advance enemy state.
- `World` remains authoritative for entity state, occupancy, reservations, telegraphs, committed attack snapshots, and terminal cleanup. Decision helpers may read controlled queries but must mutate state only through World operations.
- Authored actor content supplies attack and role data; core runtime stores plain resolved snapshots and must not import content files, React, PixiJS, GSAP, or browser APIs.
- The enemy phase collects movement intents before applying them so reservation priority, rather than iteration side effects, decides a contested destination. A losing enemy stays in its current cell and records `wait`.
- Presentation consumes ordered semantic events and snapshots. It never decides attack results, movement winners, terminal state, or the lifetime of logical entities.
- Existing Thrust/Slash tests and browser assertions are compatibility fixtures. The generalized contract must not require a second basic-enemy path.

## Scope

### Included

- Role-neutral enemy action and committed-attack runtime types.
- Shared attack snapshot, telegraph, countdown, recovery, and cancellation operations.
- Stable one-action enemy phase processing.
- Two-pass movement reservation and deterministic conflict resolution.
- Existing Thrust/Slash migration and regression coverage.

### Excluded

- Ranged, Charge, Bomb, Mode, or Boss-specific decision rules.
- General pathfinding, multi-cell movement budgets, waves, spawning, or level scaling.
- New player mechanics, rewards, or a second gameplay runtime.

## Files to Change

| File                                                 | Change Size | Purpose                                                                               |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                            | Large       | Replace basic-only action snapshots with role-neutral enemy runtime data.             |
| `src/core/world/world.ts`                            | Large       | Own generalized activity, commitment, recovery, reservation, and terminal operations. |
| `src/core/enemies/basic-enemy-actions.ts`            | Large       | Rename/generalize the pure decision and attack-geometry boundary for shared use.      |
| `src/core/actions/enemy-phase.ts`                    | Large       | Separate decision, movement arbitration, attack commitment, and status processing.    |
| `src/core/actions/action-resolver.ts`                | Small       | Preserve the existing accepted-command to enemy-phase ordering.                       |
| `src/core/events/combat-events.ts`                   | Medium      | Extend semantic payloads for role-neutral movement and committed attack snapshots.    |
| `src/harness/fixtures/shipped-arena.ts`              | Medium      | Keep deterministic Thrust/Slash fixtures on the generalized contract.                 |
| `test/unit/core/enemies/basic-enemy-actions.test.ts` | Large       | Migrate and extend shared decision, geometry, lock, and conflict assertions.          |
| `test/unit/core/world/reservations.test.ts`          | Medium      | Assert atomic contested movement arbitration and cleanup.                             |
| `test/unit/core/actions/action-resolver.test.ts`     | Medium      | Preserve event order and rejected-command behavior.                                   |
| `test/e2e/testbed.spec.ts`                           | Small       | Preserve browser-visible Thrust/Slash behavior and idle cleanup.                      |

## Execution Outline

1. Add the role-neutral runtime snapshots and World-owned lifecycle operations while preserving the current Thrust/Slash fields and event order.
2. Generalize the pure action module and migrate all existing imports and tests; keep local one-cell fallback movement rather than introducing pathfinding.
3. Refactor the enemy phase into stable decision collection, reservation arbitration, movement application, and attack commitment without allowing a newly committed attack to detonate in the same phase.
4. Add unit coverage for atomic claims, loser behavior, locked snapshots, terminal cancellation, and recovery reactivation, then rerun the current browser assertions.

## Implementation Notes

- Keep `world_advanced` as the final event for an accepted command and preserve `command_resolved` as the first event.
- A committed attack must snapshot every value needed for later resolution, including cells, damage, warning, recovery, attack kind, and role-specific terminal or landing metadata when present.
- Reservation claims for one movement phase must remain visible until winners are applied and then be released. Never use a released claim as the conflict arbiter.
- Telegraphs remain source-owned visual danger data. They are not occupancy claims unless a later child explicitly adds a role that requires such a claim.
- Terminal transitions immediately release occupancy, reservations, telegraphs, and pending enemy activity; presentation may retain a visual until its event timeline completes.

## Edge Cases

| Case                                      | Expected Handling                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Two enemies request the same destination  | The deterministic reservation winner moves; the loser remains in place and emits `enemy_waited`.   |
| A movement claim loses before application | No partial movement, duplicate occupancy, or stale reservation remains.                            |
| Player moves after commitment             | The committed cells and damage remain unchanged; only the next decision reads the new player cell. |
| Enemy becomes terminal while telegraphing | The attack, telegraph, reservation, and later detonation are cleared immediately.                  |
| Rejected player command                   | Tick, enemy activity, reservations, telegraphs, and events remain unchanged.                       |

## Acceptance Criteria

1. Thrust and Slash use the generalized contract with unchanged attack footprints, warning, Guard, Stagger, recovery, and event ordering.
2. Every accepted player Tick gives each eligible enemy at most one action, while rejected commands give none.
3. Contested movement produces one deterministic winner, no duplicate occupancy, and no stale reservation.
4. A committed attack resolves exactly once from its locked snapshot and terminal cleanup removes all owned logical state immediately.
5. Unit and browser assertions prove the shared contract remains deterministic and presentation reaches idle after reset.
