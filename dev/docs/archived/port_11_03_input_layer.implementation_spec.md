# Port 11 Child 03: Input Layer

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Extract the keyboard input handling out of `use-game-session.ts` into a dedicated `src/ui/input/` feature, wire the right-click windup cancel through the existing pointer path, and add the focus-loss/visibility release the plan requires — all without changing which commands the existing bindings produce.

## Summary

The keyboard effect currently lives inline in `use-game-session.ts` (WASD/arrow held-repeat move, IJKL attack, Alt toggling pointer mode) and re-registers its window listeners on every `interactive`/`move`/`attack` identity change. It has no release on focus loss, so a held Alt at blur leaves the pointer stuck in Mobility mode, and held movement keeps its interval across an interactive drop.

This child moves that logic behind a hook and closes the gaps, with no new bindings:

- **`src/ui/input/keymap.ts`** — pure data: the `MOVE_KEYS` (WASD/arrows → cardinal `Cell`) and `ATTACK_KEYS` (IJKL → cardinal `Cell`) maps, the `Alt` modifier constant, and a `normalizeKey` helper (single chars lowercased, named keys verbatim). This is the same key table the inline effect hardcodes today.
- **`src/ui/input/use-keyboard-input.ts`** — the driver hook. It holds the `interactive` flag and the move/attack/mobility handlers in refs, registers the `keydown`/`keyup`/`blur`/`visibilitychange` listeners once per mount, owns the held-movement repeat interval (`MOVE_REPEAT_MS = 260`, the current fast-forward cadence carried over verbatim), sets the `data-keyboard-input-ready` flag, and releases held movement and resets Mobility mode on blur/hidden. It never imports the runtime.
- **`use-game-session.ts`** — drops the inline keyboard effect and calls `useKeyboardInput` with `move`, `attack`, and a `setMobilityActive` that maps to `setPointerMode`. It adds a `cancelArmedSmash` callback (through the existing `execute` busy-wrapper onto the child 02 runtime entrance) and passes it as the pointer binding's new `onCancel`.
- **`input-controller.ts`** — `PointerInputBinding` gains `onCancel`; `bind()` adds a `contextmenu` listener that always suppresses the browser menu on the canvas and, when the binding can interact and a Smash is armed, invokes `onCancel`. Its cleanup removes the listener.

Existing keyboard/pointer/smash behavior and the e2e that drives it stay intact; the new browser-visible behaviors (right-click cancel, focus-loss release) get fresh coverage, and the keymap gets a unit test.

## Relational Context

- `use-game-session.ts` remains the single runtime wiring point: it owns `runtimeRef`, the `interactive` gate (`commandsEnabled && running && !pendingReward && !pendingMilestone`), and every `runtime.*` call. The new hook and the InputController never touch the runtime; they only invoke callbacks the session hook supplies.
- The hook receives `move`/`attack` — the same `useCallback`s that already self-gate on `interactive` and call `runtime.execute`. It calls them fire-and-forget (their `Promise` return is ignored), matching today's `void move(...)`. Because they are held in a ref updated every render, the once-per-mount listeners always call the latest identity.
- The hook's own `interactive` gate governs `preventDefault` and whether a held-move interval starts, so keys are not swallowed while input is inert. The repeat fires on the fixed `MOVE_REPEAT_MS` cadence and calls `move` unconditionally (which self-gates on `interactive`); enqueuing a step while the previous turn animates triggers the runtime's VFX fast-forward rather than dropping it, exactly as the current inline effect does. Do not reintroduce an idle gate — the unconditional enqueue is what drives fast-forward.
- `setMobilityActive(true|false)` maps to `setPointerMode("mobility"|"attack")`. Alt-down enters Mobility only when interactive; Alt-up, blur, and visibility-hidden always return to Attack. The pointer effect still reads `pointerMode` and calls `renderer.setPointerMode`, so the Alt→mobility→preview path is unchanged.
- Release symmetry: on `blur` and `visibilitychange`→hidden the hook clears every held-movement interval and resets Mobility mode. Route changes are full unmounts (`app.tsx` branches on `window.location.pathname` with no client router), so effect cleanup already covers them. Per `react_strict_mode_effects.md`, setup registers exactly the listeners cleanup removes, the `data-keyboard-input-ready` flag is set on mount and deleted on cleanup, and there is no `didRun` flag — dev remount stays safe.
- `cancelArmedSmash` routes through the `execute` busy-wrapper like `selectReward`/`selectMilestoneDecision`, so it serializes on the same runtime queue child 02 built; the resolver rejects when nothing is armed.
- The InputController `contextmenu` handler suppresses the default menu unconditionally (no browser menu ever appears over the canvas) but only dispatches `onCancel` when `binding.canInteract()` and `snapshot().armedSmashTarget` are both true, so a right-click with nothing armed is a no-op beyond suppression. `bind()` already unbinds a prior binding first, so re-binds when the pointer effect re-runs stay leak-free; the new listener joins the same cleanup as `pointermove`/`click`.
- `PixiGameRenderer.bindPointerInput` merely delegates to `InputController.bind`, so the `onCancel` addition flows through the renderer without a renderer-side change beyond the shared `PointerInputBinding` type.

