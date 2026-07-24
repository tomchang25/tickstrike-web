# Tickstrike Web Development Governance

Tickstrike Web is a `web-react` consumer of the shared governance foundation. The foundation is pinned as the `dev/foundation/` submodule at one exact commit; do not edit it from this repository or recreate its rules locally. This README is navigation only: it routes work to its canonical owner and does not own placement rules.

## Load order

1. Repository root entry point (`CLAUDE.md`).
2. `dev/foundation/core/agent_rules/foundation_startup.md`.
3. `dev/foundation/platforms/web-react/platform_startup.md`, selected by `dev/foundation.config.json`.
4. `dev/agent_rules/agent_startup.md` for this project's snapshot, operations, and local discovery.

The foundation owns document placement, core workflows, shared agent behavior, and the Web platform standards. Read shared rules directly from `dev/foundation/`; keep only project-specific deltas below.

## Local ownership

- `agent_rules/`: project snapshot, Git permissions, and executable validation operations.
- `standards/`: project-specific standards and addenda (gameplay feature architecture, verification tiers, test economy, palette and sprite asset contracts, dev-authoring catalogs).
- `workflows/`: project-owned workflow commands and authoring guides.
- `skills/`: project-specific hazard cards and recipes.
- `docs/`: product, migration, system, and tracking documents.
- `tools/`: project-owned executable tooling and its resources.

## Trigger map

Route each kind of work to its required reading before starting. This table names the project-local and load-bearing foundation owners; `dev/agent_rules/agent_startup.md` holds the full project-local discovery list.

| Work                                                                           | Required reading                                                                                                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add, move, or reorganize governance or documentation files                     | `foundation/core/standards/governance_structure_standard.md`, `foundation/platforms/web-react/standards/project_structure_standard.md`, `standards/project_structure.addendum.md` |
| Create or update a plan, sketch, spec, review, or closeout                     | `foundation/core/workflows/work_lifecycle.md` and the matching workflow under `foundation/core/workflows/`                                                                        |
| Add or change an enemy, character, artifact, or gameplay behavior/presentation | `standards/gameplay_feature_architecture.md`                                                                                                                                      |
| Author or restructure a test                                                   | `standards/verification_tiers.md`, `standards/test_economy_standard.md`, `foundation/platforms/web-react/standards/testing_standard.md`                                           |
| Change a runtime state owner, command, selector, or persisted contract         | `foundation/core/standards/runtime_ownership.md`                                                                                                                                  |
| Palette variants, recolour assets, or offline sprite animation sheets          | `standards/palette_variant_asset_standard.md`, `standards/sprite_animation_asset_standard.md`                                                                                     |
| Run validation or deliver a change                                             | `dev/agent_rules/test_operations.md`                                                                                                                                              |
| Any Git mutation                                                               | `dev/agent_rules/git_operations.md`                                                                                                                                               |

Use `foundation/core/standards/governance_structure_standard.md` to classify additions. The canonical repository layout is `foundation/platforms/web-react/standards/project_structure_standard.md`; project deltas live in `standards/project_structure.addendum.md`.
