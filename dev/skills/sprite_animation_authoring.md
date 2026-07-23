# Sprite Animation Authoring

Use this skill with `dev/tools/sprite-animation/` and `dev/standards/sprite_animation_asset_standard.md`.

## Tool Roles

- Pillow performs source cropping, masks, pixel translation, local recoloring, layer compositing, and canonical PNG writing.
- ImageMagick 7 produces optional nearest-neighbor contact sheets and GIF previews.
- Aseprite is optional for manually authored masks or keyframes; it is not required for compiler execution.

Never use bilinear, bicubic, partial alpha, ImageGen, or diffusion editing.

## Direction Rule

Source and output sheets are both column-major by direction:

```text
columns: Down, Up, Left, Right
rows: animation frames
```

Do not swap Down and Up. Do not transpose generated x8 sheets into 128x64. A 4-direction x8 sheet is 64x128.

## Effect Construction

Start from the source frame selected for each output frame. Keep actor geometry, effect geometry, effect visibility, and effect motion distinct. Unless a request explicitly requires direction-specific left/right art, author the right-facing frames and generate the left-facing frames as exact horizontal mirrors. Use each direction's own source geometry when that explicit asymmetry exists; a flip must not erase required direction-specific effect logic.

For water effects, keep the actor, submerged tint, water surface, splashes, and bubbles conceptually separate. Do not use regular checkerboard deletion to hide a submerged actor; use the water surface, clipping, and intentional effect pixels instead.

For split effects, distinguish a wound surface that moves with the separated parts from an attack effect that intentionally remains in actor, screen, or attack coordinate space.

For extinguish effects, identify an explicit flame or aura region. Do not recolor or delete stable body pixels merely because their color resembles flame.

## Preview Use

The CLI can generate a single four-direction GIF. Each GIF frame shows the four direction columns side by side and uses declared frame durations. The 1x GIF tests actual gameplay readability; the 8x GIF and contact sheet expose pixel defects. GIF output is preview-only and never a runtime source of truth.

## Common Failures

- Source movement frames accidentally become a death timeline because the source pose sequence was omitted.
- Direction and time axes are transposed in the output sheet.
- A palette variant is regenerated from another variant instead of its own existing source sheet.
- Water hides the actor through a patterned dissolve instead of an occluding surface and deliberate sinking motion.
- Preview output is mistaken for a validated or approved runtime asset.
