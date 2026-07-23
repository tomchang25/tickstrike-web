# Port 13.3a Shared Entity Drop Shadow

Parent Plan: `port_13_3_entity_visual_profiles.md`

## Goal

Give every player and enemy entity a uniform drop shadow beneath its footprint through one shared implementation, per parity decision P2, and hide it while the drowning animation plays.

## Summary

The player already draws an inline shadow ellipse; enemies have none. This change extracts that ellipse into a shared factory module in the Pixi presentation layer, points the player sprite at it, and adds the same node to the small-enemy presentation beneath the body sprite. The enemy shadow hides whenever the presentation switches to authored water frames, because those frames are waterline-centred splash art. No renderer, presenter, gameplay, or snapshot code changes; the visible result is every authored entity casting the same soft shadow on land, gone while drowning.

Decisions already resolved: the shadow lives inside the tween-scaled presentation root, so enemy squash/pop action poses deform it together with the body (consistent with the player, whose shadow already sits inside its root); the placeholder fallback card (entities with no authored presentation) gets no shadow.

## Relational Context

- `src/presentation/pixi/pixi-game-renderer.ts` `createEntityView` composes each entity view: it creates hp/guard bars and labels itself, then adds `playerSprite.root` (from `character-sprites.ts`) or `enemyPresentation.root` (from `enemy-sprites.ts`) as a child. The shadow must be created inside those two sprite modules, never by the renderer — the renderer holds no per-role or per-node presentation knowledge.
- `character-sprites.ts` `createNinjaSprite` already builds `new Graphics().ellipse(0, groundY, 20, 6).fill({ color: 0x05070b, alpha: 0.48 })` and adds it before the body. This existing shape/color/alpha is the canonical look the shared helper must reproduce; the player's visual output must be unchanged after the swap.
- `enemy-sprites.ts` `SmallEnemyPresentation` owns the enemy body node tree. Its constructor adds `this.body` to `this.root`; the shadow is added to `this.root` before the body so it renders beneath. Both files compute the same ground line, `GROUND_OFFSET_Y + SEAT_OFFSET_Y` (16 + 2 = 18), each from its own local constants.
- `SmallEnemyPresentation.applyFrame()` is the single switch between land frames (feet-anchored) and water frames (cell-centred); its existing `inWater` condition is where shadow visibility must be driven (`visible = !inWater`). `reset()` clears `currentWaterFrame` and re-runs `applyFrame` via `setFacing`, which restores the shadow with no extra code.
- GSAP action tweens (`playMove`, `playPrepareAttack`, `playAttackCommit`) scale and move `this.root`, not `this.body`, so a shadow child of `root` inherits them — this is the intended behavior, not a bug to compensate for.
- Wrong shapes to avoid: adding shadows in `src/presentation/timelines/enemy-presenters/` (per-role presenters must gain no shadow knowledge), adding the shadow in the renderer's `createEntityView`, or duplicating the ellipse literal in both sprite modules instead of sharing the factory.

## Scope

### Included

- New shared shadow factory module in the Pixi presentation layer.
- Player sprite swaps its inline ellipse for the factory.
- Enemy presentation gains the shadow node plus water-state visibility.
- Unit-test coverage for the enemy shadow node and its water behavior.

### Excluded

- Ranged rescale/redraw (child 13.3b), telegraph markers and combat VFX (13.4), any renderer or presenter changes, any shadow on the placeholder fallback card.

## Files to Change

| File                                                | Change Size | Purpose                                                                       |
| --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `src/presentation/pixi/entity-shadow.ts`            | Small (new) | Shared factory returning the standard shadow `Graphics` ellipse for a groundY |
| `src/presentation/pixi/character-sprites.ts`        | Small       | Replace the inline shadow ellipse with the factory call                       |
| `src/presentation/pixi/enemy-sprites.ts`            | Medium      | Add the shadow node under the body; hide it while water frames are active     |
| `test/unit/presentation/pixi/enemy-sprites.test.ts` | Small       | Assert shadow presence, child order beneath the body, and water-state hiding  |

## Execution Outline

1. Create `entity-shadow.ts` exporting a factory that builds the exact ellipse currently inlined in `character-sprites.ts` (offset 0/groundY, radii 20/6, color 0x05070b, alpha 0.48), taking groundY as a parameter.
2. Switch `character-sprites.ts` to the factory; the player node tree and visual output stay byte-identical in behavior.
3. In `SmallEnemyPresentation`'s constructor, create the shadow via the factory with the enemy ground line and add it to `root` before `body`; store the reference on the instance.
4. In `applyFrame()`, set the shadow's `visible` from the existing `inWater` condition.
5. Extend `enemy-sprites.test.ts`: the presentation root contains the shadow before the body; the shadow is visible on land poses, hidden after `beginEnteredWater`/`setEnteredWaterFrame`, and visible again after `reset()`.
6. Run the targeted unit tests, then `npm run verify`.

## Implementation Notes

- Keep the factory dumb: it returns a configured `Graphics`; callers own attachment, visibility, and lifecycle. Do not add options beyond groundY.
- Do not touch `clearAction`/`reset` for shadow state; visibility is derived solely inside `applyFrame` so there is exactly one owner.
- The enemy fallback path in the renderer (white rounded card + "E" label) is intentionally shadow-free; no renderer edits at all.

## Edge Cases

| Case                                                  | Expected Handling                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Entity enters water then the run resets               | `reset()` clears the water frame; the next `applyFrame` shows the shadow again |
| Action tween active (squash/pop) while shadow visible | Shadow deforms with `root`; no compensation code                               |
| Entity with no authored presentation (fallback card)  | No shadow anywhere in that path                                                |

## Acceptance Criteria

1. Every authored player and enemy on land shows the same soft elliptical shadow beneath its feet.
2. The shadow is absent for the whole duration of the drowning animation and returns after reset.
3. Player rendering is otherwise unchanged; enemy poses, tints, facings, and status bars are unchanged.
4. Unit tests and the canonical non-browser verification pass.
