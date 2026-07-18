# Base Enemy HP and Hit Resolution

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Draft implementation spec

## Goal

Add the first canonical enemy combat result to the existing Tick Arena. Normal Attack must damage an adjacent living enemy through core-owned rules, while player and enemy HP mutations remain deterministic and terminal cleanup remains independent from presentation timing.

## Summary

The current entity model already stores `hp`, `maxHp`, and `phase`, but the current Normal Attack only emits `player_attacked` and advances the Tick. This child adds a shared basic hit result and world-owned damage mutation without adding enemy AI, facing, Telegraph commitment, or Guard yet.

The result is intentionally extensible: it starts with attacker, target, HP damage, and killed state so 04.2 can use the same mutation seam for enemy attacks and 04.3 can add direction, Guard, Defense, and Stagger fields. The existing empty adjacent attack remains an accepted whiff. The current Ranged entity remains a passive foundation fixture until P7; only Thrust and Slash receive combat behavior in P4.

## Relational Context

- `action-resolver.ts` remains the only command-to-core entry point. Its Normal Attack branch reads the player from `World`, calculates the adjacent target and hit result, applies the result through `World`, then continues through the existing accepted-action boundary.
- `World` owns mutable HP, entity phase, occupancy, reservations, Telegraph cleanup, tick, and snapshots. Preview helpers remain read-only and must not mutate HP or phase.
- `EntityState.hp` and `maxHp` remain canonical. Do not create a React-side health value, a renderer-side damage calculation, or a second enemy record that can disagree with the world snapshot.
- An HP result reaching zero must use the existing terminal transition path so occupancy, the entity reservation, and its source-owned Telegraph are released immediately while the terminal entity record remains queryable.
- `CombatEvent` is the semantic bridge to `PresentationDirector`; combat events are emitted after core mutation has completed. `ActionResolution.events` remains the gameplay-result view and `semanticEvents` remains the ordered stream recorded by `World.lastEvents`.
- `GameRuntime` publishes the post-resolution snapshot before awaiting GSAP presentation. Presentation may animate the result but cannot decide damage, death, or Tick advancement.
- `shipped-arena.ts` currently creates three entities with 10 HP and keeps the Ranged fixture. The implementation must make Thrust and Slash use the authored basic-enemy HP contract without deleting the existing Ranged fixture or inventing a second scenario.

## Scope

### Included

- A pure basic HP hit result and world-owned damage application.
- Normal Attack damage against an adjacent living enemy.
- Canonical player HP damage entry point for later committed enemy attacks.
- Damage, hit, and death semantic events.
- Deterministic unit coverage for hit, whiff, overkill, inactive targets, and terminal cleanup.

### Excluded

- Enemy facing, movement, activity transitions, Telegraph commitment, warning countdown, and recovery.
- Directional results, Guard, Defense, Stagger, Protection, Dash damage, and invulnerability.
- Win/defeat flow and final combat presentation, which belong to 04.4 and P5.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Add typed basic hit-result data and any canonical combat state needed by HP-only resolution. |
| `src/core/world/world.ts` | Medium | Own atomic HP mutation, terminal transition, and player damage access. |
| `src/core/actions/action-preview.ts` | Medium | Project whether an adjacent target exists and the shared basic hit result without mutation. |
| `src/core/actions/action-resolver.ts` | Medium | Apply Normal Attack results while preserving accepted whiff and tick behavior. |
| `src/core/events/combat-events.ts` | Medium | Add typed hit, damage, and death semantic payloads. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Align Thrust and Slash fixture HP with authored basic-enemy content while retaining current fixture IDs. |
| `test/unit/core/actions/action-resolver.test.ts` | Medium | Assert occupied-target damage, whiff compatibility, event order, and tick behavior. |
| `test/unit/core/world/world.test.ts` | Medium | Assert atomic damage, overkill, terminal occupancy release, and snapshot copying. |

## Execution Outline

1. Extend the core result and event types, then add world-owned damage and terminal mutation while preserving existing spawn, movement, and reset behavior.
2. Add read-only attack preview output and switch the Normal Attack resolver from a whiff-only event to the shared hit result; keep empty and non-enemy adjacent targets accepted without damage.
3. Align the Thrust and Slash fixture HP with authored content and leave the Ranged fixture passive for P7.
4. Add focused unit assertions for accepted hits, empty whiffs, overkill, terminal release, rejected inactive actions, and exact semantic event order.

## Implementation Notes

- Use the existing player attack content as the damage source; do not hardcode a second Normal Attack value in the action resolver.
- Apply HP damage atomically and clamp current HP at zero. A hit against a dead, drowning, or missing entity produces no mutation.
- Preserve `command_resolved -> player result/combat events -> world_advanced` ordering for this child. 04.2 will insert enemy-phase events before the terminal `world_advanced` event.
- Death must not remove the entity record immediately. The existing world contract retains terminal records for snapshots and lets presentation remove the visual later.
- Do not let an empty attack target become a rejected command; the current Port 03 whiff behavior is part of the compatibility contract.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Empty adjacent target | Accept the Normal Attack, emit the player attack result, apply no damage, and advance one Tick. |
| Adjacent non-enemy entity | Accept the command but do not apply enemy damage. |
| Damage equal to current HP | Set HP to zero, enter `dead`, release occupancy immediately, and emit one death result. |
| Damage greater than current HP | Clamp HP to zero and emit the same single terminal result without duplicate death events. |
| Inactive player or non-cardinal direction | Reject without HP, phase, event, or Tick mutation. |
| Reset during death presentation | Keep old visual cleanup generation-scoped; the replacement world starts without the old entity ownership. |

## Acceptance Criteria

1. A Normal Attack damages an adjacent living Thrust or Slash through core state, while an empty target remains an accepted whiff.
2. HP, phase, occupancy, reservations, and Telegraph cleanup remain consistent after damage and death.
3. The same basic hit result drives preview-compatible data and committed mutation without presentation-side combat logic.
4. Focused unit tests prove deterministic damage, overkill, event order, rejected actions, and terminal cleanup.
