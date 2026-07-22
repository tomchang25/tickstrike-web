# Claude Instructions

## Startup

Before answering any repository-specific question or doing any work in this repo, first read `dev/foundation/core/agent_rules/foundation_startup.md`, then `dev/foundation/platforms/web-react/platform_startup.md`, then `dev/agent_rules/agent_startup.md`.

If `dev/foundation/` is missing or uninitialized, stop and request `git submodule update --init --recursive` before repository work.

## Tool-Specific Notes

This file is the root entry point for Claude-style agents that discover `CLAUDE.md`. All project rules, standards triggers, and discovery contracts live in `dev/agent_rules/agent_startup.md` and the files it references.

Do not use the Claude Browser `javascript_tool` (`mcp__Claude_Browser__javascript_tool`). It is locked: using it requires both (1) a verification need that unit tests and Playwright e2e genuinely cannot cover, and (2) the user's explicit permission granted in the current conversation. The tool has a history of hanging sessions; prefer unit tests, targeted Playwright runs, browser screenshots, and console/network readers.

## Model-Tier Notes

Match the model tier to the failure mode of the task, not its size:

- **Pattern-copy work** (applying an existing worked example to a new axis — feature modules, behavior/presenter registry entries, fixture parameterization, content authoring against a settled schema) is safe for Sonnet-class models: the codebase contains the template and the unit suite gates the result.
- **Shared-state carving and invariant-sensitive refactors** (extracting mutable state from `world.ts`, anything touching deterministic ordering, damage/displacement interleaving, or snapshot/event contracts) needs an Opus- or Fable-class model, or a Sonnet-class run followed by a human diff review plus the same-seed event-sequence comparison described in the active spec. Tests staying green is not sufficient evidence of preserved determinism.
- Run multi-step refactor specs one step per session with tests green before each commit; do not let any model batch steps.
