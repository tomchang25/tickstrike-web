# Event-to-Cue Delivery: Cue Library and Audio Director

Parent Plan: `port_12_audio_delivery.md`

## Goal

Make combat produce sound. Map the runtime's semantic combat events to the reference project's SFX through an audio director that plays them on the 12.1 mixer, matching the reference's cue set, rate limits, and randomized feel without touching gameplay state or the event stream.

## Summary

12.1 shipped a silent engine (mixer, unlock, volume, rate limiting). This child feeds it the same `CombatEvent` stream the visual layer consumes and wires in the reference's authored sounds.

- **Reference cue set only.** Eight cues are ported verbatim from the reference presets — action whoosh (attack + dash), smash windup, smash impact, damaged, blocked, guard break, died, pickup — each with the reference's limiter key/window, dB volume, multi-stream avoid-repeat, and ±5% random pitch. Movement, telegraph, stagger, and terminal transitions get no cue by decision (guard break already covers the stagger moment); those events are intentionally omitted, as are the kill-override cues (execution/guard-shredder/mobility-kill), left for a later refinement.
- **Assets are repo-owned inputs.** Ten reference audio files are copied into `src/presentation/audio/assets/` and imported as Vite URLs, exactly as sprite sheets are. `port-ref` stays untouched.
- **Cue library.** A static table of cue definitions plus a loader that fetches each asset and decodes it into `AudioBuffer`s through the mixer's context. Fetching is byte-level (no context needed); decoding happens once the context exists.
- **Audio director.** A new `AudioDirector` (presentation), parallel to `PresentationDirector`, maps each event type to a cue, picks a stream with avoid-repeat, and calls `mixer.play` with a random pitch. `GameRuntime` owns it and drives it from the same drain point that runs `presentation.play`, plus the reward-selection path so pickup sounds. It is fire-and-forget: audio is instantaneous, so it never awaits or gates the command loop, and reset/teardown already stop all voices via the mixer.
- **Small mixer additions.** `AudioCue` gains an optional `playbackRate`; the mixer gains a `decode` helper and a cumulative play counter exposed for browser verification.
- **Result.** After the first gesture, attacking, dashing, smashing, damaging an enemy, breaking guard, killing an enemy, and taking a reward each play their mapped sound; repeats are rate limited; non-combat events stay silent; reset/restart/teardown leave no voice.

## Relational Context

- `GameRuntime` (runtime) owns the single `AudioDirector`, constructed over its existing `audio` mixer, mirroring how it owns `presentation` over `renderer`. Nothing else constructs the director.
- `AudioDirector` (presentation) reads the same `resolution.events` that `GameRuntime.drainCommands` passes to `presentation.play`. The runtime calls `audioDirector.play(events)` for an accepted command resolution and for an accepted reward resolution (the reward path emits `reward_selected` but runs no presentation timeline). The director never reads gameplay state or a snapshot — only the event list.
- The director calls `AudioMixer.play` and `AudioMixer.decode`; it holds no `AudioContext` itself. The mixer stays the sole owner of the context and voices. Volume is still owned by `SettingsStore`/session push from 12.1; the director passes only per-cue linear attenuation, never the master/bus volume.
- The cue library maps a `CueId` to its decoded buffers. Decoding requires the mixer's context, which exists only after the session's first-gesture `unlock()`; the director lazily triggers a one-time load on the first `play` seen while the mixer is unlocked. Cues that fire before the load resolves are dropped (no buffer yet), not queued.
- Event→cue mapping is the director's own responsibility and the single place that knows cue identity; the mixer stays cue-agnostic (it plays buffers), and core stays audio-agnostic (it emits events). No new cross-layer edge is added: runtime→presentation already exists, and the assets import stays inside presentation.
- Stream selection and pitch are non-deterministic (injected RNG defaulting to `Math.random`). This is confirmed safe: audio is a presentation output and never feeds the golden event stream or any gameplay decision.
- Teardown is unchanged from 12.1: `invalidateWork` already calls `mixer.stopAll()` and `destroy` calls `mixer.dispose()`. The director holds no per-run timers or voices, so it needs no teardown of its own; its decoded-buffer cache is process-lived and reused across runs.
- The debug API (`installDebugApi`) exposes the mixer's cumulative play count so a Playwright test can assert a semantic event produced a cue after unlock.

