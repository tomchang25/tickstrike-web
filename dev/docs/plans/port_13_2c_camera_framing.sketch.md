# Port 13.2c Camera Framing

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Explore how the presentation fits the widescreen 18×12 board (with its water margin and decorative frame) to the supported viewport, so the full arena reads at correct scale without clipping frame props, as a slice separate from terrain painting.

## Summary

The board grows from 12×12 to 18×12 (child 13.2a), and the water surround plus the decorative outer frame (13.2d) extend beyond the 14×8 land island. The camera slice owns the mapping from world pixels to the viewport: the full board plus a water/frame margin must fit the supported desktop and narrow widths, with entity and tile scale reading correctly. In the reference this was a Godot `Camera2D` zoom (0.65); on Web it is a renderer scale/transform concern, not a per-tile change.

Currently `CELL_SIZE = 64` is fixed and the renderer paints at that scale with no viewport-fit layer. This slice adds the fit/scale/centering step and defines how much water margin surrounds the board so frame props (placed in world space by 13.2d) are always visible.

## Sketch

- **What fits**: the 18×12 board (1152×768 at 64px/cell) plus a margin of water and the decorative frame around it. The camera must show that whole composed rectangle, centered, scaled to the viewport.
- **Margin**: define a fixed world-space margin (in cells) of water around the 18×12 board so the decorative frame (world-space sprite, 13.2d) never clips at the viewport edge. The preview showed frame props clipping precisely because there was no margin; this slice sizes it.
- **Reference**: Godot used `Camera2D` zoom 0.65 over 128px cells. On Web the equivalent is a container scale/transform on the Pixi stage (or the app renderer), computed from viewport size vs composed-board size. Evidence only — not a porting contract.
- **Candidate files to inspect** (verify at spec time): `src/presentation/pixi/pixi-game-renderer.ts` (stage/app setup, resize handling, layer container that would carry the fit transform); `src/presentation/pixi/pointer-aim.ts` (`CELL_SIZE` and world↔cell mapping — pointer hit-testing must stay correct under any camera scale); the React host that owns the canvas element and its size.
- **Risk — pointer mapping**: pointer input converts screen → cell using `CELL_SIZE`. Any camera scale/transform must be applied consistently to pointer hit-testing, or aim/clicks will land on the wrong cell. This is the primary seam to verify.
- **Risk — responsive**: narrow viewports must still show the whole board (Port 13 validates narrow widths). Decide scale-to-fit vs letterbox; keep the board fully visible rather than cropping gameplay cells.
- **Static-camera assumption**: 13.2d's frame is a world-space sprite specifically so a later camera pan or player-follow would not expose seams; this slice may keep a fixed fit camera now, but should not preclude a moving camera later.

## Non-Goals

1. Board geometry and dimensions — child 13.2a.
2. Terrain/water/scatter painting — child 13.2b.
3. Decorative frame art and placement — child 13.2d (this slice only guarantees the margin that keeps it on-screen).
4. HUD/overlay layout — Port 13 child 13.5.

## Acceptance Criteria

1. The full 18×12 board plus its water/frame margin fits the supported desktop and narrow viewport widths, centered, with entity and tile scale reading correctly.
2. Decorative frame props never clip at the viewport edge.
3. Pointer aim and clicks map to the correct cell under the camera scale/transform.
4. Resize, reset, and route replacement keep the board correctly framed with no stale transform.
