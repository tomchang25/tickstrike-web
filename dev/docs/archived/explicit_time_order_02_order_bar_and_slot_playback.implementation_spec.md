# Explicit Time Order 02: Order Bar and Slot Playback

Parent Plan: `explicit_time_order.md`

## Goal

Make the canonical within-tick actor order visible and readable while it plays: a reactive order bar shows the Player followed by every living enabled enemy, highlights each slot in the HUD and arena, and advances through already-resolved events with player-selectable pacing. The presentation must expose the linear order landed by child 01 without changing gameplay timing, determinism, or command fast-forward behavior.

## Summary

Add an enlarged horizontal order rail at the bottom center of the playfield, clear of the existing corner controls. The Player token leads, followed by one token per living enabled enemy in stable spawn order. Tokens use the existing dark HUD language with a cyan active ring, dimming for inactive enemies, and accessible labels. Each token displays the entity's current base sprite frame using its facing and best available state (`idle`, `move`, `prepare`, or `attack`); idle is the safe fallback when a frame cannot be resolved. Normal state has no badge, while exceptional state uses an explicit text badge (`STG`, `REC`, or `REST`) or an attack warning with its remaining turn count (`⚠ 2`). The rail never introduces a scroll bar.

The core action result gains a deterministic, non-persisted turn-playback sidecar: the Player event batch, every enemy slot including no-op slots, each enemy's post-slot state, and trailing wave/outcome events. The flattened semantic event list remains authoritative and unchanged. Runtime captures the pre-command snapshot for initial membership, then a session-local turn-order controller plays the sidecar through `PresentationDirector`, publishes reactive HUD state, and drives Pixi active/hover highlighting.

`fast` pacing hands the logical active highlight to the next visible slot after 0.1 seconds while prior VFX may continue. `normal` pacing uses the same overlap model with a 0.25-second handoff. No-op slots publish their post-slot badge state and finish within one render turn. A new input finishes active VFX, drains every unstarted slot, settles the bar, and preserves the existing command-queue fast-forward contract.

Settings schema v5 exposes the `fast` and `normal` choices, maps v4 `staggered` to `fast` and `wait-for-vfx` to `normal`, and preserves every v1-v3 compatibility path. Hovering or focusing a HUD token highlights the matching arena entity; hovering an occupied arena cell highlights its token. Reduced-motion presentation keeps the same information and pacing while removing non-essential token transitions.

## Relational Context

- `resolveCommand` keeps the authoritative flat event list and adds a transient sidecar containing the Player batch, exact enemy slot batches/post-slot state, and trailing events. Slot ownership must never be inferred from victim-shaped event fields.
- `resolveEnemyPhase` remains the spawn-order owner and exposes slot results without adding presentation timing, role branches, renderer dependencies, or snapshot fields.
- `GameRuntime` supplies pre-command membership and final refill state to one session-local turn-order controller. The controller owns pending/active slots, reactive tokens, hover, pacing, cancellation, and refill; none is persisted.
- `PresentationDirector` keeps VFX lifetime. The controller owns logical handoff and whole-turn fast-forward; both pacing modes overlap VFX and clear the previous active highlight after their fixed 0.1- or 0.25-second handoff.
- Pixi owns arena highlight and pointer-to-entity detection; React owns tokens. They exchange entity ids only, and active/hover reasons clear independently.
- `GameHud` stays pure and `useGameSession` owns symmetrical subscriptions. React never schedules playback or mutates game state.
- `SettingsStore` v5 owns `turnOrderPacing`; every v1-v3 path stays supported, v4 values migrate forward, and absent/invalid values default to `fast`.
- Flat events, command logs, audio, goldens, replay, and `WorldSnapshot` remain compatible.

## Scope

### Included

- Reactive persistent order bar, badges, death/despawn removal/refill, and HUD/arena cross-highlight.
- Both overlap pacing modes, no-op handling, fast-forward, reduced motion, Settings v5, and focused evidence.

### Excluded

- Gameplay, snapshot, replay-log, or semantic-event changes.
- Initiative, forecast UI, new portrait assets, per-enemy pacing, and child 01 closeout.

## Files to Change

