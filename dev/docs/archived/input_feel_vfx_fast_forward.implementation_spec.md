# Input Fast-Forward of Pending VFX

Parent Plan: none (standalone spec)

## Goal

Player input currently waits for the previous turn's full presentation timeline — including every enemy motion, knockback, and death animation — before the next command resolves, which makes the controls feel sticky. This change fast-forwards the pending presentation to its end state the moment a new input is enqueued, and gives held-direction movement a fixed cadence instead of an animation-length gate, so input responsiveness stops depending on VFX duration.

## Summary

The runtime already resolves core state synchronously and publishes the snapshot before any animation starts; the stickiness comes from two gates on the presentation layer, not from the simulation:

- `GameRuntime.drainCommands` awaits the full presentation timeline of the previous accepted command before dequeuing the next job, so a queued click waits out every enemy VFX tail.
- The held-movement keyboard repeat polls `runtime.isIdle`, which requires zero active timelines, ghosts, and transients — so movement rate is accidentally governed by animation length and enemy VFX tails.

The fix, in three parts:

1. **Working fast-forward in `PresentationDirector`.** The existing `finishImmediately()` is a no-op (it sets `gsap.globalTimeline.timeScale(1000)` then back to `1` synchronously, with no tick in between) and has no callers. Replace it with `finishActive()`: iterate a copy of the active timeline set and drive each timeline to `totalProgress(1)`, which fires remaining callbacks in order, triggers `onComplete`, and runs the existing release path (transients, position reservations, promise resolution). Never `kill()` — killing freezes sprites mid-tween and skips end states; `cancel()` remains the scenario-replacement path only.
2. **Enqueue-triggered fast-forward in `GameRuntime`.** All three job entrances (`execute`, `selectReward`, `selectMilestoneDecision`) route through one private enqueue helper that calls `presentation.finishActive()` when the presentation is busy. The `await presentationDone` serialization in `drainCommands` stays untouched — fast-forward only makes it resolve almost immediately. When no new input arrives, animations play exactly as today.
3. **Fixed held-move cadence in `use-game-session`.** The held-movement interval changes from a 50 ms poll gated on `isIdle` to a fixed ~260 ms cadence (matching today's effective move rate, `MOVE_DURATION` 0.26 s) that enqueues unconditionally; the enqueue-triggered fast-forward trims only the long enemy tails. Movement rate becomes a deliberate design parameter instead of an animation side effect.

Correctness rests on the architecture's one-way data flow: presentation only writes Pixi view transforms and never feeds back into core, so fast-forwarding animations cannot alter world state, the command log, or determinism goldens. The user-visible trade-off, accepted by design: spamming inputs skips the previous turn's animations; unhurried play looks unchanged.

## Requirements

1. A player input issued while the previous turn's presentation is still playing must resolve immediately by completing the pending animations to their end states, because input latency must not scale with VFX duration.
2. When no new input is pending, presentation must play at its normal speed and appearance; fast-forward triggers only on demand.
3. Held-direction movement must advance at a fixed cadence of one step per ~260 ms (today's effective rate) regardless of enemy VFX tails, so movement pacing is authored rather than emergent from animation length.
4. Reward and milestone selections clicked while end-of-wave VFX are still playing must also take effect immediately, because they share the same job queue and suffer the same wait today.
5. Fast-forward must leave no presentation residue: all transients, ghost views, and position reservations release, and the idle signal returns true.
6. Core determinism is untouched: the same seed and command sequence produce the same event stream and final snapshot as before.

## Relational Context

- Core resolution is synchronous and completes before presentation starts: `drainCommands` calls `resolveCommand`, then `emit()` publishes the snapshot, then `presentation.play()` builds timelines. Presentation is a pure consumer that writes only Pixi view state and never writes core; fast-forward therefore cannot make runtime state stale.
- `drainCommands` serialization is load-bearing and must stay: the next queued job is dequeued only after `await presentationDone`. Fast-forward accelerates that promise's resolution; do not remove or bypass the await, and do not resolve a job before its predecessor's presentation has completed (fast-forwarded or natural).
- `PresentationDirector.timelineDone` wires `onComplete` and `onInterrupt` to a `finish()` guarded by set-deletion, then runs `afterComplete` (which releases transients via `renderer.releaseTransient` and motion reservations via `renderer.releasePosition`) and resolves the tracked promise. Completing a timeline via `totalProgress(1)` triggers this path naturally; `finishActive()` must complete timelines, not kill them.
- Completing timelines mutates `activeTimelines` during iteration (via `finish()`), so `finishActive()` iterates a snapshot copy, the same pattern `cancel()` already uses.
- `playNow` releases terminal ghost views only after `await Promise.all(animations)`; fast-forward resolves those promises, and the release runs on the microtask queue before the drain loop continues. No extra handling is needed, but the ordering is why `finishActive()` alone is sufficient for `isIdle` to return true.
- Timeline `.call()` callbacks (water death frames, `setPlayerAnimation("idle")`, presenter hooks) fire synchronously in playhead order during `totalProgress(1)`. All current callbacks are idempotent view writes; this becomes an invariant — future presenter timelines must not depend on real elapsed time between callbacks.
- Player-motion end states land on the same coordinates the snapshot already holds (`cellToPixels` of the resolved cell), so the post-fast-forward frame agrees with `renderer.updateSnapshot` reconciliation once reservations release.
- `runtime.isIdle` (`!processingCommands && queue empty && presentation.isIdle`) keeps its meaning for `SemanticMirror`'s `data-idle`, the debug API, and e2e waits; it simply becomes reachable sooner after a fast-forward.
- The held-move repeat in `use-game-session` currently never enqueues while busy (it polls `isIdle`), so it would never trigger the enqueue fast-forward; that is why its gate must change to a fixed cadence in the same change. `move()` retains its `interactive` guard, which keeps held keys inert during pending reward/milestone overlays.
- `replayCommandLog` awaits each entry's resolution, which resolves before the entry's presentation finishes; with enqueue-triggered fast-forward, replay now fast-forwards between entries. Semantics are unchanged (core events identical); replays just render faster.
- Wrong shape to avoid: triggering fast-forward from inside `drainCommands` or the click handler instead of the single enqueue seam — the seam must cover all three job kinds uniformly and must be a no-op when the presentation is idle.

## Scope

### Included

- A working `finishActive()` fast-forward on `PresentationDirector`, replacing the broken `finishImmediately()`.
- Enqueue-triggered fast-forward for all three runtime job kinds.
- Fixed-cadence held-direction movement.
- Focused unit coverage and one targeted Playwright capability scenario.

### Excluded

- Any change to core resolution, event ordering, command log, or determinism goldens.
- Partial or per-event fast-forward (e.g. keeping player VFX while skipping enemy VFX), timeline speed-up ramps, and animation duration tuning.
- Input buffering depth changes or new input verbs; touch/gamepad input.
- `InputController` pointer/preview behavior.

## Files to Change

| File                                                             | Change Size | Purpose                                                                            |
| ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `src/presentation/timelines/presentation-director.ts`            | Small       | Replace no-op `finishImmediately()` with `finishActive()` completing all timelines |
| `src/runtime/game-runtime.ts`                                    | Small       | Route all job enqueues through one helper that fast-forwards a busy presentation   |
| `src/app/use-game-session.ts`                                    | Small       | Held-move fixed ~260 ms cadence; drop the `isIdle` poll gate                       |
| `test/unit/presentation/timelines/presentation-director.test.ts` | Small       | `finishActive()` resolves play, fires end-state callbacks, releases everything     |
| `test/unit/runtime/game-runtime.test.ts`                         | Small       | Enqueue during active presentation triggers fast-forward; serialization preserved  |
| `test/e2e/mobility-combat.spec.ts`                               | Small       | Capability scenario: rapid successive inputs both apply and presentation settles   |

## Execution Outline

1. `PresentationDirector`: implement `finishActive()` (copy the set, `totalProgress(1)` each timeline) and delete `finishImmediately()`. Add unit tests first-class in the same commit: start a `play()` with motion + impact transient + terminal ghost, call `finishActive()` before natural completion, assert the play promise resolves without ticker time, `isIdle` is true, `transientCount` and `terminalViewCount` are 0, and the final `setPlayerAnimation("idle")` callback fired.
2. `GameRuntime`: extract a private enqueue helper used by `execute`, `selectReward`, and `selectMilestoneDecision` that pushes the job, calls `presentation.finishActive()` when `presentation.isIdle` is false, and kicks `drainCommands`. Add a unit test that enqueues a second command while the first presentation is mid-flight and asserts the second resolves without waiting the first batch's natural duration, and that per-job ordering is unchanged.
3. `use-game-session`: change the held-move interval to a fixed ~260 ms cadence that calls `move()` unconditionally (keeping the immediate first step on keydown), and remove the `runtime.isIdle` check from the repeat closure.
4. Add the Playwright capability scenario (two rapid inputs both apply; idle signal returns true; no residue), then run `npm run verify` plus the targeted `npx playwright test -g` selection. Full e2e stays in CI per the browser run policy.

## Implementation Notes

- Use `totalProgress(1)`, not `progress(1)`, so any timeline-level repeat is also completed; child-tween repeats are covered by either.
- `finishActive()` must be safe to call re-entrantly and when idle: completing a timeline synchronously runs `finish()`, `afterComplete`, and promise resolution, so iterate `[...this.activeTimelines]` and rely on the existing delete-guard in `finish()`.
- In the runtime enqueue helper, fast-forward is a fire-and-forget synchronous call before `void this.drainCommands()`; no await is needed because completion resolves the pending `presentationDone` on the microtask queue, which the already-running drain loop is awaiting.
- Do not gate the enqueue fast-forward by job kind or generation: `finishActive()` on an idle director is a no-op, and scenario replacement already runs `cancel()` via `setGeneration` before any stale timeline could matter.
- In `use-game-session`, keep the constant's intent readable (e.g. rename `MOVE_REPEAT_MS = 50` to a held-move cadence constant of 260). The cadence value is the movement-rate design parameter; changing it later is balance work, not architecture.
- Unit tests must not await real animation durations for the fast-forward assertions; the point of the test is that resolution happens without ticker advancement.

## Edge Cases

| Case                                                       | Expected Handling                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `finishActive()` with no active timelines                  | No-op; no callbacks, no state change                                                                             |
| New input mid-dash/move of the player's own sprite         | Tween jumps to its end cell; trailing `setPlayerAnimation("idle")` fires before the next batch sets a new pose   |
| Fast-forward during an authored water-death frame sequence | Frame callbacks fire synchronously in order, ending on the last frame; ghost destroyed after the microtask flush |
| Scenario replacement racing a queued input                 | Unchanged: generation guards reject stale jobs; `cancel()` path is untouched                                     |
| Held key during a pending reward or milestone overlay      | Cadence keeps ticking but `move()`'s `interactive` guard drops the command, as today                             |
| Input spam                                                 | Each enqueue completes the previous batch; animations are visually skipped, core order and results unchanged     |
| Command-log replay                                         | Entries fast-forward each other; identical events and final snapshot, faster rendering                           |

## Acceptance Criteria

1. An input issued while the previous turn's effects are still animating resolves immediately: pending animations jump to their end states and the new action's result appears without waiting out the previous animations.
2. With no pending input, animations play at their normal speed and appearance.
3. Held-direction movement advances at a fixed ~0.26 s per step and is not delayed by lingering enemy effect animations.
4. After any fast-forwarded turn there is no visual residue: transient effects, ghost views, and reserved motion slots are all released, and the idle signal returns true.
5. Reward and milestone selections made during end-of-wave effect tails take effect immediately.
6. The same seed and input sequence produce the same event stream and final state as before the change; determinism goldens pass without regeneration.
