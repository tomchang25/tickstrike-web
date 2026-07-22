# Port 13.2d Decorative Outer Frame

Parent Plan: `port_13_2_layered_arena.md`

## Goal

Frame the arena with a world-space stone enclosure, water rocks, and coherent green tree cover, while giving the grass island a visible foundation and water contact so it reads as raised terrain rather than a flat sheet.

## Summary

The current 18x12 board fills the entire 1152x768 canvas, leaving no ungridded space for the quality-bar frame. This slice expands the presentation composition to 1408x896, places the unchanged gameplay board at world origin (128,64), and keeps the added two-cell horizontal and one-cell vertical margins presentation-only. The larger composition gives the 14x8 island the breathing room visible in the reference without changing arena geometry or gameplay scale.

An offline deterministic Pillow bake produces one transparent-centre frame image from a modular mint-stone/teal-brick wall, asymmetrical submerged grey rocks, two large green tree masses, and their pixel shadows. The frame remains one static world-space Pixi sprite. A separate baked depth atlas lets the terrain painter add a south-facing brick foundation, corner returns, contact shadow, and broken static reflection wherever the live land mask exposes a southern edge.

The grid remains limited to the 18x12 gameplay board. Pointer mapping subtracts the board origin and rejects the decorative margin; HUD sizing follows the composed canvas. Decoration remains below gameplay markers and actors, uses no core RNG, has no collision, and is unaffected by reduced-motion settings.

## Relational Context

- `bake_decorative_frame.py` reads editable source material from `assets/` and emits package-ready frame/depth PNGs plus a manifest under the Pixi terrain asset owner; runtime code imports only the packaged outputs, never root assets.
- The decorative manifest is the presentation source of truth for composition size, board origin, and depth-atlas layout. `arena-layout.ts` maps that serialized contract to TypeScript constants used by Pixi, pointer mapping, and the React HUD scale.
- `PixiGameRenderer` continues to own every Pixi layer and asset lifetime. It sizes the application to the composition, translates the existing world layer by the board origin, tiles water behind the full composition, and places the frame at negative board-origin coordinates inside the translated world.
- Existing cell-to-pixel functions remain board-local. Translating the shared world layer moves terrain, grid, markers, entities, and effects together; callers must not add the board origin to individual entities or effects.
- `TerrainPainter` remains a pure snapshot projection. It reads the arena land mask to choose straight/end depth pieces and writes static sprites into renderer-owned base and depth layers; it never defines terrain or reads core randomness.
- The grid is drawn in board-local coordinates and inherits the world translation. The depth and frame layers sit above the grid but below reservations, telegraphs, actors, labels, previews, and effects so physical decoration may occlude a small amount of water grid without hiding gameplay feedback.
- `InputController` supplies the current snapshot dimensions and board origin to `screenPointToCell`. Screen-to-canvas scaling happens first, then origin subtraction and board-bounds rejection; the decorative margin never produces a hover cell or click commit.
- `GameApp` and global CSS continue to scale the DOM HUD in lockstep with the CSS-scaled canvas, but use 1408x896 as the internal design surface. HUD semantics and interaction ownership do not change.
- Reset and route replacement continue through `PixiGameRenderer.destroy`; background, frame, and depth objects are children of renderer-owned containers and are destroyed with the application. No separate listener, timer, animation, or state owner is introduced.
- Wrong shapes to avoid are painting frame props per gameplay cell, treating rocks as collision, using core RNG for placement, importing root `assets/` at runtime, adding origin offsets independently to every painter, or baking the island foundation into the fixed outer-frame image.

## Scope

### Included

- A 1408x896 world-space composition with the 18x12 board at (128,64).
- Offline-baked wall, rocks, green trees, tree shadows, island foundation pieces, contact shadow, and static reflection.
- Pixi layer integration, pointer-origin handling, HUD/canvas sizing, focused unit coverage, and pointer browser coverage.

### Excluded

- Gameplay geometry, collision, obstacles, terrain authority, or deterministic core changes.
- Animated water/reflections, parallax, camera movement, seasonal tree variants, or dynamic board-size frame generation.
- Removal of the existing gameplay grid or redesign of the HUD.

## Files to Change