| File                                                                   | Change Size | Purpose                                                          |
| ---------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `src/core/actions/{enemy-phase,action-resolver}.ts`                    | Medium      | Produce slot metadata while preserving flat events               |
| `src/runtime/{turn-order-controller,game-runtime,settings-store}.ts`   | Large       | Own playback, integration, fast-forward, and Settings v5         |
| `src/presentation/timelines/presentation-director.ts`                  | Medium      | Report visual work and allow concurrent slot batches             |
| `src/presentation/pixi/{pixi-game-renderer,input-controller}.ts`       | Medium      | Arena highlights and hovered-entity reporting                    |
| `src/app/{use-game-session,game-app,testbed-app}.tsx`                  | Medium      | Subscribe and wire HUD/settings                                  |
| `src/ui/{hud/turn-order-bar,hud/game-hud,settings/settings-panel}.tsx` | Medium      | Render the rail and pacing controls                              |
| `src/app/styles.css`                                                   | Medium      | Layout, badges, highlights, responsive and reduced-motion styles |
| `test/unit/{core/actions,runtime,presentation}/**/*.test.ts`           | Large       | Slot parity, scheduling, migration, cleanup, and highlighting    |
| `test/e2e/time-order.spec.ts`                                          | Medium      | Visible order, progression, cross-highlight, and persistence     |

## Execution Outline

1. Add slot results and the action sidecar; prove flattening preserves the existing event stream and goldens.
2. Land the controller/runtime scheduler with both modes, reactive reduction, cancellation, refill, and fast-forward tests.
3. Add composable Pixi highlights and arena hover reporting without changing gameplay pointer behavior.
4. Add Settings v5, session wiring, HUD/settings UI, CSS, focus semantics, and reduced motion.
5. Run focused unit and isolated targeted Playwright checks, capture desktop/narrow screenshots, then run `npm run verify`.

## Implementation Notes

- Slots carry actor id, events, and cloned post-slot state; the Player owns command/action events and wave/outcome events trail the rail.
- Event reduction applies death and interruption immediately; post-slot state updates the acting token at handoff.
- The labelled ordered list is fixed at the bottom center of the playfield and uses focusable 74px sprite tokens, short exceptional-state badges, accessible names, a cyan active/focus outline, and a reduced-motion-safe completion transition. It uses current direction/state sprite frames with idle fallback, never scrolls, and shows ATTACK as `⚠` plus remaining turns. Tokens stay visible through every slot; only death/despawn removes a token, and an empty rail stays rendered. Normal state renders no badge; ambiguous wave-like labels such as `W1` are prohibited.
- Wave spawns appear only in the final-snapshot refill at the tick boundary.

## Edge Cases

| Case                                   | Expected Handling                                                     |
| -------------------------------------- | --------------------------------------------------------------------- |
| Player kills an enemy before its slot  | Remove its initial token during the Player batch; play no enemy slot  |
| Earlier enemy interrupts a later enemy | Re-badge the victim `REC` immediately; retain its later recovery slot |
| Slot has no visible work               | Publish post-slot state within one render turn and add no delay       |
| VFX overlap in either pacing mode      | Only the latest logical slot stays active                             |
| Input arrives during playback          | Settle active and unstarted slots before the queued command           |
| Wave spawn, hovered death, or reset    | Refill only at boundary; clear stale hover/timers/highlights safely   |
| Stored pacing is absent/invalid        | Use `fast`; map retired v4 values and retain older settings           |

## Acceptance Criteria

1. The visible bar always states Player first and then the current living enabled enemies in stable spawn order, with no prediction or alternate ordering truth.
2. Slot events and status changes play in canonical order; active HUD and arena highlights agree, completed slots remain visible until death/despawn, and the next segment refills at the tick boundary.
3. Fast playback starts visible slots 0.1 seconds apart; normal playback uses 0.25 seconds; both overlap VFX, and no-op slots add no perceptible delay.
4. Any new player input fast-forwards active and unstarted slots to the settled final state before the next command runs.
5. HUD and arena hover/focus cross-highlight by entity identity, remain keyboard-readable, do not rely on color alone, and respect reduced motion.
6. The pacing preference survives reload through Settings v5 while v1-v3, v4 values, and malformed payloads retain safe defaults.
7. Core event ordering, command replay, snapshots, and same-seed determinism remain unchanged; focused unit, targeted browser, visual review, and canonical non-browser verification pass.
