# Port 10 Child 02: Command Log And Replay

Parent Plan: `port_10_complete_run_lifecycle.md`

## Goal

Record every accepted input — command, reward selection, and milestone decision — into an append-only per-run log on the runtime, and expose debug-API export and replay so a seed plus its log reproduces any recorded run state. This delivers plan requirement 7 and acceptance criterion 5, and adds the runtime entrance for the milestone decision that child 01 left core-only.

## Summary

Child 01 made every gameplay input deterministic in core. This child gives the runtime a faithful recording of the accepted ones and a replay that drives the same public entrances a player used, so `seed + log` reconstructs the run.

- `GameRuntime` composes a `RunCommandLog` (`{ scenarioId, seed, entries }`). `loadScenario` resets it to a fresh header; every accepted resolution in `drainCommands` appends one entry. Rejected or generation-stale inputs are never recorded.
- A new `selectMilestoneDecision(choice)` runtime entrance, modeled on `selectReward`, serializes child 01's `resolveMilestoneDecision` through the same queue. The three entry kinds are `command`, `reward`, and `milestone`.
- Debug API gains `selectMilestoneDecision`, `exportCommandLog` (deep-copied, mutation-safe), and `replayCommandLog(log)`.
- Replay reconstructs the world with `loadScenario({ ...scenario, seed: log.seed })` and re-drives each entry through `execute` / `selectReward` / `selectMilestoneDecision`. The queue already serializes, so replay needs no special mode and produces the same final snapshot.

Because `GameRuntime` constructs a Pixi renderer that requires a mounted canvas, the recording/clearing/round-trip behavior is proven by a debug-API-driven Playwright spec; the pure log clone/export helper is unit-tested. No core files change.

## Relational Context

- `GameRuntime.drainCommands` is the single serialized choke point all inputs pass through; it is the only place entries are appended, and only when a resolution reports `accepted` and the job's generation still matches `currentGeneration`. A stale job that is rejected after a scenario replacement must not be logged.
- `GameRuntime.loadScenario(scenario)` is the single world-replacement path (`reset()` routes through it). It resets the log header from `scenario.id` and `scenario.seed`, satisfying "cleared on reset or scenario replacement" with one code path. No other path replaces the world.
- The log records `seed: scenario.seed` (a `Seed | undefined`), not the normalized `WorldSnapshot.seed` number. Replay calls `createWorld(log.seed)` via `loadScenario`, reproducing exactly what the original run constructed — including the fixture's own default when `seed` is undefined. Exporting to JSON drops an undefined `seed` key, which round-trips back to the same fixture default, so this is safe.
- Layer boundary: `src/runtime` must not import the harness scenario **registry as a value** (`nothing imports harness except app`, enforced by `check:boundaries`; existing type-only harness imports in `game-runtime.ts` are allowed). Therefore `replayCommandLog(scenario, log)` takes the already-resolved `TestScenario`; the debug API in `src/harness` performs `requireScenario(log.scenarioId)` and passes the value in.
- `selectMilestoneDecision` follows `selectReward` exactly: it enqueues a job resolved by child 01's `resolveMilestoneDecision(world, choice, scenario.waveContext)`, calls `emit()`, and runs no enemy phase or presentation timeline. It reuses the milestone context the runtime already holds via the loaded scenario.
- Replay drives the public entrances in order and awaits each; a replayed entry that comes back rejected means a stale or corrupted log — surface it as a thrown error rather than continuing silently. Replay itself re-records into the freshly reset log, so the post-replay log equals the original.

## Scope

### Included

- `RunCommandLog` type and pure clone/export helper; runtime log ownership, the milestone entrance, and export/replay; debug-API surface; the log unit test and one debug-API round-trip e2e.

### Excluded

- Any UI, overlay, or home-page change; the milestone overlay and full-run scenario (child 03).
- Log persistence, JSON schema versioning, or cross-session compatibility; save/load, undo, record replay, checkpoint revive (Future Draft).
- Any change to `src/core`.

## Files to Change

| File                                    | Change Size | Purpose                                                                           |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `src/runtime/command-log.ts`            | Small       | `RunCommandLog` / `RunCommandLogEntry` types and a pure deep-clone/export helper  |
| `src/runtime/game-runtime.ts`           | Medium      | Own the log, append accepted inputs, add `selectMilestoneDecision`, export/replay |
| `src/harness/debug-api.ts`              | Small       | Expose `selectMilestoneDecision`, `exportCommandLog`, `replayCommandLog`          |
| `test/unit/runtime/command-log.test.ts` | Small       | Clone/export immutability and entry-shape coverage                                |
| `test/e2e/command-log.spec.ts`          | Medium      | Debug-API round-trip: record, export, replay, assert identical final snapshot     |

## Execution Outline

1. Add `command-log.ts`: the entry union (`command` / `reward` / `milestone`), the `RunCommandLog` shape, and a pure clone function; unit-test the clone/export immutability.
2. Wire the log into `GameRuntime`: reset in `loadScenario`, append accepted entries at the `drainCommands` resolve points, add `exportCommandLog()`.
3. Add `selectMilestoneDecision(choice)` as a queued job beside the reward job, resolving child 01's `resolveMilestoneDecision`.
4. Add `replayCommandLog(scenario, log)`: load the scenario with the logged seed, then await each entry through the matching entrance; throw on a rejected entry.
5. Extend the debug API with the three methods, resolving the scenario in the harness layer.
6. Add the debug-API round-trip e2e on the existing `rewards` scenario (commands plus a reward selection), asserting the replayed final snapshot equals the recorded one.
7. Run `npm run verify` and the targeted e2e.

## Implementation Notes

- Keep the append guarded by both `accepted` and the current-generation check; do not log a job that is rejected by the generation mismatch after a scenario replacement.
- `exportCommandLog` must return a structurally cloned object so a caller cannot mutate runtime state; `replayCommandLog` must not assume the passed log is the runtime's own instance.
- Replay reuses the normal entrances, so presentation plays exactly as in live play; no fast path. If a future test needs speed, that is a separate decision and must not change core outcomes.
- The e2e records at least two entry kinds (a command and a reward). The `milestone` kind is structurally identical and is exercised live by child 03's lifecycle scenario; note that gap rather than adding a milestone scenario here.

## Edge Cases

| Case                                          | Expected Handling                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Rejected command (e.g. during a reward pause) | Not appended to the log                                                     |
| Scenario replaced or reset mid-run            | Log resets to the new header; prior entries are gone                        |
| `seed` undefined on the scenario              | Recorded as undefined/omitted; replay reconstructs the same fixture default |
| Replay entry returns rejected                 | Replay throws, signaling a stale or corrupted log                           |
| Exported log mutated by the caller            | Runtime state is unaffected (export is a deep copy)                         |

## Acceptance Criteria

1. Every accepted command, reward selection, and milestone decision is recorded in order with the scenario identity and seed; rejected inputs are not recorded.
2. The log is cleared on reset or scenario replacement.
3. Export returns a self-contained, mutation-safe log; replaying a seed and its log through the public entrances reproduces an identical final snapshot for a recorded run.
4. The milestone decision is drivable through the runtime and debug API using the same serialized queue as every other input.
