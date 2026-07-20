# Gameplay Feature Architecture Standard

Read this before adding or changing an enemy, a character, an artifact, or any gameplay behavior/presentation, and before touching `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer`.

## Feature seams

An enemy is described in exactly one feature module under `src/content/enemies/features/` (definition, attacks, presentation profile, sprite/water assets) plus one registry entry there. Role logic lives in `src/core/enemies/behaviors/` (one module + one registry entry); bespoke animation lives in `src/presentation/timelines/enemy-presenters/` (one module + one registry entry).

Never add role or profile branching to `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer`. These hubs hold no per-feature knowledge; features reach them only through the registries above.

The same pattern is planned for the character axis; see `dev/docs/plans/character_featurization_and_viking_split.md` before starting character-scoped work.

## File budget

A new enemy reusing an existing behavior touches at most 2–4 files; a new behavior touches 4–7. Exceeding the budget is an architecture regression — fix the seam instead of spreading the feature.

## Pending ownership work

`world.ts` is scheduled for a subsystem split; read `dev/docs/plans/gameplay_architecture_refactor_a6_world_ownership_split.implementation_spec.md` before restructuring anything inside `src/core/world/`.