## Scope

### Included

- `keymap.ts` and `use-keyboard-input.ts` under `src/ui/input/`.
- Removing the inline keyboard effect and wiring the hook plus `onCancel` in `use-game-session.ts`.
- The `contextmenu` cancel seam and `onCancel` on the pointer binding in `input-controller.ts`.
- A keymap unit test and browser tests for right-click cancel and focus-loss release.

### Excluded

- Any new binding (keyboard Dash, restart, Wait) or rebinding UI.
- Settings persistence, HUD, and the settings-panel Restart (children 04/05).
- Touch/gamepad input; any change to pointer aim math or the preview painter.
- Any change to core command semantics or the child 02 cancel resolver.

## Files to Change

| File                                        | Change Size | Purpose                                                                           |
| ------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `src/ui/input/keymap.ts`                    | Small       | Pure move/attack key tables, Alt modifier, `normalizeKey`                         |
| `src/ui/input/use-keyboard-input.ts`        | Medium      | Driver hook: listeners, held-repeat, release-on-blur/visibility, ready flag       |
| `src/app/use-game-session.ts`               | Medium      | Replace inline keyboard effect with the hook; add `cancelArmedSmash` + `onCancel` |
| `src/presentation/pixi/input-controller.ts` | Small       | `onCancel` on the binding; `contextmenu` suppression + cancel dispatch            |
| `test/unit/ui/input/keymap.test.ts`         | Small       | `normalizeKey` and key-table coverage                                             |
| `test/e2e/pointer-input.spec.ts`            | Medium      | Right-click cancels an armed windup; blur resets stuck Mobility and held move     |

## Execution Outline

1. Add `keymap.ts` (the tables the inline effect currently hardcodes) and its unit test.
2. Add `use-keyboard-input.ts`, moving the keydown/keyup logic verbatim in behavior, then adding the blur/visibility release and the once-per-mount ref pattern.
3. Extend `input-controller.ts`: add `onCancel` to `PointerInputBinding`, the `contextmenu` listener in `bind()`, and its removal in cleanup.
4. Rewire `use-game-session.ts`: delete the inline keyboard effect and `MOVE_REPEAT_MS`, call `useKeyboardInput`, add the `cancelArmedSmash` callback, and pass `onCancel` into `bindPointerInput`.
5. Add the two browser tests to `pointer-input.spec.ts` (right-click cancel on `smash-water`; blur release on a held-movement scenario).
6. Run `npm run verify`, then the targeted e2e selection (the new tests plus the existing held-movement and smash tests).

## Implementation Notes

- Keep `MOVE_REPEAT_MS = 260` (the current fast-forward cadence) and the immediate-fire-then-interval shape: the first step fires synchronously on keydown, then every 260 ms. Carry the fast-forward rationale comment across with the constant.
- The held-movement map is keyed by `normalizeKey(event.key)` on both keydown and keyup so a released key stops the right interval.
- `blur` uses `window.addEventListener("blur", ...)`; visibility uses `document.addEventListener("visibilitychange", ...)` and acts only when `document.visibilityState === "hidden"`.
- Do not gate the `contextmenu` `preventDefault` — suppress the menu on the canvas always; gate only the `onCancel` dispatch.
- The pointer effect's dependency array gains `cancelArmedSmash`; re-binding is safe because `bind()` unbinds first.

## Edge Cases

| Case                                      | Expected Handling                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Window blur while Alt is held             | Blur resets Mobility mode to Attack; no stuck pointer mode                    |
| Window blur while a movement key is held  | Held-movement interval is cleared; movement stops until a fresh keydown       |
| Right-click with nothing armed            | Browser menu suppressed; no command dispatched                                |
| Right-click while armed but overlay/inert | `canInteract()` false → suppressed only, no cancel (cannot occur while armed) |
| Held movement while a turn is resolving   | Repeat no-ops until `isIdle`, unchanged from today                            |
| Dev Strict Mode remount                   | Symmetric listener cleanup and ready-flag delete; no duplicate registration   |

## Acceptance Criteria

1. Production keyboard and pointer input drive the same commands and outcomes as before the refactor.
2. Focus loss and visibility loss release held movement and return the pointer mode to Attack.
3. Right-click during an armed windup cancels it without advancing the Tick, and the browser context menu never appears over the canvas.
4. Gameplay input stays inert while a reward or milestone overlay is open.
