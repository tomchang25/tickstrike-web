# Basic Enemy Tick Actions and Locked Attacks

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Implemented and verified

## Goal

Add the shared data-owned enemy activity model for Thrust and Slash. After every accepted player action, each ready or recovery-complete basic enemy receives at most one deterministic action, commits immutable attack data when ready, exposes a locked Telegraph, resolves it once, and can act again when recovery ends.

## Summary

The Web implementation now has a small core enemy-action module rather than a generic Node-style FSM. Persistent activity is `ready`, `telegraphing`, or `recovering`; movement, attack commitment, detonation, and waiting are semantic actions. Facing changes as part of a move or attack and no longer consumes a separate turn action.

This port intentionally uses at most one action per enabled basic enemy per accepted Tick. A recovery countdown that reaches zero makes that enemy eligible for one action in the same Tick. It does not add the reference Speed/Energy scheduler, banked action energy, frame timers, or general pathfinding. A deterministic local fallback checks alternate cardinal directions when the preferred route is blocked. Thrust and Slash share all runtime rules and differ only through their existing authored attack definitions and local offsets.

## Relational Context

- `resolveCommand()` remains the command boundary. Accepted player commands resolve player effects first, then invoke the enemy phase; rejected commands do not advance time or invoke enemy decisions.
- `World` remains authoritative for entity placement, occupancy, reservations, Telegraphs, tick, and snapshots. Enemy decision code reads a snapshot or controlled world query and applies movement, phase, and Telegraph changes only through world-owned mutation methods.
- `EntityState` must carry enough immutable snapshot data for enemy activity, cardinal facing, and committed attack countdown to be observable by the renderer and debug API. Do not keep enemy state in a module-level map or React state.
- `EnemyDefinition` and `AttackDefinition` are immutable authored content. Existing Thrust and Slash definitions provide the attack IDs, damage, warning ticks, recovery ticks, and local custom offsets; enemy runtime must resolve those references and must not duplicate their cells in role-specific code.
- Attack commitment snapshots attack ID, rotated cells, damage, and warning ticks. Subsequent player movement or content changes cannot retarget or change an already committed attack.
- The enemy phase must use stable entity/scenario order. The existing reservation arbitration remains the authority for conflicts; a losing move must not partially change placement or leave a stale claim.
- `World.lastEvents`, `GameRuntime.emit()`, and `PresentationDirector.play()` consume the ordered semantic stream. The terminal `world_advanced` event remains last after enemy-phase events so the snapshot and event log describe the completed Tick.
- `PixiGameRenderer` projects persistent enemy positions, facing markers, Telegraphs, and Debug-mode action labels from snapshots; `PresentationDirector` animates movement from event `from` cells to event `to` cells without changing core state.

## Scope

### Included

- Data-owned ready, telegraphing, and recovering activity.
- Cardinal facing and one-cell local movement with deterministic fallback directions.
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
| `src/core/events/combat-events.ts` | Large | Add enemy movement, attack commit, detonation, recovery, damage, and Telegraph events. |
| `src/content/enemies/enemy-definitions.ts` | Small | Confirm or adjust only the Thrust/Slash authored timing and offsets used by the shared runtime. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Provide deterministic positions that exercise Thrust and Slash without adding a second scenario. |
| `src/app/App.tsx` | Small | Route the Debug-mode presentation toggle to the renderer. |
| `src/app/styles.css` | Small | Style the compact Debug-mode checkbox. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Medium | Project enemy facing markers and Debug-mode action labels while preserving snapshot ownership. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Animate enemy movement from semantic event origins to destinations. |
| `src/ui/SemanticMirror.tsx` | Small | Expose enemy activity, facing, recovery, and committed-attack fields to the browser harness. |
| `src/ui/TestbedPanel.tsx` | Small | Provide the Debug-mode toggle without owning enemy state. |
| `test/unit/core/enemies/basic-enemy-actions.test.ts` | Large | Assert footprint rotation, decisions, countdowns, conflicts, and stable one-action behavior. |
| `test/unit/core/actions/action-resolver.test.ts` | Large | Assert player result, enemy phase, event order, rejected action behavior, and tick advancement. |
| `test/unit/core/world/world.test.ts` | Medium | Assert committed attack cleanup, player damage, reset-safe state, and terminal ownership. |
| `test/e2e/testbed.spec.ts` | Small | Assert browser-visible Telegraph state, Debug-mode activation, and ordered enemy events. |

