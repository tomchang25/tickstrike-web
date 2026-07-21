# Verification Tiers Standard

Scope verification to the risk of the change; never run the full vertical slice for every content variant.

| Change                                 | Required verification                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| New enemy reusing an existing behavior | Content/schema test; sprite test only for new assets       |
| New enemy behavior                     | Behavior unit test plus one deterministic scenario         |
| New browser-visible integration        | Shared Playwright scenario asserting the system capability |
| New terminal or multi-entity animation | Presentation unit test plus Playwright cleanup assertion   |
| New global system                      | Full vertical slice                                        |

Playwright verifies system capabilities, not per-content variants.

## Browser suite scope

The table's Playwright rows name which capability needs a scenario, not how often the suite runs. Per-commit verification runs only a targeted selection (`npx playwright test -g "<test name>"` or `<file>.spec.ts:<line>`); the full `npm run test:e2e` suite runs in CI on every push and locally at most once per spec, at closeout. The operational contract and its enforcing hook live in `dev/agent_rules/test_operations.md`.

## Determinism goldens

`test/unit/determinism/` runs the Charge, rewards, and waves scenarios through a fixed command script and compares each accepted flag, the full ordered semantic-event stream, and the final snapshot against a committed golden under `__golden__/`. A normal run — `npm test`, `npm run check`, CI — only asserts and never rewrites a golden, so a divergence stays red until a human resolves it.

Regenerate goldens only with `npm run golden:update`, and only when the change under review **intentionally** alters a rule, a value, or content. The regenerated files land in the diff: review them line by line, and name the behavioral change in the commit message. Regenerating a golden to turn a red test green without an intended behavior change is the precise abuse this gate exists to catch — a determinism regression reaching a golden is a finding, not a formatting chore.
