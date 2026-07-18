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

The flow is `wave complete -> offer -> selection -> build update -> resume same arena`. Start with one small reward that visibly changes player damage or Dash cooldown. Add the remaining authored pool only after this flow is stable. Reward randomness must use a separate deterministic stream when it is introduced.

## Non-Goals

1. Do not add shops, coins, permanent unlocks, save data, or meta progression.
2. Do not create a reward simulator or a second player-stat owner.
3. Do not add every Artifact trigger before the basic offer-to-combat flow works.
4. Do not let React calculate combat outcomes.

## Acceptance Criteria

1. A completed wave pauses the same Tick Arena, presents valid offers, and resumes after one selection.
2. The selected reward changes the existing player/combat result deterministically.
3. Reset clears rewards and restores the initial player state.
4. Dismissal and reset remove every reward card and animation without stale input or callbacks.
