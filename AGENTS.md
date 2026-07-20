# Agent Rules

## Startup

Before repository work, read `dev/foundation/core/agent_rules/foundation_startup.md`, `dev/foundation/platforms/web-react/platform_startup.md`, and `dev/agent_rules/agent_startup.md` in that order.

If `dev/foundation/` is missing or uninitialized, stop and request `git submodule update --init --recursive`.

## Project structure

Read `dev/standards/project_structure.md` before adding, moving, or reorganizing source, tests, assets, build output, or project documentation. That standard is the canonical owner for repository layout and dependency boundaries.

## Human-only reports

`dev/docs/reports/` is human-facing historical/report material and may be stale. Agents must not read, search, cite, summarize, or use files in this directory as a source of truth. Use current source, tests, standards, and agent rules instead.
