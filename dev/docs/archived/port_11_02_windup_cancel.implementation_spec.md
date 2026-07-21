# Port 11 Child 02: Windup Cancel Core And Runtime

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Give the armed Smash windup a tick-free cancel: a core resolver that clears the armed state and returns the player to idle without advancing time, reachable through the runtime's serialized queue and the debug API, and recorded in the command log so replay stays faithful.

## Summary

Today an armed Smash has exactly two exits: releasing it (the second `smash` command, which consumes a tick) or player death/removal (`world.ts` clears it in `setPhase` and `removeEntity`). No entrance clears the windup without spending a tick, so the plan's right-click cancel has nothing to call.

This child adds that entrance, copying the proven `selectReward`/`selectMilestoneDecision` shape end to end:

- A `resolveSmashCancel(world)` resolver in `player-actions.ts` beside `resolveSmash`. It rejects when nothing is armed; otherwise it clears the armed target, records a new `smash_cancelled` event, and returns an accepted resolution. No player action, enemy phase, wave phase, or tick advancement runs.
- A new `smash_cancelled` combat event carrying the previously armed target cell.
- A runtime `cancelArmedSmash()` entrance serialized through the same queue as every other input, with a new `cancel` job kind and a new `cancel` command-log entry kind appended only on acceptance.
- Debug API `cancelArmedSmash()`, and a `cancel` case in log replay.
- No presentation work: the armed-smash marker is snapshot-driven (`input-controller.ts` / `preview-painter.ts` read `armedSmashTarget`), so the runtime's `emit()` clears it; the cancel job never calls `presentation.play`.

The UI right-click wiring is child 03. Determinism goldens must pass unregenerated — no golden script uses cancel.

## Relational Context

- `GameRuntime.drainCommands` is the single serialized choke point for all inputs; the cancel job is a fourth branch there, modeled on the milestone branch: resolve, `emit()`, generation check, log append on acceptance, resolve the promise. It must not call `presentation.play`, `reserveMotionOwners`, or `captureTerminalViews` — cancel produces no timeline work.
- Unlike `reward` and `milestone` jobs, the cancel job needs no `waveContext` and must not gate on it; scenarios without a wave context (e.g. `smash-water`) must be able to cancel.
- The armed target is World-owned direct state (`currentArmedSmashTarget` on `World`, not a subsystem), already exposed as `armedSmashTarget` / `clearArmedSmash()`. The resolver reaches it through a narrow structural context interface declared beside it in `player-actions.ts` — `armedSmashTarget`, `clearArmedSmash()`, `recordEvents()` — which `World` satisfies structurally, mirroring how `WavePhaseWorld` works. Do not add a new `World` facade method.
- The resolver records its events via `recordEvents` exactly as `resolveRewardSelection` does, so `snapshot.lastEvents` reflects the cancel; nothing else publishes core events on this path.
- The tick counter (`advancePlayerAction`) and `preparePlayerAction` are never called: the arming tick stays spent, mobility cooldown is untouched (release-time `setMobilityCooldown` never ran), and no enemy or wave phase resolves.
- Command-log ownership: `RunCommandLogEntry` in `src/runtime/command-log.ts` gains a `{ kind: "cancel" }` variant (no payload — the armed state is singular); `cloneEntry` gains its case; `GameRuntime.replayEntry` maps it to `cancelArmedSmash()`. Replay drives the same public entrance, so a replayed cancel that comes back rejected throws, signaling a stale log (existing replay contract).
- The debug API (`src/harness/debug-api.ts`) wraps the runtime entrance like `selectMilestoneDecision`; the harness layer adds no logic.
- Admission during the cancel: `resolveCommand`'s reward/milestone gates are untouched. An armed windup cannot coexist with a pending reward or milestone pause (arming deals no damage, so it never clears a wave), so the resolver's only gate is "nothing armed → rejected".
- `PresentationDirector`'s event switch never sees `smash_cancelled` (the job skips presentation), so no presenter case is added; the event exists for the log, `lastEvents`, and future presentation.

## Scope

### Included

