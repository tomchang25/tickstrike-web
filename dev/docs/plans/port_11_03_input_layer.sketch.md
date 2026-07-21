# Port 11 Child 03: Input Layer Sketch

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Formalize keyboard input into a dedicated `src/ui/input/` feature, add the right-click windup cancel, and add the release semantics the plan requires (blur, visibility change, unmount), while `use-game-session.ts` stays the single runtime wiring point.

## Summary

Direction favored: a pure keymap data module plus a driver hook under `src/ui/input/`, consumed by `use-game-session.ts`, which keeps sole ownership of runtime calls. Pointer input stays where it is (`src/presentation/pixi/input-controller.ts`); the only pointer change is a contextmenu seam for the child 02 cancel entrance. The binding set is locked in conversation and adds nothing: keyboard owns Move and Normal Attack, Dash and Smash stay unified as the Alt-entered pointer Mobility mode, and no restart input exists. The spec must verify the current keyboard effect's exact behavior before moving it.

## Sketch

- Current state (verify at spec time): the keyboard effect lives at `use-game-session.ts:197-276` — WASD/arrows held-repeat movement (`MOVE_REPEAT_MS = 50`), IJKL attacks, Alt toggling `pointerMode`, a `keyboardInputReady` dataset flag the e2e suite waits on. Cleanup clears intervals only on keyup and effect teardown; there is no blur/visibilitychange release, and a held Alt at focus loss leaves `pointerMode` stuck on `"mobility"`.
- Candidate shape: `src/ui/input/keymap.ts` (pure data: key → intent, where intents are roughly move/attack/dash/restart discriminated records) and `src/ui/input/use-keyboard-input.ts` (the driver hook: held-key map, repeat interval, Alt state, window listeners, release-on-blur/visibilitychange, symmetric cleanup). The hook takes callbacks and an `enabled`/`interactive` flag; it never imports the runtime.
- The current effect re-subscribes its window listeners whenever `interactive`/`move`/`attack` identities change (every snapshot transition). The driver should hold callbacks in refs so listener registration happens once per mount; read `dev/foundation/platforms/web-react/skills/react_strict_mode_effects.md` at spec time — Strict Mode replay must not double-register or double-release.
- Binding set (locked in conversation): keyboard owns Move (WASD/arrows) and Normal Attack (IJKL) only. Dash and Smash remain unified as the pointer-driven Mobility mode entered with Alt — no separate keyboard Dash binding. There is no restart input: restart stays a terminal-overlay affordance, with a settings-panel Restart arriving in child 05. The extraction moves existing bindings without adding any.
- Right-click cancel: candidate seam is extending `PixiGameRenderer.bindPointerInput` / `InputController.bind` (verify at `input-controller.ts:109-195`) with a `contextmenu` listener that always suppresses the browser menu on the canvas and invokes an `onCancel` callback; the session hook maps that to the child 02 `cancelArmedSmash` entrance. Dispatch unconditionally and let core reject when nothing is armed, or gate on `snapshot.armedSmashTarget` — spec decides after checking what `busy` interplay looks like.
- Release semantics: on `blur` and `visibilitychange`(hidden), clear the held-movement map, stop intervals, and reset `pointerMode` to `"attack"` (fixes the stuck-Alt bug). Route changes are full unmounts in this app (path-based branch in `app.tsx`), so effect cleanup already covers them — verify no client-side navigation was added.
- The `keyboardInputReady` flag and existing e2e expectations (held-movement queueing test in the split harness-lifecycle spec) must survive unchanged; the driver is a refactor plus additions, not a behavior rewrite.
- Suppression over UI: the existing `interactive` gate (`commandsEnabled && running && !pendingReward && !pendingMilestone`) remains the single suppression input to the driver; the settings panel from child 05 will later join that gate — do not invent a second one here.

## Non-Goals

1. Rebindable keys or any key-configuration UI (out of port_11 entirely).
2. Touch and gamepad input (plan non-goal).
3. HUD or overlay changes (child 04) and settings persistence (child 05).
4. Any change to core command semantics; child 02 owns the cancel entrance.

## Acceptance Criteria

1. Production keyboard and pointer input drive the same commands and outcomes as the deterministic browser scenario.
2. Focus loss, visibility loss, and reset release all held input, and the pointer mode returns to its default.
3. Right-click during an armed windup cancels it without advancing the Tick; the browser context menu never appears over the canvas.
4. Gameplay input is inert while an overlay is open, exactly as before the refactor.
