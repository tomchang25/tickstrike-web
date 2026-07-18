# Directional Guard Combat

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)

## Goal

Deliver Batch 4 of the Tickstrike Full Port Roadmap by matching the shipped directional hit, Guard, Defense, Stagger, Protection, and combat-prediction rules. This creates one shared truth for previews and committed player hits.

## Requirements

1. Resolve Front, Side, and Back hits from attacker movement or attack direction and the target's facing.
2. Apply shipped Guard damage, HP bypass, Guarded HP reduction, Guard-break, and Defense formulas in the same order as the reference.
3. Model Stagger duration, post-Stagger Guard restoration, Protection duration, and Protection Guard-damage reduction.
4. Clear stored enemy energy, committed attacks, and recovery when Guard breaks, because Guard break interrupts the enemy's current combat cycle.
5. Support Mobility stagger-burst damage and Mobility invulnerability as explicit combat context rather than presentation timing.
6. Produce the same projected outcomes and committed outcomes from shared deterministic rules.

## Design

Directional values are:

| Hit direction | Guard damage | HP bypass while Guard remains |
| --- | ---: | ---: |
| Front | 4 | 0% |
| Side | 16 | 10% |
| Back | 32 | 25% |

While Guard remains after the hit, ordinary HP damage is multiplied by 0.2 after directional bypass is accounted for. A hit that breaks Guard applies full HP damage for that hit. Defense transforms an incoming amount using `amount × amount / (amount + defense)`.

Stagger lasts three world ticks by default. On exit, Guard is restored and five ticks of Protection begin. Protection halves ordinary Guard damage. Later Artifact rules may bypass this reduction only under their explicit trigger conditions.

## Non-Goals

1. Do not implement specific enemy decision-making or attack shapes.
2. Do not implement Artifact triggers beyond preserving extension seams in combat results.
3. Do not rebalance directional values, duration, or formulas.
4. Do not make animation frames determine invulnerability or status timing.

## Acceptance Criteria

1. Front, Side, and Back scenarios match the reference Guard and HP results exactly.
2. Guard break clears enemy combat commitments and enters Stagger with the expected duration.
3. Stagger exit restores Guard and applies Protection for the expected duration and modifier.
4. Preview labels and committed outcomes cannot disagree for the same state and command.
5. Unit coverage proves formulas, ordering, status transitions, interruption, stagger burst, and Mobility invulnerability.
6. Browser acceptance visibly distinguishes blocked hits, full damage, Guard break, Stagger, Protection, and cleanup of transient feedback.
