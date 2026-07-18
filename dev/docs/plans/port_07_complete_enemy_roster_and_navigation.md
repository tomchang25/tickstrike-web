# Complete Enemy Roster and Navigation

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../port-ref/tickstrike)

## Goal

Deliver Batch 7 of the Tickstrike Full Port Roadmap by porting every shipped enemy role and the shared navigation, reservation, facing, and combat-runtime rules they require. This establishes complete encounter vocabulary before authored waves are introduced.

## Requirements

1. Implement deterministic pathfinding, step consumption, attack-position intent, and movement reservation arbitration for all shipped enemy movement.
2. Preserve reservation priority: active movement step, then attack-position intent, then shorter distance to the player, then earlier registration order.
3. Implement Slash, Ranged, Charge, Bomb, Mode, and Mode Boss behavior in addition to the accepted Thrust foundation.
4. Preserve each role's shipped target locking, attack footprint, warning, movement, recovery, self-destruction, attack-cycle, and retaliation behavior.
5. Apply class combat, Guard, the shipped delayed hit-facing response, Stagger, Protection, death, and level-ready stat seams consistently across every role.
6. Present each shipped enemy identity, facing, prepare/commit state, attack telegraph, damage response, status, and terminal sequence.

## Design

Role contracts include:

| Role | Distinguishing shipped behavior |
| --- | --- |
| Slash | Front lateral three-cell sweep with its authored warning. |
| Ranged | Maintains Manhattan distance three to five and locks a five-cell cross on the player's commit-time cell. |
| Charge | Commits a forward line up to five cells, then travels to the farthest legal cell with authored damage and recovery. |
| Bomb | Commits a radius-four blast when adjacent and self-destructs after detonation. |
| Mode | Selects among its authored attack cycle and gains post-Stagger retaliation for ten ticks. |
| Mode Boss | Uses the Mode behavior with Boss data, scale, Guard, Defense, and presentation; it is not a separate Boss AI. |

Navigation is deterministic and board-authoritative. Enemy decision behavior should be represented as explicit gameplay state and decisions, not recreated Godot state-machine nodes.

## Non-Goals

1. Do not implement a proposed backline ambusher, collision Charge redesign, multi-step action redesign, or forced displacement.
2. Do not invent a distinct Mode Boss behavior.
3. Do not implement wave scheduling, spawn warnings, or level formulas beyond the seams needed by enemies.
4. Do not preserve scene inheritance or per-scene lifecycle wiring.

## Acceptance Criteria

1. Every shipped enemy role has deterministic scenarios matching its decision, commitment, attack, movement, recovery, and terminal outcomes.
2. Contested navigation and reservation scenarios produce the reference winner and loser behavior in every priority tier.
3. Ranged, Charge, Bomb, Mode, and Mode Boss preserve their role-specific target-locking and state transitions.
4. The shipped delayed hit-facing response waits for a funded enemy action and does not advance on a free player action.
5. Unit coverage proves each role and the shared path, reservation, attack, and retaliation contracts.
6. Pixi/GSAP and Playwright acceptance prove browser-visible identity and combat behavior for every role with no stale reservation, telegraph, or terminal visual.
