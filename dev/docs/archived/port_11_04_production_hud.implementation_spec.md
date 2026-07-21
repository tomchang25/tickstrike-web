# Port 11 Child 04: Production HUD

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Give both shells a game-style overlay HUD floating on the arena board — player HP and mobility top-left, wave top-center, Monster-Hunter-style control hints top-right, and the run build with a Build button bottom-left that opens an artifacts overview — replacing the disjoint below-board build panel and the stale key hint. Visual-consistency baseline only; reference parity stays with port_13.

## Summary

Today the production shell shows the player no HP, wave, or mobility, only a below-board `RunBuildHud` (which reads as a separate panel) and a hint line that child 03a made wrong. This child moves the HUD onto the board as an overlay and drops the below-board fragments. Every value comes from `WorldSnapshot`.

- **`src/ui/hud/game-hud.tsx`** — a `GameHud({ snapshot, commandsEnabled })` overlay that fills the canvas frame with `pointer-events: none`, so gameplay clicks pass through to the board; only its interactive controls re-enable pointer events. It renders:
  - **Top-left** player status: HP as a text-plus-bar (`80 / 100`), and mobility as `Dash · Ready` / `Dash · CD 3` when the player has mobility. No guard row (the player has no guard).
  - **Top-center** `Wave N`, shown only when the scenario has a `waveRuntime`.
  - **Top-right** static control hints (Move/Attack `WASD`, Attack `IJKL`, Mobility `Alt + cursor`, Cancel `right-click`), rendered with text keycaps; hidden when `commandsEnabled` is false.
  - **Bottom-left** the existing `RunBuildHud` (chips, testids preserved) plus a `Build` button that opens a `BuildOverview` modal listing every held artifact and its count.
- **`BuildOverview`** — a small dialog reading `snapshot.runBuild`, opened from the Build button, closed by its button, backdrop click, or Escape. UI-only local state; it never touches the runtime.
- Both `GameApp` and `TestbedApp` render `GameHud` inside their `canvas-frame` and drop the below-board `RunBuildHud` and hint. The dense `TestbedPanel` is unchanged.

## Relational Context

- `GameHud` is a pure projection of `WorldSnapshot` plus one piece of presentation-only state (the overview open flag): player = `entities.find(id === "player")`, HP `hp`/`maxHp`, mobility `mobility?.kind`/`remainingCooldown`; `waveRuntime?.waveNumber`. It recalculates no combat, owns no game state, and calls no runtime method (React component standard; runtime-ownership presentation-state rule).
- It renders inside `canvas-frame` as an absolute overlay. `canvas-frame` is `position: relative` and its children (`terminal-banner`, `reward-overlay`, `semantic-mirror`) are absolute with no explicit z-index, so stacking is DOM order. `GameHud` is placed right after `canvas-host` (before those), so the modal reward/milestone overlays and terminal banner naturally sit above it; the `BuildOverview` backdrop carries an explicit high z-index so it is usable when open.
- Pointer-events: the `game-hud` container is `pointer-events: none` and the non-interactive panels inherit it, so aiming/clicking the board is unaffected; the Build button and the `BuildOverview` set `pointer-events: auto`. This is the load-bearing rule that keeps the HUD from stealing gameplay input.
- `RunBuildHud` markup and its `run-build-hud` / `run-build-empty` / `run-build-item-*` testids stay byte-stable (asserted by `rewards.spec.ts` on `/debug`); only its container styling changes, and its `Build` `<h3>` title is hidden via CSS inside the overlay to avoid duplicating the Build button label.
- Control hints use text keycaps, not an icon font (the app loads no icon webfont); the mockup's mouse glyphs become `cursor` / `right-click` text.
- No new snapshot field, no `1/1` action counter (deferred to the future speed refactor), and no per-enemy HUD (Non-Goal 2). Telegraphs and entities stay in Pixi.
- Accessibility (`web_accessibility_standard`): the HUD is a labelled region; HP and cooldown are text, not colour alone; the overview is a labelled `dialog` closable by keyboard (Escape) and a real close button; no `aria-live` on the HUD (frequent HP changes would be noisy — the terminal banner owns announcements).
- Layout: with the build panel and hint gone from below the board, `game-stage`'s height reserve is reduced so the board can grow; the overlay adds no vertical stack height.

