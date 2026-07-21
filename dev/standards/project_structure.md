# Project Structure Standard

This standard is the canonical owner for Tickstrike Web repository layout, source boundaries, test placement, and asset ownership. Shared TypeScript naming and Web test-layer rules remain owned by the selected Web React foundation platform.

## Repository Layout

```text
assets/                 General source material and asset references
build/                  Generated Web export
dev/                    Project governance, development documentation, and tooling
src/                    Production application source and packaged runtime assets
src-tauri/              Tauri desktop shell
test/                   Automated test source
```

The repository root must not contain a second documentation tree or an alternate source tree. Product, migration, and system documents belong in `dev/docs/`; durable project rules belong in the matching `dev/` governance directory.

## Root Responsibilities

### `test/`

All automated test source lives under `test/` rather than beside production modules.

```text
test/
  unit/                 Vitest domain, content, and runtime tests
  e2e/                  Playwright browser acceptance tests
```

Unit test paths should mirror the relevant `src/` ownership path when practical. Runtime-selectable scenarios and their contracts remain in `src/harness/`; assertions and runner-specific test code belong in `test/`.

### `dev/`

`dev/` contains the pinned shared foundation and every project-owned development artifact.

```text
dev/
  foundation/           Pinned game-devkit submodule; never edit from this project
  foundation.config.json
  agent_rules/          Project operating constraints
  standards/            Durable project output contracts
  workflows/            Project-local development processes
  skills/               Focused project recipes and hazard cards
  docs/                 Product, migration, system, and tracking documents
  tools/                Project-owned executable development tooling
```

Classify governance additions through `dev/foundation/core/standards/governance_structure_standard.md`. Do not copy shared foundation contracts into project-local files.

### `build/`

`build/` is exclusively the generated Web export produced by `npm run build`. It is not a plugin, addon, package source, or manually maintained content directory. Source code and tools must not depend on a pre-existing `build/`, and Git must ignore its generated contents. Tauri may consume this export but does not own it.

### `assets/`

The root `assets/` directory is the unified library for general references, editable source files, and unoptimized source material. It is outside the runtime module graph and must never be imported directly by application code.

Every asset used by the game must be copied or exported into the owning feature below `src/content/<feature>/assets/`. A runtime asset used by multiple independent features belongs in `src/shared/assets/` only after the shared ownership is concrete. Do not place feature assets in shared storage for hypothetical reuse.

```text
assets/                             Editable and reference source material
src/content/<feature>/assets/       Feature-owned package-ready runtime assets
src/shared/assets/                  Proven cross-feature runtime assets
```

Runtime assets are imported through TypeScript, TSX, or CSS so Vite can fingerprint and package them. If `public/` is introduced, reserve it for platform files that require stable URLs, such as a favicon or Web manifest; normal game content does not belong there.

`src/core/` uses semantic identifiers for textures, audio, and effects. It must not import asset files or resolve asset URLs.

## Source Layout

```text
src/
  app/                    Application composition and global application styles
  content/                Authored game content grouped by feature
    <feature>/
      assets/             Runtime assets owned by that feature
  core/                   Deterministic gameplay state, commands, rules, and events
  harness/                Deterministic scenarios, debug API, and semantic mirrors
  platform/               Browser, Tauri, Steam, filesystem, and external adapters
  presentation/           PixiJS rendering and GSAP presentation timelines
  runtime/                Orchestration between gameplay and presentation
  shared/                 Proven cross-feature source with no narrower owner
    assets/               Proven cross-feature runtime assets
  ui/                     React HUD, menus, rewards, and test controls
  main.tsx                Web bootstrap entry point
```

### `src/app/`

Application assembly belongs in `app/`. It may compose runtime, UI, harness, and platform capabilities. `main.tsx` remains a minimal bootstrap entry point and does not accumulate gameplay or presentation logic.

### `src/content/`

Content is grouped by gameplay feature or authored domain. It owns immutable definitions, arena layouts, enemy and reward configuration, spawn definitions, and feature-specific package-ready assets. Content may construct or type data through `core`, but it must not own mutable run state or presentation flow.

### `src/core/`

Core owns deterministic world state, gameplay commands, rules, and semantic events. Modules below `core/` may import only other framework-independent core modules. They must never import React, PixiJS, GSAP, DOM, Tauri, browser globals, asset files, or asset URLs.

### `src/runtime/`

Runtime coordinates command execution, snapshots, semantic events, scenarios, and presentation completion. It does not reimplement gameplay outcomes or move visual lifetime into core state.

### `src/presentation/`

Presentation maps core snapshots and semantic events to PixiJS objects, GSAP timelines, audio, and other visual behavior. It may resolve runtime asset imports, but it never decides gameplay outcomes.

Terminal gameplay state is resolved immediately in core so occupancy and subsequent rules remain deterministic. Presentation may keep a terminal entity visible while its semantic-event timeline completes, then purge the visual object. Animation lifetime must never control whether an entity remains logically active.

### `src/ui/`

UI owns low-frequency React interfaces such as HUD, menus, rewards, and test controls. React does not own or rerender individual combat entities every frame.

### `src/harness/`

Harness owns deterministic scenario definitions, scenario discovery, debug APIs, semantic mirrors, and runtime-accessible fixtures. Test-runner assertions remain under `test/`.

### `src/platform/`

Platform owns adapters for browser capabilities, Tauri, Steam, filesystem, cloud saves, analytics, and other external APIs. Core gameplay must not import platform adapters.

### `src/shared/`

Shared is an exception for source with demonstrated cross-feature ownership and no more precise owner. Do not use it as a default location or a miscellaneous directory.

## Enforcement

The per-layer import boundaries above are machine-checked by `npm run check:boundaries` (dependency-cruiser, configured in `.dependency-cruiser.cjs`), which runs inside `npm run check`. The cruise freezes the cross-layer dependency set measured at adoption: `core` reaches nothing outward, and each other layer imports only within its recorded set. Widening a boundary means editing both this prose and the rule file in the same change; a rule the prose does not describe, or prose the rule does not enforce, is the drift this pairing exists to prevent. Cross-layer imports use the `@layer/*` path aliases so a boundary crossing is visible in the import specifier itself.

`npm run check:unused` (knip) reports dead files, exports, and dependencies. It runs in report mode and does not yet gate `check`; see `dev/docs/plans/engineering_hardening.md` for the burn-down.

## Placement Test

Before adding or moving a project file:

1. Put deterministic gameplay state or rules in `core/`.
2. Put immutable authored definitions and feature-owned runtime assets in `content/<feature>/`.
3. Put visual and audio realization in `presentation/`.
4. Put application orchestration in `runtime/` and React application assembly in `app/`.
5. Put browser or desktop integration behind `platform/`.
6. Use `shared/` only when multiple current owners require the same artifact.
7. Put assertions in `test/`, development artifacts in `dev/`, source material in root `assets/`, and generated exports in `build/`.
