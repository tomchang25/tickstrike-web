# Port 11 Child 05: Settings And Debug Gating

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Add the repository's first persisted settings — a `localStorage`-backed store behind a platform adapter, owned in the runtime — plus a settings panel in both shells carrying a whole-run Restart and a development-only debug-overlay toggle, while the production bundle keeps excluding all debug code.

## Summary

No persistence exists in `src/` today and `src/platform/` is an empty leaf nothing imports. This child builds the settings/persistence seam the plan calls for and wires one persisted preference through it.

- **`src/platform/settings-storage.ts`** — a `localStorage` adapter: `createLocalStorageSettingsStorage()` returns `{ load, save }` reading/writing one namespaced key (`tickstrike.settings`) with a versioned envelope `{ version: 1, data }`. Absent or unparsable data yields `undefined` (the store falls back to defaults); an unavailable store (private mode, quota) makes `load` return `undefined` and `save` a caught no-op, so the game never blocks on storage. It imports nothing (leaf) and matches the runtime port structurally.
- **`src/runtime/settings-store.ts`** — the owner: a `SettingsStorage` port interface, the `GameSettings` shape (`{ showDebugOverlay: boolean }` for v1), a versioned `PersistedSettings` envelope, and a `SettingsStore` that loads-and-merges defaults on construction, exposes `get` / `set(partial)` / `subscribe`, and persists through the injected port on every `set`. It imports no platform code — the adapter is constructor-injected.
- **`src/ui/settings/settings-panel.tsx`** — a gear button plus a panel rendered from props: a Restart action (with an in-panel confirm step) that calls back to the session `reset`, and — only under `import.meta.env.DEV` — a debug-overlay toggle bound to `showDebugOverlay`. Pure presentation; no runtime or platform import.
- **`use-game-session.ts`** constructs the `SettingsStore` with the `localStorage` adapter (the one app→platform import), drives `renderer.setDebugMode` from `settings.showDebugOverlay` (replacing the removed `debugMode` prop), exposes `settings` / `setShowDebugOverlay` / `settingsOpen` / `setSettingsOpen`, and folds `!settingsOpen` into the `interactive` gate so gameplay input is inert while the panel is open. Both shells render the panel; the testbed's existing debug checkbox is re-pointed at the same store value.
- **Debug gating stays exclusion-based**: `installDebugApi` and the scenario registry remain behind the existing `debugApi && import.meta.env.DEV` dynamic import, and the debug toggle is DEV-only, so the production panel shows only Restart and the production bundle ships no debug code — proven by the existing bundle check.

## Relational Context

- Boundary change (decision A): the frozen dependency-cruiser set forbids every checked layer from importing `src/platform`, and `.tsx` shells are unparsed, so the only cruise-checked import of platform is `use-game-session.ts` (`.ts`). `.dependency-cruiser.cjs` widens the `app-imports-within-its-measured-set` rule to allow `app → platform`, and `dev/standards/project_structure.addendum.md` records the edge in the same commit (the prose/rule pairing rule). This is the sanctioned "architecture decision" the cruiser comment anticipates, and it is the seam port_12 (audio) and port_14 (platform) will reuse.
- Ownership: `SettingsStore` lives in `runtime` and is the single source of truth for `showDebugOverlay`. `runtime` never imports `platform`; it defines the `SettingsStorage` port and receives an implementation via its constructor. `platform` never imports `runtime`; its adapter's return shape is structurally compatible with the port. `app` (`use-game-session`) imports both and injects the adapter — the wiring point.
- `ui` reaches settings only through props the session supplies; `SettingsPanel` imports neither runtime nor platform (machine-checked). The session subscribes to the store and re-renders the shells on change.
- Debug-mode unification: `useGameSession` drops its `debugMode` input and drives `renderer.setDebugMode(settings.showDebugOverlay)`. `game-app` stops hardcoding `debugMode: false`; `testbed-app` drops its local `debugMode` state and points `TestbedPanel`'s existing `debug-mode` checkbox (`debugMode` / `onDebugModeChange`) at `settings.showDebugOverlay` / `setShowDebugOverlay`, so that checkbox and the settings-panel toggle stay in sync and the `debug-mode` e2e still flips the overlay.
- Suppression: `settingsOpen` joins `interactive` exactly like `pendingReward` / `pendingMilestone`; the child-03 keyboard driver and pointer binding already read `interactive`, so no input-layer change is needed.
- Settings never touch core, commands, or the command log (plan Non-Goal 4). Restart routes through the existing `session.reset` full-run rebuild (tick 0, Wave 1), the same path port_10_03 verified; it is not a wave-local reset.
- Persistence scope: `localStorage` is synchronous, so there is no async hydration ordering to manage. Cross-tab sync is explicitly out of scope — the only persisted value is harmless to lose — and the spec claims no multi-tab safety.

