# Port 13.1 Reference Inventory And Parity Matrix

Parent Plan: `port_13_visual_parity_and_polish.md`

## Goal

Audit the reference project's shipped visual, feedback, and shell surface and record every in-scope item in a parity matrix with a decision and an observable acceptance target, so children 13.2 through 13.5 execute against audited facts instead of screenshots or placeholder assumptions.

## Summary

Port 13 currently rests on plan-level intent plus a handful of user-locked decisions. This child converts that into a single audited authority: a parity matrix document listing every reference board, terrain, entity, effect, HUD, overlay, and audio surface, each with reference evidence, current Web status, one of the four parity decisions (preserve / reproduce Web-native / omit with reason / defer), and an observable acceptance target.

The audit reads the reference project's actual scenes, presenter scripts, and packaged assets under `port-ref/tickstrike/` — not screenshots — and maps each surface onto the Web runtime's existing owners (content feature registry, Pixi presentation, React shell, shipped audio delivery). The six locked pre-audit decisions recorded in the parent plan enter the matrix as pre-approved rows and are not reopened.

Deliverables are documentation only: the new matrix document beside the parent plan, plus scope/acceptance updates folded back into the parent plan's later children where the audit changes them. No runtime code, asset, or recipe changes.

What the result looks like: a reviewer can open the matrix, pick any reference surface (for example the water edge treatment, the boss health presentation, or the build inspection panel), and read where it lives in the reference, what the Web build shows today, what decision governs it, and what observable outcome closes the gap.

## Relational Context

- `port-ref/tickstrike/` is read-only evidence. The audit never edits it, never imports from it, and treats Godot scenes, node ownership, and lifecycle callbacks as evidence sources only, never as porting contracts.
- The matrix lives at `dev/docs/plans/port_13_reference_parity_matrix.md`, is pointed to only from the parent plan, and is archived with the plan at closeout. It owns acceptance targets for children 13.2–13.5; requirements stay in the parent plan and are never duplicated into the matrix.
- Reference evidence roots, verified live: arena scene and terrain in `game/tick_arena/tick_arena.tscn`, `game/tick_arena/view/` (grid view plus Smash and Major-trigger VFX), and `game/scenes/stages/` (Grass, TX Tileset Grass, Water sheets); player presentation in `game/tick_arena/player/`; enemy presentation in `game/entities/enemies/` (per-role visual presenters, `directional_sprite_frame_view.gd`, `enemy_palette_swap.gdshader`, `assets/`, `data/`); combat feedback in `game/tick_arena/combat/` (feedback, preview controller, hit SFX context); shell in `game/tick_arena/hud/`, `game/tick_arena/reward/` (reward cards, overlay, build inspection), and `game/tick_arena/run/` (run result and demo completion overlays).
- Web mapping targets, verified live: per-enemy presentation profiles are declared in content feature modules under `src/content/enemies/features/` and consumed by the Pixi enemy presentation (`src/presentation/pixi/enemy-sprites.ts`, shared scale 3.5, ranged currently overridden to 5); transient visuals are owned by `src/presentation/timelines/presentation-director.ts`; HUD, reward, and overlay surfaces live in the React shell (`src/app/game-app.tsx` and siblings). The matrix records Web status against these owners; it must not propose moving gameplay ownership into presentation.
- Audio parity already shipped in port 12; the matrix records audio rows as status-only (satisfied or explicitly deferred, for example the parked special-result SFX sketch) and must not open new audio work.
- Generated animation sheets are pipeline-owned per `dev/standards/sprite_animation_asset_standard.md`; base sheets are source assets requiring human visual approval. Matrix rows that imply new sheets must name which of the two paths applies.
- `dev/docs/reports/` is forbidden as an audit source; evidence comes from the reference checkout, the live Web code, and the vendored packs under `assets/` (Ninja Adventure, Sprout Lands — the same packs the reference uses), whose availability the matrix records per surface.
- Wrong shape to avoid: the matrix is an audit, not a design document. Rows state what the reference does and what outcome closes the gap; layout, tile choices, and animation design belong to the later children's sketches.

