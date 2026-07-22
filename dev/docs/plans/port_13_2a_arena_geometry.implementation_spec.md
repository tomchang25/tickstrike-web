# Port 13.2a Arena Geometry

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Change the shipped arena from a 12×12 grid with a 10×10 land region to an 18×12 grid with a 14×8 centered land island and a 2-cell water ring, reposition the fixed player and enemy spawns onto the new geometry, and regenerate the deterministic goldens. This is a core geometry change that the terrain rendering, camera, and decoration slices build on.

## Summary

The shipped board today is a 12×12 grid whose land region is x∈[1,10]/y∈[1,10] (a 1-cell sea ring), authored in one place: `createShippedArena()` in `src/core/world/arena.ts`. Four fixtures build worlds from that geometry and hard-code spawn cells around the old center (6,6). Three committed goldens capture the event streams those fixtures produce.

This change rewrites the shipped geometry to 18×12 with land x∈[2,15]/y∈[2,9] (a 14×8 island inside a 2-cell sea ring), moves the board center to (9,6), repositions each hard-coded spawn to preserve its relative role on valid land, and regenerates the three goldens with a reviewed diff. Wave enemy spawns are placed by the spawn planner from the arena's land cells, so they need no coordinate edits but their resulting positions (and thus the goldens) change. Presentation reads board dimensions from the snapshot, so the renderer adapts to the larger board automatically; fitting it to the viewport is child 13.2c, not this change. Independent testbeds (enemy-navigation, training) keep their own geometry and are out of scope.

The result: the same deterministic runtime on a widescreen board, with every fixture and golden consistent, ready for the terrain rendering slice to paint.

## Relational Context

- `src/core/world/arena.ts` is the single authority for shipped geometry: `SHIPPED_WIDTH`, `SHIPPED_HEIGHT`, and the land predicate inside `createShippedArena()`. Every shipped-geometry consumer flows through this function.
- `createShippedArena()` (fixture, `src/harness/fixtures/shipped-arena.ts`) wraps the geometry in a `World` and spawns the player plus five fixture enemies at hard-coded cells; `createFoundationArena()` in the same file adds them. These cells must move to valid land on the new geometry.
- `wave-arena.ts`, `milestone-arena.ts`, and `reward-arena.ts` each build a `World` from `createShippedArena()` geometry and hard-code the player at (6,6); each must move to the new center.
- Wave enemy placement is planner-driven: `wave-definitions.ts` declares spawn groups (weighted/fixed composition), and the wave/spawn system chooses land cells at run time. No wave coordinate is hard-coded, so geometry change alone repositions wave spawns; this changes the golden event streams.
- The deterministic goldens `test/unit/determinism/__golden__/{charge-enemy,rewards,waves}.json` are produced from scenarios driving these fixtures and are regenerated only via `npm run golden:update` (`dev/tools/update-goldens.mjs`). Geometry + spawn changes require regeneration and a human diff review, since golden-passing is not by itself evidence of preserved determinism.
- Presentation (`board-painter.ts`, `pixi-game-renderer.ts`) reads `arena.width`/`height` and `tiles` from the snapshot and paints per cell; it needs no dimension constant edits. Fitting the larger board to the viewport is child 13.2c.
- `enemy-navigation-arena.ts` and `training-arena.ts` construct their own geometry (`new World(width, height, tiles, …)`) and do not use `createShippedArena()`; they are independent testbeds and out of scope.
- Wrong shape to avoid: do not thread a new width/height parameter through call sites or introduce a second arena owner. Geometry stays authored in `createShippedArena()`; consumers keep calling it.

## Scope

### Included

- Rewrite shipped geometry to 18×12 with a 14×8 centered land island (offset 2,2) and a 2-cell sea ring.
- Reposition the hard-coded player and fixture-enemy spawns in the four shipped-geometry fixtures onto valid land, preserving relative layout.
- Regenerate and review the three deterministic goldens.

### Excluded

