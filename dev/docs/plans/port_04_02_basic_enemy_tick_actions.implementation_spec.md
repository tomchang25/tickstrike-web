# Basic Enemy Tick Actions and Locked Attacks

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Draft implementation spec

## Goal

Add the shared data-owned enemy activity model for Thrust and Slash. After every accepted player action, each enabled basic enemy must receive at most one deterministic action, commit immutable attack data when ready, expose a locked Telegraph, resolve it once, and recover before acting again.

## Summary

The current Web code has occupancy, reservations, Telegraph storage, and one accepted-action tick boundary, but it has no enemy runtime or enemy phase. This child adds a small core enemy-action module rather than a generic Node-style FSM. Persistent activity is `ready`, `telegraphing`, or `recovering`; movement, turn, commitment, detonation, and waiting are semantic actions.

This port intentionally uses one action per enabled enemy per accepted Tick. It does not add the reference Speed/Energy scheduler, banked action energy, frame timers, or pathfinding. Thrust and Slash share all runtime rules and differ only through their existing authored attack definitions and local offsets.

## Relational Context

- `resolveCommand()` remains the command boundary. Accepted player commands resolve player effects first, then invoke the enemy phase; rejected commands do not advance time or invoke enemy decisions.
- `World` remains authoritative for entity placement, occupancy, reservations, Telegraphs, tick, and snapshots. Enemy decision code reads a snapshot or controlled world query and applies movement, phase, and Telegraph changes only through world-owned mutation methods.
- `EntityState` must carry enough immutable snapshot data for enemy activity, cardinal facing, and committed attack countdown to be observable by the renderer and debug API. Do not keep enemy state in a module-level map or React state.
- `EnemyDefinition` and `AttackDefinition` are immutable authored content. Existing Thrust and Slash definitions provide the attack IDs, damage, warning ticks, recovery ticks, and local custom offsets; enemy runtime must resolve those references and must not duplicate their cells in role-specific code.
- Attack commitment snapshots attack ID, rotated cells, damage, and warning ticks. Subsequent player movement or content changes cannot retarget or change an already committed attack.
- The enemy phase must use stable entity/scenario order. The existing reservation arbitration remains the authority for conflicts; a losing move must not partially change placement or leave a stale claim.
- `World.lastEvents`, `GameRuntime.emit()`, and `PresentationDirector.play()` consume the ordered semantic stream. The terminal `world_advanced` event remains last after enemy-phase events so the snapshot and event log describe the completed Tick.

## Scope

### Included

- Data-owned ready, telegraphing, and recovering activity.
- Cardinal facing and one-cell local movement/turn actions.
- Shared Thrust/Slash attack footprint rotation and commitment.
- Enemy phase integration after accepted player actions.
- Telegraph countdown, player-cell detonation, and recovery.
- Stable order, conflict handling, reset, and cancellation cleanup.

### Excluded

- Speed/Energy scheduling, multiple enemy actions per Tick, action banking, or frame-driven state updates.
- Ranged, Charge, Bomb, Mode, Boss, waves, spawning, and general pathfinding.
- Guard, Stagger, Protection, Mobility-specific combat, and final presentation polish.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Large | Add enemy activity, facing, and committed-attack snapshot data to canonical state. |
| `src/core/world/world.ts` | Large | Own enemy activity mutation, tick phase data, committed attack lifecycle, and player damage application. |
| `src/core/enemies/basic-enemy-actions.ts` | Large | Add pure shared Thrust/Slash decision, facing, footprint, and one-action transition rules. |
| `src/core/actions/action-resolver.ts` | Large | Run the ordered enemy phase after accepted player results and before the terminal world-advance event. |
| `src/core/events/combat-events.ts` | Large | Add enemy movement, turn, attack commit, detonation, recovery, damage, and Telegraph events. |
| `src/content/enemies/enemy-definitions.ts` | Small | Confirm or adjust only the Thrust/Slash authored timing and offsets used by the shared runtime. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Provide deterministic positions that exercise Thrust and Slash without adding a second scenario. |
| `test/unit/core/enemies/basic-enemy-actions.test.ts` | Large | Assert footprint rotation, decisions, countdowns, conflicts, and stable one-action behavior. |
| `test/unit/core/actions/action-resolver.test.ts` | Large | Assert player result, enemy phase, event order, rejected action behavior, and tick advancement. |
| `test/unit/core/world/world.test.ts` | Medium | Assert committed attack cleanup, player damage, reset-safe state, and terminal ownership. |

## Execution Outline

1. Add typed activity and committed-attack data plus world-owned lifecycle operations without changing presentation.
2. Implement pure local offset rotation and shared Thrust/Slash decision logic; test facing, attack coverage, legal movement, and wait behavior independently.
3. Integrate the enemy phase into the accepted-command resolver with the fixed order: player result, Tick increment, expired detonations, status countdowns, enemy actions, then terminal world-advance event.
4. Add deterministic fixture commands and unit assertions for Telegraph lock, player dodge, one-time detonation, recovery, rejection, conflict arbitration, and reset cleanup.

## Implementation Notes

- Use local attack offsets where `x` is forward and `y` is lateral, matching the reference attack controller and the existing custom-offset content.
- A ready Thrust or Slash may turn, move one cell, commit, or wait, but must not perform two of those actions in one Tick.
- A telegraphing enemy is frozen until its countdown expires. Detonation checks the player's post-action cell against the committed cells and applies the snapshotted damage.
- A recovering enemy decrements recovery and cannot bank an action. When recovery reaches zero it returns to `ready` for a later accepted Tick, not the current status pass.
- Do not expose `EntityDefinition.speed` as an unused scheduler hook in this child. The fixed cadence is intentional.
- A terminal entity cancels its committed attack and clears its Telegraph through the existing world terminal path.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Rejected player command | Preserve tick, activity, countdowns, Telegraphs, reservations, and events. |
| Player moves after Telegraph commit | Keep committed cells and damage unchanged; only the next enemy decision observes the new player cell. |
| Player remains inside committed cells | Apply enemy damage once at countdown zero, clear the attack, and start recovery. |
| Telegraph overlaps another Telegraph | Keep both source-owned Telegraphs independent and do not make either one occupancy authority. |
| Movement destination is occupied, reserved, illegal, or the player cell | Do not move; produce a deterministic wait or next legal action without partial placement. |
| Enemy dies while telegraphing or recovering | Release ownership immediately and prevent later detonation or recovery events. |
| Reset during a committed attack | Clear all activity, countdowns, reservations, and Telegraphs in the replacement world. |

## Acceptance Criteria

1. Every accepted player action gives each enabled Thrust and Slash at most one deterministic action; rejected commands give none.
2. Thrust and Slash share facing, one-cell movement, commitment, Telegraph, detonation, and recovery while retaining their authored footprints.
3. A committed Telegraph retains cells and damage while the player moves, resolves once when its warning ends, and blocks further action during recovery.
4. Unit assertions prove deterministic positions, activity, countdowns, conflicts, event order, player damage, and reset cleanup.
