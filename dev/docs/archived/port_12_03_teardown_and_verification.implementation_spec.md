# Teardown Completeness and Full-Run Cue Verification

Parent Plan: `port_12_audio_delivery.md`

## Goal

Close out audio delivery: suspend and resume audio on tab visibility changes, and add the full-run verification that every audible combat event across a deterministic run produces its cue while reset and teardown leave no orphan voice.

## Summary

The teardown backbone already exists — `invalidateWork()` calls `audio.stopAll()` on reset/restart/scenario swap and `destroy()` calls `audio.dispose()` on unmount. This child fills the two remaining gaps.

- **Visibility suspend/resume.** The mixer gains `suspend()`/`resume()` over the WebAudio context, and `use-game-session` adds a `visibilitychange` listener that suspends the context when the tab is hidden and resumes it when visible. This is a minimal audio-owned hook by decision; port_14 later consolidates platform lifecycle wiring. `stopAll` on reset and `dispose` on teardown are unchanged.
- **Full-run cue coverage.** A new unit test feeds the committed determinism golden event streams (`test/unit/determinism/__golden__/*.json`) through the `AudioDirector` with a fake mixer, asserting the run produces cues and that anchor cues (attack whoosh, damage, guard chip) fire. A classification guard asserts every event type present in the goldens is either in the director's exported audible set or a maintained intentionally-silent set, so a future event type added upstream cannot silently go unmapped.
- **Orphan-free stop.** The debug API exposes the mixer's active-voice count, and a browser check confirms it returns to zero after a reset. The mixer's `stopAll`/`dispose` unit coverage from 12.1 already proves the primitive.
- **Result.** Hiding the tab pauses audio and returning resumes it; a deterministic run's audible events are all accounted for; reset and teardown leave no playing or pending source.

## Relational Context

- `AudioMixer` (presentation) owns the `AudioContext`; only it may `suspend`/`resume`/`close` it. `suspend()` is a no-op unless the context exists and is running; `resume()` is a no-op unless it exists and is suspended, so both are safe before unlock and idempotent. This mirrors the existing `unlock()` resume guard.
- `use-game-session` (app) is the only wiring point, as with the 12.1 first-gesture unlock. It adds a `document` `visibilitychange` listener that calls `runtime.audio.suspend()`/`resume()`, and removes it on unmount. It must not couple to the input layer's separate `visibilitychange` handler in `use-keyboard-input.ts` (that one only clears held keys); the two listeners are independent.
- The coverage test drives only presentation: it reads the golden JSON (already produced by the core-only determinism harness), constructs a `CueLibrary` over `CUE_DEFINITIONS` with an injected fetcher/decoder so buffers exist without real assets, and a fake `AudioMixer` that records `play` calls. It does not run the core or the runtime.
- `AudioDirector` exposes its audible event-type set (the union of the per-event and hit-feedback maps) so the coverage test can assert classification without duplicating the mapping. The director stays the single owner of event→cue identity; the test reads the set, it does not redefine it.
- The debug API (`installDebugApi`) reads `runtime.audio.activeVoiceCount`. This is a read-only observability seam like the existing play-count read; it adds no control surface.
- `GameRuntime.isIdle` intentionally continues to exclude audio: cues are short and fire-and-forget, so gating idle on live voices would make the presentation idle boundary flaky. Orphan-free is verified by active-voice count reaching zero after teardown, not by idle.

## Scope

### Included

- `AudioMixer.suspend()`/`resume()`.
- A `visibilitychange` audio hook in `use-game-session`.
- An exported audible-event-type set on `AudioDirector`.
- A debug-API active-voice-count read.
- A golden-stream cue coverage unit test with a classification guard.
- Mixer unit tests for suspend/resume, and a browser check that active voices return to zero after reset.

### Excluded

- Consolidated platform lifecycle wiring (route change, focus, renderer teardown ordering) — owned by port_14.
- Any change to the cue set, mapping, volume model, unlock, or the existing `stopAll`/`dispose` teardown.
- Special-result/artifact override cues (parked in `audio_special_result_sfx.sketch.md`).

## Files to Change