## Scope

### Included

- Ten reference SFX copied into `src/presentation/audio/assets/`.
- `cue-library.ts`: cue definitions (streams, limiter key/window, dB→linear volume, pitch range) and a fetch+decode loader.
- `AudioDirector`: event→cue mapping for the eight cues, avoid-repeat stream pick, random pitch, lazy load-on-unlock.
- Mixer additions: `playbackRate` on `AudioCue`, a `decode` helper, and a cumulative play counter.
- `GameRuntime` wiring on the command and reward drain paths; debug-API play-count read.
- Unit tests for the mapping and cue library, and a browser smoke asserting a cue fires after a gesture.

### Excluded

- Any cue for movement, telegraph, stagger, spawn, wave, milestone, or terminal outcome (decided out of scope).
- Kill-override cues (execution, guard shredder, mobility kill) and any music/ambience.
- Changes to the volume model, unlock, or teardown from 12.1.
- Format conversion of assets; reference `.wav`/`.mp3` are kept as-is.

## Files to Change

| File                                                  | Change Size | Purpose                                                                      |
| ----------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `src/presentation/audio/assets/*` (10 files)          | Medium      | Repo-owned reference SFX inputs.                                             |
| `src/presentation/audio/cue-library.ts`               | Medium      | Cue definitions and the fetch+decode loader.                                 |
| `src/presentation/audio/audio-director.ts`            | Medium      | Event→cue mapping, stream pick, pitch, lazy load, mixer playback.            |
| `src/presentation/audio/audio-mixer.ts`               | Small       | `playbackRate` on `AudioCue`, `decode`, cumulative play counter.             |
| `src/runtime/game-runtime.ts`                         | Small       | Own the director; drive it on accepted command and reward resolutions.       |
| `src/harness/debug-api.ts`                            | Small       | Expose the mixer play count for browser verification.                        |
| `test/unit/presentation/audio/audio-director.test.ts` | Medium      | Event→cue mapping, limiter/volume/bus, avoid-repeat, unmapped events silent. |
| `test/unit/presentation/audio/cue-library.test.ts`    | Small       | dB→linear conversion and load populates buffers.                             |
| `test/e2e/audio.spec.ts`                              | Small       | After a gesture, an attack increments the play count.                        |

## Execution Outline

1. Copy the ten SFX into `src/presentation/audio/assets/`.
2. Extend the mixer: add `playbackRate` to `AudioCue` (apply to `source.playbackRate.value`), a `decode(bytes)` that returns `undefined` without a context, and a cumulative play counter surfaced by a getter. Update the mixer unit test for the new field/counter.
3. Author `cue-library.ts`: import the asset URLs, declare the eight cue definitions with dB→linear volumes and pitch range, and a loader that fetches (injected fetcher) and decodes each stream. Add its unit test.
4. Author `AudioDirector`: the event→cue map, avoid-repeat stream selection and pitch (injected RNG), a public idempotent `load()`, and a `play(events)` that lazy-loads once unlocked and triggers cues. Add its unit test with a fake mixer.
5. Wire `GameRuntime`: construct the director over `audio`, and call `audioDirector.play(resolution.events)` on the accepted command path (next to `presentation.play`) and the accepted reward path.
6. Expose the mixer play count through `installDebugApi`.
7. Add the browser smoke and run `npm run verify` plus the targeted audio and settings e2e.

## Implementation Notes

