# Platform and Release Hardening

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Harden the same Tick Arena path for shipping: responsive behavior, application-shell lifecycle, and release validation across the supported browser and Windows desktop shell. This plan owns platform mechanisms and packaging, not visual parity or audio content.

## Requirements

1. Harden responsive layout across supported desktop and narrow viewport sizes without changing gameplay information.
2. Honor reduced-motion and focus preferences at the platform level so every gameplay state stays readable and playable.
3. Handle application-shell lifecycle — visibility change, reset, route change or replacement, and canvas/renderer teardown — so no timeline, callback, or orphan resource survives.
4. Package and validate the browser build and the Windows desktop shell against one full deterministic run with a reliable idle signal.

## Design

Release validation covers the supported Chromium browser and Windows desktop shell only. Other platforms remain unclaimed until separately tested and approved.

Platform hardening owns the mechanism: viewport handling, preference APIs, lifecycle wiring, packaging, and idle detection. Whether the resulting visuals match the reference is owned by [port_13](port_13_visual_parity_and_polish.md); which audio cues fire is owned by port_12 (audio delivery, shipped). This plan provides the lifecycle boundary that both hook their teardown into. It must not introduce a second runtime or alter deterministic gameplay rules.

## Non-Goals

1. Do not add gameplay balance changes during hardening.
2. Do not add platform services, cloud saves, analytics, PWA behavior, or offline support without a separate decision.
3. Do not claim mobile, touch, gamepad, or unsupported-browser compatibility.
4. Do not package engine metadata, generated build output, or reference-only source material as runtime content.

## Acceptance Criteria

1. The supported viewport sizes present every active combat state without layout breakage or lost gameplay information.
2. Reduced motion preserves all gameplay information and remains playable.
3. Reset, restart, route change or replacement, visibility change, and teardown leave no pending timeline, callback, or orphan resource.
4. Browser and Windows builds complete the same deterministic run and report presentation idle reliably.