## Execution Outline

1. Add typed activity, last-decision, facing, and committed-attack data plus world-owned lifecycle operations.
2. Implement pure local offset rotation, attack-facing selection, one-cell movement, and deterministic fallback directions; test move, attack, and wait behavior independently.
3. Integrate the enemy phase into the accepted-command resolver with the fixed order: player result, Tick increment, expired detonations, status countdowns, recovery-complete eligibility, enemy actions, then terminal world-advance event.
4. Project facing and action state through Pixi and the Debug-mode toggle, and animate movement from semantic event origins without making presentation authoritative.
5. Add deterministic fixture commands and unit/browser assertions for Telegraph lock, player dodge, one-time detonation, same-Tick recovery reactivation, rejection, conflict arbitration, and reset cleanup.

## Implementation Notes

- Use local attack offsets where `x` is forward and `y` is lateral, matching the reference attack controller and the existing custom-offset content.
- A ready Thrust or Slash selects attack-facing or movement-facing as part of its one action. It may move one cell, commit, or wait, but must not perform two actions in one Tick.
- If the preferred movement cell is blocked, the decision checks fixed alternate cardinal directions before waiting. This is local fallback movement, not general pathfinding.
- A telegraphing enemy is frozen until its countdown expires. Detonation checks the player's post-action cell against the committed cells and applies the snapshotted damage.
- A recovering enemy decrements recovery and cannot bank an action. When recovery reaches zero it returns to `ready` and is eligible for one action in the current accepted Tick.
- Do not expose `EntityDefinition.speed` as an unused scheduler hook in this child. The fixed cadence is intentional.
- A terminal entity cancels its committed attack and clears its Telegraph through the existing world terminal path.
- Debug mode is a presentation toggle. It displays the current terminal/activity state, or the latest `move`, `attack`, or `wait` decision directly above the enemy; it does not create a second enemy state store.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Rejected player command | Preserve tick, activity, countdowns, Telegraphs, reservations, and events. |
| Player moves after Telegraph commit | Keep committed cells and damage unchanged; only the next enemy decision observes the new player cell. |
| Player remains inside committed cells | Apply enemy damage once at countdown zero, clear the attack, and start recovery. |
| Telegraph overlaps another Telegraph | Keep both source-owned Telegraphs independent and do not make either one occupancy authority. |
| Movement destination is occupied, reserved, illegal, or the player cell | Try the fixed alternate cardinal directions; wait only when all candidates are unavailable, without partial placement. |
| Recovery countdown reaches zero | Enter `ready` and execute at most one new action in that same accepted Tick. |
| Enemy dies while telegraphing or recovering | Release ownership immediately and prevent later detonation or recovery events. |
| Reset during a committed attack | Clear all activity, countdowns, reservations, and Telegraphs in the replacement world. |

## Acceptance Criteria

1. Every accepted player action gives each ready or recovery-complete enabled Thrust and Slash at most one deterministic action; rejected commands give none.
2. Thrust and Slash share attack-facing, one-cell movement, local fallback movement, commitment, Telegraph, detonation, and recovery while retaining their authored footprints.
3. A committed Telegraph retains cells and damage while the player moves, resolves once when its warning ends, and makes the enemy eligible again when recovery reaches zero.
4. Pixi visibly marks cardinal facing and Debug mode shows the current activity or latest action directly on each enemy.
5. Unit and browser assertions prove deterministic positions, activity, countdowns, conflicts, event order, player damage, recovery reactivation, and reset cleanup.
