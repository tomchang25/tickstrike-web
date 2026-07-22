# Port 13.2b Terrain Rendering

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Explore the implementation shape for replacing the flat color-fill board with a layered, same-tone tiled grass surface: dual-grid autotiled shore, an offline-baked textured interior, a tiled water base, and presentation-seeded ground scatter. The visual approach was validated in throwaway previews; this sketch records the decisions and the likely code movement before the spec.

## Summary

The terrain look is settled and proven in preview (see `port_13_2_terrain_refs/island_grass_target.png`). The land is a single-green light-tone island: an autotiled rounded shore over a tiled water base, with a subtly textured interior that shares the shore's exact tone (no seam). Decoration is a sparse ground scatter of nature props placed by a presentation seed.

The open work is packaging: bake the atlases offline (deterministic Pillow), add a Pixi terrain layer that consumes the board snapshot and paints water base → land dual-grid → interior texture → scatter, and keep it all reduced-motion-safe and resettable. The spec must verify the current `BoardPainter`/`PixiGameRenderer` seam and decide where the terrain layer sits relative to the existing grid/telegraph/entity layers.

## Sketch

### Validated visual decisions (from preview)

- **Autotile = dual-grid, 4-corner bitmask.** Each grid corner reads its 4 surrounding cells (TL,TR,BL,BR land bits) → index = TL + 2·TR + 4·BL + 8·BR ∈ [0,15] → 16-tile atlas. Visually each gameplay cell shows a 2×2 composite at 32px effective resolution (16px source ×2). Only the convex subset occurs for the rectangle island; inner-corner entries are baked but unused until obstacles land later. The 8-bit blob (47/256) scheme is deliberately not used — overkill for a 2-terrain boundary.
- **Shore/edge source = TilesetField light-green 3×3-minimal** (`assets/Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetField.png`, rows 3–5, cols 0–2). Deterministic, unambiguous layout — reliably sliced. Clean rounded shore is the target; reference `ref_shore_clean.png`.
- **Interior fill = independent same-tone texture** baked from TilesetFloor row-12 (`TilesetFloor.png`, one plain fill at (0,12) + tuft variants (1–4,12)), recolored to the exact edge-fill tone, tufts softened (~55% blend toward plain) and weighted mostly-plain, random-flipped. Applied only to fully-interior cells (all 8 neighbors land) so the shore ring stays pristine. Reference `ref_interior_texture.png`; combined target `island_grass_target.png`.
- **Water base = TilesetWater open-water tile** (`TilesetWater.png`, the uniform cyan open-water tile), tiled as the base layer under land. Out-of-bounds paints water, not wall.
- **Grid lines preserved** — keep the current Web grid-line treatment; it reads well over the tiles.
- **Ground scatter** = single-tile nature props (grass tufts, flowers, small stones) from `TilesetNature.png`, sprinkled sparsely on land, anchored under entities, placed by a presentation-only seed (never core RNG) so determinism and goldens are untouched.

### Offline bake (deterministic, no ImageGen)

Likely a new tool under `dev/tools/` (candidate, sibling to the sprite-animation tool) that emits packaged atlas assets: the 16-tile land dual-grid atlas, the same-tone interior texture set, and the water tile. All Pillow, nearest-neighbor, binary alpha. The bake is reproducible from named source tiles + parameters (recolor target = edge-fill tone; tuft softness; variant weights). The preview scripts and `port_13_2_terrain_refs/` images are the visual acceptance target, not runtime assets.

### Candidate files to inspect (verify at spec time)

- `src/presentation/pixi/board-painter.ts` — currently paints flat color rects per tile plus debug/telegraph overlays; likely the seam where the terrain layer replaces the flat fill while keeping telegraph/reservation overlays.
- `src/presentation/pixi/pixi-game-renderer.ts` — owns the layer stack (grid, reservation, telegraph, actor layers); the terrain layer's z-order relative to these must be decided.
- `src/presentation/pixi/pointer-aim.ts` — `CELL_SIZE = 64`; terrain sub-tiles are 32px (cell/2).
- Asset packaging path for the baked atlases (how content assets are imported into the renderer today, e.g. the enemy sheet imports).
- Reset/teardown paths so the terrain layer and any scatter are cleared without orphan visuals.

### Risks / seams

- Keep terrain strictly presentation: it reads the snapshot's `arena` (dimensions + `tiles`) and never decides gameplay. It must not become a second terrain authority.
- Scatter placement must use a presentation seed derived independently of core RNG; pulling from `world.random` would change goldens and is wrong.
- The dual-grid offset layer has (W+1)×(H+1) corner tiles; edge tiles extend half a cell beyond the board — ensure the water base and layer bounds cover the margin the camera (13.2c) will show.
- Reduced motion: static terrain is unaffected; only 13.2e water animation must honor reduced motion.

## Non-Goals

1. Board geometry, spawn repositioning, golden regeneration — child 13.2a.
2. Camera/viewport fit and water margin sizing — child 13.2c.
3. Decorative outer frame — child 13.2d.
4. Water surface ripple animation — child 13.2e (optional).
5. Interior obstacle cells — deferred Stable-Base Obstacles feature.

## Acceptance Criteria

1. Land renders as a same-tone tiled grass island: autotiled rounded shore plus a textured interior, with no visible tiling seam and no fill/edge tone seam, matching `island_grass_target.png`.
2. Water renders as a tiled surround under and around the island; grid lines remain legible; out-of-bounds reads as water.
3. Ground scatter dresses the land sparsely without affecting core determinism or goldens.
4. Reset and route replacement clear the terrain and scatter with no orphan visual, and reduced motion preserves all terrain information.
