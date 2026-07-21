# Port 11 Child 05: Settings And Debug Gating Sketch

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Add the repository's first persisted settings — a minimal v1 (debug overlay toggle, reduced motion) stored in `localStorage` behind a narrow adapter — plus a settings-panel Restart action and an explicit in-app debug toggle, while the production bundle keeps excluding all debug code.

## Summary

Direction favored: a runtime-owned settings store with a storage port injected at app bootstrap, a `localStorage` adapter in `src/platform/`, and a small gear panel in the shells. This is greenfield: no persistence exists anywhere in `src/` today, so the spec's main job is locking the interface shape against `persistence_standard.md` and `browser_persistence_standard.md` before any UI is written. Debug gating stays exclusion-based: production builds contain no debug modules, so the plan's non-goal is satisfied structurally rather than by a runtime flag.

## Sketch

- Ownership candidate: a settings owner in `src/runtime/` (per `runtime_ownership.md`, persisted preferences need a domain owner, not component state) exposing typed `get`/`set`/`subscribe`. The `localStorage` adapter in `src/platform/` implements a storage port interface declared by the owner. Wiring candidate: the app layer constructs the adapter and passes it in (`app` may import both `runtime` and `platform`), avoiding a direct `runtime → platform` import — verify what edge the frozen dependency-cruiser sets actually permit before choosing constructor injection versus a runtime-side import.
- `ui` reaches the store through `use-game-session.ts` or a dedicated hook that the session hook exposes — never by importing `platform` (machine-checked boundary).
- Envelope: a versioned payload (`{ version: 1, ... }`) under one namespaced key. Per the persistence standards: absent or unparsable data yields defaults without overwriting storage until the first explicit user write; a storage failure (private mode, quota) leaves the in-memory session working and marks persistence unavailable rather than throwing.
- v1 keys (locked in conversation): `showDebugOverlay` (drives the existing `PixiGameRenderer.setDebugMode`, currently reachable only from `TestbedPanel`) and a reduced-motion preference (candidate shape: `"system" | "reduced"`, where system defers to `prefers-reduced-motion`). Reduced motion's presentation effect is likely a pass-through flag the presentation layer consults for non-essential timelines; the spec should scope it to what `web_accessibility_standard.md` requires and no further.
- Settings must not change combat rules (plan non-goal 4): nothing in v1 touches core, commands, or the scenario context. The command boundary is unaffected; settings writes are not runtime commands and do not enter the command log.
- Settings UI candidate: a small panel/gear button in both shells rendered from store state; while open it joins the child 03 `interactive` suppression gate the same way overlays do. Buttons and toggles follow the native-element accessibility rules.
- The panel carries a Restart action (locked in conversation): it restarts the whole Run, not the current Wave. It routes through the existing session `reset`, which reloads the scenario from `scenario.createWorld(scenario.seed)` back to the tick-0 initial state (Wave 1) — the same full-run rebuild the terminal overlay's "Play again" already uses and that port_10_03 verified reproduces the fresh initial snapshot. It is the only restart affordance outside the terminal overlays; no keyboard restart binding exists anywhere. Since it wipes a live run, the candidate shape is a confirm step inside the panel rather than a bare button.
- Debug gating: `installDebugApi` and the scenario registry stay behind the existing `debugApi && import.meta.env.DEV` dynamic import (`use-game-session.ts`); `showDebugOverlay` appears in the settings panel only under `import.meta.env.DEV`. The production bundle check (no registry glob, no testbed strings) continues to prove exclusion; no production debug mode ships in port_11.
- Verification sketch: unit tests for the store against a fake storage port (defaults, corrupt payload, quota failure, version envelope); component-level assertions can wait for the shells' e2e; per `browser_persistence_standard.md`, cross-tab policy is explicitly out of scope for `localStorage` preferences whose loss is harmless — state that in the spec rather than claiming multi-tab safety.

## Non-Goals

1. Key rebinding, audio/volume settings (port_12), and any gameplay-affecting option.
2. IndexedDB, save data, run persistence, or any schema shared with future saves.
3. A production-build debug mode; exclusion remains the mechanism.
4. Cross-tab synchronization or conflict policy.

## Acceptance Criteria

1. Settings persist across reloads, survive absent or corrupt storage by falling back to defaults, and never block the game when storage is unavailable.
2. The debug overlay toggle works in development shells and neither it, the debug API, nor the scenario registry appears in the production bundle.
3. Settings and debug controls operate only through the existing runtime entry points and cannot alter combat outcomes.
4. The panel's Restart returns the run to its tick-0 initial state (Wave 1) through the existing reset path, not a wave-local reset.