- Core resolver, context interface, resolution type, and the `smash_cancelled` event.
- Runtime job kind, `cancelArmedSmash()` entrance, log entry kind, replay case.
- Debug API method; unit tests; one targeted e2e in the existing command-log spec.

### Excluded

- Right-click / contextmenu wiring and any UI change (child 03).
- Any presentation timeline for the cancel.
- Cancel semantics for any future multi-tick action beyond Smash.

## Files to Change

| File                                            | Change Size | Purpose                                                                            |
| ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `src/core/events/combat-events.ts`              | Small       | `smash_cancelled` event variant beside `smash_armed`                               |
| `src/core/actions/player-actions.ts`            | Small       | `SmashCancelWorld` context, `SmashCancelResolution`, `resolveSmashCancel`          |
| `src/runtime/command-log.ts`                    | Small       | `cancel` entry kind and its clone case                                             |
| `src/runtime/game-runtime.ts`                   | Medium      | `cancelArmedSmash()` entrance, `cancel` job kind, drain branch, log append, replay |
| `src/harness/debug-api.ts`                      | Small       | Expose `cancelArmedSmash`                                                          |
| `test/unit/core/actions/player-actions.test.ts` | Small       | Cancel accept/reject, tick and cooldown unchanged, re-arm after cancel             |
| `test/unit/runtime/command-log.test.ts`         | Small       | Clone coverage for the `cancel` entry kind                                         |
| `test/e2e/command-log.spec.ts`                  | Small       | Arm → cancel → export → replay round-trip on the `smash-water` scenario            |

## Execution Outline

1. Add the `smash_cancelled` event variant, then the resolver, context interface, and resolution type in `player-actions.ts`, so everything later compiles against final shapes.
2. Add the unit test file for the resolver: cancel with an armed target (accepted, target cleared, tick unchanged, event recorded, cooldown untouched), cancel with nothing armed (rejected, no events, no mutation), arm → cancel → arm again succeeds.
3. Extend `command-log.ts` with the `cancel` entry kind and clone case; extend its unit test.
4. Wire the runtime: `cancelArmedSmash()` via `submit`, the `cancel` drain branch, the log append guarded by acceptance and generation, and the `replayEntry` case.
5. Extend the debug API.
6. Add one e2e test to `command-log.spec.ts` on `/debug?scenario=smash-water`: arm a smash through the debug API, call `cancelArmedSmash`, assert the tick is unchanged from the post-arm value and `armedSmashTarget` is undefined, export the log, replay it, and assert the replayed final snapshot equals the recorded one and the exported log contains a `cancel` entry.
7. Run `npm run verify` and the targeted e2e selection. Goldens must pass without regeneration.

## Implementation Notes

- The resolver's accepted result must capture the armed target cell before clearing it so the event can carry it.
- In `drainCommands`, the cancel branch mirrors the milestone branch's structure minus the `waveContext` guard; keep the `emit()` before the generation check exactly as the sibling branches do.
- For the e2e, derive a legal smash target from `getState()` (the existing testbed smash test shows the pattern of reading the player cell and picking a nearby target); do not hardcode cells that the fixture does not guarantee.
- The `busy`/UI layer is untouched; `use-game-session.ts` gains nothing in this child.

## Edge Cases

| Case                                               | Expected Handling                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Cancel with nothing armed                          | Rejected resolution with a reason; no events, no state change, not logged |
| Cancel after scenario replacement (stale job)      | Generation check rejects the job; nothing logged                          |
| Cancel then arm again in the same run              | Both succeed; the log records command, cancel, command in order           |
| Replayed cancel entry rejected (corrupted log)     | Replay throws, per the existing replay contract                           |
| Exported log with a cancel entry mutated by caller | Runtime state unaffected (clone covers the new kind)                      |

## Acceptance Criteria

1. Cancelling an armed windup returns the player to idle with the Tick unchanged, and the armed marker disappears from the published snapshot.
2. Cancelling when nothing is armed is rejected with no state change and no log entry.
3. The cancel is drivable through the runtime queue and the debug API, serialized with every other input.
4. A recorded run containing a cancel replays from its seed and log to an identical final snapshot.
5. The determinism goldens pass without regeneration.
