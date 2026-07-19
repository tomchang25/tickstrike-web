# Palette Variant Asset Standard

This standard defines how Tickstrike Web creates and owns fixed visual palette variants such as enemy recolours, alternate sprite identities, and authored faction or rarity appearances.

## Decision Rule

Use an offline ImageMagick-derived runtime asset as the default for a palette variant when all of the following are true:

- The palette is authored content rather than a gameplay variable.
- The variant is fixed for a profile, enemy, faction, rarity, or other content identity.
- Runtime does not need arbitrary, continuous, or user-selected colour values.
- The palette does not determine a gameplay result or communicate a value that changes independently of the authored presentation state.

Use a runtime shader, filter, or other procedural colour path only when the colour transformation is a gameplay or product requirement, such as:

- A gameplay rule selects or changes the colour during runtime.
- The player can choose arbitrary colours or accessibility themes.
- One asset must support a large or unbounded set of dynamic variants.
- The visual result depends on a runtime value that cannot be represented as a finite authored asset set.

When the runtime path is chosen, the implementation spec must state why fixed derivative assets are insufficient and must define the renderer backend and ordering with other tint, alpha, and animation effects.

## Asset Ownership

- Keep the unmodified source image in the root `assets/` reference library.
- Generate each shipped derivative under the owning feature at `src/content/<feature>/assets/`.
- Import the derivative through TypeScript or CSS so Vite packages and fingerprints it.
- Keep the source sheet dimensions, frame grid, frame order, transparency, and pixel-art filtering unchanged.
- Use a stable descriptive name such as `kappa-purple-sprite-sheet.png`; do not make runtime code depend on a tool-generated temporary filename.
- Generate all sibling palette variants from the same source image. Do not generate one variant from another derivative.

## ImageMagick Generation

Use ImageMagick 7 for fixed colour replacement. Preserve alpha and request an RGBA PNG output:

```powershell
magick `
  input.png `
  -alpha on `
  -fill "#TARGET_0" -opaque "#SOURCE_0" `
  -fill "#TARGET_1" -opaque "#SOURCE_1" `
  -fill "#TARGET_2" -opaque "#SOURCE_2" `
  -fill "#TARGET_3" -opaque "#SOURCE_3" `
  -type TrueColorAlpha `
  -define png:color-type=6 `
  -strip `
  "PNG32:output.png"
```

Use the reference palette resource as the colour authority. Convert reference float channels to the target image's 8-bit values deliberately and record any threshold or tolerance decision in the implementation spec. Do not approximate a palette by eye when the reference provides exact values.

## Validation

Every generated palette variant must pass all of the following before implementation is considered complete:

- `magick identify` confirms the expected dimensions, sRGB colour space, and alpha channel.
- The source and derivative have the same frame grid and transparent regions.
- The runtime asset is imported by the owning presentation module and selected through a profile mapping rather than an ad hoc entity-type branch spread across timelines.
- Unit coverage proves the profile selects the intended derivative and preserves frame selection across facing and visual states.
- Browser coverage proves the rendered result is visible, the authored palette identity is distinct, state feedback settles without restoring the source palette, and reset or scenario replacement leaves no stale visual.
- `npm run check` and the relevant Playwright suite pass.

Do not treat an image viewer preview as runtime validation. Indexed PNG, colour profile, alpha, premultiplication, and renderer upload differences can produce a preview that does not match the Pixi result.

## State Feedback

State feedback must apply to the already-selected derivative asset. For example, damage or stagger tint may modulate a fixed purple Slash sheet, but it must never run a palette swap against a tinted green source sheet.

Keep palette identity and transient state feedback separate:

```text
profile -> fixed green or purple asset
state   -> temporary tint, alpha, transform, or pose
```

Do not use `Sprite.tint` or an equivalent modulate operation as a substitute for a fixed palette variant. Do not add a runtime filter solely to avoid packaging a small authored derivative.
