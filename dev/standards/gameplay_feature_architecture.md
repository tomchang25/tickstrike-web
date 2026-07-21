# Gameplay Feature Architecture Standard

Read this before adding or changing an enemy, a character, an artifact, or any gameplay behavior/presentation, and before touching `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer`.

## Feature seams

An enemy is described in exactly one feature module under `src/content/enemies/features/` (definition, attacks, presentation profile, sprite/water assets) plus one registry entry there. Role logic lives in `src/core/enemies/behaviors/` (one module + one registry entry); bespoke animation lives in `src/presentation/timelines/enemy-presenters/` (one module + one registry entry).

Never add role or profile branching to `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer`. These hubs hold no per-feature knowledge; features reach them only through the registries above.

Registry-only access is machine-checked by `npm run check:boundaries`: outside each registry's own directory, only its `index.ts` may be imported, so reaching past a behavior, presenter, or feature registry fails `npm run check`. Keep this prose and `.dependency-cruiser.cjs` in step when the seams change.

The same pattern is planned for the character axis; see `dev/docs/plans/character_featurization_and_viking_split.md` before starting character-scoped work.

## File budget

A new enemy reusing an existing behavior touches at most 2–4 files; a new behavior touches 4–7. Exceeding the budget is an architecture regression — fix the seam instead of spreading the feature.

## World subsystem ownership

`world.ts` composes four subsystems, each owning one kind of state: `GridBoard` (space), `CombatOperations` (enemy combat lifecycle), `WaveRuntime` (wave progression), `RunBuild` (artifact build and pending reward). They are wired in `World`'s constructor and must not import one another — `check:boundaries` enforces this, with the single recorded exception that `combat-operations` may reach `grid-board` for spatial answers. Add new mutable gameplay state to the subsystem that owns its concern, not to the `World` facade. Background and the delegation audit are in `dev/docs/plans/gameplay_architecture_refactor_a6_world_ownership_split.implementation_spec.md`.
