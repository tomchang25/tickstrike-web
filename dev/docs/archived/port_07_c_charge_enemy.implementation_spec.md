# Charge Enemy Live Target Impact and Displacement

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate Charge as a Heavy enemy that telegraphs a live cardinal charge target, displaces entities along the charge path, and resolves a deterministic impact and landing. Charge keeps the shared enemy lifecycle and phase authority; it does not introduce a separate runtime or Godot-style state Node.

## Summary

Charge uses the authored `charge` attack, Heavy Guard, 150 HP, 8 damage, two warning ticks, and two recovery ticks. It attacks a Player on a legal cardinal path one to five cells away, while movement planning prefers origins two to five cells from the Player. During warning, Charge tracks the live Player position whenever it remains on a legal range path; otherwise it retains the most recently valid target.

At detonation, every non-target entity on the target path attempts to move one cell sideways in an alternating Charge-relative direction. A blocked primary side retries the other side; an entity blocked on both sides remains in place and takes Charge damage. The current occupant of the target cell is the impact target. When its forward knockback destination is free, it is knocked one cell forward, damaged normally, and Charge occupies the target cell. When that destination is blocked by terrain, water, arena bounds, or another entity, the target remains in place, takes exactly double damage, and Charge lands at the nearest free path cell before the target or remains at its origin. The blocked impact exposes a semantic outcome for a distinct hurt VFX.

## Relational Context

- Charge uses the shared `ready -> telegraphing -> recovering -> ready` lifecycle. Its decision code declares an ordinary move, attack, or wait decision and never mutates World directly.
- Normal enemy committed cells remain locked. Charge is the explicit exception: commitment locks its attack identity, origin, maximum range, and warning/recovery values, while its target cell, facing, path, and telegraph cells are refreshed during warning only when the live Player is on a legal cardinal range path.
- `World` owns the three ordered state operations: detonation and damage evaluation, atomic Charge impact/landing resolution, and recovery entry. `enemy-phase.ts` calls those operations in order and emits their semantic results; it must not validate or apply placement itself.
- Charge path cells run from the cell immediately in front of Charge through the current target cell. The target cell receives impact handling, not the alternating side-displacement rule.
- World evaluates all path occupants, alternate-side displacement attempts, target knockback, blocked impact, and Charge landing from one detonation-start snapshot. It commits the accepted final placements atomically so entity iteration order cannot affect occupancy or damage.
- A side-blocked entity remains in place and takes normal Charge damage. Charge may traverse that intermediate cell as a transient impact path but never shares a final footprint with it.
- The current target-cell occupant receives the target impact even if the Player moved away during warning. If the Player is not on a legal range path, Charge retains its latest target rather than rebuilding an arbitrary attack from live state.
- Water is an invalid displacement and landing destination. Charge displacement does not create drowning, collision damage, chain pushes, or multi-cell movement budgets.
- `CombatEvent` carries generic displacement, Charge impact outcome, normal/double damage, target death, and landing information. Presentation consumes those events and cannot decide damage, target selection, displacement, or landing.
- The foundation arena gains one deterministic Charge fixture without changing existing fixture identities or positions. A dedicated Charge scenario supplies blockers and controlled Player movement for browser-visible Charge assertions.

## Scope

### Included

- Charge role activation and Heavy Guard integration.
- Live warning-time target, facing, path, and telegraph updates for a Player on a legal one-to-five-cell cardinal range path.
- Alternating side displacement, opposite-side retry, blocked-side damage, target forward knockback, blocked double impact, and atomic landing.
- Ordered detonation/damage, Charge impact/landing, then recovery APIs and semantic events.
- A Charge fixture in the foundation arena plus a dedicated deterministic Charge scenario.
- Charge Skull sprite packaging, renderer loading, presentation profile, normal impact feedback, blocked-impact hurt VFX, unit coverage, and browser coverage.

### Excluded

- Collision damage beyond the defined normal or blocked Charge impact damage.
- Chain pushes, water displacement, drowning from Charge displacement, forced displacement outside Charge, or persistent multi-cell movement.
- Boss behavior, general behavior trees, wave scheduling, enemy levels, or player Mobility changes.

## Files to Change

