# Rewards and Run Build in the Same Runtime

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Let completed waves offer rewards that modify the existing player and combat state. Rewards are a pause between encounters, not a new gameplay path.

## Requirements

1. Keep acquired rewards, stacks, and derived player effects in one resettable run state.
2. Generate eligible offers deterministically at the existing wave boundary.
3. Apply a selected reward before the next wave and expose its effect through the same snapshot used by the arena HUD.
4. Keep reward presentation and dismissal outside the deterministic combat resolver.

## Design

The flow is `wave complete -> offer -> selection -> build update -> resume same arena`. The build is run-scoped state: it records acquired artifact stacks and is the sole source of reward contributions. The player remains the sole owner of effective combat values; rewards never create a parallel combat player.

Reward randomness uses a dedicated deterministic stream, independent of wave composition and placement. Every generated offer is constrained by the active character Mobility, minimum wave, exclusivity, and enforced stack caps. Reset replaces the complete run state, including its build and pending offer.

### Delivery Sequence

| Child | Focus                                                                                            | Current document                                                                          |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| A     | Run-owned build, one deterministic `attack_up` offer, selection pause, and reset-safe reward UI  | [Draft Implementation Spec](port_09_a_run_build_and_first_reward.implementation_spec.md)  |
| B     | Shared artifact-effect application for the supported channels plus Guard Shredder and Execution  | [Draft Implementation Spec](port_09_b_uniform_artifact_effects.implementation_spec.md)    |
| C     | Three-card offers, milestone cadence, compact build HUD, and full reward-flow browser acceptance | [Draft Implementation Spec](port_09_c_reward_offers_and_build_hud.implementation_spec.md) |

Child A proves the state and pause boundary with one visible effect before the effect surface expands. Child B makes supported artifacts use one acquisition and projection path, rather than adding per-artifact state owners. Child C turns the proved boundary into the regular reward cadence and exposes the acquired build without taking ownership away from the runtime.

`speed_up` is deferred because the Web port has no Speed-meter action model yet. `chain_dash` remains validated authored content but is intentionally unavailable in every offer until its replacement design is approved. Neither artifact is silently treated as a no-op reward.

## Non-Goals

1. Do not add shops, coins, permanent unlocks, save data, or meta progression.
2. Do not create a reward simulator or a second player-stat owner.
3. Do not add every Artifact trigger before the basic offer-to-combat flow works.
4. Do not let React calculate combat outcomes.
5. Do not offer `speed_up` or `chain_dash` in this plan.

## Acceptance Criteria

1. A completed wave with eligible rewards pauses the same Tick Arena, presents valid offers, and resumes after one selection; an exhausted eligible pool advances without an inert offer.
2. The selected reward changes the existing player/combat result deterministically.
3. Reset clears rewards and restores the initial player state.
4. Dismissal and reset remove every reward card and animation without stale input or callbacks.
