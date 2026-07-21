# Audio Delivery

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Add event-driven combat audio to the existing Tick Arena without giving audio any authority over gameplay state. Audio is a presentation output driven by the same semantic snapshots and events as the visual layer.

## Requirements

1. Play combat audio from semantic events only — movement, WindupAttackPrep, Telegraph, attack, damage, Guard, Stagger, death, reward, and terminal transitions map to sound cues.
2. Unlock the browser audio context safely on first user gesture, with no autoplay assumptions.
3. Provide volume control and per-cue rate limiting so repeated events cannot flood output.
4. Tear down every audio source on reset, restart, route change, visibility change, and renderer teardown, leaving no pending or orphaned source.

## Design

Audio never decides whether a command hit, a Telegraph exists, an entity is dead, or a Tick advanced. Sound assets are runtime inputs owned by the audio feature that consumes them; general source material and generated output remain outside the runtime graph.

This plan owns the audio delivery mechanism — the event-to-cue mapping, unlock, mixing, rate limiting, and teardown. Which visual events exist and when they fire is audited by [port_13](port_13_visual_parity_and_polish.md); this plan consumes that same event stream rather than redefining it. Platform-level lifecycle wiring (visibility, route, renderer teardown) is owned by [port_14](port_14_platform_and_release_hardening.md); audio teardown hooks into it.

Audio is delivered through the WebAudio API with no added dependency, and its sound assets are the reference project's own SFX carried into this repository as runtime inputs owned by the audio feature.

### Volume buses

The mixer exposes three volume controls — Master, Effect, and Music — where Master multiplies both bus gains and therefore scales all audio. The Music bus is wired structurally (a `musicGain` node and a persisted Music volume control) so the mixer graph and settings surface are complete, but this plan plays no music content or music source through it. Introducing actual music playback remains a separate decision under Non-Goal 1.

### Child decomposition

| Child | Focus                                                                                                     | Current document form                                                          |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 12.1  | Audio engine: WebAudio mixer, gesture unlock, Master/Effect/Music volume, and per-cue rate limiting       | Implementation spec: port_12_01_audio_engine.implementation_spec.md            |
| 12.2  | Event-to-cue delivery: cue registry, reference SFX assets, and an audio director on the same event stream | Implementation spec: port_12_02_event_cue_delivery.implementation_spec.md      |
| 12.3  | Teardown completeness and full-run verification of cue coverage and orphan-free stop                      | Plan child; create a verified implementation spec immediately before execution |

Recommended landing order is 12.1, 12.2, then 12.3.

The reference's result-override SFX (execution, mobility-kill, and the guard-shredder artifact) are out of this plan's scope; they are parked in the standalone `audio_special_result_sfx.sketch.md`, deferred until the artifacts and special-kill effects are reworked.

## Non-Goals

1. Do not add music content or a music source. The Music volume bus is wired as empty structure only; actual music, ambience, or spatial audio needs a separate decision.
2. Do not let audio own, cache, or recompute any gameplay state.
3. Do not assume autoplay or bypass the browser gesture unlock.

## Acceptance Criteria

1. Every active combat event produces its mapped audio cue during the full deterministic run.
2. Audio starts only after a user gesture and respects the volume control.
3. Rapid repeated events are rate limited and never overlap into distortion or unbounded voices.
4. Reset, restart, route change, visibility change, and teardown stop all audio and leave no pending or orphan source.
