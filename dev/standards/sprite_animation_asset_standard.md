# Sprite Animation Asset Standard

This standard owns the durable Tickstrike Web contract for deterministic, offline-authored pixel animation sheets. It applies to tools, recipes, metadata, manifests, previews, and eventual runtime imports. It does not authorize runtime integration by itself.

## Source And Output Layout

All source and generated enemy sheets use 16x16 cells. Direction is always a column and animation time is always a row:

```text
Column 0: Down
Column 1: Up
Column 2: Left
Column 3: Right

Row: source or generated animation frame
```

The source sheet is 64x64: four direction columns by four source-frame rows. The standard generated x8 sheet is 64x128: four direction columns by eight generated-frame rows. The internal representation is `frames[direction][animation_frame]`; only the sheet serializer maps it to columns and rows.

The pipeline must not transpose this layout. A consumer may use a different external format only through an explicit export adapter; the compiler and recipe contracts retain this canonical layout.

## Deterministic Inputs

The compiler accepts only the declared source PNG, recipe configuration, recipe implementation, and optional checked-in masks or keyframes. It must not use ImageGen, diffusion editing, or an unsaved one-off image output.

Pillow owns pixel-level editing and RGBA PNG generation. ImageMagick 7 may generate previews and inspect secondary image properties; it does not own canonical sheet composition. All scaling uses nearest-neighbor filtering. Output alpha is binary: `0` or `255` only.

Fixed palette replacement is currently frozen. The pipeline must read the existing Kappa Green and Kappa Purple runtime sheets directly and must not derive one from the other. Transient effect tint, such as a water-submerged state, is allowed only when declared by the recipe and is not a replacement for palette identity.

## Recipe Contract

One animation recipe consists of a JSON config and a Python implementation under `dev/tools/sprite-animation/`. The config declares source-pose selection, frame durations, anchor, overflow policy, effect coordinate space, end state, and approval status. The implementation owns effect-specific masks, pixel operations, and direction differences.

Configs must name all eight source poses explicitly. Source movement rows must never be treated as a generated animation timeline by implication. Use each target's existing source sheet; the same recipe may be used for multiple compatible sheets only when its logic does not depend on an identity palette.

Recipe status has two values:

- `draft`: may generate staging output for visual review but cannot become a shipped asset.
- `approved`: its visual decisions are frozen and it may be used to rebuild an approved asset.

Only a human approval may promote a recipe from `draft` to `approved`.

## Output Contract

Every generation writes the following files to an explicit staging output directory:

```text
<target>-<effect>-4dir-x8.png
<target>-<effect>-4dir-x8.animation.json
<target>-<effect>-4dir-x8.manifest.json
```

The metadata records the source and output layouts, direction order, timing, anchor, overflow policy, effect coordinate space, end state, recipe status, and alpha policy. The manifest records source, config, recipe, and canonical RGBA hashes plus the Python, Pillow, and ImageMagick availability information.

Preview files are optional and never become runtime assets or validation sources. Their only roles are visual review and debugging.

## Validation And Rejection

Validation must reject output when any of the following applies:

- The source or output dimensions do not match the declared grid.
- Direction columns are not `Down`, `Up`, `Left`, `Right`.
- An x8 output is not 64x128.
- Alpha contains a value other than `0` or `255`.
- The metadata, manifest, or canonical RGBA hash does not match the sheet.
- A source pose sequence or timing array does not contain exactly eight valid entries.
- A generated frame conflicts with its declared end state.
- A required effect or target has no recipe and the workflow attempts to substitute an unrelated recipe.

Automated checks are necessary but insufficient. A draft also requires a 1x preview, an 8x preview, and human visual review for event readability, direction correctness, silhouette stability, and final-frame meaning.

## Runtime Boundary

This standard owns offline authoring only. Generated sheets remain staging artifacts until a separate runtime integration change explicitly adds packaged assets, Pixi frame playback, terminal-event routing, scenario coverage, and browser assertions. Do not add generated assets under `src/content/enemies/` or use them in runtime code as part of pipeline-only work.
