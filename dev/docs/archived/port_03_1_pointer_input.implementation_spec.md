# Pointer Input and Aim Preview

Parent Plan: `port_03_player_verbs_and_player_clock.md`

Status: Implemented and verified

## Goal

Add cursor-driven aiming to the existing Tick Arena without changing the deterministic command boundary. Players should be able to preview and commit Normal Attack with the left mouse button, enter Mobility mode with Alt, and see a truthful Mobility landing preview while Smash/Dash selection remains panel-owned.

## Summary

Port 03.1 adds a Pixi canvas pointer adapter and presentation-only aim overlays. Cursor coordinates resolve to grid cells, then to a dominant cardinal direction using the same fallback rules as the reference project. Hovering never advances time or mutates the world.

In Attack mode, the left click dispatches the existing `attack` command. The adjacent target cell is highlighted; an empty target remains clickable but uses a red outline. Holding Alt enters Mobility mode without consuming a tick. Mobility hover shows the legal path and a translucent virtual player at the landing cell. If the current Mobility aim has no legal landing, the preview retains the last valid landing instead of moving to the illegal cell.

The current Web Port 03 Mobility payload is Dash. This child does not add pointer-driven Smash or a cursor-based Smash/Dash selector; the existing panel toggle selects the Mobility payload while the canvas owns pointer invocation. Core validation, tick advancement, runtime queuing, and accepted event order remain unchanged.

## Relational Context

- The pointer adapter converts browser coordinates into a grid cell and a cardinal direction, then calls the existing application command callbacks; it must not call the resolver, mutate the world, or advance time directly.
- `GameRuntime` remains the only command entry point. Accepted pointer commits use the same `execute()` path as panel and keyboard commands, including busy gating, generation cancellation, presentation completion, and reset cleanup.
- `PixiGameRenderer` owns canvas pointer listeners and transient preview graphics. Entity views remain non-interactive; board-level pointer handling prevents entity-specific event paths from becoming a second input system.
- Attack and Mobility preview calculation is read-only. The preview must use the same cardinal direction and Dash path/landing geometry as the command commit, with no preview-only legality or occupancy rules.
- The deterministic core remains the authority for acceptance, occupancy, and tick advancement. The current Web Port 03 rule that occupied, reserved, wall, water, and out-of-bounds cells block Dash remains authoritative even though the current `port-ref` Dash implementation can traverse enemy cells.
- Attack target presence is presentation information only. An empty adjacent target is shown as a red outline but remains a valid Normal Attack whiff when committed through the existing command.
- Attack mode is the default and is restored on Alt release, scenario reset, and renderer teardown. Mobility mode is transient and never becomes persisted or canonical gameplay state.
- A rejected Mobility preview does not replace the last valid preview state. Reset, scenario replacement, disabled-command scenarios, and teardown clear all pointer listeners, preview graphics, and virtual player visuals.
- The existing panel remains responsible for selecting Smash or Dash. Port 03.1 must not infer an ability switch from cursor buttons, right click, or an additional pointer gesture.

## Scope

### Included

- Canvas pointer-to-grid conversion that respects CSS scaling and device-pixel resolution.
- Attack-mode hover preview and left-click Normal Attack dispatch.
- Alt-held Mobility mode, Mobility hover preview, translucent virtual landing node, and last-valid-preview retention.
- Shared non-mutating aim/path geometry so preview and commit cannot disagree.
- Unit coverage for aim/path preview decisions and Playwright coverage for hover, click, mode switching, and visible command results.

### Excluded

