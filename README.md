# Tickstrike Web

A runnable base for rebuilding Tickstrike as a Web-native, Agent-first game without reproducing Godot's scene lifecycle in TypeScript.

This is deliberately a small vertical slice rather than an empty architecture skeleton. It contains:

- Pure TypeScript deterministic core.
- Command → world mutation → semantic event flow.
- PixiJS renderer that knows nothing about combat rules.
- GSAP timelines for Smash, knockback, crush, and drowning.
- React testbed/HUD that does not own combat entities.
- Auto-discovered Scenario modules through `import.meta.glob`.
- Semantic DOM mirror and `window.__TICKSTRIKE__` debug API.
- Vitest logical parity test.
- Playwright browser acceptance test.
- Tauri 2 shell configuration for a Windows executable.

## Requirements

- Node.js 22.12 or newer.
- npm 10 or newer.
- For Tauri only: current Rust stable toolchain and Windows WebView2 build prerequisites.

## Start in the browser

    npm install
    npm run dev

Open the displayed local URL. The default `tick-arena` scenario is also available directly as:

    http://127.0.0.1:1420/?scenario=tick-arena

Controls:

- WASD or arrow keys: move.
- Hold Alt and hover to preview the active authored Mobility, then click to commit it.
- Testbed buttons provide the same commands for Playwright and manual use.

## Tests

Install the Playwright Chromium binary once:

    npx playwright install chromium

Run logical tests:

    npm test

Run browser acceptance:

    npm run test:e2e

Run compile, unit tests, and production build:

    npm run check

## Tauri

Install Rust stable first, then:

    npm run tauri:dev

Build the executable:

    npm run tauri:build

The starter sets `bundle.active` to `false`, so it focuses on producing and testing the executable rather than installer metadata. Add icons and enable bundling when the Steam release shell is ready.

## Important folders

    assets/            General references and source material; never loaded directly at runtime
    build/             Generated Web export from npm run build; ignored by Git
    dev/               Project governance, formal docs, tools, and pinned game-devkit
    dev/docs/          Migration and scenario documentation
    TODO.md            Forward work tracker
    CHANGELOG.md       Append-only shipped outcome history
    src/content/       Feature content and feature-owned runtime assets
    src/shared/assets/ Proven cross-feature runtime assets
    src/core/          Deterministic rules and state; no browser/game-renderer imports
    src/runtime/       Orchestration between core and presentation
    src/presentation/  Pixi views and GSAP timelines
    src/ui/            DOM HUD, menus, rewards, and testbed
    src/harness/       Scenarios, auto-registry, debug API, semantic mirror
    src/platform/      Tauri, Steamworks, filesystem, and other adapters
    test/unit/         Vitest logical parity tests
    test/e2e/          Playwright browser acceptance tests
    src-tauri/         Minimal Tauri 2 shell

Every asset consumed by the game must be copied or exported into `src/content/<feature>/assets/` and imported by source code. Use `src/shared/assets/` only for demonstrated cross-feature ownership; the root `assets/` directory is for general references or editable source material.

The canonical repository layout and placement rules live in `dev/standards/project_structure.md`.

The shared Web development governance is pinned as a Git submodule at `dev/foundation/`. After cloning this repository, initialize it with:

    git submodule update --init --recursive

Read `AGENTS.md` before allowing an implementation Agent to extend the project. It is the startup entry point for the canonical project rules that prevent this repository from becoming a TypeScript copy of Godot.

## Current sample behavior

The default scenario starts with:

- A fixed Ninja player at `(6,6)` with a five-cell Dash.
- Thrust and Slash enemies with directional Guard at the center lane.
- One passive Ranged fixture retained for three-entity coverage.

The deterministic Smash scenario starts with a fixed Viking at `(3,3)` and a legal landing at `(4,3)`. Releasing Smash produces:

- A shared Mobility hit result for each eligible enemy in the 3x3 area.
- A crush result for the enemy occupying the impact cell.
- A two-cell land knockback for the right-side enemy, ending at `(7,3)`.
- A reservation-blocked victim that remains at `(4,2)`.
- A water-fall for the lower victim at `(4,6)`, entering the `drowning` phase and releasing occupancy.
- A six-tick authored Mobility cooldown.
- Logical tick advances exactly once.

The unit and Playwright tests encode this as the first migration parity contract.