| File                                                  | Change Size | Purpose                                                  |
| ----------------------------------------------------- | ----------- | -------------------------------------------------------- |
| `src/presentation/audio/audio-mixer.ts`               | Small       | `suspend()`/`resume()` over the context.                 |
| `src/presentation/audio/audio-director.ts`            | Small       | Export the audible-event-type set.                       |
| `src/app/use-game-session.ts`                         | Small       | `visibilitychange` listener calling suspend/resume.      |
| `src/harness/debug-api.ts`                            | Small       | Expose the active-voice count.                           |
| `test/unit/presentation/audio/audio-mixer.test.ts`    | Small       | suspend/resume behavior and guards.                      |
| `test/unit/presentation/audio/audio-coverage.test.ts` | Medium      | Golden-stream cue coverage and the classification guard. |
| `test/e2e/audio.spec.ts`                              | Small       | Active voices return to zero after reset.                |

## Execution Outline

1. Add `suspend()`/`resume()` to the mixer with context/state guards; extend the mixer fake and unit test.
2. Export the audible-event-type set from the director (union of the per-event and hit-feedback maps), without changing behavior.
3. Wire the `visibilitychange` listener in `use-game-session`, cleaned up on unmount.
4. Add the active-voice-count read to the debug API.
5. Write the coverage test: load each golden, flatten every entry's `events`, feed them through the director over a fake mixer, assert anchor cues fire, and assert every event type present is classified as audible or intentionally-silent.
6. Extend the audio e2e: after unlocking and driving activity, reset and assert the active-voice count is zero.
7. Run `npm run verify` and the targeted audio e2e.

## Implementation Notes

- **suspend/resume.** `suspend()` → if context exists and `state === "running"`, `void context.suspend()`. `resume()` → if context exists and `state === "suspended"`, `void context.resume()`. Do not create a context here; only `unlock()` does.
- **Visibility hook.** Read `document.visibilityState`; `"hidden"` → `audio.suspend()`, otherwise `audio.resume()`. Resume is guarded, so a resume fired before any unlock is a harmless no-op. Keep this listener separate from the input layer's.
- **Verification gap to state, not fix.** The configured harness has no component-test layer, so the `use-game-session` visibility wiring is verified by the mixer's suspend/resume unit tests plus inspection, not a driven `visibilitychange`; Playwright cannot set `document.visibilityState`. Note this in the closeout rather than adding a test layer.
- **Coverage test shape.** Golden entries are `{ events?: CombatEvent[] }` (plus a trailing `{ snapshot }`); flatten `events`. Preload the library by injecting a fetcher returning any bytes and a decode returning a stub `AudioBuffer`, so every cue has a buffer. Assert `action_whoosh`, `damaged`, and `blocked` appear — the command walk always attacks into enemies, takes hits back, and chips guard; the current goldens kill nothing, so `died`/`guard_break`/`smash`/`pickup` are not asserted. The classification guard iterates the distinct event types across all goldens and fails naming any type that is neither audible nor in the maintained silent set.
- **Silent set.** Enumerate the currently-present non-audible types (movement, tick/world, telegraph/reservation, commit/detonate, recovery, stagger lifecycle, protection, interrupt, wave lifecycle, milestone, etc.). The guard's value is that a newly introduced event type appearing in a regenerated golden forces a mapped-or-silent decision.

## Edge Cases

| Case                                       | Expected Handling                                                   |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Tab hidden before any gesture (no context) | `suspend()` is a no-op; nothing to pause.                           |
| Tab shown again after a suspend            | `resume()` restarts the context; queued/near-future cues play.      |
| Reset while the tab is hidden              | `stopAll()` clears voices; the context stays suspended until shown. |
| A golden contains a newly added event type | Coverage classification guard fails, naming the unclassified type.  |
| Active-voice count read before unlock      | Returns zero.                                                       |

## Acceptance Criteria

1. Hiding the browser tab pauses combat audio and returning to the tab resumes it.
2. Across a full deterministic run, every audible combat event produces a cue, and no event type in the run is left unclassified between audible and intentionally silent.
3. After a reset, no audio voice remains active.
4. Existing reset, restart, and teardown behavior continues to stop all audio with no orphan source.