| File                                                         | Change Size | Purpose                                                                           |
| ------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------- |
| `dev/tools/terrain/bake_decorative_frame.py`                 | Large       | Deterministically compose the frame and depth atlas and write their manifest      |
| `src/presentation/pixi/assets/terrain/decorative-frame.png`  | Generated   | Full-composition transparent-centre wall/tree/rock frame                          |
| `src/presentation/pixi/assets/terrain/land-depth.png`        | Generated   | Straight and end-cap island foundation/reflection pieces                          |
| `src/presentation/pixi/assets/terrain/decorative-frame.json` | Generated   | Composition, origin, atlas layout, and source/output hashes                       |
| `src/presentation/pixi/arena-layout.ts`                      | New         | Typed presentation constants mapped from the generated manifest                   |
| `src/presentation/pixi/terrain-painter.ts`                   | Medium      | Project exposed southern land edges into the depth layer                          |
| `src/presentation/pixi/pixi-game-renderer.ts`                | Medium      | Load assets, build the expanded layer stack, translate the board, and own cleanup |
| `src/presentation/pixi/pointer-aim.ts`                       | Medium      | Convert composition-space pointer positions into bounded board-local cells        |
| `src/presentation/pixi/input-controller.ts`                  | Small       | Supply board origin and snapshot dimensions to pointer conversion                 |
| `src/app/game-app.tsx`                                       | Small       | Scale the HUD against the composed internal width                                 |
| `src/app/styles.css`                                         | Small       | Adopt the composition aspect ratio and HUD design dimensions                      |
| `test/unit/presentation/pixi/pointer-aim.test.ts`            | Medium      | Cover origin subtraction, CSS scaling, and decorative-margin rejection            |
| `test/e2e/canvas-geometry.ts`                                | New         | Share composition-aware canvas cell coordinates across browser scenarios          |
| `test/e2e/pointer-input.spec.ts`                             | Medium      | Aim through composition-aware cell centres and assert margin rejection            |
| `test/e2e/charge-enemy.spec.ts`                              | Small       | Preserve entity-bound assertions under the translated board origin                |
| `test/e2e/harness-lifecycle.spec.ts`                         | Small       | Replace stale pre-13.2 geometry and canvas-coordinate assertions                  |
| `test/e2e/mobility-combat.spec.ts`                           | Small       | Aim through composition-aware cell centres                                        |
| `test/e2e/water-animations.spec.ts`                          | Small       | Aim through composition-aware cell centres                                        |
| `dev/docs/plans/port_13_2_layered_arena.md`                  | Small       | Point child 13.2d to this executable spec                                         |

## Execution Outline

1. Add the generated-manifest-backed arena layout and focused pointer tests, then translate the renderer world and update input/HUD sizing so the unchanged board operates correctly inside the expanded composition.
2. Add and run the deterministic decorative bake, inspect its packaged frame and depth atlas, then wire the full-composition water base and frame sprite into renderer-owned layers.
3. Extend the terrain painter with a separately owned depth layer that selects south-edge pieces from the live land mask, preserving the existing terrain signature and cleanup behavior.
4. Update the targeted browser pointer coordinates, verify board and margin interaction, visually inspect desktop and narrow layouts, and run the required static, unit, build, and browser checks.

## Implementation Notes

- Composition constants are 1408x896; the shipped board origin is (128,64). All values remain multiples of the 32px terrain sub-tile.
- The frame bake uses a pale stone cap, two to three teal masonry rows on the inward top face, darker water-contact pixels, several deterministic brick variants, hand-authored corner treatment, large props outside the gameplay board, and only low submerged stones near the board water ring.
- Use one coherent green canopy source. Place the primary masses at top-right and bottom-left, keep trunks mostly beyond the wall, and derive hard-edged teal shadows from canopy alpha without blur.
- The depth atlas uses 64px-wide straight, left-end, right-end, and single-run pieces. A piece starts at an exposed south edge (`land(x,y) && !land(x,y+1)`); horizontal neighbours select end caps. The visible wall is 24-32px tall and the reflection is sparse broken horizontal pixels below it.
- Keep nearest-neighbour scaling and binary/source alpha. The frame and depth are static, so do not add filters, tick updates, GSAP timelines, or reduced-motion branches.

## Edge Cases

| Case                                                   | Expected Handling                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Pointer lies in any decorative margin                  | No hover cell, preview, facing change, or click commit is produced                                                |
| CSS scales the canvas at desktop or narrow width       | Origin and cell conversion remain correct in both axes                                                            |
| A non-rectangular land mask exposes several south runs | Each run receives correct independent left/right end caps without bridging water gaps                             |
| A small harness arena is rendered                      | Terrain/depth projection uses its snapshot dimensions while the fixed shipped composition and frame remain stable |
| Reset or route replacement occurs                      | All frame, background, and depth display objects are destroyed with no orphan visual                              |

## Acceptance Criteria

1. A mint-stone and teal-brick wall, coherent green tree cover, tree shadows, and asymmetrical submerged rocks frame the arena in an ungridded water margin matching the reference composition.
2. The grass island has a south-facing masonry foundation, joined corner returns, water contact shadow, and broken static reflection that make it read as raised terrain.
3. The full 18x12 gameplay board remains visible and unchanged, while decoration does not obscure entities, telegraphs, reservations, previews, effects, or HUD controls.
4. Pointer aim and clicks select the correct gameplay cell under CSS scaling, and the decorative margin is non-interactive.
5. Decoration has no collision or core determinism effect, and reset, resize, narrow layout, reduced motion, and route replacement leave no clipped or orphaned visual.
