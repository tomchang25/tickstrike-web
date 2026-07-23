# Claude Instructions

## Startup

Before answering any repository-specific question or doing any work in this repo, first read `dev/foundation/core/agent_rules/foundation_startup.md`, then `dev/foundation/platforms/web-react/platform_startup.md`, then `dev/agent_rules/agent_startup.md`.

If `dev/foundation/` is missing or uninitialized, stop and request `git submodule update --init --recursive` before repository work.

## Tool-Specific Notes

This file is the root entry point for Claude-style agents that discover `CLAUDE.md`. All project rules, standards triggers, and discovery contracts live in `dev/agent_rules/agent_startup.md` and the files it references.

Do not use any Claude Browser tool (`mcp__Claude_Browser__*` — preview servers, navigation, screenshots, console/network readers, and `javascript_tool` alike). The family is banned in this repo (`.claude/settings.json` denies the server): it has a history of hanging sessions and timing out on canvas screenshots. For browser verification use unit tests, targeted Playwright runs, or a one-off Node script driving the repo's Playwright package (navigate, drive the `window.__TICKSTRIKE__` debug API, `page.screenshot` to the scratchpad) against the dev server.

**STRICTLY FORBIDDEN: never kill, restart, or take over the dev server on port 1420.** That port belongs to the user's own long-running `npm run dev`. Do not run `npm run dev` yourself (it binds 1420 and, on failure, corrupts the shared `node_modules/.vite` dep cache), do not `Stop-Process`/`kill` whatever holds the port, and do not clear `node_modules/.vite`. Agents run their OWN server on a DIFFERENT port for verification — start Vite with an explicit alternate port (e.g. `npm run dev -- --port 5199 --strictPort`) in the scratchpad and point Playwright at that port, or just reuse the user's running 1420 server read-only. If port 1420 appears broken, tell the user and let them restart it; never do it for them.

## Model-Tier Notes

Match the model tier to the failure mode of the task, not its size:

- **Pattern-copy work** (applying an existing worked example to a new axis — feature modules, behavior/presenter registry entries, fixture parameterization, content authoring against a settled schema) is safe for Sonnet-class models: the codebase contains the template and the unit suite gates the result.
- **Shared-state carving and invariant-sensitive refactors** (extracting mutable state from `world.ts`, anything touching deterministic ordering, damage/displacement interleaving, or snapshot/event contracts) needs an Opus- or Fable-class model, or a Sonnet-class run followed by a human diff review plus the same-seed event-sequence comparison described in the active spec. Tests staying green is not sufficient evidence of preserved determinism.
- Run multi-step refactor specs one step per session with tests green before each commit; do not let any model batch steps.
