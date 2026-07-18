# Additional Enemy Roles on the Shared Activity Model

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Expand the Thrust/Slash foundation into Ranged and the remaining authored roles without changing the Tick Arena entry point. Every new enemy must reuse the existing data-owned activity, Telegraph, recovery, Guard, and terminal contracts.

## Requirements

1. Add Ranged, Charge, Bomb, Mode, and Boss data one role at a time to the shared enemy decision contract.
2. Add deterministic navigation and reservations only where multiple enemies can actually compete for a cell.
3. Preserve each role's target lock, attack shape, warning, movement, recovery, and terminal behavior as content data plus small explicit rules.
4. Keep all enemies in the same arena scenario and process them in stable order.
5. Make role identity visible through the same snapshot and event projection already used by the basic three.

## Design

The data-owned enemy activity model is the boundary; roles supply decisions and attack definitions. A role may choose a different attack or movement target, but it may not bypass the shared Tick order or resolve directly through presentation. Add roles in the smallest useful group and keep Thrust and Slash active as regression fixtures.

Navigation remains board-authoritative. If two enemies want one cell, the world resolves a deterministic winner and the loser stays in its current state for that Tick. Do not add a general pathfinding framework until a real role needs more than a one-step legal move.

### Child Overview

The children are prepared as draft implementation specs without an exploratory sketch because each boundary is already settled and independently testable. They are executable only in this order:

| Child | Focus | Current document |
| --- | --- | --- |
| A | Shared enemy action snapshot, locked attack lifecycle, and deterministic navigation | [Draft Implementation Spec](port_07_a_shared_enemy_action_and_navigation.implementation_spec.md) |
| B | Ranged distance-band movement and target-centered Cross pressure | [Draft Implementation Spec](port_07_b_ranged_enemy.implementation_spec.md) |
| C | Charge line commitment, detonation, and landing movement | [Draft Implementation Spec](port_07_c_charge_enemy.implementation_spec.md) |
| D | Bomb adjacent commitment, locked area detonation, and self-destruction | [Draft Implementation Spec](port_07_d_bomb_enemy.implementation_spec.md) |
| E | Mode attack selection, retaliation, and the Boss policy seam | [Draft Implementation Spec](port_07_e_mode_enemy_and_boss_policy.implementation_spec.md) |

Child A establishes the shared contract before any role-specific behavior lands. Children B through E extend the same `tick-arena` scenario and do not create another runtime, route, or presentation boundary.

## Non-Goals

1. Do not create one scene, runtime, or vertical slice per enemy.
2. Do not add wave scheduling, level scaling, rewards, or new player classes here.
3. Do not invent enemy roles or redesign the shared state transitions.
4. Do not preserve engine lifecycle patterns as gameplay ownership.

## Acceptance Criteria

1. Every added role runs through the same Tick order and leaves Thrust and Slash unchanged.
2. Contested movement is deterministic and produces no duplicate occupancy or stale Telegraph.
3. Role-specific attack cells remain locked from attack commitment through resolution.
4. The same browser scenario can spawn and exercise all currently enabled roles without another entry point.
