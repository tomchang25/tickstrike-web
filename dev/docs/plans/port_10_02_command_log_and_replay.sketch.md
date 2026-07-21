# Port 10 Child 02: Command Log And Replay

Parent Plan: `port_10_complete_run_lifecycle.md`

## Goal

Give the runtime an append-only record of every accepted input — commands, reward selections, and milestone decisions — plus debug-API export and replay, so a seed and its log reproduce any reported run state. This is plan requirement 7 and acceptance criterion 5, and it also delivers the runtime entrance for the milestone decision that child 01 left core-only.

## Summary

The favored direction: the log lives on `GameRuntime` (the single serialized entry point), records only accepted resolutions, and replay drives the same public entrances a player would. Nothing in core changes; child 01 already made every input deterministic. The expected outcome is a `window.__TICKSTRIKE__.exportCommandLog()` / `replayCommandLog(log)` pair whose round-trip produces an identical final snapshot, verified by an automated test.

The main things the spec author must verify fresh: the effective-seed shape a log must record, and where a runtime-level round-trip test can actually run given that `GameRuntime` constructs a Pixi renderer.

## Sketch

- Runtime milestone entrance: `GameRuntime.selectMilestoneDecision(choice)` modeled on `selectReward` — a new variant in the `QueuedJob` union in `game-runtime.ts`, resolved in `drainCommands` by calling child 01's `resolveMilestoneDecision`, followed by `emit()`. No enemy phase, no presentation timeline, mirroring the reward job.
- Log ownership: a private `{ scenarioId, seed, entries[] }` structure on `GameRuntime`. Entries are appended inside `drainCommands` immediately after a resolution reports `accepted: true` — the single choke point all three input kinds already flow through. Candidate entry union: `{ kind: "command", command }`, `{ kind: "reward", artifactId }`, `{ kind: "milestone", choice }`.
- Clearing: `loadScenario` replaces the log with a fresh header; `reset()` already routes through `loadScenario`, satisfying "cleared on reset or scenario replacement" with one code path. Verify no other world-replacing path exists.
- Seed to record: `TestScenario.seed` is optional and scenario fixtures default it internally (for example `createFoundationArena(seed ?? SHIPPED_SCENARIO_SEED)`), so the scenario object's own `seed` field is the likely recordable value — but verify whether a scenario with an undefined `seed` can produce a world the log cannot reproduce, and whether `WorldSnapshot.seed` (a number) is derivable or needs the original `Seed` input. The log must store whatever value makes `createWorld` deterministic again.
- Replay: `replayCommandLog(log)` resolves the scenario via the registry, calls `runtime.loadScenario({ ...scenario, seed: log.seed })`, then sequentially awaits each entry through `execute` / `selectReward` / `selectMilestoneDecision`. The queue already serializes, so replay needs no special mode; it returns the final snapshot so callers can compare. Replay entries that come back rejected indicate a corrupted or stale log — surface an error rather than continuing silently.
- Debug API: add `exportCommandLog` and `replayCommandLog` to `TickstrikeDebugApi` in `src/harness/debug-api.ts`, plus `selectMilestoneDecision` for the UI child and tests. Export must deep-copy to a JSON-safe object so callers cannot mutate runtime state.
- Round-trip test placement is the main risk to inspect: `GameRuntime` constructs `PixiGameRenderer` eagerly, and unit tests run in a node environment (`vitest` `environment: "node"`). Verify whether an unmounted runtime can execute commands headlessly (renderer `sync`/`updateSnapshot` may guard on mount — check). If it can, a unit round-trip test under `test/unit/` is the cheapest AC5 proof; if not, candidates are a core-level round-trip (drive `resolveCommand` directly with a scripted log, similar to the determinism goldens) plus an e2e round-trip through the debug API in child 03.
- Presentation cost during replay is acceptable: replay awaits each command's presentation like normal play. If that proves too slow for tests, the spec may consider a runtime-level fast path, but only if it provably cannot change core outcomes.
- Candidate files to inspect: `src/runtime/game-runtime.ts`, `src/harness/debug-api.ts`, `src/harness/types.ts`, `test/unit/determinism/` (for the golden runner's command-script pattern), and wherever runtime-level tests currently live, if anywhere.

## Non-Goals

1. Save/load UX, persistence, or any IndexedDB work — the log is an in-memory debug substrate only.
2. Undo, record replay, or checkpoint revive (tracked as Future Draft items in `TODO.md`).
3. Any UI consumption of the log or the milestone entrance — child 03 owns overlays and scenarios.
4. Log schema versioning or cross-session compatibility promises; the log is not yet a persisted artifact.

## Acceptance Criteria

1. Every accepted command, reward selection, and milestone decision is recorded in order with the scenario identity and seed; rejected inputs are not recorded.
2. The log is cleared on reset or scenario replacement.
3. Export returns a self-contained, mutation-safe log; replaying a seed and its log through the public entrances reproduces an identical final snapshot for a recorded run.
4. The milestone decision is drivable through the runtime and debug API using the same serialized queue as every other input.
