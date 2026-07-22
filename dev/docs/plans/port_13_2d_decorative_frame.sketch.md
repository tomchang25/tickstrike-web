# Port 13.2d Decorative Outer Frame

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Explore the decorative outer frame that dresses the arena border (trees, rocks, foliage around the water ring), matching the quality-bar composition, as a slice separate from terrain and camera. This is parity-matrix decision P3.

## Summary

The reference arena has no decorated border; the quality-bar captures do. The frame is authored offline as one image and placed as a **world-space** static sprite around the board — not a screen-space overlay — so a future camera pan or player movement toward the edge can never expose a seam. A ground-scatter preview using `TilesetNature.png` props (trees, rock clusters) validated the look; the open choice is the biome tree set.

The frame lives in the margin the camera slice (13.2c) guarantees around the 18×12 board. Placement is presentation-only and never affects core determinism.

## Sketch

- **Approach (decided)**: bake the whole border into one image offline, place it as a single world-space sprite positioned around the board in the Pixi scene. Rationale: same effort as a screen overlay, but world-space means it pans with the world if a camera is ever enabled — a screen overlay would clip/desync. Only if per-prop animation or dynamic board sizes are later needed would individual sprites be promoted.
- **Prop source**: `assets/Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetNature.png` — trees (green, sakura pink, autumn, snow), rock clusters (brown/grey), bushes, plus small props already used for ground scatter (13.2b).
- **Open visual choice**: biome tree set. Candidates: all-green (calm, coherent), or green + sakura (spring accent). The preview mixed green/sakura/snow/autumn deliberately to show options; the shipped frame picks one coherent set. Settle during this slice; not a blocker for 13.2a–13.2c.
- **Placement**: props anchored by their base, arranged around the water ring / outer margin, denser at corners, sparser along edges, avoiding the land island's readable play area. Placement uses a presentation seed (or a fixed authored layout baked into the image), never core RNG.
- **Candidate files to inspect** (verify at spec time): `src/presentation/pixi/pixi-game-renderer.ts` (where a world-space background/foreground sprite layer attaches relative to terrain and actors); the asset-import path for a packaged baked image; reset/teardown so the frame sprite is destroyed with the scene.
- **Depth**: the frame sits behind actors and telegraphs (it is border dressing outside the play area) but above the water base; confirm z-order against the terrain layer from 13.2b.
- **Risk**: the frame must not intrude on the 14×8 play area or obscure edge cells, telegraphs, or entities near the shore. Keep props in the water ring and beyond.

## Non-Goals

1. Board geometry — child 13.2a.
2. Terrain/water/scatter painting — child 13.2b (ground scatter on land is 13.2b; this slice is the border frame).
3. Camera fit and margin sizing — child 13.2c (this slice consumes the margin it provides).
4. Water surface animation — child 13.2e.

## Acceptance Criteria

1. A decorated border frames the arena in the water margin, matching the quality-bar composition, with one coherent biome tree set.
2. The frame is placed in world space and does not clip, desync, or intrude on the 14×8 play area, telegraphs, or entities.
3. Frame placement never affects core determinism or goldens.
4. Reset and route replacement destroy the frame with no orphan visual.
