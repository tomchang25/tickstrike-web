# Audio Engine: WebAudio Mixer, Unlock, Volume, and Rate Limiting

Parent Plan: `port_12_audio_delivery.md`

## Goal

Stand up the audio delivery engine that later children drive: a WebAudio mixer with a Master/Effect/Music gain graph, safe gesture unlock, three persisted volume controls, and per-cue rate limiting. This child builds the mechanism and its controls; it maps no gameplay events and plays no combat sound yet.

## Summary

Tickstrike Web has no audio today. This child adds the presentation-side engine every later audio child needs, without touching gameplay state or the semantic event stream.

- **Mixer (`src/presentation/audio/`).** A new `AudioMixer` owns a lazily-created browser `AudioContext` and a fixed gain graph: `effectGain → masterGain → destination` and `musicGain → masterGain → destination`. It plays a supplied `AudioBuffer` through a bus by creating a short-lived source node, tracking it in an active set, and releasing it on `ended`; a bounded active-voice cap and a per-key rate limiter keep repeated requests from flooding output. It exposes `unlock`, `setVolumes`, `play`, `stopAll`, and `dispose`. It reads no settings and owns no gameplay state.
- **Presentation output, mirroring the visual layer.** `AudioMixer` lives in `@presentation` and owns its browser API directly, exactly as `PixiGameRenderer` owns the canvas/Pixi app. `GameRuntime` owns the mixer instance alongside `renderer` and `presentation`; no new layer boundary is introduced.
- **Volume is persisted settings.** `SettingsStore` (runtime) is the single source of truth for the three volumes; the schema moves to v2 with a migration that preserves a v1 payload's `showDebugOverlay` and defaults the new volumes. The mixer never persists; it receives volumes as an imperative push.
- **Wiring lives in the session.** `use-game-session` pushes volume changes into the mixer (mirroring the existing `showDebugOverlay → renderer.setDebugMode` effect) and installs a one-shot first-gesture listener that calls `mixer.unlock()`. `SettingsPanel` renders three sliders from props.
- **Result.** The settings panel shows Master/Effect/Music sliders that persist across reload; nothing sounds before a user gesture; after a gesture the engine is running; repeated identical requests are rate limited; reset/restart/teardown stop every active voice and dispose the engine; a browser without a usable audio context runs normally and still persists the sliders.

## Relational Context

- `GameRuntime` (runtime) constructs and owns the single `AudioMixer`, the same way it constructs `renderer` and `presentation`, both imported from `@presentation`. The runtime→presentation import edge already exists; nothing else constructs the mixer.
- `AudioMixer` (presentation) directly owns the browser `AudioContext` and its `GainNode`s. Audio is a presentation output; this mirrors `PixiGameRenderer` owning browser rendering. No platform adapter and no runtime→platform edge is added for audio in this child.
- `SettingsStore` (runtime) is the single authority for the three persisted volume values, saved through the existing `SettingsStorage` platform adapter and localStorage envelope. The mixer holds only the live `GainNode` values derived from those settings; it neither reads nor writes storage.
- `use-game-session` (app) is the only wiring point. It already subscribes to `SettingsStore` and pushes `showDebugOverlay` to the renderer; it adds an effect that pushes the three volumes into `runtime.audio.setVolumes(...)`, and a first-gesture window listener that calls `runtime.audio.unlock()`. It passes the volume values and setters to `SettingsPanel` props.
- `SettingsPanel` (ui) is pure presentation: it renders the three sliders from props and calls back. It never touches the mixer or storage directly; ui reaches runtime/platform capability only through the session, never directly.
- `GameRuntime.invalidateWork()` (reset, restart, scenario replacement) already calls `presentation.cancel()`; it additionally calls `audio.stopAll()` so no voice outlives a run boundary. `GameRuntime.destroy()` already calls `renderer.destroy()`; it additionally calls `audio.dispose()`.
- The rate limiter is pure and owns no audio nodes; the mixer consults it before allocating a voice. No gameplay `CombatEvent` stream is consumed in this child — `play()` is exercised by unit tests here and by the audio director in child 12.2.
- The settings change is a versioned migration: `SETTINGS_VERSION` 1→2, `GameSettings` gains three volume fields, and `coerceSettings` maps a v1 payload (keep `showDebugOverlay`, default volumes) while an absent, wrong-version, or malformed payload still yields full defaults. The settings-store unit test and the settings e2e own the observable proof.

## Scope

### Included

- `AudioMixer` engine: lazy `AudioContext`, Master/Effect/Music gain graph, bounded active-voice pool, `play(buffer, bus, limiterKey?)`, `setVolumes`, `unlock`, `stopAll`, `dispose`.
- Pure per-key sliding-window rate limiter.
- Settings v2: three volume fields plus v1→v2 migration.
- Three volume sliders in the settings panel, wired through the session.
- First-gesture unlock and volume push wiring in the session.
- Unit tests for the mixer (fake context) and limiter, updated settings-store tests, and a targeted e2e for slider persistence.

### Excluded

- Any `CombatEvent`-to-cue mapping, an audio director, asset loading/decoding, and actual combat sounds (child 12.2).
- Visibility-change and route-change teardown wiring (child 12.3 / port_14); this child covers only the reset/restart/scenario/destroy boundaries the runtime already owns.
- Any music content or music source (deferred by Non-Goal 1); the Music bus and its control are wired but silent.

## Files to Change

