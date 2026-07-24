# Telegraph Readability Rework

Parent Plan: none (standalone spec)

## Goal

Make an incoming enemy attack readable at a glance: move the turn order bar to the top of the screen, draw each attacker's threat as one faint outline around its whole attack-cell set, hang the warning countdown over the attacker's head, and cue the final tick before execution with a synchronized red pulse on the bar, the enemy, and its outline. Add a player-facing setting that numbers every entity on the board with its turn-order index.

## Summary

Today the telegraph reads poorly: every attack cell is a separate faint filled rectangle, and a large countdown number sits on the floor of each cell (`BoardPainter.drawTelegraphs` + `telegraph-labels`), which clutters the board and does not connect the danger zone to the enemy that owns it. The turn order bar sits at the bottom, and the wave badge sits top-center.

This is a **presentation-only** rework. No `core/` gameplay, event ordering, or snapshot contract changes — the renderer already receives everything it needs (`entity.committedAttack.warningTicks`, `snapshot.telegraphs`, `telegraph.remainingTicks`). What changes:

- **Layout:** the turn order rail moves to top-center and the wave badge moves directly below it. This is a CSS-ownership change in `styles.css`; both elements are already absolutely positioned in the HUD's fixed 1408×896 space.
- **Telegraph shape:** replace the per-cell faint fill with a single faint **outline tracing the perimeter of the attacker's whole attack-cell set**. One attacker = one outline, drawn per telegraph.
- **Countdown location:** entity-backed attacks lose their floor numbers; the remaining-ticks countdown is drawn **over the attacker's head** as an entity-view child (alongside the existing HP bar / status label). Spawn telegraphs, which have no entity on the board, **keep a floor countdown** on their cells so nothing loses its timer.
- **Imminent cue:** when an attack will resolve on the very next enemy phase (`warningTicks === 1`), an **animated red pulse** plays in lockstep on three surfaces — the turn order token, the enemy sprite, and that attacker's telegraph outline.
- **Entity order setting:** a new always-visible settings toggle (`showEntityOrder`) draws each entity's turn-order index (`P`, `E1`, `E2`…) next to it on the board. The index must be the **same numbering the turn order bar shows**, so both are driven by one shared rule.

Once landed: the top of the screen shows turn order then wave; each threatened region is one clean outline with a number floating over the enemy that will strike; the last tick before impact flashes red everywhere that enemy is represented; and toggling the setting labels every board entity to match the bar.

## Requirements

1. The turn order rail renders at top-center and the wave badge renders immediately below it, both still scaling with `--hud-scale`. Rationale: turn order is the primary read; wave is secondary context.
2. Each active/warning telegraph renders as one faint outline around the union perimeter of its cells, with no per-cell fill. Rationale: connect the whole danger zone to a single attacker.
3. An entity-backed attack shows its remaining-ticks countdown over the attacker's head, not on the floor. A spawn telegraph (no backing entity) keeps a countdown on its cells. Rationale: over-head ties the timer to its owner; spawns have no owner to hang from.
4. When `warningTicks === 1`, the enemy's turn order token, sprite, and telegraph outline pulse red together, and the pulse clears when the attack resolves, is interrupted, or the entity is removed. Rationale: a single unmistakable "it lands next turn" beat.
5. A persisted, always-visible `showEntityOrder` setting labels every alive entity (player and enemies) on the board with its turn-order index, matching the turn order bar exactly. Default off.

## Relational Context