- New gameplay commands, damage rules, cooldowns, Speed, class selection, or enemy behavior.
- Pointer-driven Smash, pointer-driven Mobility selection, right-click cancel, touch, gamepad, or drag input.
- Changing the existing Port 03 Dash rule or adopting later `port-ref` combat behavior.
- Production HUD, settings, focus-loss policy, key repeat, or the broader Port 11 shell.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/actions/action-preview.ts` | Small | Provide read-only attack target and Dash path/landing geometry shared by preview and commit. |
| `src/core/actions/action-resolver.ts` | Medium | Reuse the shared Dash geometry without changing accepted/rejected outcomes or event order. |
| `src/presentation/pixi/pointer-aim.ts` | Small | Convert canvas coordinates to cells and resolve dominant cardinal aim with last-aim fallback. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Large | Bind board-level pointer events and render/clear attack, Mobility, and virtual-player previews. |
| `src/runtime/GameRuntime.ts` | Small | Keep the renderer's read-only snapshot current after command resolution without snapping presentation timelines. |
| `src/app/App.tsx` | Medium | Own transient pointer mode, Alt lifecycle, command gating, and pointer callback registration. |
| `test/unit/core/actions/action-preview.test.ts` | Small | Assert read-only target/path decisions and parity with current Port 03 legality. |
| `test/unit/presentation/pixi/pointer-aim.test.ts` | Small | Assert coordinate conversion and dominant-direction fallback behavior. |
| `test/e2e/testbed.spec.ts` | Medium | Assert browser-visible pointer hover, mode switch, click dispatch, tick/event results, and preview retention. |

## Execution Outline

1. Extract the existing Dash path scan into a read-only core helper and make the resolver consume it. Add focused tests proving blocked, partial, and legal paths retain the current Port 03 results.
2. Add the presentation pointer geometry helper for canvas-to-cell conversion and dominant cardinal direction, including the reference fallback to the last non-zero aim for zero or perfectly diagonal deltas.
3. Add renderer-owned board pointer handling and preview layers. Attack preview shows one adjacent cell; Mobility preview shows the computed path and a translucent landing node. A rejected Mobility plan leaves the prior valid preview untouched.
4. Add App-level Alt keydown/keyup mode registration and route left-click commits through the existing attack or Dash callback. Suppress commits while commands are disabled or a command is busy, while keeping preview state presentation-only.
5. Add unit assertions, then extend the shared Tick Arena Playwright scenario to hover an empty attack cell, verify no tick change, enter Mobility mode, verify valid/invalid preview behavior, and click to observe the existing command event stream.
6. Verify reset, scenario replacement, and renderer destruction remove listeners and preview objects, then run the project check and focused browser test.

## Implementation Notes

- Use the canvas bounding rectangle together with the Pixi screen dimensions when converting `clientX/clientY`; do not assume the CSS canvas size equals the internal render size.
- Keep actor containers at `eventMode = "none"` and attach input at the board/canvas boundary. Pointer clicks over the React panel must not reach the game canvas.
- Attack preview resolves to the adjacent cell represented by the dominant cardinal direction, not to an arbitrary distant cursor cell. Empty, blocked, or out-of-bounds adjacent targets remain previewable as whiffs when the pointer is over the board.
- Mobility preview uses the current Web Dash range of three cells and the shared Port 03 walkability predicate. A valid plan updates the retained landing; a plan with no legal landing does not update it.
- The virtual player is a transient presentation object only. It must not enter `WorldSnapshot`, occupancy, reservations, command results, or debug state.
- Mode switching and hover updates must not call `GameRuntime.execute()`. Only a left click in a valid active mode submits a command; the resolver still decides whether the command is accepted.
- Reset and scenario replacement must clear preview state before the new snapshot is displayed so an old target or virtual player cannot appear on the new arena.
- Expose stable preview data attributes on the existing game canvas for browser assertions: current pointer mode, attack preview cell/target state, Mobility preview cell, and whether a retained Mobility preview is active. These attributes are test visibility, not gameplay state.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Pointer leaves the canvas or is outside the arena | Clear the active hover preview and do not submit a command. |
| Cursor delta is zero or perfectly diagonal | Use the last non-zero cardinal aim, initially right, for both preview and commit. |
| Attack target has no enemy | Show the red non-target outline; left click still submits the Normal Attack whiff. |
| Mobility aim has no legal landing | Do not change the retained Mobility preview or virtual player node; do not submit a command. |
| Alt is released while a Mobility preview is visible | Return to Attack mode and replace the Mobility preview with the Attack preview for the current cursor. |
| Pointer click occurs while busy or commands are disabled | Ignore the commit and leave the world snapshot and tick unchanged. |
| Scenario reset or replacement occurs during a preview or presentation | Clear listeners and preview visuals; no stale pointer state may affect the new generation. |
| Panel control is clicked | Only the panel action runs; the same click must not submit a canvas command. |

## Acceptance Criteria

1. Hovering the Tick Arena in Attack mode highlights the adjacent Normal Attack cell without changing the world snapshot or tick.
2. An empty attack target uses a red outline while remaining a valid left-click Normal Attack whiff.
3. A left click in Attack mode produces the same command result, event order, and presentation completion as the equivalent panel or keyboard attack.
4. Holding Alt enters Mobility mode without advancing time, and legal hover shows the same Dash path and landing that the command resolver will use.
5. Hovering an illegal Mobility aim retains the last valid landing and translucent virtual player instead of moving the preview to the illegal cell.
6. The current panel behavior for Smash and Dash remains available, with no cursor-based Smash/Dash switching added.
7. Reset, scenario replacement, and teardown leave no pointer listener, pending preview, virtual player, or orphan presentation object.
8. Focused unit assertions and a Playwright browser assertion cover the pointer-visible behavior and the resulting deterministic command state.