- **Cue table (authoritative values).** action_whoosh: whoosh-001..005, key `action_whoosh`, 8/0.3s, −20 dB → `player_attacked`, `player_dashed`. smash_windup: whoosh-001..003, `smash_windup`, 4/0.3s, −20 dB → `smash_armed`. smash_impact: hit.wav, `smash_impact`, 4/0.3s, −20 dB → `smash_impact`. damaged: hit.wav, `damaged`, 8/0.5s, −20 dB → `enemy_damaged`, `player_damaged`. blocked: block.mp3, `blocked`, 8/0.5s, −10 dB → `enemy_guard_damaged`. guard_break: window-break-sfx-333914.wav, `guard_break`, 8/0.5s, −24 dB → `enemy_guard_broken`. died: Punch_2.wav, `died`, 4/1.0s, −20 dB → `enemy_died`, `enemy_self_destructed`, `enemy_crushed`. pickup: crystal_pling.wav, `pickup`, 8/0.5s, −10 dB → `reward_selected`. Pitch range is ±: min 0.95, max 1.05 (the reference AudioEvent default).
- **Reused reference cues.** `player_damaged` reuses the `damaged` cue and the death aliases (`enemy_self_destructed`, `enemy_crushed`) reuse `died`; these reuse existing reference assets rather than introducing new cues, so they stay inside the "match reference" decision.
- **One cue per hit.** A single enemy hit emits several guard/damage events at once — `enemy_guard_damaged` or `enemy_guard_broken` alongside `enemy_damaged`. Only the highest-priority family cue may sound per enemy per resolution: guard chip (`blocked`) over guard break (`guard_break`) over plain damage (`damaged`). The whoosh, smash, death, and pickup cues are independent and still fire per event. The reference's result-override cues (execution, mobility-kill, guard-shredder) are deferred to child 12.4.
- **dB→linear.** `10 ** (dB / 20)`. Precompute in the cue table so the director passes a linear `volume`.
- **Avoid-repeat.** Single-stream cues always use index 0. Multi-stream cues pick a random index; if it equals the last index used for that cue, advance by one modulo the count. Track last index per cue.
- **Lazy load.** On `play`, if `mixer` reports unlocked and the library is neither loaded nor loading, kick off `load()` (fire-and-forget). Do not block `play`. A cue whose buffers are not yet present is skipped silently.
- **Mixer decode.** `decodeAudioData` is promise-based; guard for an absent context by returning `undefined`. A stream that fails to decode is filtered out, leaving the cue with its remaining streams (or empty, i.e. silent).
- **Fire-and-forget.** The runtime does not await the director and does not thread generation through it; a scenario swap mid-drain is handled by the mixer's `stopAll`. Keep `audioDirector.play` a synchronous call that returns before any audio starts.

## Edge Cases

| Case                                            | Expected Handling                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Combat event fires before the first gesture     | Mixer is locked, director skips load and plays nothing; no error.           |
| Event fires after unlock but before decode done | Cue has no buffer yet and is skipped; later identical events play normally. |
| Unmapped event (movement, telegraph, stagger…)  | No cue is triggered.                                                        |
| Multi-stream cue repeats                        | Consecutive plays avoid replaying the immediately previous stream.          |
| Rapid identical cues                            | Rate limited by the cue's key/window in the mixer.                          |
| One asset fails to fetch or decode              | That stream is dropped; the cue still plays its remaining streams.          |
| Reset/restart during playback                   | Mixer `stopAll` cancels voices; decoded buffers survive for the next run.   |

## Acceptance Criteria

1. After a user gesture, a player attack, dash, smash windup, and smash impact each play their mapped sound.
2. An enemy taking damage, having its guard chipped, having its guard broken, and dying each play their mapped sound, and selecting a reward plays the pickup sound.
3. Movement, telegraph, stagger, and terminal-transition events play no sound.
4. A single enemy hit plays exactly one guard/damage cue — a guard chip, a guard break, or plain damage — never two at once; repeated identical cues are rate limited and multi-stream cues avoid immediately repeating the same stream.
5. No sound plays before the first gesture, and reset, restart, and teardown leave no voice playing.
6. A semantic combat event triggering a cue is observable in the browser after unlock.
