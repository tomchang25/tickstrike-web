# Project Structure Addendum

Canonical repository layout, root vocabulary, source layers, import boundaries, and the placement test are owned by `dev/foundation/platforms/web-react/standards/project_structure_standard.md`. This addendum records only Tickstrike Web's deltas and project-owned trees. Do not restate the shared standard here.

## Project-owned root trees

```text
src-tauri/              Tauri 2 desktop shell; consumes the dist/ export but does not own it
port-ref/               Read-only reference checkout of the original Godot Tickstrike
index.html              Vite entry document (no public/ directory is used)
```

`port-ref/` is reference material only: never import it into the Web runtime, and never edit it from this repository.

## Earned layers

`src/presentation/` (PixiJS rendering and GSAP timelines) and `src/shared/` (including `src/shared/assets/`) are both earned and active. Terminal gameplay state is resolved immediately in core; presentation may keep a terminal entity visible while its semantic-event timeline completes, but animation lifetime never controls whether an entity remains logically active.

## Asset pipeline deltas

Palette variant assets and offline sprite animation sheets have dedicated owners: `palette_variant_asset_standard.md`, `sprite_animation_asset_standard.md`, and the sprite authoring workflow. Their generated filenames are pipeline-owned and exempt from the shared code filename rules.

## Test placement deltas

Unit test paths mirror the relevant `src/` ownership path. Deterministic golden fixtures live in `test/unit/determinism/__golden__/` and are regenerated only through `npm run golden:update`. Browser acceptance tests use the `.spec.ts` role suffix under `test/e2e/`.

## Enforcement deltas

The shared standard's machine-checked boundaries are implemented with dependency-cruiser (`.dependency-cruiser.cjs`), run by `npm run check:boundaries` inside `npm run verify`. The cruise freezes the cross-layer dependency set measured at adoption: `core` reaches nothing outward, and each other layer imports only within its recorded set. Cross-layer imports use the `@layer/*` path aliases so a boundary crossing is visible in the import specifier itself. Registry-only feature seams add further rules; see `gameplay_feature_architecture.md`.

`npm run check:unused` (knip) reports dead files, exports, and dependencies. It runs in report mode and does not yet gate `verify`: the baseline is mostly deliberate extension surface awaiting its consumer rather than dead code, so the burn-down is per-item judgment — delete a genuine orphan, or give an intended-but-unconsumed export the consumer it was built for. Flip `check:unused` into `verify` only once the baseline reaches zero.