## Scope

### Included

- `GameHud` and `BuildOverview` under `src/ui/hud/`, and their styles.
- Rendering `GameHud` inside both shells' `canvas-frame`; removing the below-board `RunBuildHud` and hint from both.
- Shared overlay panel styling; the `game-stage` height-reserve adjustment.
- Home-page smoke assertions plus a Build-overview open/close browser test.

### Excluded

- Any per-enemy HUD, telegraph/entity rendering through React, or a second state owner.
- The `1/1` action counter (future speed refactor), artifact descriptions in the overview, and reference visual parity/polish (port_13).
- New snapshot fields, any `src/core` change, or any `RunBuildHud` markup/testid change.
- Settings UI and the settings-panel Restart (child 05).

## Files to Change

| File                             | Change Size | Purpose                                                                         |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `src/ui/hud/game-hud.tsx`        | Medium      | Overlay HUD: player status, wave, control hints, build bar, build overview      |
| `src/app/game-app.tsx`           | Small       | Render `GameHud` in the canvas frame; drop the below-board build panel and hint |
| `src/app/testbed-app.tsx`        | Small       | Same, passing `commandsEnabled`                                                 |
| `src/app/styles.css`             | Medium      | Overlay positioning, pointer-events, panel look, hide build title, board size   |
| `test/e2e/run-lifecycle.spec.ts` | Small       | Home smoke asserts HUD HP + Wave; Build button opens/closes the overview        |

## Execution Outline

1. Add `GameHud` (and `BuildOverview`) with testids `hud-player-hp`, `hud-wave`, `hud-build-button`, `hud-build-overview`, rendering from a passed snapshot and local open state.
2. Add the overlay styles in `styles.css`: `game-hud` fills the frame with `pointer-events: none`, corner panels, interactive controls re-enable pointer events, hide `.run-build-title` inside the HUD, and reduce the `game-stage` height reserve.
3. Render `GameHud` inside `canvas-frame` in both shells (right after `canvas-host`), and delete the below-board `RunBuildHud` and hint from both.
4. Extend the home smoke in `run-lifecycle.spec.ts`: assert the HUD shows full player HP and `Wave 1` on load, then click the Build button and assert the overview opens and closes.
5. Run `npm run verify` and the targeted e2e (home smoke plus the existing rewards build-HUD test, confirming `run-build-*` still resolves inside the overlay).

## Implementation Notes

- Mobility row renders only when `player.mobility` exists; wave renders only when `waveRuntime` exists (`tick-arena` / `smash-water` show no wave); the player being absent (terminal) must not throw.
- Keep `RunBuildHud` rendered as the chip bar; do not fold its logic into `GameHud`. The Build button is a sibling that toggles `BuildOverview`.
- The overview lists name + `×count` per held artifact (sorted by id), reusing the artifact catalog like `RunBuildHud`; no description templating in this child.
- `pointer-events` is the correctness crux — verify board clicks still work with the HUD present (the existing pointer e2e covers this once the HUD renders on `tick-arena`).

## Edge Cases

| Case                              | Expected Handling                                            |
| --------------------------------- | ------------------------------------------------------------ |
| Scenario without `waveRuntime`    | No wave label rendered                                       |
| Player has no mobility            | Mobility row omitted; HP still shows                         |
| `commandsEnabled` false (testbed) | Control hints hidden; HP/wave/build still show               |
| Build overview open then reset    | Overview reads the live snapshot; reset re-renders cleanly   |
| Board click under a HUD panel     | Passes through (`pointer-events: none`); only controls catch |

## Acceptance Criteria

1. Both shells overlay player HP, mobility, wave, and the run build on the board, derived only from snapshots, without recalculating combat.
2. The HUD does not intercept gameplay pointer input; board aiming and clicking work with the HUD present.
3. The Build button opens an artifacts overview that lists held artifacts and closes cleanly; the control hints state the current bindings.
4. No stale hint or below-board build panel remains, and reset/scenario replacement leaves no stale HUD values.