- Terrain rendering, water tiles, autotile, ground scatter, camera framing, decorative frame (children 13.2b–13.2e).
- Interior obstacle cells (deferred feature).
- Independent testbeds (enemy-navigation, training) and their scenarios.
- Any change to enemy behavior, balance, wave composition, or reward logic beyond the positions implied by the new geometry.

## Files to Change

| File                                                 | Change Size | Purpose                                                               |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `src/core/world/arena.ts`                            | Small       | Shipped dimensions 18×12 and the 14×8 centered land predicate         |
| `src/harness/fixtures/shipped-arena.ts`              | Small       | Reposition player and five fixture-enemy spawns onto the new geometry |
| `src/harness/fixtures/wave-arena.ts`                 | Small       | Move player spawn to the new center                                   |
| `src/harness/fixtures/milestone-arena.ts`            | Small       | Move player spawn to the new center                                   |
| `src/harness/fixtures/reward-arena.ts`               | Small       | Move player spawn to the new center                                   |
| `test/unit/determinism/__golden__/charge-enemy.json` | Regenerated | Golden reflecting the new geometry                                    |
| `test/unit/determinism/__golden__/rewards.json`      | Regenerated | Golden reflecting the new geometry                                    |
| `test/unit/determinism/__golden__/waves.json`        | Regenerated | Golden reflecting the new geometry                                    |

## Execution Outline

1. Change `createShippedArena()` geometry in `arena.ts` to 18×12 with the land predicate x∈[2,15], y∈[2,9]; run the arena unit tests and fix any dimension assertions.
2. Reposition the hard-coded spawns: player to (9,6) in all four fixtures, and the five fixture enemies in `shipped-arena.ts` to preserve their around-the-player layout on valid land. Confirm every spawn cell is land and unoccupied.
3. Run the unit suite; expect the three determinism goldens to fail on changed event streams.
4. Regenerate the goldens with `npm run golden:update`, then review each diff to confirm the changes are geometry/position shifts only — same event kinds and ordering, shifted coordinates — not a determinism regression.
5. Run `npm run verify`; then a targeted browser check of the arena scenario to confirm the board renders at the new dimensions (presentation auto-adapts).

## Implementation Notes

- New center is (9,6): 18 wide → columns 8–9 straddle center, 12 tall → rows 5–6 straddle center; (9,6) is well inside land x∈[2,15]/y∈[2,9].
- Preserve the shipped-arena fixture's relative layout when repositioning: player at (9,6) with the fixture enemies offset around it (left/right along the row, up/down along the column, and the diagonal bomb), each landing on valid land within x∈[2,15]/y∈[2,9]. Pick exact cells at implementation time and verify each is land and unoccupied; determinism depends on the exact cells, so record them once chosen.
- Do not hand-edit golden JSON. Only `npm run golden:update` may rewrite them, and the diff must be reviewed, not trusted because tests pass.
- The 2-cell sea ring is ordinary sea; the existing drown mechanic applies unchanged. No new terrain kind is introduced.

## Edge Cases

| Case                                                                      | Expected Handling                                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A repositioned spawn would land on sea or off-board                       | Choose a different valid land cell; every fixture spawn must be land within x∈[2,15]/y∈[2,9].       |
| A golden diff shows changed event kinds or ordering, not just coordinates | Stop and investigate a determinism regression before accepting the regenerated golden.              |
| Wave spawn planner finds fewer/more valid cells on the new geometry       | Accept the planner's deterministic result; the golden captures it. Do not hard-code wave positions. |

## Acceptance Criteria

1. The shipped arena is an 18×12 board with a 14×8 centered land island and a 2-cell sea ring, and the browser arena renders at those dimensions.
2. Every fixed player and enemy spawn in the shipped, wave, milestone, and reward fixtures sits on valid land and preserves its scenario role.
3. The three determinism goldens are regenerated and their diffs are position/coordinate shifts consistent with the geometry change, with unchanged event kinds and ordering.
4. `npm run verify` passes and the arena renders the new board without renderer changes beyond what the snapshot dimensions drive.