## Scope

### Included

- `settings-storage.ts` (platform), `settings-store.ts` (runtime), `settings-panel.tsx` (ui), and their wiring in both shells and `use-game-session`.
- The `app → platform` dependency-cruiser widening plus the addendum note.
- Store unit tests and a settings-panel e2e.

### Excluded

- Reduced motion, audio/volume (port_12), key rebinding, and any gameplay-affecting option.
- IndexedDB, save data, run persistence, cross-tab sync, or any schema shared with future saves.
- A production debug mode; exclusion stays the mechanism, and no debug toggle ships in production.
- Changing `RunBuildHud`, `TestbedPanel` markup beyond re-pointing the debug checkbox, or the HUD.

## Files to Change

| File                                          | Change Size | Purpose                                                                          |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `.dependency-cruiser.cjs`                     | Small       | Allow `app → platform`                                                           |
| `dev/standards/project_structure.addendum.md` | Small       | Record the `app → platform` edge alongside the rule                              |
| `src/platform/settings-storage.ts`            | Small       | `localStorage` adapter with a versioned envelope and failure handling            |
| `src/runtime/settings-store.ts`               | Medium      | `SettingsStorage` port, `GameSettings`, defaults, load/merge/persist store       |
| `src/ui/settings/settings-panel.tsx`          | Medium      | Gear button, panel, Restart-with-confirm, DEV-only debug toggle                  |
| `src/app/use-game-session.ts`                 | Medium      | Construct/inject the store; drive `setDebugMode`; `settingsOpen` gate; drop prop |
| `src/app/game-app.tsx`                        | Small       | Render the settings panel; drop `debugMode`                                      |
| `src/app/testbed-app.tsx`                     | Small       | Render the panel; re-point the debug checkbox at the store                       |
| `test/unit/runtime/settings-store.test.ts`    | Medium      | Defaults, corrupt payload, save failure, envelope, subscribe                     |
| `test/e2e/settings.spec.ts`                   | Medium      | Open panel, toggle debug overlay, Restart returns to tick 0                      |

## Execution Outline

1. Widen the cruiser rule and record it in the structure addendum.
2. Add `settings-store.ts` (port interface, types, defaults, store) and its unit test against a fake storage port.
3. Add `settings-storage.ts` (the `localStorage` adapter) matching the port structurally.
4. Add `SettingsPanel` (gear + panel, Restart-with-confirm, DEV-only debug toggle) as a props-driven component.
5. Rewire `use-game-session`: construct the store with the adapter, expose settings/setters and `settingsOpen`, drive `setDebugMode` from settings, fold `!settingsOpen` into `interactive`, and remove the `debugMode` input.
6. Render the panel in both shells; drop `game-app`'s `debugMode`; re-point `testbed-app`'s `TestbedPanel` debug checkbox at the store.
7. Add the settings e2e; run `npm run verify` and confirm the production bundle still contains no debug API, scenario registry, or debug toggle.

## Implementation Notes

- The store loads once in its constructor (synchronous `localStorage`); merge the loaded `data` over defaults so a missing key uses its default and an extra key is ignored. Do not write back on load — only on an explicit `set`.
- Wrap every `localStorage` access in try/catch; on failure, operate in-memory and treat `save` as a no-op. Never throw out of the store into render.
- The debug toggle and the panel's DEV gate both use `import.meta.env.DEV`; production renders the panel with Restart only.
- Restart confirm: the panel shows a two-step confirm before calling `reset`, since it wipes a live run.
- Keep the `debug-mode` testid on `TestbedPanel`'s checkbox so the existing navigation/foundation e2e keep working; only its bound state changes.

## Edge Cases

| Case                                            | Expected Handling                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Absent `localStorage` key                       | Store uses defaults; nothing is written until the first `set`         |
| Corrupt/unparsable payload                      | Treated as absent → defaults; not overwritten until a `set`           |
| `localStorage` unavailable (private mode/quota) | Store runs in-memory; `save` is a caught no-op; game unaffected       |
| Older/newer envelope version                    | v1 reads only its own version; unknown version falls back to defaults |
| Settings panel open                             | `interactive` is false; gameplay keyboard/pointer input is inert      |
| Production build                                | No debug toggle, debug API, or scenario registry present              |

## Acceptance Criteria

1. Settings persist across reloads, fall back to defaults on absent or corrupt storage, and never block the game when storage is unavailable.
2. The debug-overlay toggle works in the development shells and drives the same overlay as before; neither it, the debug API, nor the scenario registry appears in the production bundle.
3. Gameplay input is inert while the settings panel is open, and the panel's Restart returns the run to its tick-0 initial state through the existing reset path.
4. Settings and debug controls operate only through existing entry points and cannot alter combat outcomes.
