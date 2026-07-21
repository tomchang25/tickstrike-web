# Special-Result and Artifact Override SFX

Parent Plan: none (standalone sketch)

## Goal

Capture the reference project's result-override combat SFX — the sounds that replace the default hit or death cue when a special outcome occurs — so they are not lost, while keeping them out of the baseline audio plan. This work is deferred until the artifacts and special-kill effects they depend on are reworked into the Web runtime.

## Summary

port_12 delivers the baseline reference cue set (whoosh, smash, damaged, blocked, guard break, died, pickup) with a one-cue-per-hit priority. The reference additionally authors three override cues that swap in for the default cue on a special outcome. None of the outcomes that trigger them is currently a distinct, detectable moment in the Web event stream, and one of them is an artifact effect that has not been reworked yet — so this is parked as a standalone sketch rather than a port_12 child.

The reference override cues (from `port-ref/tickstrike/game/tick_arena/player/audio/`):

| Override       | Asset             | Limiter key      | Window   | Volume | Trigger in the reference                        |
| -------------- | ----------------- | ---------------- | -------- | ------ | ----------------------------------------------- |
| execution      | Punch_2.wav       | `execution`      | 4 / 1.0s | −20 dB | An Execution kill (replaces the default death). |
| mobility_kill  | stab_flesh.wav    | `mobility_kill`  | 8 / 0.5s | −20 dB | A Dash/Smash mobility kill (replaces death).    |
| guard_shredder | crystal_pling.wav | `guard_shredder` | 4 / 0.3s | −20 dB | The Guard Shredder artifact shredding guard.    |

## Requirements

1. When a special result occurs, play its override cue instead of the default hit or death cue for that hit, matching the reference cue-to-outcome mapping above.
2. Preserve the baseline one-cue-per-hit rule: an override still resolves to exactly one cue per enemy per resolution.

## Sketch

- The likely home is the existing `AudioDirector` and `CueLibrary` in `src/presentation/audio/`. The override cues extend the same cue table and the same per-enemy selection pass that already collapses `enemy_guard_damaged`/`enemy_guard_broken`/`enemy_damaged` to one cue; an override would sit at a higher priority than the default it replaces. Verify this against the live director at spec time.
- **Hard dependency and the real blocker:** the triggering outcomes must first be distinguishable in the semantic event stream. Today `enemy_died` carries only `attackerId`/`cell`, with no flag for Execution vs. mobility kill vs. normal kill, and there is no guard-shredder signal at all. The reference in `port-ref/tickstrike/game/entities/enemies/grid_enemy.gd` selects a queued death-override event at kill time (`play_death_sfx`) — the Web port would need an equivalent semantic distinction on the event, not a presentation-side guess.
- The `guard_shredder` cue is an artifact effect; it cannot be authored until the artifacts system is reworked and a Guard Shredder (or equivalent) artifact exists with a detectable shred outcome.
- Assets: `Punch_2.wav` and `crystal_pling.wav` are already vendored under `src/presentation/audio/assets/` for the `died` and `pickup` cues and can be reused; `stab_flesh.wav` is not yet copied from `port-ref` and would need to be added.
- Candidate files to inspect at spec time: `src/presentation/audio/audio-director.ts`, `src/presentation/audio/cue-library.ts`, `src/core/events/combat-events.ts` (for the new semantic distinction), and the kill/artifact resolution in `src/core/actions/`.

## Non-Goals

1. Do not add these cues to port_12; that plan ships the baseline reference cue set only.
2. Do not introduce a presentation-side heuristic to guess Execution vs. mobility vs. normal kills; the distinction must come from the semantic event stream.
3. Do not add or redesign the artifacts system here; this sketch consumes that rework, it does not own it.

## Acceptance Criteria

1. An Execution kill, a mobility kill, and a Guard Shredder shred each play their reference override cue in place of the default cue, once per outcome.
2. No regression to the baseline one-cue-per-hit behavior for ordinary hits.
