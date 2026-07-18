# Mobility Selection and Smash Preview

Parent Plan: `port_03_player_verbs_and_player_clock.md`

## Goal

Extend the Port 03 pointer interaction so the selected Mobility can be Dash or Smash, while keeping all Mobility actions on the same Alt-held cursor preview and left-click confirmation path. Dash must traverse enemy cells without applying damage in this slice, and Smash must gain the reference two-confirm preview and action flow.

## Summary

Port 03.2 removes the temporary Move and Mobility direction controls from the React testbed panel. Normal Attack direction buttons remain. The existing `Smash right cell` button becomes a two-state Mobility toggle that selects Dash or Smash; it never consumes a tick or executes an action. The selected Mobility is the payload used by Alt-held cursor input.

Dash preview and commit will allow living enemy cells in the travelled path. The player lands on the farthest legal non-enemy land cell within the fixed Port 03 range, while the semantic Dash path includes traversed enemy cells. No Dash damage, enemy HP change, or victim event is added yet.

Smash preview follows the reference project: the cursor resolves to a clamped landing center, previews the 3x3 impact area and a virtual player node, and distinguishes legal from blocked landing cells. The first left click arms and locks the landing, consumes one action, and advances one tick without damage. The second left click releases the locked Smash, consumes one action, and reuses the existing Web Smash impact, crush, knockback, and water outcomes. Cursor movement and Mobility switching cannot change an armed landing.

## Relational Context

- The panel owns only the transient selected Mobility (`dash` or `smash`); it does not own cooldowns, armed Smash state, landing validity, or world time. The initial selection is Dash.
- The pointer adapter reads the selected Mobility and sends the existing application command path. Hover and Mobility selection never call `GameRuntime.execute()`.
- `GameRuntime` remains the only command entry point and queues both the first Smash arm and the second Smash release through the same generation and presentation lifecycle as other commands.
- `World` owns the canonical armed Smash landing. The armed target must be included in snapshots so reset, preview, debug inspection, and presentation all observe the same lock.
- The Smash command remains context-sensitive like the reference confirm verb: when no Smash is armed it validates and arms the supplied target; when a Smash is armed it ignores the current cursor target and releases the locked target.
- Smash arm and release are separate accepted actions. Arm emits a player-result event and advances one tick without applying damage; release applies the existing Smash outcomes and advances one tick.
- A Smash release whose locked landing is no longer open is rejected without advancing time and keeps the Smash armed. The player must continue to see the locked preview until a valid release or reset occurs.
- Dash path legality is split from landing occupancy: land and unreserved cells may be traversed when occupied by a living enemy, but the landing must be a non-enemy walkable cell. Walls, water, out-of-bounds, and reservations stop the path.
- `port-ref` currently applies damage to Dash victims after planning the path. Port 03.2 intentionally ports only traversal and landing; no Dash victim damage or victim semantic event is added.
- Normal Attack, keyboard Move, reset, scenario selection, and the existing Smash impact outcomes remain compatible unless explicitly changed by the panel or armed-Smash behavior in this spec.
- The temporary panel no longer provides direct Move, Dash-direction, or Smash-target actions. Accessibility must expose the Mobility toggle's current selection through its label and pressed state; the canvas remains labelled and keyboard Move/Attack remain available.

## Scope

### Included

- Remove the Move section and all Dash direction buttons from the testbed panel.
- Replace `Smash right cell` with a Dash/Smash Mobility toggle.
- Route Alt-held pointer preview and left click through the selected Mobility.
- Allow Dash traversal through living enemies without damage, while preserving deterministic landing and path events.
- Add read-only Smash target clamp, 3x3 area, legality, and locked-preview calculations.
- Add context-sensitive Smash arm/release state, events, snapshot data, presentation, reset cleanup, unit assertions, and browser acceptance.

### Excluded

- Dash damage, guard, stagger, victim outcomes, invulnerability, cooldowns, Speed, or Chain Dash.
- Character-class ownership of Mobility selection; the panel toggle is a temporary Web testbed adapter until class runtime exists.
- New Wait, cancel, right-click, touch, gamepad, or drag commands.
- Port 04 enemy behavior, enemy response, waves, rewards, or Port 11 production HUD/settings.
- A second Smash target-selection UI or direct Smash/Dash action buttons outside the shared cursor path.

## Files to Change

| File                                                 | Change Size | Purpose                                                                                                             |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                            | Small       | Add the optional armed Smash target to the canonical world snapshot.                                                |
| `src/core/world/world.ts`                            | Medium      | Own, clear, snapshot, and validate the armed Smash landing.                                                         |
| `src/core/events/combat-events.ts`                   | Small       | Add the Smash-arm semantic event and preserve existing release events.                                              |
| `src/core/actions/action-preview.ts`                 | Large       | Permit enemy traversal in Dash planning and add shared Smash target/area preview geometry.                          |
| `src/core/actions/action-resolver.ts`                | Large       | Reuse the new Dash plan and implement context-sensitive Smash arm/release resolution.                               |
| `src/presentation/pixi/PixiGameRenderer.ts`          | Large       | Render Dash-through-enemy paths, selected Mobility previews, Smash areas, and locked Smash previews.                |
| `src/presentation/timelines/PresentationDirector.ts` | Small       | Present Smash arm feedback and preserve release cleanup through the tracked timeline boundary.                      |
| `src/app/App.tsx`                                    | Medium      | Own transient Mobility selection, remove direct keyboard Mobility bypasses, and route the selected pointer payload. |
| `src/ui/TestbedPanel.tsx`                            | Medium      | Remove Move/Dash controls and expose the accessible Dash/Smash selection toggle.                                    |
| `test/unit/core/actions/action-preview.test.ts`      | Medium      | Assert enemy traversal, non-enemy landing, Smash clamp, area, legality, and locked-target behavior.                 |
| `test/unit/core/actions/action-resolver.test.ts`     | Large       | Assert Dash path/event behavior and Smash arm/release tick and outcome semantics.                                   |
| `test/e2e/testbed.spec.ts`                           | Large       | Assert the reduced panel, Mobility toggle, Dash traversal preview, and two-stage Smash browser flow.                |

