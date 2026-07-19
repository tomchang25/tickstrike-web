# Combat Event Stream Consolidation

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Implemented and verified

## Goal

Make every accepted player command expose one authoritative ordered combat-event stream. This completed consolidation removed the former split result contract so core, snapshots, runtime, and presentation observe the same result without compatibility fallbacks.

## Summary

The resolver now returns one complete non-optional `events` list containing the command boundary, player and enemy outcomes, and Tick advancement. `World.lastEvents`, `GameRuntime`, the semantic mirror, the event log, and presentation consume that same ordered stream without a compatibility fallback.

This child keeps the existing event types and ordering, but makes `ActionResolution.events` the only non-optional result stream. An accepted command begins with `command_resolved`, includes direct player and enemy-phase outcomes in their current order, and ends with `world_advanced`. Rejected commands still return an empty event list and leave the recorded stream and world state unchanged. Existing Pixi/GSAP behavior remains unchanged because it already accepts and ignores non-visual boundary events.

## Relational Context

- `resolveCommand()` and its verb-specific resolvers own construction of the command result. The accepted result returns the one complete ordered stream as `ActionResolution.events`; no second public view is retained.
- `World` remains the owner of canonical mutable combat state and copies the resolver's complete stream through `recordEvents()`. `WorldSnapshot.lastEvents` is a cloned observation of that same stream, not a separately filtered event history.
- `GameRuntime.drainCommands()` calls the resolver, publishes the resulting World snapshot, and passes `resolution.events` directly to `PresentationDirector.play()`.
- `PresentationDirector` consumes the complete stream only for visual realization. Its existing no-op handling for `command_resolved` and `world_advanced` remains valid; presentation must not filter, add, reorder, or mutate core events.
- `PixiGameRenderer` reads `snapshot.lastEvents` to retain movement animation positioning while snapshots update. Its behavior must continue to use the same complete ordered stream that runtime presentation receives.
- The semantic mirror, event log, debug API, and Playwright assertions read `WorldSnapshot.lastEvents`; they must continue to expose the full stream, including boundary events, without adding a UI-owned event store.
- No compatibility alias, optional fallback, event adapter, or second gameplay-only collection exists. Consumers that need a subset filter the one authoritative stream locally.

## Scope

### Included

- The completed implementation uses one complete non-optional `events` stream for command results, snapshots, runtime presentation, and browser observation.
- Preserve current accepted-command event order, World recording, snapshot cloning, runtime presentation, and Pixi/GSAP handling.
- Update focused unit and browser assertions to prove the single-stream contract and rejected-command behavior.

### Excluded

- New combat-event types, changes to Tick order, enemy decisions, Guard rules, or presentation timelines.
- Event persistence, replay, telemetry, combat-log redesign, and UI layout changes.
- ECS conversion or broader runtime/content architecture reorganization.

## Files to Change

| File                                                 | Change Size | Purpose                                                                                  |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `src/core/actions/action-resolver.ts`                | Small       | Expose one complete `ActionResolution.events` stream and remove the duplicate field.     |
| `src/runtime/GameRuntime.ts`                         | Small       | Present the single resolver stream without an optional fallback.                         |
| `test/unit/core/actions/action-resolver.test.ts`     | Medium      | Update command-result and snapshot assertions to the unified event contract.             |
| `test/unit/core/enemies/basic-enemy-actions.test.ts` | Small       | Preserve enemy-phase order assertions against the complete command stream.               |
| `test/e2e/testbed.spec.ts`                           | Small       | Assert the browser event log and debug snapshot expose the same complete ordered result. |

## Execution Outline

1. The resolver result contract and accepted-result assembly return the complete ordered sequence only as `events`, with no alternate stream.
2. Runtime passes the unified result stream directly to presentation while preserving snapshot publication before timeline playback.
3. Focused resolver and enemy lifecycle tests assert boundary events, direct outcomes, enemy-phase outcomes, World snapshot equality, and rejected-command non-mutation through the single field.
4. Browser event-log/debug assertions prove the visible and debug-observed sequence remains complete and ordered.

## Implementation Notes

- Preserve `events` as the public property name for the complete authoritative stream; no renamed replacement field is needed.
- For accepted commands, `command_resolved` remains first and the `world_advanced` event returned by `World.advancePlayerAction()` remains last. Direct player outcomes remain before enemy-phase outcomes.
- `World.recordEvents()` must receive the same event values returned to the caller. Snapshot cloning may preserve immutability, but must not change order or omit boundary events.
- Rejections retain `accepted: false`, `consumedTime: false`, a reason, and `events: []`; they do not record a rejection event or overwrite the previous `lastEvents` snapshot.
- Do not change presentation's event switch solely to accommodate the unified contract. It already safely ignores the two non-visual boundary events.

## Edge Cases

| Case                                                         | Expected Handling                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted command with no direct target                       | Return command boundary, whiff/player outcome, any existing enemy-phase outcomes, and Tick advance in one stream.                          |
| Accepted command that kills an enemy or resolves a Telegraph | Preserve all existing damage, terminal, Telegraph, recovery, and enemy-decision events between the two boundary events.                    |
| Rejected command after a prior accepted command              | Return an empty stream and preserve the World snapshot's prior complete `lastEvents` record.                                               |
| Scenario replacement during presentation                     | Continue cancelling presentation by generation; the already-resolved unified stream must not create a second event path or stale callback. |

## Acceptance Criteria

1. Every accepted command exposes one non-optional ordered `events` stream that begins with command resolution, includes all existing player and enemy outcomes, and ends with Tick advancement.
2. The event sequence returned from an accepted command and the sequence exposed in the resulting World snapshot have equal values and order.
3. Runtime presentation, the browser event log, and debug snapshot observe that same complete sequence without an optional event fallback or a second filtered contract.
4. Rejected commands return an empty event stream and do not advance time, alter combat state, or overwrite the previous recorded event sequence.
5. Existing movement, attack, Dash, Smash, enemy Telegraph, damage, recovery, terminal cleanup, and animation-idle behavior remain deterministic and browser-visible as before.