- The renderer projects from `WorldSnapshot` every frame (`PixiGameRenderer.projectSnapshot`); the `TurnOrderController` owns the DOM bar and pushes highlight state to the renderer through the `TurnOrderHighlights` seam (`setTurnOrderHighlights`). The order-number setting flows like `showDebugOverlay`: `SettingsStore` → `use-game-session` effect → a new `renderer.setShowEntityOrder(value)` method, mirroring the existing `setDebugMode` wiring.
- The turn-order index is currently produced inline in `orderTokens` (enemy counter over alive entities whose `enemyAction` is defined; player is `P`). The board number must equal the bar's index, so this numbering rule is the single source of truth: extract it into one shared pure helper consumed by both `orderTokens` and the renderer, or have the renderer call the same helper. Do not fork a second numbering rule in the renderer.
- The over-head countdown and the order-number label are **entity-view children** owned by the renderer (like `hpBar`, `statusLabel`, `debugLabel`), positioned above `BODY_CENTER_Y`; they are created in `createEntityView`, updated in `projectSnapshot`, and destroyed with the view in `destroyEntityView`. They read `entity.committedAttack?.warningTicks` and the shared index — never gameplay state.
- The telegraph outline and spawn floor countdown remain **board-owned** in `BoardPainter.drawTelegraphs`, which reads `snapshot.telegraphs` and resolves per-telegraph ticks from `telegraph.remainingTicks ?? entitiesById.get(sourceId)?.committedAttack?.warningTicks`. "Imminent" for the outline pulse is that resolved tick `=== 1`.
- The imminent red pulse is a presentation-only animated effect with three synchronized surfaces owned by different layers (DOM token via CSS class, sprite + outline via Pixi). It must be a steady loop while imminent and fully torn down when the condition ends or the entity/telegraph disappears — no leaked GSAP tweens or ticker callbacks. This is the terminal-cleanup obligation the verification tier asserts.
- `data-telegraph-labels`, `data-telegraph-source-count`, `data-spawn-telegraph-count`, and `data-committed-attack-count` on the canvas are asserted by the browser suite. Their meaning changes (floor labels now cover spawn telegraphs only; a new attribute is needed for the over-head countdowns and imminent state). Redefine the dataset contract deliberately and update every asserting spec in the same change; do not leave a dataset half-describing the old model.
- `SettingsStore` is a persisted schema at version 5 with a field-wise forward migration (`coerceSettings`). Adding `showEntityOrder` bumps it to version 6, adds 6 to `KNOWN_VERSIONS`, defaults the field for every older envelope, and defaults it in `DEFAULT_SETTINGS`.

## Scope

### Included

- HUD layout move (rail top-center, wave below) in `styles.css`.
- Telegraph outline (union perimeter, no fill); over-head countdown for entity-backed attacks; floor countdown retained for spawn-only telegraphs.
- Synchronized imminent red pulse on token, sprite, and outline at `warningTicks === 1`.
- `showEntityOrder` setting: store field + v6 migration, settings-panel toggle, renderer wiring, and per-entity board index labels sharing the turn-order numbering rule.
- Updated presentation unit tests, component tests, and the affected canvas-dataset assertions.

### Excluded

