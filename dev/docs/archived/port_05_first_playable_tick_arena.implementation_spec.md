# First Playable Tick Arena

Parent Plan: `port_05_first_playable_tick_arena.md`

Status: Implemented and verified

## Goal

Complete the existing deterministic Tick Arena as one playable encounter with explicit victory, defeat, reset, and presentation-idle outcomes. The encounter must reuse the current command resolver, Thrust/Slash activity model, event stream, and generation-safe runtime rather than introducing a parallel combat path.

## Summary

The completed implementation resolves player verbs, basic enemy actions, locked Telegraphs, Guard, damage, enemy death, reset, and canonical encounter outcomes through one command path. It emits terminal events from the existing ordered command stream, rejects commands after an outcome, and exposes the result through the existing React testbed and debug mirror.

Victory occurs when every enabled basic enemy is terminal after an accepted command. Defeat occurs when the player becomes terminal from a committed enemy attack. The World resolves the logical outcome immediately; Pixi/GSAP only completes terminal feedback and removes visual views. Reset continues to replace the World through the existing runtime generation boundary and must leave the replacement idle with no stale presentation state.

## Relational Context

- `World` owns the canonical encounter outcome because it already owns entity phases, occupancy, Telegraphs, Tick state, and snapshots. React, the runtime, and Pixi read this value but never derive or mutate it.
- `resolveCommand()` remains the only command-to-gameplay boundary. It checks the current outcome before dispatch, resolves the existing player and enemy phases, updates the World outcome once after the phase, and returns terminal events in the same authoritative `events` stream.
- Accepted command events must retain `command_resolved` as the first event and `world_advanced` as the last event. `encounter_ended` and `player_died` belong between the gameplay events and the final Tick boundary.
- A committed attack resolves against the player's post-action cell exactly as before. Moving away from a Telegraph produces no damage; standing in it can produce `player_died` and `encounter_ended(defeat)`.
- Logical terminal entity cleanup remains in `World.setPhase()`: it immediately releases occupancy, reservations, Telegraphs, and enemy activity state. Presentation may retain a terminal view only until its event timeline completes.
- `GameRuntime` continues to own command queueing, reset, generation invalidation, and presentation cancellation. It must not add a second terminal state or decide victory/defeat from rendered objects.
- `PresentationDirector` consumes terminal events and removes terminal views after their timelines. It must treat generation cancellation as authoritative and leave `isIdle` true after reset or scenario replacement.
- `TestbedPanel`, `SemanticMirror`, and the debug API project `WorldSnapshot.outcome`; they do not maintain an independent event or encounter store. The reset control remains the existing runtime reset boundary.
- The single `tick-arena` scenario is the browser proof for both normal completion and defeat. Do not add enemy-specific scenes, a second arena, or a test-only combat runtime.

## Scope

### Included

- Canonical encounter outcome in core state and snapshots.
- Player death and encounter-ended semantic events in the existing event stream.
- Terminal command rejection and deterministic victory/defeat detection.
- Terminal Pixi/GSAP feedback, outcome UI, semantic mirror/debug visibility, and reset affordance.
- Focused unit, presentation, and Playwright acceptance coverage.

### Excluded

- Waves, rewards, class selection, permanent progression, production menus, or new enemy roles.
- New damage, Guard, Telegraph, Mobility, pathfinding, or Tick scheduling rules.
- A second combat resolver, runtime, scenario, event stream, or presentation-owned gameplay state.

## Files to Change

