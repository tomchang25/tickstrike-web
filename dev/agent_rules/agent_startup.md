# Agent Startup

## Required Startup

Read `dev/foundation/core/agent_rules/foundation_startup.md`, the `web-react` platform startup, and the selected profiles before this file. This file is the authoritative project-local startup layer for Tickstrike Web.

## Project Snapshot

Tickstrike Web ports Tickstrike from Godot to a Web-native React, PixiJS, and GSAP application. It is a `web-react` consumer using no foundation architecture profile. Gameplay rules live in framework-independent `src/core/`; React owns application UI, PixiJS owns game rendering, and the runtime coordinates semantic events between them.

## Reference Source

The original/reference Tickstrike implementation is available at `port-ref/tickstrike/` (`E:\IndieProjects\tickstrike-web\port-ref\tickstrike`). Read it when verifying ported behavior, content, navigation, or lifecycle semantics. It is reference material only: do not import it into the Web runtime or preserve Godot lifecycle patterns without an independently justified Web-native equivalent.

The repository uses Node.js 22.12 or newer and npm. Runtime source and packaged assets live in `src/`, tests live in `test/`, project governance and tools live in `dev/`, general non-runtime source material lives in `assets/`, and Vite writes generated exports to ignored `build/`.

## Required Operation Contracts

- Read `dev/agent_rules/git_operations.md` before any Git mutation or when Git state is unreliable.
- Read `dev/agent_rules/test_operations.md` before running any test, build, import, screenshot, smoke, or other platform validation operation.

## Project-Local Discovery

Before creating or changing fixed palette variants, generated recolour assets, or their runtime selection and validation, read `dev/standards/palette_variant_asset_standard.md`.

Read `dev/standards/project_structure.md` before adding, moving, or reorganizing source, tests, assets, build output, or project documentation. Read additional files under `dev/agent_rules/`, `dev/standards/`, `dev/workflows/`, `dev/skills/`, and applicable parts of `dev/docs/` when their trigger applies. Never read, search, cite, summarize, or use `dev/docs/reports/` as an agent source; those files are human-facing historical/report material and may be stale. Root `AGENTS.md` defines the migration completion, porting, and report-exclusion contracts.
