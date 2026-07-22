# Layered Arena and Tile Presentation

Parent plan: [Reference Visual Parity and Presentation Polish](port_13_visual_parity_and_polish.md) (child 13.2)
Acceptance authority: [Port 13 Reference Parity Matrix](port_13_reference_parity_matrix.md) (Board and terrain section)
Terrain visual target: `port_13_2_terrain_refs/island_grass_target.png`

## Goal

Replace the flat color-fill arena with a widescreen, layered, tiled presentation: a core geometry change to an 18×12 grid holding a 14×8 land island with a 2-cell water ring, then a same-tone tiled grass surface, autotiled shore, water base, ground scatter, camera framing, and a decorative outer frame. This is the first execution line of Port 13 and the visual foundation the entity and feedback children draw on.

## Requirements

Requirements are owned by the parent Port 13 plan (requirement 2). This sub-plan slices that requirement into arena scope and adds the geometry and asset decisions locked in conversation:

1. The playable board becomes an 18×12 grid with a 14×8 centered land island (offset 2,2) and a 2-cell water ring — a product decision diverging from the reference 12×12/10×10 toward the widescreen quality-bar composition. The board-shape change is a core geometry change; the deterministic scenario, spawns, and goldens move with it.
2. Land renders as a same-tone tiled grass surface: dual-grid autotiled shore and corners from one green source, plus an independent same-tone textured interior baked offline, so the ground has natural variation without a visible tiling seam or a fill/edge tone seam.
3. Water renders from an authored water tile; out-of-bounds reads as water surround rather than an implicit wall. Grid lines are preserved as the current Web treatment.
4. Ground scatter (grass tufts, flowers, stones) and a decorative outer frame (trees, rocks) dress the arena, placed by a presentation-only seed so they never affect core determinism.
5. Camera framing fits the widescreen board to the supported viewport with a water margin around the board so frame props never clip, owned by a dedicated slice.
6. The initial island ships clean: no interior obstacle cells. Water/rock interior obstacles are a deferred gameplay feature (Future Draft Stable-Base Obstacles), not part of this sub-plan.

## Design

### Board geometry

The core arena becomes 18 wide × 12 tall. Land is the 14×8 rectangle centered at offset (2,2): land cells are x∈[2,15], y∈[2,9]. The surrounding 2-cell ring is sea, reusing the existing sea/drown mechanic as the drown border. The board center moves from (6,6) to (9,6); all player, enemy, and wave spawns reposition to valid land preserving their relative layout, and the deterministic goldens regenerate.

### Terrain rendering (validated in preview)

- **Autotile**: dual-grid (offset corner grid), 4-corner bitmask. Each grid corner reads its 4 surrounding cells (TL,TR,BL,BR land bits) → index 0..15 → a 16-tile atlas. Visually each gameplay cell shows a 2×2 composite at 32px effective resolution. For the convex rectangle island only the convex subset of the 16 combinations occurs; inner-corner entries are baked but unused until obstacles land.
- **Shore/edges**: from the TilesetField light-green 3×3-minimal patch (deterministic, reliably sliced). The clean rounded shore is the visual target — see `ref_shore_clean.png`.
- **Interior fill**: an independent same-tone texture baked offline from the TilesetFloor row-12 grass set (one plain fill + tuft variants), recolored to the exact edge-fill tone (no seam), tufts softened and weighted mostly-plain, applied only to fully-interior cells so the shore ring stays pristine. Target: `island_grass_target.png`; interior-texture reference: `ref_interior_texture.png`.
- **Water base**: the TilesetWater open-water tile, tiled as the base layer under land.
- All bakes are deterministic Pillow steps (nearest, binary alpha), producing packaged atlas assets; no ImageGen.

### Decoration

- **Ground scatter**: single-tile nature props (grass tufts, flowers, small stones) sprinkled on land by a presentation seed, sparse, sitting under entities.
- **Decorative outer frame**: trees and rock clusters around the water ring, baked offline into one image and placed as a **world-space** static sprite (not a screen-space overlay) so a future camera pan or player movement cannot expose a seam. Biome tree set (all-green vs green+sakura) is an open visual choice settled during 13.2d.

### Sub-child decomposition

Landed in order because later slices draw on the geometry the first produces.

| Sub-child | Focus                                                                                                    | Document form                                            |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 13.2a     | Arena geometry: 18×12 grid, 14×8 island, 2-cell ring, spawn repositioning, golden regeneration           | Spec: `port_13_2a_arena_geometry.implementation_spec.md` |
| 13.2b     | Layered terrain rendering: dual-grid autotile, offline-baked same-tone grass, water base, ground scatter | Sketch: `port_13_2b_terrain_rendering.sketch.md`         |
| 13.2c     | Camera framing for the widescreen board (viewport fit, water margin, scale)                              | Sketch: `port_13_2c_camera_framing.sketch.md`            |
| 13.2d     | Decorative outer frame (baked world-space sprite)                                                        | Sketch: `port_13_2d_decorative_frame.sketch.md`          |
| 13.2e     | Optional water surface ripple animation, reduced-motion-aware                                            | Deferred/optional; sketch created when activated         |

## Non-Goals

1. Interior obstacle cells (water/rock) — deferred gameplay feature, tracked under Future Draft Stable-Base Obstacles.
2. Entity, combat-feedback, and HUD presentation — Port 13 children 13.3–13.5.
3. New gameplay mechanics, balance, or enemy behavior beyond repositioning spawns onto the new geometry.
4. Reproducing Godot scene, node, or lifecycle structure.

## Acceptance Criteria

1. The browser arena shows an 18×12 board with a 14×8 tiled grass island and a 2-cell water ring, at the widescreen composition, with the deterministic scenario intact after spawn repositioning and golden regeneration.
2. Land renders as a same-tone tiled grass surface with an autotiled rounded shore and a textured interior, with no visible tiling seam and no fill/edge tone seam.
3. Water renders as a tiled water surround; grid lines remain legible; out-of-bounds reads as water.
4. Ground scatter and the decorative frame dress the arena without affecting core determinism or clipping at the camera edge.
5. Reduced motion, reset, and route replacement preserve the terrain and cancel any presentation work with no orphan visual.
