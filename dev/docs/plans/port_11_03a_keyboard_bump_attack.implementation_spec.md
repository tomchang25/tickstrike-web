# Port 11 Child 03a: Keyboard Bump-Attack

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Let a movement key double as a Normal Attack: pressing a WASD/arrow direction whose target cell holds an attackable enemy performs the attack instead of moving, while the explicit IJKL attack keys and the Alt-plus-cursor Mobility mode stay exactly as they are.

## Summary

Child 03 moved keyboard input into `src/ui/input`, where WASD/arrows always `move` and IJKL always `attack`. This child keeps both bindings but makes the movement keys context-sensitive: on each WASD/arrow step the session checks the core attack preview for that direction, and if it has a target, it attacks; otherwise it moves.

- The keyboard hook stops calling a fixed `move` handler for movement keys and calls a single `moveOrAttack(direction)` handler instead. IJKL still calls `attack`, and the Alt Mobility modifier is untouched. `keymap.ts` is unchanged (both key tables stay).
- `use-game-session.ts` adds `moveOrAttack`: it reads the current runtime snapshot, runs `previewAttack` for the direction, and dispatches the existing `attack` callback when the preview is `accepted && hasTarget`, else the existing `move` callback. Held-repeat re-decides every step, so holding a direction into an enemy auto-attacks and, once the target is gone, resumes moving.
- No Mobility keyboard input is added; Dash/Smash remain pointer-only via Alt.

Deliberate pass-a-tick still exists through an IJKL whiff into an empty cell; the movement keys never whiff (an empty direction moves).

## Relational Context

- `use-game-session.ts` stays the single runtime wiring point. `moveOrAttack` reuses the existing `move` and `attack` `useCallback`s (both self-gate on `interactive` and route through the `execute` busy-wrapper), so no new runtime call path or `execute` wrapping is introduced. `moveOrAttack`'s own `interactive`/`runtime` guard is a fast path that avoids computing a preview while inert.
- The attack decision uses `previewAttack(snapshot, playerId, direction)` from `@core/actions/action-preview` (the same pure preview the pointer path already uses). `app` importing `@core` is boundary-legal. `accepted && hasTarget` is the condition: `hasTarget` means an enemy sits in the attack footprint for that direction; `accepted` guards actor-alive/cardinal validity. The snapshot comes from `runtime.snapshot()` each call, so held-repeat and post-tick changes re-decide against fresh state.
- The keyboard hook's `KeyboardInputHandlers` renames `move` to `moveOrAttack`; the WASD/arrow (held-repeat) branch calls it, the IJKL branch still calls `attack`, and `setMobilityActive` is unchanged. The hook still never imports the runtime or core; it only invokes handlers.
- The pointer path is untouched: left-click still attacks/dashes/smashes through `onPrimaryClick`, and `attack` is shared by the pointer path, the IJKL branch, and `moveOrAttack`.
- The fast-forward cadence (`MOVE_REPEAT_MS = 260`, unconditional enqueue) is preserved; `moveOrAttack` dispatches on the same cadence, so an auto-attack step fast-forwards a pending VFX tail exactly as a move step does.

## Scope

### Included

- `moveOrAttack` in `use-game-session.ts` and the handler rename in `use-keyboard-input.ts`.
- One browser test covering the movement-key-attacks-a-target case.

### Excluded

- Any change to `keymap.ts`, IJKL behavior, the pointer path, or Mobility input.
- Removing the IJKL keys or the movement bindings.
- Auto-attack footprint variants or any core command change.

## Files to Change

| File                                 | Change Size | Purpose                                                                   |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------- |
| `src/ui/input/use-keyboard-input.ts` | Small       | Rename the movement handler to `moveOrAttack`; WASD/arrow branch calls it |
| `src/app/use-game-session.ts`        | Small       | Add `moveOrAttack` (preview-driven attack-or-move); wire it into the hook |
| `test/e2e/pointer-input.spec.ts`     | Small       | A movement key toward an adjacent enemy attacks instead of moving         |

## Execution Outline

1. Rename `move` to `moveOrAttack` in `KeyboardInputHandlers` and the WASD/arrow branch of `use-keyboard-input.ts`; leave the IJKL branch on `attack`.
2. Add `moveOrAttack` to `use-game-session.ts` (import `previewAttack`, decide `attack` vs `move` on `accepted && hasTarget`) and pass it plus `attack` to `useKeyboardInput`.
3. Add the browser test on `smash-water` (player at 3,3, enemy-center adjacent at 4,3): pressing the toward-enemy key attacks (player stays put, `player_attacked` logged), not moves.
4. Run `npm run verify` and the targeted e2e (the new test plus the existing mobility-panel test that still presses IJKL).

## Implementation Notes

- Keep `attack` and `move` as they are; `moveOrAttack` composes them rather than calling `runtime.execute` directly, so the `execute`/busy path and `interactive` self-gating are reused.
- `hasTarget`, not `hit`: guard/protection can leave `hit` undefined on a real target, which must still attack rather than move.

## Acceptance Criteria

1. Pressing a movement key whose direction holds an attackable enemy performs the Normal Attack and the player does not move.
2. Pressing a movement key toward an empty legal cell still moves.
3. IJKL still attacks explicitly, and Dash/Smash remain pointer-only via Alt.