| File                                                | Change Size | Purpose                                                                                       |
| --------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `src/presentation/audio/audio-mixer.ts`             | Medium      | WebAudio engine: gain graph, voice pool, unlock, setVolumes, play, stopAll, dispose.          |
| `src/presentation/audio/rate-limiter.ts`            | Small       | Pure per-key sliding-window limiter used by the mixer.                                        |
| `src/runtime/game-runtime.ts`                       | Small       | Own the mixer; `stopAll()` in `invalidateWork`, `dispose()` in `destroy`.                     |
| `src/runtime/settings-store.ts`                     | Small       | v2 schema with three volume fields and v1→v2 migration.                                       |
| `src/app/use-game-session.ts`                       | Medium      | Volume setters, push-to-mixer effect, first-gesture unlock listener, expose values/setters.   |
| `src/ui/settings/settings-panel.tsx`                | Small       | Three volume sliders driven by props.                                                         |
| `src/app/game-app.tsx`                              | Small       | Pass volume values and setters to `SettingsPanel`.                                            |
| `src/app/styles.css`                                | Small       | Minimal slider-row styling.                                                                   |
| `test/unit/presentation/audio/rate-limiter.test.ts` | Small       | Window pruning and gating.                                                                    |
| `test/unit/presentation/audio/audio-mixer.test.ts`  | Medium      | Pool reuse cap, bus/gain routing, limiter gate, unlock idempotency, stopAll/dispose teardown. |
| `test/unit/runtime/settings-store.test.ts`          | Small       | v2 defaults, v1→v2 migration, volume set/persist.                                             |
| `test/e2e/settings.spec.ts`                         | Small       | Volume sliders render and persist across reload.                                              |

## Execution Outline

1. Add the pure `rate-limiter.ts` and its unit test first — it has no browser dependency and the mixer consumes it.
2. Add `audio-mixer.ts` accepting an injected context factory and clock so the unit test drives it with a fake `AudioContext` and fake `AudioBuffer`; cover pool cap, bus/gain routing, limiter gate, unlock idempotency, and stopAll/dispose teardown.
3. Move `SettingsStore` to v2: extend `GameSettings`, bump the version, add the migration, and update the settings-store test.
4. Have `GameRuntime` construct the mixer and call `audio.stopAll()` in `invalidateWork` and `audio.dispose()` in `destroy`.
5. Wire `use-game-session`: add the three volume setters, an effect pushing volumes to `runtime.audio.setVolumes`, and a first-gesture unlock listener with cleanup; expose the values and setters.
6. Render the three sliders in `SettingsPanel`, pass props from `game-app`, and add minimal styles.
7. Extend the settings e2e to assert slider persistence across reload, then run `npm run verify` and the targeted settings e2e.

## Implementation Notes

- **Lazy context.** The mixer must not create an `AudioContext` at construction: browsers block or warn on a pre-gesture context, and `GameRuntime` construction must stay audio-side-effect-free. Create the context and gain graph on the first `unlock()`. `setVolumes` before unlock records values and applies them once the nodes exist.
- **Gain graph and volume.** `masterGain → destination`; `effectGain → masterGain`; `musicGain → masterGain`. Volumes are linear `0..1` clamped and written to `GainNode.gain.value`. Master scales everything because both bus gains feed it.
- **Voice pool — wrong shape to avoid.** A WebAudio `AudioBufferSourceNode` is single-use and cannot be restarted, so do not keep a reusable pool of source nodes like the Godot reference's player pool. Instead create a source per `play`, connect it to the target bus gain, track it in an active set, and remove it on `ended`. Bound concurrency by a maximum active-voice count: when the cap is reached, drop the new request. `stopAll` stops and disconnects every tracked source.
- **Rate limiter.** Map `key → timestamps`; on a request prune entries older than `windowSec`, reject if the retained count is at or above `maxPerWindow`, otherwise record `now` and allow. Inject `now()` for deterministic tests. An absent limiter key means no limiting.
- **Capability degradation.** If no `AudioContext` constructor is available, `unlock` is a silent no-op and `play` does nothing; the mixer never throws. This mirrors the settings adapter degrading to in-memory operation, so the game and the volume sliders keep working with no audio.
- **First-gesture listener.** Attach to `pointerdown` and `keydown` on `window`; on the first event call `runtime.audio.unlock()` and remove both listeners. Also remove them on unmount. Never `preventDefault` or otherwise interfere with input.
- **Settings migration.** v1 `data` is `{ showDebugOverlay }`; v2 adds `masterVolume`, `effectVolume`, `musicVolume`. Migrating a v1 payload keeps `showDebugOverlay` and defaults the volumes; a malformed field falls back to its default. Default each volume to `1`.

## Edge Cases

| Case                                                   | Expected Handling                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `AudioContext` unavailable or blocked                  | Mixer degrades to a silent no-op and never throws; sliders still persist.          |
| Volume set before the first gesture                    | Value is recorded and applied when the context is created on unlock.               |
| `unlock()` called repeatedly / context already running | Single context and gain graph; no duplicate nodes; `resume()` only when suspended. |
| Repeated identical requests within the limiter window  | Excess requests are dropped, not queued.                                           |
| Active-voice cap reached                               | New request is dropped rather than unbounded voices being allocated.               |
| Reset / restart / scenario replacement mid-playback    | `stopAll()` cancels every active voice, leaving no orphan source.                  |
| v1 persisted payload present                           | Migrated to v2 preserving `showDebugOverlay`, volumes defaulted.                   |

## Acceptance Criteria

1. The settings panel exposes Master, Effect, and Music volume controls, and a change to any of them persists and is restored after a reload.
2. No audio is produced before a user gesture; after the first gesture the audio engine is active.
3. With the engine active, repeated identical cue requests within the rate-limit window are dropped instead of all sounding, and the number of simultaneous voices stays bounded.
4. Master volume scales all audio, while Effect and Music volumes scale their own bus independently.
5. Reset, restart, and scenario replacement stop every active voice with no pending or orphan source, and teardown closes the engine.
6. On a browser with no usable audio context, the game runs normally and the volume controls still persist, with no error surfaced.
