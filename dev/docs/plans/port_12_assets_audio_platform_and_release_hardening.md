# Assets, Audio, Platform, and Release Hardening

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Deliver Batch 12 of the Tickstrike Full Port Roadmap by completing shipped visual and audio identity, hardening browser and desktop lifecycle behavior, and establishing release-ready validation. This closes parity without importing Godot runtime architecture or unshipped platform ambitions.

## Requirements

1. Package and present the shipped terrain, Ninja, Viking, enemy, Artifact, and combat-feedback assets through their owning Web content domains.
2. Reproduce shipped semantic animation and VFX timing for movement, attacks, Guard results, Stagger, death, Dash, Smash, Major triggers, telegraphs, warnings, and run transitions.
3. Implement event-driven combat audio presentation with shipped spatial SFX selection, random variation, rate limits, active volume behavior, and browser audio unlock.
4. Harden responsive layout, reduced motion, focus, visibility, canvas lifecycle, fullscreen, reset, route change, and renderer/audio teardown for the configured Chromium acceptance target and Windows desktop shell.
5. Harden Tauri packaging and the production build path with release metadata and platform-appropriate behavior for browser-only actions such as Quit.
6. Establish full-run regression, presentation-idle assertions, asset-load failure handling, and release checks for browser and desktop targets.

## Design

Runtime assets are optimized package inputs owned by the feature that consumes them. General source packs, editable material, Godot imports, generated exports, and vendor references do not enter the runtime graph directly.

Presentation preserves semantic identity and timing rather than recreating Godot drawing nodes. Temporary polygon effects may be redesigned visually, but blocked hit, Guard break, full damage, windup, commitment, impact, retaliation, and terminal meanings must remain clear.

Audio starts only after browser user activation. Active Master and SFX behavior preserves the reference, while visible but unused music settings remain inert. The shipped game has no active background music or UI click/hover calls, so those capability scaffolds do not enter parity.

The release gate covers the configured Chromium Playwright target and the Tauri Windows shell backed by current WebView2. Other browser engines and desktop operating systems are best-effort rather than supported release targets. Steamworks, achievements, cloud save, analytics, PWA, service worker, and offline support remain deferred unless separately promoted.

## Non-Goals

1. Do not package Godot import metadata, engine UIDs, build output, test addons, or root reference assets as runtime content.
2. Do not introduce background music, UI sounds, Steamworks, achievements, cloud saves, analytics, PWA, or offline behavior solely because scaffolds exist.
3. Do not redesign gameplay, balance, content, or run progression during presentation polish.
4. Do not claim mobile, touch, gamepad, non-Chromium browser, or non-Windows desktop compatibility without an explicit support decision and validation.

## Acceptance Criteria

1. Every shipped gameplay role and interface uses its intended terrain, sprite, icon, animation, VFX, and combat SFX identity or an explicitly approved Web-native equivalent.
2. Responsive and reduced-motion modes remain playable and preserve all semantic combat information.
3. Audio unlock, category volume, rate limiting, focus loss, and teardown behave safely without duplicated or orphaned playback.
4. Reset, scenario replacement, run restart, route change, visibility change, and application teardown leave no pending timeline, stale callback, orphan display object, or active audio source.
5. Production Chromium and Tauri Windows builds complete with validated packaged assets and platform-appropriate fullscreen, focus, and exit behavior.
6. Unit, Playwright, full-run, and packaging acceptance cover the declared Chromium and Windows targets and expose a reliable runtime-idle signal.
