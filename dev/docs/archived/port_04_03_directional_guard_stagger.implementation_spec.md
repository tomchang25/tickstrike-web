# Directional Guard, Stagger, and Protection

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Implemented and verified

## Goal

Extend the shared hit result with directional Guard combat for Thrust and Slash. Front, Side, and Back outcomes must update Guard, HP, Defense, Stagger, Protection, and enemy activity synchronously before presentation starts.

## Summary

The content catalog contains Small Guard data with base 32, Stagger 3, Protection 5, and Protection multiplier 0.5, and Thrust/Slash reference that profile. The implementation adds deterministic Guard state and directional resolution through the existing 04.1 hit seam rather than introducing a second combat calculation.

The selected reference behavior is explicit: Front, Side, and Back apply 4, 16, and 32 Guard damage; surviving Guard reduces HP damage to 20%; a Guard-breaking hit receives full HP damage after Defense. The reference source contains directional HP-bypass constants that are not used by its effective resolver path, so this spec follows the effective 0.2 guarded-damage behavior.

## Relational Context

- Direction classification reads the attacker origin cell and target cardinal facing. It is a pure core calculation and must return no directional hit for a missing, same-cell, or invalid-facing relationship.
- The shared hit resolver consumes an immutable target combat snapshot and returns all calculated values before mutation: angle, Guard damage, HP damage, Defense-adjusted damage, Guard break, Stagger burst flag, kill, and feedback classification.
- `World` owns Guard current/max values, Stagger and Protection countdowns, enemy activity, committed-attack cancellation, HP mutation, and snapshots. Guard data must not live in presentation or content definitions as mutable state.
- The existing `GuardDefinition` remains immutable authored content. Runtime Guard state is initialized from the referenced definition and reset from that definition; do not duplicate Small Guard constants in attack code.
- A Guard break must clear the enemy's committed attack, Telegraph, recovery, and action eligibility before entering `staggered`. This is the interruption contract between 04.2 and 04.3.
- Stagger and Protection advance in the global enemy status stage before the ready-enemy action stage. A staggered or recovering enemy cannot act or bank an action in the same Tick it is disabled.
- Normal Attack preview and commit must call the same calculation. Presentation consumes the result and status snapshot through semantic events but never applies Guard or HP changes.

## Scope

### Included

- Front/Side/Back direction classification from cardinal facing.
- Guard current/max state initialized from authored Guard content.
- Guard damage, guarded HP damage, Guard break, and Defense formula.
- Three-Tick Stagger, Guard restoration, five-Tick Protection, and half Guard damage during Protection.
- Guard-break cancellation of committed attacks, recovery, reservations, and Telegraphs.
- Unit coverage for preview/commit agreement and status cleanup.

### Excluded

- Dash/Smash stagger burst, Mobility invulnerability, cooldowns, Chain Dash, Execution, Guard Shredder, and Artifacts.
- New Guard profiles, enemy roles, waves, level scaling, and class selection.
- Status-specific visual polish, which belongs to 04.4.

## Files to Change

| File                                             | Change Size | Purpose                                                                                 |
| ------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------- |
| `src/core/model/types.ts`                        | Large       | Add directional result, Guard runtime, and Stagger/Protection activity snapshot data.   |
| `src/core/combat/directional-hit.ts`             | Medium      | Classify Front/Side/Back and calculate the shared directional hit result.               |
| `src/core/world/world.ts`                        | Large       | Own Guard/status mutation, countdown advancement, and Guard-break interruption cleanup. |
| `src/core/actions/action-preview.ts`             | Medium      | Return the same directional hit projection used by Normal Attack commit.                |
| `src/core/actions/action-resolver.ts`            | Medium      | Apply the shared Guard/HP result and preserve ordered enemy-phase status handling.      |
| `src/core/events/combat-events.ts`               | Large       | Add directional hit, Guard, Stagger, Protection, and interruption events.               |
| `src/content/enemies/enemy-definitions.ts`       | Small       | Continue using existing Small Guard content and expose no mutable runtime state.        |
| `test/unit/core/combat/directional-hit.test.ts`  | Large       | Assert angle classification, formulas, ordering, and preview/commit parity.             |
| `test/unit/core/world/world.test.ts`             | Medium      | Assert status countdown, interruption, reset, and terminal cleanup.                     |
| `test/unit/core/actions/action-resolver.test.ts` | Medium      | Assert committed Normal Attack outcomes and event order.                                |

## Execution Outline

1. Add pure angle and hit-result calculations with the reference constants and formulas; cover Front, Side, Back, no-result, Guarded, break, and Defense cases.
2. Add runtime Guard, Stagger, and Protection state initialized from the existing Guard content and expose copied snapshot values.
3. Integrate the result into Normal Attack preview and commit, then connect Guard-break cancellation to the 04.2 committed-attack lifecycle.
4. Add countdown, reset, terminal, event-order, and preview/commit tests without adding presentation-specific status ownership.

## Implementation Notes

- Direction classification must use target facing, not the last player movement command or the visual rotation of a Pixi object.
- Apply the guarded-versus-full-damage decision before Defense. Use `amount * amount / (amount + defense)` when Defense is positive and preserve amount when Defense is zero.
- A surviving Guard uses 20% of base HP damage. A hit that reduces Guard to zero uses full base HP damage for that hit.
- Protection multiplies ordinary Guard damage by 0.5. It does not reduce HP damage, and it must not protect a Guard-break cancellation from happening when the post-multiplier Guard damage reaches current Guard.
- Guard break is a single logical transition. It must not emit duplicate stagger, Telegraph-clear, death, or recovery events when the same hit also kills the enemy.
- Stagger exit restores Guard to maximum and starts Protection. The Stagger-ending Tick does not also consume one Protection Tick.

## Edge Cases

| Case                                           | Expected Handling                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Same-cell or zero-facing attacker relationship | Return no directional hit and apply no Guard/HP result.                                                                      |
| Side or Back hit against protected Guard       | Apply the Protection multiplier to Guard damage before break evaluation.                                                     |
| Guard-breaking hit                             | Apply full Defense-adjusted HP damage, clear committed attack/recovery, and enter Stagger once.                              |
| Hit during Stagger                             | Do not apply ordinary Guard damage; use the defined HP hit path and do not restart Stagger.                                  |
| Stagger countdown reaches zero                 | Restore Guard, begin five Protection Ticks, and leave the enemy unable to act until the next eligible phase.                 |
| Reset or terminal death                        | Remove current Guard damage, Stagger, Protection, committed attack, Telegraph, and reservations from the new/terminal state. |

## Acceptance Criteria

1. Front, Side, and Back classify from facing and apply 4, 16, and 32 Guard damage respectively.
2. Surviving Guard reduces HP damage to 20%, a Guard-breaking hit applies full Defense-adjusted damage, and preview and commit agree.
3. Guard break cancels pending attack and recovery, Stagger blocks action for three Ticks, and Stagger exit restores Guard before five Protection Ticks.
4. Unit assertions prove formula ordering, interruption, status countdown, event order, reset cleanup, and terminal cleanup.
