# Agent Rules

## Startup

Before repository work, read `dev/foundation/core/agent_rules/foundation_startup.md`, `dev/foundation/platforms/web-react/platform_startup.md`, and `dev/agent_rules/agent_startup.md` in that order.

If `dev/foundation/` is missing or uninitialized, stop and request `git submodule update --init --recursive`.

## Project structure

Read `dev/standards/project_structure.md` before adding, moving, or reorganizing source, tests, assets, build output, or project documentation. That standard is the canonical owner for repository layout and dependency boundaries.

## Human-only reports

`dev/docs/reports/` is human-facing historical/report material and may be stale. Agents must not read, search, cite, summarize, or use files in this directory as a source of truth. Use current source, tests, standards, and agent rules instead.

## Enemy features

An enemy is described in exactly one feature module under `src/content/enemies/features/` (definition, attacks, presentation profile, sprite/water assets) plus one registry entry there. Role logic lives in `src/core/enemies/behaviors/` (one module + one registry entry); bespoke animation lives in `src/presentation/timelines/enemy-presenters/` (one module + one registry entry). Never add role or profile branching to `enemy-phase`, `world`, `PresentationDirector`, or `PixiGameRenderer`.

File budget: a new enemy reusing an existing behavior touches at most 2–4 files; a new behavior touches 4–7. Exceeding the budget is an architecture regression — fix the seam instead of spreading the feature.

## Testing tiers

Scope verification to the risk of the change; never run the full vertical slice for every content variant.

| Change | Required verification |
| --- | --- |
| New enemy reusing an existing behavior | Content/schema test; sprite test only for new assets |
| New enemy behavior | Behavior unit test plus one deterministic scenario |
| New browser-visible integration | Shared Playwright scenario asserting the system capability |
| New terminal or multi-entity animation | Presentation unit test plus Playwright cleanup assertion |
| New global system | Full vertical slice |

Playwright verifies system capabilities, not per-content variants.