| File                                                  | Change Size | Purpose                                                                                                           |
| ----------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/core/enemies/enemy-actions.ts`                   | Large       | Add Charge range-path selection, preferred planning origins, and warning-time target refresh data.                |
| `src/core/actions/enemy-phase.ts`                     | Large       | Order Charge detonation/damage, impact/landing, telegraph changes, and recovery without owning placement rules.   |
| `src/core/world/world.ts`                             | Large       | Split detonation, atomic Charge impact/landing, and recovery entry; preserve placement and terminal invariants.   |
| `src/core/events/combat-events.ts`                    | Medium      | Add generic displacement and Charge impact/landing outcome events.                                                |
| `src/harness/fixtures/shipped-arena.ts`               | Medium      | Add the authored Charge fixture while preserving existing foundation fixtures.                                    |
| `src/harness/scenarios/charge-enemy.scenario.ts`      | Medium      | Define deterministic normal, blocked, and retargetable Charge browser setups.                                     |
| `src/content/enemies/assets/skull-sprite-sheet.png`   | Small       | Package the authored Charge runtime sprite from the Skull SpriteSheet source.                                     |
| `src/presentation/pixi/PixiGameRenderer.ts`           | Small       | Import and load the Charge Skull texture.                                                                         |
| `src/presentation/pixi/enemy-sprites.ts`              | Medium      | Add the standalone Charge profile and normal/blocked impact feedback surfaces.                                    |
| `src/presentation/timelines/PresentationDirector.ts`  | Medium      | Present displacement, landing, and blocked-impact feedback with cleanup.                                          |
| `test/unit/core/enemies/charge-enemy-actions.test.ts` | Large       | Assert range, preferred planning, retargeting, and path construction.                                             |
| `test/unit/core/world/world.test.ts`                  | Large       | Assert atomic displacement, normal and blocked impact, fallback landing, damage, occupancy, and terminal cleanup. |
| `test/e2e/testbed.spec.ts`                            | Large       | Observe Charge telegraph retargeting, displacement, normal/blocked impact, reset cleanup, and idle presentation.  |

## Execution Outline

1. Add focused Charge decision tests for one-to-five-cell cardinal range, two-cell planning preference, warning retargeting, out-of-range target retention, and deterministic path order.
2. Split World attack resolution into detonation/damage, Charge impact/landing, and recovery entry. Add atomic world tests before routing Charge through the enemy phase.
3. Emit the ordered displacement, impact, damage, landing, telegraph, and recovery events; connect the live-target Charge branch without changing ordinary locked attacks.
4. Add the Charge fixture and dedicated scenario, package and load the Skull sheet, then verify normal and blocked impact presentation reaches idle after reset.

## Implementation Notes

- A legal Charge range path is cardinal, has distance one through five from the Charge origin to the Player, and contains only legal terrain. The target cell is included; no cells beyond it are needed for path validation.
- During warning, refresh Charge target/facing/path and telegraph only when the live Player satisfies that range rule. If not, preserve the last valid target and path. Emit a non-clearing telegraph change only when the projected cells change.
- Movement planning ranks legal Charge origins at target distance two through five before other candidates. An already adjacent Player remains an immediate valid attack target.
- At detonation, enumerate non-target path occupants in origin-to-target order. For path index one, try Charge-relative right first; for index two, left first; alternate thereafter. If the primary destination is illegal, occupied, reserved, or water, try the other side. If both fail, retain the entity and apply normal Charge damage without a chain push.
- Treat the final target-cell occupant as the impact target regardless of kind. Its forward destination is one cell beyond target in Charge-facing direction. If that destination is legal, unoccupied, unreserved, and not water, move the target there and apply normal Charge damage. Otherwise retain it, apply exactly `2 * committedAttack.damage`, and mark the impact blocked.
- For a blocked target impact, select Charge's landing by scanning target-adjacent path cells back toward the origin and choose the first legal, unoccupied, unreserved cell after accepted displacement results. If none exists, Charge remains at its origin. Charge never shares a final footprint with an entity.
- Apply all accepted placements and damage as one World transaction. A rejected placement must leave occupancy, reservations, footprints, and unrelated entities unchanged.
- Preserve semantic ordering: detonation and impact damage results, accepted displacement events, Charge landing, cleared telegraph, then recovery. A blocked impact emits a Charge-specific outcome before presentation consumes the generic damage event.
- A Charge death, Guard break, or terminal transition during warning clears the telegraph and pending live-target data. No retarget, impact, landing, or recovery event occurs afterwards.
- Package `assets/Ninja Adventure - Asset Pack/Actor/Monster/Skull/SpriteSheet` as `src/content/enemies/assets/skull-sprite-sheet.png`. Use nearest-neighbour filtering, a standalone profile, and the existing directional pose convention.

## Edge Cases

| Case                                                                         | Expected Handling                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Player moves to another legal range path during warning                      | Refresh target, facing, path, and telegraph to the Player's new cell.                                        |
| Player leaves Charge range during warning                                    | Preserve the latest valid target; its current occupant receives detonation effects.                          |
| Target cell is empty at detonation                                           | Charge lands on the target cell when legal and applies no target damage.                                     |
| A non-target path entity has one free side                                   | Move it to that side without damage.                                                                         |
| A non-target path entity has no free side                                    | Keep it in place and apply normal Charge damage; Charge may traverse it transiently.                         |
| Target forward cell is wall, water, outside the arena, reserved, or occupied | Keep target in place, apply double damage, emit blocked impact, and land Charge before target when possible. |
| Target-adjacent fallback landing cell is occupied                            | Scan backward toward the Charge origin; remain at origin when no legal path cell exists.                     |
| Player is adjacent to Charge                                                 | Charge may attack. A blocked forward target leaves Charge at origin and deals double damage.                 |
| Charge dies or is Guard-broken while telegraphing                            | Clear telegraph and pending live-target data without detonation, landing, or recovery.                       |

## Acceptance Criteria

1. Charge attacks a Player on a legal cardinal path one through five cells away, while movement planning prefers a two-through-five-cell origin and still attacks an adjacent Player.
2. During warning, Charge updates only to a live legal Player target; when the Player leaves range, it deterministically resolves against the last valid target cell and its current occupant.
3. Path entities alternate side displacement, retry the opposite side, and take normal Charge damage only when neither side is legal.
4. A target with a legal forward destination is knocked forward, takes normal damage, and yields its cell to Charge; a blocked target takes exactly double damage, remains in place, and triggers the blocked-impact semantic result and VFX.
5. All displacement, damage, and landing outcomes preserve atomic World occupancy and leave no reservations, telegraphs, or presentation timelines after death or reset.
