# Scenario Contract

A Scenario is the Web replacement for running an isolated `.tscn` inside a testbed.

Each Scenario must provide:

- Stable ID and title.
- Deterministic world creation.
- Fixed arena, actors, resources, and seed when randomness is introduced.
- Direct URL through `?scenario=<id>`.
- Semantic state accessible through `window.__TICKSTRIKE__`.
- Unit-level expectations for gameplay results.
- Browser-level expectations for integration and presentation cleanup.

Scenario files are auto-discovered with `import.meta.glob`. Adding a new `*.scenario.ts` file automatically places it in the testbed selector without editing a central registry.
