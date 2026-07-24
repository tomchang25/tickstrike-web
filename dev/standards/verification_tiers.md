# Verification Tiers Standard

Scope verification to the risk of the change; never run the full vertical slice for every content variant.

| Change                                 | Required verification                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| New enemy reusing an existing behavior | Content/schema test; sprite test only for new assets       |
| New enemy behavior                     | Behavior unit test plus one deterministic scenario         |
| New browser-visible integration        | Shared Playwright scenario asserting the system capability |
| New terminal or multi-entity animation | Presentation unit test plus Playwright cleanup assertion   |
| New global system                      | Full vertical slice                                        |

The capability rule in `dev/foundation/platforms/web-react/standards/testing_standard.md` applies: Playwright verifies system capabilities, never per-content variants. How an individual test is authored — layer choice, cost budget, and fixture-based setup — is owned by `dev/standards/test_economy_standard.md`.

## Browser suite scope

The table's Playwright rows name which capability needs a scenario, not how often the suite runs. Per-commit verification runs only a targeted selection (`npx playwright test -g "<test name>"` or `<file>.spec.ts:<line>`); the full `npm run test:e2e` suite runs in CI on every push and locally at most once per spec, at closeout. The operational contract and its enforcing hook live in `dev/agent_rules/test_operations.md`.

## Determinism goldens

Golden-fixture discipline — assert-only normal runs, regeneration only for intended behavior changes, line-by-line review — is owned by `dev/foundation/platforms/web-react/standards/testing_standard.md`. Tickstrike's goldens live under `test/unit/determinism/__golden__/` and cover the Charge, rewards, and waves scenarios: a fixed command script is compared against each accepted flag, the full ordered semantic-event stream, and the final snapshot. The dedicated update command is `npm run golden:update`.
