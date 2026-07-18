# Presentation and Release Hardening

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Polish and ship the same Tick Arena path after its rules and lifecycle are stable. Presentation work must clarify semantic state without adding gameplay ownership.

## Requirements

1. Package the approved terrain, player, enemy, reward, Telegraph, impact, and terminal assets through their owning content boundaries.
2. Drive movement, WindupAttackPrep, Telegraph, attack, damage, Stagger, death, rewards, and lifecycle effects from semantic snapshots/events.
3. Add event-driven combat audio with safe browser unlock, volume control, rate limits, and teardown.
4. Harden responsive layout, reduced motion, focus, visibility, reset, route changes, canvas lifecycle, and renderer cleanup.
5. Validate the browser build and desktop shell with one full deterministic run and a reliable idle signal.

## Design

Visual timing may be redesigned, but it must never decide whether a command hit, a Telegraph exists, an entity is dead, or a Tick advanced. Assets are runtime inputs owned by the feature that uses them. General source material and generated output remain outside the runtime graph.

Release validation covers the supported Chromium browser and Windows desktop shell. Other platforms remain unclaimed until separately tested and approved.

## Non-Goals

1. Do not add gameplay balance changes during polish.
2. Do not add music, platform services, cloud saves, analytics, PWA behavior, or offline support without a separate decision.
3. Do not package engine metadata, generated build output, or reference-only source material as runtime content.
4. Do not claim unsupported browsers, mobile, touch, or gamepad compatibility.

## Acceptance Criteria

1. The full run presents every active combat state clearly, including WindupAttackPrep and Telegraph.
2. Reduced motion preserves all gameplay information and remains playable.
3. Reset, restart, route change, visibility change, and teardown leave no pending timeline, callback, audio source, or orphan visual.
4. Browser and Windows builds complete the same deterministic run and report presentation idle reliably.