| File                                                            | Change Size | Purpose                                                                               |
| --------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                                       | Small       | Define encounter outcome and expose it in `WorldSnapshot`.                            |
| `src/core/events/combat-events.ts`                              | Small       | Add player-death and encounter-ended semantic events.                                 |
| `src/core/world/world.ts`                                       | Medium      | Own outcome state and provide deterministic terminal-state evaluation.                |
| `src/core/actions/action-resolver.ts`                           | Medium      | Reject post-terminal commands, emit player death, and append terminal outcome events. |
| `src/presentation/timelines/PresentationDirector.ts`            | Small       | Present player terminal feedback and preserve cleanup/idle behavior.                  |
| `src/ui/SemanticMirror.tsx`                                     | Small       | Expose outcome and terminal data to browser assertions.                               |
| `src/ui/TestbedPanel.tsx`                                       | Small       | Show encounter status and a terminal restart affordance.                              |
| `src/app/App.tsx`                                               | Small       | Render the browser-visible terminal result over the existing game surface.            |
| `src/app/styles.css`                                            | Small       | Style the terminal result without removing responsive behavior.                       |
| `test/unit/core/actions/action-resolver.test.ts`                | Medium      | Assert deterministic victory, defeat, Telegraph avoidance, and terminal rejection.    |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Small       | Assert player terminal presentation and cleanup.                                      |
| `test/e2e/testbed.spec.ts`                                      | Medium      | Assert browser-visible victory, defeat, reset, and idle cleanup in `tick-arena`.      |

## Execution Outline

1. Add the outcome type, snapshot field, event variants, and World outcome ownership without changing existing combat formulas or entity terminal cleanup.
2. Update the resolver to reject commands after an outcome, emit `player_died` when a committed attack kills the player, evaluate the outcome after the existing enemy phase, and preserve the unified event ordering.
3. Add terminal presentation and React projections, including a visible status/live region and a reset/restart affordance while keeping the existing testbed controls and accessibility semantics.
4. Add focused unit and presentation assertions, then add one browser sequence for victory, one for Telegraph avoidance and defeat, and reset assertions against the same deterministic scenario.
5. Run unit tests, the production build, and Playwright Chromium coverage; verify no stale Telegraph, terminal visual, callback, or non-idle state remains after reset.

## Implementation Notes

- Use `running`, `victory`, and `defeat` as the only outcome values. Do not infer terminal state from the enemy count rendered by React; count enabled enemies from core entities (`enemyAction` present), with player defeat taking precedence if both conditions become true in one resolution.
- Emit `encounter_ended` only on the transition from `running` to a terminal outcome. A rejected command after terminal state returns `events: []` and does not overwrite the prior snapshot event stream.
- Keep `world_advanced` last for accepted commands, including terminal commands, so existing event-stream consumers remain ordered and complete.
- A player death event is emitted only when the current enemy attack damage result has `killed: true`; it is not generated by presentation or by a later snapshot comparison.
- The terminal UI must state the outcome in text, not color alone, and the restart button must remain keyboard reachable. Use an appropriate status/live-region boundary without announcing every combat event.
- Presentation must remove both player and enemy terminal views only after their matching timeline. Generation cancellation must prevent removal callbacks from affecting a replacement scenario.

## Edge Cases

| Case                                                            | Expected Handling                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Player moves off a locked Telegraph before detonation           | The attack resolves once with no damage; the encounter remains running unless another terminal condition is met.                 |
| Player dies while the final enabled enemy also becomes terminal | Defeat wins the tie because the player did not survive the encounter.                                                            |
| Command is submitted after victory or defeat                    | Reject it without Tick advancement, state mutation, or new events.                                                               |
| Reset during terminal animation                                 | Cancel the old generation, clear timelines/transients, load the deterministic initial snapshot, and leave the new scenario idle. |
| Scenario has no enabled basic enemies                           | It remains a static/non-playable inspection scenario and does not accidentally report victory during initialization.             |

## Acceptance Criteria

1. The deterministic browser scenario lets the player move, attack, use the current Mobility behavior, avoid a locked Telegraph, clear the enabled enemies, and reach a visible victory state.
2. Standing in a committed attack can reduce the player to zero HP and reaches a visible defeat state with a player-death event.
3. The same seed and command sequence produce the same snapshots, ordered events, damage, and terminal outcome.
4. Commands after victory or defeat do not advance the Tick or mutate the World.
5. Reset from either terminal outcome restores the initial snapshot and leaves no active Telegraph, pending animation, stale callback, or orphan visual; the runtime reports idle.
6. Focused unit and Playwright assertions pass against the existing single Tick Arena integration point.
