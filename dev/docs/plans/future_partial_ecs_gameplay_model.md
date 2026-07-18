# Deferred Partial ECS Gameplay Model

## Goal

Adopt a typed, data-oriented gameplay model only when the arena needs to coordinate heterogeneous active entities such as specialized enemies, autonomous structures, projectiles, hazards, and grid triggers. The model must make shared interactions easier to extend while preserving deterministic Tick resolution, one canonical gameplay state, and the existing presentation boundary.

## Requirements

1. Do not begin this work on a Port schedule or merely to standardize architecture; promote it only when approved content needs several active entity categories with shared movement, targeting, damage, collision, or grid-trigger rules.
2. Represent a gameplay entity by stable identity plus typed data components, so a role is composed from capabilities rather than forced into one expanding enemy-state shape.
3. Keep components as state only; deterministic systems, rather than entities or components, decide and apply behavior in a fixed Tick order.
4. Keep the world model as the only mutable gameplay authority for component state, grid occupancy, reservations, lifecycle cleanup, Tick progression, and encounter outcome.
5. Preserve one complete ordered semantic-event stream and snapshot projection so input, browser presentation, reset, scenario replacement, debugging, and tests retain the same contracts.
6. Allow exceptional bosses to carry explicit custom state and use dedicated behavior while still participating in the shared lifecycle, grid, damage, event, and outcome rules.

## Design

This is a future data-organization change, not a requirement that every arena object use the same behavior.

### Promotion Gate

Promote this plan only after approved gameplay simultaneously needs multiple shared-interaction categories, such as several movement or attack styles of enemy, an autonomous tower, a projectile, a triggered trap, and a persistent area hazard. The need must be demonstrated by repeated rule branching or an entity-state model that can no longer express these combinations clearly.

Do not promote it solely because more enemy roles exist. Enemy roles that continue to fit one shared activity model should remain data-defined within that model.

### Ownership Model

Each gameplay participant has a stable identity and may carry typed data for capabilities such as position, footprint, health, defense, faction, attack intent, movement intent, cooldown, projectile travel, trigger state, area hazard, status effect, or boss state.

The world owns all mutable data and enforces shared invariants. A system determines when a transition occurs; the world applies the transition only when it preserves legal grid placement, occupancy, reservation, target, and lifecycle rules. No view, input layer, or asynchronous callback may mutate gameplay state.

Components contain no self-updating behavior. Entities do not run per-entity update methods. Systems select the component combinations they own and resolve them in an explicit, deterministic order.

### Deterministic Resolution

The future Tick pipeline must make ordering visible and stable:

```text
player command
-> existing status and timer updates
-> intent and Telegraph creation
-> movement and charge resolution
-> grid triggers and persistent hazards
-> autonomous attacks and projectile travel
-> damage, death, and lifecycle cleanup
-> encounter outcome
-> ordered semantic events and snapshot
```

Each phase must use stable entity ordering and produce deterministic results for the same initial state, seed, and command sequence. Damage, death, occupancy release, reservation cleanup, Telegraph cleanup, and outcome evaluation remain shared lifecycle rules rather than being reimplemented by individual enemy, tower, trap, or boss behaviors.

### Composition Examples

| Gameplay role | Composed capabilities |
| --- | --- |
| Slash or Thrust enemy | Position, Health, Guard, facing, attack intent, Telegraph, and role-specific decision data |
| Suicide, Charge, or Dash enemy | Position, Health, movement intent, attack or fuse state, and role-specific decision data |
| Arrow tower | Position, cooldown, target selection, and projectile spawning |
| Flame tower | Position, cooldown, target selection, and area attack |
| Trap | Position, grid trigger, and attack payload |
| Fire floor | Persistent grid-area hazard, whether represented as arena effect data or a gameplay participant |
| Boss | Shared position, health, and lifecycle data plus explicit boss state and dedicated behavior |

The boss exception is intentional. A boss does not need to be decomposed into generic components when its phase machine or pattern state is clearer as custom data, but it must not bypass deterministic ordering or shared cleanup.

### Presentation Contract

The simulation continues to complete state transitions before presentation starts. The browser projects snapshots and consumes ordered semantic events for visual and audio feedback; feedback timing cannot delay or alter gameplay. Reset, scenario replacement, and teardown continue to invalidate old presentation work so stale callbacks cannot alter a replacement arena.

## Non-Goals

1. Do not introduce a generic ECS framework, plugin registry, dynamic system scheduler, or string-keyed component bag.
2. Do not convert the current gameplay model before the promotion gate is met.
3. Do not require every entity type, especially bosses and terrain effects, to share one generic behavior implementation.
4. Do not change combat rules, Tick timing, event ordering, player-visible feedback, or existing scenario behavior as an incidental result of the model migration.
5. Do not make Pixi, React, GSAP, browser APIs, or persistence part of the deterministic gameplay model.

## Acceptance Criteria

1. When this plan is promoted, the approved heterogeneous gameplay content can compose and share movement, targeting, damage, projectile, trigger, and hazard rules without duplicating lifecycle or grid-cleanup logic per role.
2. The same initial state, seed, and command sequence produce the same ordered semantic events, snapshots, damage, occupancy, and encounter outcome before and after the migration.
3. Boss-specific behavior can retain custom state while participating in the shared deterministic Tick and lifecycle rules.
4. The browser continues to present snapshots and events without owning gameplay state, and reset or scenario replacement leaves no stale visual, callback, projectile, hazard, or pending presentation work.
