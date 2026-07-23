# Agent Startup

## Required Startup

Read `dev/foundation/core/agent_rules/foundation_startup.md`, the `web-react` platform startup, and the selected profiles before this file. This file is the authoritative project-local startup layer for Tickstrike Web.

## Project Snapshot

Tickstrike Web ports Tickstrike from Godot to a Web-native React, PixiJS, and GSAP application. It is a `web-react` consumer using no foundation architecture profile. Gameplay rules live in framework-independent `src/core/`; React owns application UI, PixiJS owns game rendering, and the runtime coordinates semantic events between them.

## Reference Source

The original/reference Tickstrike implementation is available at `port-ref/tickstrike/` (`E:\IndieProjects\tickstrike-web\port-ref\tickstrike`). Read it when verifying ported behavior, content, navigation, or lifecycle semantics. It is reference material only: do not import it into the Web runtime or preserve Godot lifecycle patterns without an independently justified Web-native equivalent.

The repository uses Node.js 22.12 or newer and npm. Runtime source and packaged assets live in `src/`, tests live in `test/`, project governance and tools live in `dev/`, general non-runtime source material lives in `assets/`, and Vite writes generated exports to ignored `dist/`.

## Required Operation Contracts

- Read `dev/agent_rules/git_operations.md` before any Git mutation or when Git state is unreliable.
- Read `dev/agent_rules/test_operations.md` before running any test, build, import, screenshot, smoke, or other platform validation operation.

## Dev Server / Port 1420 (STRICTLY FORBIDDEN to disturb)

Port 1420 hosts the user's own long-running `npm run dev`. It is off-limits: never kill it, never restart it, never take it over, and never run `npm run dev` yourself (that command binds 1420 and, if it fails to bind, re-runs the dep optimizer and corrupts the shared `node_modules/.vite` cache the user's server depends on). Never `Stop-Process`/`kill` the process holding 1420 and never delete `node_modules/.vite`. For agent browser verification, start your OWN Vite instance on a different port (e.g. `npm run dev -- --port 5199 --strictPort`, run from the scratchpad) and drive Playwright against that port, or read the user's 1420 server without mutating it. If 1420 looks broken, report it and let the user restart — do not fix it for them.

## Project-Local Discovery

- Before changing TypeScript, TSX, formatter, or linter configuration, read `dev/foundation/platforms/web-react/standards/code_style_standard.md` and `dev/standards/code_style.addendum.md`.

Before adding or changing an enemy, character, artifact, or any gameplay behavior/presentation — and before touching `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer` — read `dev/standards/gameplay_feature_architecture.md`.

Before deciding what verification a change needs, read `dev/standards/verification_tiers.md`.

Before closing out a plan child or updating a plan's child overview, read `dev/workflows/closeout_standard.addendum.md`: shipped rows stay in the plan with their spec named in plain text and no link.

Before creating or changing fixed palette variants, generated recolour assets, or their runtime selection and validation, read `dev/standards/palette_variant_asset_standard.md`.

Before creating, changing, regenerating, or reviewing an offline pixel animation sheet, read `dev/standards/sprite_animation_asset_standard.md`, `dev/workflows/sprite_animation_authoring.md`, and `dev/skills/sprite_animation_authoring.md`.

Read `dev/foundation/platforms/web-react/standards/project_structure_standard.md` and `dev/standards/project_structure.addendum.md` before adding, moving, or reorganizing source, tests, assets, build output, or project documentation. Read additional files under `dev/agent_rules/`, `dev/standards/`, `dev/workflows/`, `dev/skills/`, and applicable parts of `dev/docs/` when their trigger applies. Never read, search, cite, summarize, or use `dev/docs/reports/` as an agent source; those files are human-facing historical/report material and may be stale.