## Execution Outline

1. Add canonical armed-Smash state and snapshot projection with reset-safe ownership. Add the arm event without changing the existing release outcome event types.
2. Update shared preview geometry. Dash planning must continue over living enemy cells, record those cells in order, and choose the last non-enemy legal landing. Smash planning must clamp the cursor target to a three-cell range box and calculate its 3x3 area and open-landing legality.
3. Update the resolver. Preserve the existing Dash command shape and event order while allowing enemy traversal. Make the existing Smash command arm on the first accepted call and release the locked target on the next accepted call; rejected release leaves the armed state unchanged.
4. Replace the panel's Move, Dash direction, and right-cell Smash controls with one labelled, pressed-state Mobility toggle. Keep Normal Attack direction controls and Reset.
5. Extend App and Pixi input state so Alt-held hover uses the selected Mobility. Dash displays its path and landing; Smash displays its area and landing ghost, then locks the Smash preview after arm until release or reset. Remove direct keyboard Mobility dispatch so no input bypasses the selected payload.
6. Add presentation feedback and cleanup for Smash arm/release, including scenario replacement and reset during either phase.
7. Update focused unit assertions and the shared Playwright scenario. Replace panel Move/Dash/Smash action assumptions with keyboard Move, Normal Attack panel input, Mobility toggle, pointer Dash, and two-click Smash coverage.

## Implementation Notes

- Dash traversal may include living enemy cells in `path`, but `landing` must be the last path cell without a living enemy. If every traversed cell is occupied by an enemy, reject with no tick or placement change.
- A Dash path stops at the first wall, water, out-of-bounds, or reserved cell. A later enemy does not stop the path; a later empty land cell can become the landing.
- Dash release moves only the player to `landing`. It must not mutate enemy HP, phase, occupancy, or emit a victim/damage event in this slice.
- Smash target resolution is not cardinal. Clamp each cursor delta axis independently to `[-3, 3]`, matching the reference target planner. The preview center may be diagonal from the player.
- Smash preview shows the 3x3 area for the current target. A legal target shows the translucent virtual player at the center; an illegal target shows the blocked area without making it clickable.
- The first accepted Smash command records the target, emits `smash_armed`, and advances the world. It does not emit `smash_impact`, enemy outcomes, or damage.
- While armed, the second command uses the stored target even if the cursor moved or Alt was released. A successful release clears the armed target after applying the existing Smash result.
- The Mobility toggle must be a native button with `aria-pressed`, a stable test id, and visible text identifying the selected payload. Toggling is presentation/input state and does not advance time.
- The panel's removed Move and Dash controls must not be replaced by hidden or disabled duplicates. Keyboard Move and Normal Attack remain the non-pointer fallback; all direct keyboard Dash/Smash shortcuts must not bypass the selected Mobility.
- Preview metadata must expose selected Mobility, Dash landing/path cells, Smash center, Smash legality, and armed state on the existing canvas for Playwright assertions without adding preview state to the semantic gameplay mirror.

## Edge Cases

| Case                                                                  | Expected Handling                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dash cursor path crosses one or more living enemies                   | Include those cells in the path, land on the farthest later non-enemy legal cell, and apply no damage. |
| Dash path contains only enemies before range or terrain blockage      | Reject without moving, ticking, or changing the event stream.                                          |
| Smash cursor target is diagonal or beyond range                       | Clamp independently per axis and preview the resulting 3x3 center.                                     |
| Smash target is occupied, reserved, water, wall, or outside the arena | Show blocked preview and reject the arm without advancing time.                                        |
| Smash is armed and cursor moves                                       | Keep the locked center, area, and virtual player unchanged.                                            |
| Smash release target becomes blocked                                  | Reject without advancing and keep Smash armed.                                                         |
| Mobility toggle is pressed while Smash is armed or a command is busy  | Ignore the toggle until the action is no longer locked/busy; do not mutate the armed target.           |
| Reset or scenario replacement occurs during an armed Smash            | Clear the armed target, selection preview, pointer listeners, and presentation work.                   |
| Static inspection scenario receives pointer or toggle input           | Keep commands and selection disabled; do not mutate the snapshot.                                      |

## Acceptance Criteria

1. The panel contains Normal Attack controls and one accessible Dash/Smash toggle, but no Move section, Dash direction controls, or direct Smash action button.
2. Alt-held cursor preview and left-click commit use the Mobility selected by the panel toggle without advancing time during hover or selection.
3. Dash preview and commit traverse living enemy cells, land on the farthest legal non-enemy cell, include the traversed path in the player event, and leave enemy HP and phase unchanged.
4. Smash preview shows a clamped 3x3 area and legal landing ghost, while blocked centers are visibly non-committable.
5. The first accepted Smash click arms and advances exactly one tick without damage; the second accepted click releases the locked target, applies existing Smash outcomes, and advances exactly one tick.
6. Cursor movement, Alt release, Mobility toggling, reset, and scenario replacement cannot move or mutate an armed Smash target unexpectedly.
7. Unit assertions and Playwright acceptance observe the same Dash path, Mobility selection, Smash arm/release state, event order, and visible result.