- Any `core/` gameplay, enemy behavior, event, or snapshot-shape change.
- Determinism goldens (untouched; no core behavior changes).
- Reworking the turn order token contents, portraits, or its existing `⚠ n` status chip beyond adding the imminent pulse class.
- The superseded port_13 danger-marker work (tracked separately in TODO).

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/presentation/pixi/board-painter.ts` | Large | Union-perimeter outline, drop per-cell fill, spawn-only floor countdown, imminent outline pulse, redefined datasets. |
| `src/presentation/pixi/telegraph-labels.ts` | Medium | Repurpose label aggregation/placement to spawn-only floor countdowns; drop the head/center/side model the over-head countdown replaces. |
| `src/presentation/pixi/pixi-game-renderer.ts` | Large | Over-head countdown + order-number entity-view children, `setShowEntityOrder`, imminent sprite pulse, shared numbering. |
| `src/runtime/turn-order-controller.ts` | Small | Export/extract the shared turn-order numbering rule; imminent flag on the token. |
| `src/ui/hud/turn-order-bar.tsx` | Small | Imminent-pulse class on the token when `warningTicks === 1`. |
| `src/app/styles.css` | Medium | Move rail to top-center, wave below; imminent-pulse keyframes/class. |
| `src/runtime/settings-store.ts` | Medium | `showEntityOrder` field, v6 bump + migration. |
| `src/ui/settings/settings-panel.tsx` | Small | `showEntityOrder` toggle. |
| `src/app/use-game-session.ts` | Small | Wire `showEntityOrder` → `renderer.setShowEntityOrder` and into the settings panel props. |

## Execution Outline

1. Extract the turn-order numbering rule from `orderTokens` into one shared pure helper and reuse it in the controller; add unit coverage that the helper's index matches the bar's tokens.
2. Add the `showEntityOrder` field to `SettingsStore` (v6 + migration), the settings-panel toggle, and the `use-game-session` wiring to a new `renderer.setShowEntityOrder`; renderer stores the flag and re-projects.
3. In `pixi-game-renderer`, add the order-number and over-head countdown entity-view children (create → update → destroy), driving the number from `committedAttack.warningTicks` and the index from the shared helper.
4. In `board-painter`/`telegraph-labels`, replace per-cell fill with the union-perimeter outline, and restrict floor countdowns to spawn telegraphs; redefine the canvas datasets and update every asserting unit/e2e spec together.
5. Add the imminent red pulse: a CSS pulse class on the token (`turn-order-bar`), and a synchronized Pixi pulse on the sprite (renderer) and outline (board-painter), gated on the resolved tick `=== 1`, with teardown on resolve/interrupt/removal.
6. Move the rail to top-center and the wave badge below it in `styles.css`; adjust the component test expectations.
7. Run the presentation unit suites, component tests, settings-store test, and the one Playwright capability/cleanup assertion; follow lint-before-finish over the touched files.

## Implementation Notes

- **Over-head vs floor:** the over-head countdown is an entity-view Text hung above the head; it renders only while the entity is telegraphing / has a `committedAttack`. Board floor countdowns must skip any telegraph whose `sourceId` resolves to a live entity, keeping numbers only for source-less (spawn) telegraphs — otherwise a countdown appears twice.
- **Outline geometry:** trace the perimeter of the cell set (edges not shared with another cell in the same telegraph), not a bounding box, so L-shaped and disjoint footprints read correctly. One `Graphics` stroke per telegraph.
- **Pulse teardown:** the three surfaces animate independently but must all start and stop on the same `warningTicks === 1` condition. Ensure no tween/ticker survives `destroyEntityView`, telegraph clear, or the attack resolving; a lingering red pulse on a dead enemy is the failure mode the cleanup assertion guards.
- **Numbering agreement:** the board index and the bar index can momentarily differ only if two rules exist. Keep exactly one rule; the player is `P` and enemies are `E{n}` over the same alive/`enemyAction` filter `orderTokens` uses.
- **Datasets:** decide the new attribute names for over-head countdowns and imminent state up front and update the browser/unit assertions in lockstep; the browser suite treats these as byte-for-byte contracts.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Attacker dies during playback while its telegraph pulses | Outline, over-head countdown, and token pulse all tear down with the entity; no orphaned red effect remains. |
| Spawn telegraph (no source entity) | No over-head countdown; keeps its floor countdown on its cells and does not pulse as an entity would. |
| Two attackers threaten overlapping cells | Each renders its own outline around its own set; over-head countdowns stay attached to their respective heads. |
| `showEntityOrder` toggled mid-run | Board index labels appear/disappear on the next projection for every alive entity, matching the bar. |
| Persisted settings from version ≤5 | Migrate forward with `showEntityOrder` defaulted off; store re-persists at v6 on next change. |

## Acceptance Criteria

1. The turn order bar renders at top-center with the wave badge directly beneath it, both scaling with the HUD.
2. Each incoming attack renders as a single faint outline around its whole attack-cell set with no per-cell fill.
3. An enemy's warning countdown appears over its head; spawn telegraphs still show a countdown on their cells; no entity-backed attack shows a floor number.
4. On the final tick before execution, the enemy's turn order token, sprite, and telegraph outline pulse red together and stop when the attack resolves, is interrupted, or the enemy is removed.
5. Enabling the entity-order setting labels every alive entity on the board with the same index shown in the turn order bar; disabling it removes the labels; the preference persists across reloads.
