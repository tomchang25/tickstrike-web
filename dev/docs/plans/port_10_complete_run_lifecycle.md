# Complete Run Lifecycle in the Same Runtime

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Turn the single Tick Arena into a complete run without changing its command, world, enemy, or presentation entry points.

## Requirements

1. Start a fresh run, load the first authored wave, and reset all run-scoped state deterministically.
2. Detect wave completion only after no living enemy, pending Telegraph, or scheduled spawn remains.
3. Pause the same runtime for rewards, then resume it without duplicate ticks or stale input.
4. Resolve player death after the current Tick, stop future world work, and expose restart.
5. Rebuild the same fresh logical state on restart while cancelling old presentation work.
6. Support the authored milestone and Endless branch only after the ordinary run path works.
7. Record every accepted command, reward selection, and milestone decision into an append-only log (`scenarioId`, `seed`, ordered entries), cleared on reset or scenario replacement, and expose `exportCommandLog()` and `replayCommandLog()` on the debug API so a seed plus its log reproduces any reported run state. This is the substrate the later save design consumes (a save is a checkpoint snapshot plus, optionally, its log); it is not the save UX, which stays out of scope here. Moved from engineering hardening spec b1, deferred until this lifecycle consumes it.

## Design

The lifecycle is a small state machine around the existing runtime: `running`, `reward`, `dead`, `complete`, and `endless`. These states control command admission; they do not own combat entities or recompute outcomes. A run transition replaces the canonical scenario state and increments the reset generation used by presentation cleanup.

## Children

Execute top to bottom, one child per session, tests green before each commit.

| Child                                 | Scope                                                                                                                                                                           | Handoff                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 01 Core milestone pause and decision  | Milestone state, wave-phase branch, decision resolver, admission gate, events, unit tests                                                                                       | [port_10_01_milestone_lifecycle_core.implementation_spec.md](port_10_01_milestone_lifecycle_core.implementation_spec.md)           |
| 02 Command log and replay             | Runtime `selectMilestoneDecision` entrance, append-only log of accepted commands/rewards/milestone decisions, debug API `exportCommandLog`/`replayCommandLog`, round-trip tests | [port_10_02_command_log_and_replay.implementation_spec.md](port_10_02_command_log_and_replay.implementation_spec.md)               |
| 03 Lifecycle UI and full-run scenario | Milestone overlay in testbed and home shell, shortened-milestone harness scenario, run-lifecycle e2e, switch the home page to the full waves run                                | [port_10_03_lifecycle_ui_and_run_scenario.implementation_spec.md](port_10_03_lifecycle_ui_and_run_scenario.implementation_spec.md) |

## Non-Goals

1. Do not add active-run saves, settlement currency, permanent unlocks, or new modes.
2. Do not create a main-menu runtime separate from the Tick Arena.
3. Do not add tutorials or progression systems.
4. Do not allow a lifecycle overlay to own gameplay state.

## Acceptance Criteria

1. One deterministic browser run can start, clear waves, select a reward, die, restart, and reach the milestone branch.
2. No Tick, enemy decision, reward callback, or presentation event occurs after a terminal transition.
3. Restart produces the same initial snapshot as a fresh start and removes old overlays, entities, Telegraphs, and timelines.
4. The full lifecycle uses the same runtime entry point from first input to terminal outcome.
5. `exportCommandLog` and `replayCommandLog` round-trip: replaying a seed and its command log through the public entrances reproduces an identical final snapshot for a recorded run.
