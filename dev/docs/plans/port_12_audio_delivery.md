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

## Non-Goals

1. Do not add music, ambience, or spatial audio without a separate decision.
2. Do not let audio own, cache, or recompute any gameplay state.
3. Do not assume autoplay or bypass the browser gesture unlock.

## Acceptance Criteria

1. Every active combat event produces its mapped audio cue during the full deterministic run.
2. Audio starts only after a user gesture and respects the volume control.
3. Rapid repeated events are rate limited and never overlap into distortion or unbounded voices.
4. Reset, restart, route change, visibility change, and teardown stop all audio and leave no pending or orphan source.
