# Port 10 Child 01: Core Milestone Pause And Decision

Parent Plan: `port_10_complete_run_lifecycle.md`

## Goal

Give a wave-driven run an authored end. Clearing the final authored wave pauses the world for a deterministic End Run / Continue Endless decision, so the run can complete as a victory or branch into the endless template through the same core entry points.

## Summary

Today the wave phase can never finish a run: every scenario's `waveFor` falls back to the endless template, so `victoryReady` never fires and the milestone branch the reference game has (clear the last authored wave, choose End Run or Continue Endless) does not exist.

This child adds the milestone pause entirely inside `src/core`, copying the proven `pendingRewardOffer` pattern:

- A new `PendingMilestoneDecision` state owned by the `WaveRuntime` subsystem. The wave phase installs it when the cleared wave number equals a new optional `WavePhaseContext.milestoneWaveNumber`; while installed, `resolveCommand` rejects gameplay commands exactly as it does for a pending reward.
- A new `resolveMilestoneDecision(world, choice, context)` resolver beside `resolveRewardSelection`. `"end-run"` declares victory through the existing outcome authority. `"continue-endless"` generates the milestone wave's reward offer and rejoins the existing reward flow, which already starts the next wave — the endless template — on selection. With no offerable artifacts the next wave starts immediately.
- New semantic events `milestone_reached` and `milestone_decided`, and a new `pendingMilestone` field on `WorldSnapshot`.
- Scenarios that do not supply `milestoneWaveNumber` (all current ones) are byte-for-byte unchanged, including the determinism goldens.

The runtime queue entrance, command log, UI overlay, and the full-run scenario are children 02 and 03. After this child lands, the milestone flow is drivable and fully tested at the unit level via the resolver functions.

## Relational Context

- `resolveWavePhase` step 4 currently handles a cleared wave by either reporting `victoryReady` (when `waveFor` returns undefined), installing a reward offer, or starting the next wave. The milestone branch is checked first: when the cleared wave number equals `context.milestoneWaveNumber`, install the pause, emit `milestone_reached`, and return with `victoryReady: false`. The reward offer for that wave is deferred until the continue decision.
- `WaveRuntime` is the single owner of wave-progression state (wave number, slots, pending spawn batch); the pending milestone decision is wave-progression state and lives there. `RunBuild` keeps owning only the artifact build and the pending reward offer.
- `resolveCommand` in `action-resolver.ts` is the single command admission gate. It must reject with `consumedTime: false` while a milestone decision is pending, mirroring the existing `pendingRewardOffer` rejection. The runtime's queue serialization is untouched.
- `resolveMilestoneDecision` follows the `resolveRewardSelection` shape exactly: it mutates core through `WavePhaseWorld` capabilities, records its events via `world.recordEvents`, and never runs the player action, enemy phase, wave phase, or presentation.
- Declaring victory requires `updateEncounterOutcome`, which is World-owned. Name it on the `WavePhaseWorld` capability interface; per the facade-freeze rule this exposes an existing world-level orchestration on a context, it does not add a facade method.
- `WavePhaseContext` is assembled by harness fixtures because core never imports content catalogs. `milestoneWaveNumber` is optional; when absent, all paths behave exactly as today. `waveFor`'s endless fallback stays intact — endless waves continue to come from it after a continue decision.
- On `"continue-endless"`, generate the offer with the same `generateRewardOffer` inputs the wave phase uses (the `"rewards"` random stream, `context.offerableArtifacts`, the milestone wave number). Do not duplicate next-wave startup in the resolver: `resolveRewardSelection` already starts `waveFor(offer.waveNumber + 1)`. Only the no-offer path starts the next wave directly, using the same `createInitialSlotStates` call `resolveRewardSelection` uses.
- `WorldSnapshot.pendingMilestone` is a read-only projection cloned like `pendingReward`; nothing outside core consumes it until child 03. The semantic mirror and renderer are untouched.
- The wave phase already returns early when the player is not alive, so a milestone pause can never coexist with a defeat outcome.

## Scope

### Included

- Core milestone state, wave-phase branch, decision resolver, admission gate, events, snapshot field, and unit tests.

### Excluded

- Runtime queue entrance (`selectMilestoneDecision`), command log, debug API, UI overlay, scenarios, e2e, home-page scenario change, and any derived `runPhase` projection.

## Files to Change

| File                                             | Change Size | Purpose                                                                                  |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                        | Small       | `PendingMilestoneDecision`, `MilestoneChoice`, and the `pendingMilestone` snapshot field |
| `src/core/events/combat-events.ts`               | Small       | `milestone_reached` and `milestone_decided` event variants                               |
| `src/core/world/wave-runtime.ts`                 | Small       | Own the pending milestone decision: install, clear, cloned read                          |
| `src/core/world/world.ts`                        | Small       | Facade delegation getter and snapshot wiring                                             |
| `src/core/actions/wave-phase.ts`                 | Medium      | Context field, step-4 milestone branch, `resolveMilestoneDecision`, context capability   |
| `src/core/actions/action-resolver.ts`            | Small       | Reject commands while a milestone decision is pending                                    |
| `test/unit/core/actions/wave-phase.test.ts`      | Medium      | Milestone install, end-run, continue-endless (with and without offer), determinism       |
| `test/unit/core/actions/action-resolver.test.ts` | Small       | Admission rejection while the milestone pause is installed                               |

## Execution Outline

1. Add the model types and event variants so every later edit compiles against the final shapes.
2. Add the pending-decision state to `WaveRuntime` with the same clone discipline as `pendingBatch`, then the `World` delegation getter and snapshot field.
3. Add `milestoneWaveNumber` to `WavePhaseContext`, the step-4 branch in `resolveWavePhase`, and `resolveMilestoneDecision`; extend `WavePhaseWorld` with `updateEncounterOutcome`.
4. Add the admission rejection in `resolveCommand`.
5. Extend the unit suites: drive a wave to clear at the milestone number (reuse the existing wave-clear helpers), assert the pause, both decision branches, the no-offer branch, rejection of a decision with no pause installed, and command rejection during the pause.
6. Run `npm run verify`; the determinism goldens must pass without regeneration.

## Edge Cases

| Case                                                       | Expected Handling                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Decision submitted with no pending milestone               | Rejected resolution with a reason; no state mutation, no events                  |
| Unknown choice value at runtime boundary                   | Rejected resolution with a reason; no state mutation                             |
| Continue with absent or empty `offerableArtifacts`         | No reward pause; the next (endless) wave starts immediately with `wave_started`  |
| Milestone wave is also a reward-eligible wave              | Milestone pause wins; the reward offer opens only after a continue decision      |
| Scenario replacement or reset while the pause is installed | The world is replaced wholesale; no milestone state survives (existing behavior) |
| `milestoneWaveNumber` absent from the context              | Every current path, event stream, and golden fixture is unchanged                |

## Acceptance Criteria

1. Clearing the final authored wave pauses the run: gameplay commands are rejected until a decision resolves, and the pause is visible in the snapshot.
2. Choosing End Run produces the victory outcome with no further tick, enemy, spawn, or reward work.
3. Choosing Continue Endless opens the milestone wave's reward flow and then resumes with endless-template waves through the unchanged reward and wave paths.
4. Scenarios without an authored milestone behave exactly as before, and the determinism goldens pass unregenerated.
5. The same seed with the same decisions reproduces identical snapshots and event streams, verified at the unit level.
