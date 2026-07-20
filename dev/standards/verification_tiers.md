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
