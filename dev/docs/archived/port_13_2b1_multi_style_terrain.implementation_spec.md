# Port 13.2b.1 Multi-Style Terrain (patch)

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Remove the visible plain-grass ring at the island shore and enrich the terrain with authored variation, while structurally guaranteeing that no sub-tile ever shows two stacked patterns and that patterns never overlap the shore fringe.

## Summary

The first terrain slice (13.2b) painted one plain autotile for shore and fill plus a separate textured interior overlay; the two vocabularies met at the shore as a visible plain ring, patterns could stack, and pattern tone drifted from the flat base. This patch replaces that approach with an authored two-source architecture, converged through visual iteration with the user (reference renders in `port_13_2_terrain_refs/`):

- **`grass-tile-base.png` (authored)** — five opaque 32px base variants; variant 0 is the pure flat tile whose colour is the canonical ground tone. The bake turns each variant into a full 16-tile dual-grid autotile block. All blocks share one silhouette and one shore fringe (fringe pixels are detected by distance-to-water and preserved; the grass body is flattened to the variant texture), so any two variants meet seamlessly and the fringe is never overdrawn.
- **`grass-texture.png` (authored)** — transparent 32px motifs in two weighted rows (row 0 light marks, row 1 heavier marks; empty slots allowed). The runtime scatters at most one motif per fill sub-tile, only where the covering corner's base variant is 0 (flat): 60% none / 30% row 0 / 10% row 1, uniform within a row.

Selection (base variant per grid corner, motif per sub-tile) is a pure hash of coordinates — presentation-seeded, never core RNG. Iterating on art is: edit the two authored PNGs, rerun the bake.

## Relational Context

- `dev/tools/terrain/bake_terrain.py` reads the two authored PNGs plus vendored TilesetField (fringe silhouette) and TilesetWater (open-water tile), and emits `land-autotile.png` (N variant blocks side by side, 16 tiles each, index = 4-corner land mask), `water.png`, and `terrain-atlas.json` (variant count, overlay weights, per-row non-empty motif slots, source hashes). Deterministic Pillow, nearest, binary alpha; no ImageGen.
- The flat tone is taken from variant 0's colour, not from the vendored tileset, so the authored base and the flattened fringe pieces match exactly and no tone seam can appear.
- `src/presentation/pixi/terrain-painter.ts` consumes the manifest: water tiling → per-corner variant autotile → motif overlay. The overlay eligibility rule (fill sub-tile AND covering corner variant is flat) is what structurally prevents stacking and fringe overlap; the covering corner of sub-tile `(sxg, syg)` is `((sxg+1)>>1, (syg+1)>>1)`.
- `pixi-game-renderer.ts` loads the three textures, maps the manifest onto the painter's `TerrainConfig`, and owns the terrain layer's position at the bottom of the world layer stack. No other system knows about terrain.
- Wrong shapes to avoid: selecting variants or motifs from `world.random` (breaks determinism isolation); giving variants their own edge silhouettes (edge shimmer); letting the overlay place motifs without checking the base variant (reintroduces stacking).

## Scope

### Included

- Style-driven bake from the authored base-variant and motif sheets; obsolete `grass-patterns.png`/`grass-accent.png` deleted.
- Per-corner variant autotile plus flat-only motif overlay in the terrain painter.

### Excluded

- Ground scatter props, camera framing (13.2c), decorative frame (13.2d), water animation (13.2e).
- Any board geometry, gameplay, or determinism change.

## Files to Change

As built:

| File                                                       | Change Size    | Purpose                                                              |
| ---------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| `dev/tools/terrain/bake_terrain.py`                        | Rewritten      | Authored-source bake: variant autotile blocks, water, manifest       |
| `src/presentation/pixi/assets/terrain/grass-tile-base.png` | New (authored) | Five 32px base variants; variant 0 = flat, defines the ground tone   |
| `src/presentation/pixi/assets/terrain/grass-texture.png`   | New (authored) | Transparent motif rows for the runtime overlay                       |
| `src/presentation/pixi/assets/terrain/land-autotile.png`   | Regenerated    | 5 × 16-tile dual-grid blocks (1280×256)                              |
| `src/presentation/pixi/assets/terrain/terrain-atlas.json`  | Regenerated    | Variant count, overlay weights (60/30/10), row slots, source hashes  |
| `src/presentation/pixi/assets/terrain/grass-patterns.png`  | Removed        | Superseded by the authored motif sheet                               |
| `src/presentation/pixi/assets/terrain/grass-accent.png`    | Removed        | Superseded by the authored motif sheet                               |
| `src/presentation/pixi/terrain-painter.ts`                 | Rewritten      | Per-corner variant blits + flat-only motif overlay from the manifest |
| `src/presentation/pixi/pixi-game-renderer.ts`              | Small          | Load authored/baked textures, map manifest to `TerrainConfig`        |

## Implementation Notes

- Iteration history that produced the final rules (each was a user-rejected defect): per-corner style mixing chopped motifs across a cell → one pattern per 32px sub-tile; mean-based recolour lightened pattern backgrounds → base colour comes from the flat variant itself; overlay landing on textured variants → flat-only eligibility; patterns crossing the shore line → fill-sub-tile eligibility plus fringe preservation in the bake.
- Weights (60/30/10, variant count) live in the bake constants and manifest; the painter reads them, so tuning is a bake rerun with no code change.

## Acceptance Criteria

1. Shore and interior read as one continuously varied grass surface with no plain ring, no tone seam, and the authored fringe intact along the entire waterline.
2. No 32px sub-tile shows more than one pattern: base variants and overlay motifs never stack.
3. Terrain variation is stable across renders and has no effect on core determinism or goldens.
4. Editing the authored PNGs and rerunning the bake changes the terrain with no code edits; `npm run verify` passes and the arena renders without console errors.