## Scope

### Included

- Reading the reference project's arena, entity, combat feedback, shell, and audio surfaces from source and packaged assets.
- Writing the parity matrix with decision and acceptance target per surface, including the six pre-approved rows.
- Folding audit-driven scope or acceptance-target corrections into the parent plan's later children.

### Excluded

- Any runtime, asset, recipe, or test change; any new or regenerated sprite sheet.
- Reopening the locked pre-audit decisions or any deferred Future Draft item.
- Auditing gameplay rules, balance, or systems the reference ships but the port has intentionally deferred or replaced (recorded as defer rows, not investigated).

## Files to Change

| File                                                 | Change Size | Purpose                                                                 |
| ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `dev/docs/plans/port_13_reference_parity_matrix.md`  | Large (new) | The audited inventory and parity matrix; single acceptance-target owner |
| `dev/docs/plans/port_13_visual_parity_and_polish.md` | Small       | Point to the matrix; fold audit-driven child scope/target corrections   |

## Execution Outline

1. Inventory arena and terrain: read the arena scene, grid view, stage tile sheets, and both feedback VFX scripts; record board footprint, layer order, camera framing, cell scale, and edge/water treatment as observable facts.
2. Inventory entity presentation: for the player and each enemy role, read its visual presenter, directional frame view usage, palette shader inputs, and asset sheets; record identity, facing coverage, scale, shadow, state animations, and terminal states. Seed the pre-approved ranged rescale/redraw and Mobility-kill split rows here.
3. Inventory combat feedback: read the combat feedback, preview controller, and hit-SFX context plus the Smash and Major-trigger VFX; record aim preview, locked Telegraph, impact, damage, Guard, Stagger, drowning, and spawn-warning presentation. Mark drowning satisfied.
4. Inventory the shell: HUD bars and artifact strip, reward cards and overlay, build inspection, run result and demo completion overlays, settings and debug affordances; seed the pre-approved reward-rebuild and HUD-preserve rows.
5. Record audio rows status-only against the shipped port 12 surface.
6. Write the matrix with one row per surface and columns for surface, reference evidence, Web status, decision, acceptance target, and asset source; then update the parent plan's later children where audited facts change their scope or targets, and add the plan's pointer to the matrix.
7. Run the documentation format check on both changed files.

## Implementation Notes

- Verify every Web-status claim against the live Web code at audit time; this spec's snapshot (for example the ranged scale override) is context, not authority.
- A reference surface with no Web equivalent and no locked decision gets a decision proposal in its row, flagged for human confirmation at review — the matrix may propose, but only the human approves a new omit or defer.
- Keep rows observable: "10x10 land plateau inset in a 12x12 board with water ring and edge overhang tiles" is a row; "make the arena prettier" is not.
- Where the reference uses an asset the vendored packs do not contain, say so explicitly in the asset-source column instead of assuming availability.

## Edge Cases

| Case                                                                 | Expected Handling                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Reference surface belongs to removed content (Mode / Mode Boss)      | Record as omit with the removal decision as the reason; do not audit its presentation in depth.  |
| Reference behavior contradicts a locked decision or shipped Web rule | Record the conflict in the row and stop for user confirmation; do not silently rewrite the plan. |
| Surface already satisfied by shipped work                            | Record as preserve/satisfied with the shipping evidence named; no new acceptance target.         |

## Acceptance Criteria

1. Every in-scope board, terrain, entity, effect, HUD, overlay, and audio surface of the reference appears in the matrix with a parity decision and an observable acceptance target or satisfied status.
2. The six locked pre-audit decisions appear as pre-approved rows without being reopened.
3. Later children's scope and acceptance targets in the parent plan reflect the audited facts, and the plan points to the matrix as the single acceptance-target authority.
4. The audit changes no runtime behavior, assets, or tests, and documentation formatting checks pass on the changed files.
