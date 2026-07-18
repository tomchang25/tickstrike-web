# Smash Displacement and Terrain

Parent Plan: `port_06_character_classes_and_mobility.md`
Status: Implemented

## Goal

Extend the Port 06 Smash action with its authored impact aftermath: crushing the impact-cell enemy, forcing surrounding enemies away, and sending victims into water. These effects must remain deterministic post-hit outcomes in the same Tick Arena rather than becoming a second Smash combat runtime.

## Summary

Port 06 first establishes the shared directional Mobility hit contract. Port 06a then adds a separate post-hit displacement result to Smash. The shared hit calculation still decides angle, Guard, HP damage, Defense, Stagger, and interruption; the displacement layer decides only whether an already-resolved victim is crushed, moved, or sent into water.

At release, the locked Smash target and 3x3 area are read from one plan. The impact cell may contain an enemy only when that enemy is the crush victim; the player lands there after the crush releases occupancy. Other occupied or blocked landing cells remain illegal. All eligible enemies receive the shared directional hit prediction first. A living enemy on the impact cell is then terminalized as crushed. Other living, non-killed victims receive a deterministic forced-displacement attempt of up to two cells away from the impact center. The farthest legal cell is chosen; a water destination enters the existing drowning terminal phase and emits the existing water event.

The preview returns these post-hit results, including crush, landing destination, blocked displacement, and water terminalization. Commit applies that plan synchronously before the enemy phase. Pixi/GSAP presents the existing semantic crush, knockback, and water timelines; animation timing never determines logical placement or terminal state.

## Recovered Prototype Reference

The Port 06 diff intentionally removed the old Smash aftermath. The following behavior is retained here as migration reference for 06a, not as permission to restore the old second damage path:

- The old release checked the armed impact cell for a center enemy and emitted `enemy_crushed` after immediately terminalizing that enemy. This happened before the surrounding-victim loop and did not produce a normal damage event for the crush.
- Every other living enemy in the 3x3 area received the old Mobility damage helper, then attempted forced displacement only if it remained alive.
- The old knockback direction used the enemy-cell minus impact-cell delta. It selected the dominant horizontal axis when `abs(delta.x) > abs(delta.y)`; otherwise it selected the vertical axis. A perfectly diagonal relationship therefore resolved vertically, and the impact cell itself produced no direction.
- The old destination search tried two cells first, then one cell, along that direction. It rejected out-of-bounds cells, walls, and cells occupied by a living entity. It did not reject water; water was intentionally accepted as a terminal destination.
- A water destination called the existing terminal placement path with `drowning` and emitted `enemy_entered_water` with the pre-water and water cells. A land destination emitted `enemy_knocked` with the pre/post cells.
- The old event shape was `smash_impact`, optional center `enemy_crushed`, each victim's `enemy_damaged` followed by optional displacement event, then `actor_moved`, enemy phase, and `world_advanced`.

The old `smash-water` fixture and its prose were not fully consistent: the fixture placed the nominal center enemy at `(3,2)` while the armed target was `(4,3)`, so the center-crush branch was not exercised. Its assertions observed that victim moving to `(3,1)`, the right victim moving to `(7,3)`, and the lower victim entering water at `(4,6)`. 06a should preserve these authored scenario intentions only after re-expressing them through the shared hit result, deterministic preview, occupancy contract, and typed terminal events defined below.

## Relational Context

- This spec depends on Port 06's shared Mobility plan and directional hit result. It must not reintroduce the basic-damage helper or direct center-cell death as an alternative combat calculation.
- `World` remains the sole authority for occupancy, reservations, entity phase, and final displacement application. Preview reads a snapshot and never reserves, moves, damages, or terminalizes an entity.
- Smash release resolves all directional hits against the release snapshot before applying displacement. Displacement decisions use the victims' pre-displacement cells and a stable order; earlier movement can affect later destination occupancy only through the authoritative world application.
- The impact cell is a special landing exception: an enemy occupant is crushable and may be replaced by the player after it becomes terminal. A player, reservation, wall, water target cell, or non-crushable occupant keeps the Smash landing illegal.
- Crush, knockback, and water-fall are semantic results emitted by core and consumed by `PresentationDirector`. Pixi/GSAP may animate them but never chooses the destination, water transition, or terminal phase.
- A water-fall uses the existing `drowning` terminal phase and `enemy_entered_water` event. It must release occupancy immediately while presentation keeps the visual until its timeline completes.
- Forced displacement does not alter enemy AI, Telegraph countdown, Guard state, or player invulnerability. A Guard break or lethal shared hit has already applied its normal interruption and terminal cleanup before displacement begins.
- The deterministic scenario owns terrain, victim placement, facing, and reservations. Unit tests assert logical displacement; Playwright asserts the visible cell/state/event result and waits for the existing runtime idle contract.

## Scope

### Included

- Smash impact-cell crush as a post-hit terminal effect.
- Deterministic two-cell maximum knockback for other eligible living victims.
- Stable cardinal displacement direction from the impact center, including a deterministic tie rule.
- Occupancy, reservation, wall, boundary, and water handling for forced displacement.
- Preview/commit agreement for crush, displacement destination, blocked victims, and drowning.
- Reuse of existing semantic events and GSAP terminal cleanup, plus focused unit/scenario/browser coverage.

### Excluded

- Dash displacement, chain reactions, Chain Dash, or any Artifact-triggered forced movement.
- Player forced displacement, player damage from terrain, or a new terrain damage system.
- Diagonal knockback, pull effects, multi-step pathfinding, or displacement through walls/entities.
- A second Smash damage/Guard resolver or frame-driven resolution.
- New drowning mechanics beyond the existing terminal phase and presentation behavior.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Define typed Smash displacement predictions and semantic result data. |
| `src/core/world/world.ts` | Medium | Apply forced movement and water terminalization through existing occupancy/phase ownership. |
| `src/core/actions/action-preview.ts` | Large | Extend the shared Smash plan with post-hit displacement predictions. |
| `src/core/actions/player-actions.ts` | Large | Apply shared Smash hits, then crush/knockback/water results in deterministic order. |
| `src/core/events/combat-events.ts` | Small | Add or refine typed displacement event payloads if the existing events cannot carry the resolved result. |
| `src/harness/scenarios/smash-water.scenario.ts` | Medium | Establish fixed crush, blocked knockback, land knockback, and water victims. |
| `src/presentation/timelines/PresentationDirector.ts` | Medium | Keep crush, knockback, and water timelines aligned with the new event ordering and cleanup. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Small | Expose any semantic preview markers needed for displacement acceptance. |
| `test/unit/core/actions/action-preview.test.ts` | Medium | Assert pure Smash displacement predictions and preview/commit inputs. |
| `test/unit/core/actions/action-resolver.test.ts` | Large | Assert crush, deterministic knockback, blocked destinations, and water phase transitions. |
| `test/unit/core/world/world.test.ts` | Medium | Assert occupancy release and terminal placement for forced displacement. |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Medium | Assert every displacement timeline settles and terminal views are removed. |
| `test/e2e/testbed.spec.ts` | Medium | Replace the Port 06 Smash-only assertions with the complete aftermath contract. |
| `test/e2e/smash-displacement.spec.ts` | Medium | Assert browser-visible crush, land knockback, water state, event order, and idle cleanup. |
| `README.md` | Small | Document the restored Smash aftermath sample. |

## Execution Outline

1. Re-read the landed Port 06 Mobility preview/result types and preserve their hit-result contract before adding displacement data.
2. Add pure displacement geometry and typed predictions, including crush eligibility, stable victim ordering, dominant cardinal direction, farthest legal destination, and water classification.
3. Add focused unit tests for all geometry and occupancy cases before changing Smash commit behavior.
4. Apply shared hit results first, then apply post-hit displacement through `World`; update event ordering so logical terminal phases precede presentation cleanup.
5. Restore the deterministic Smash terrain fixture and connect the existing GSAP events without making animation frames authoritative.
6. Add Playwright assertions for the complete scenario, then promote this draft only after Port 06 has landed and all coordinates are revalidated against the live codebase.

## Implementation Notes

- Crush applies only to an enemy occupying the locked impact cell at release. The preview must allow that enemy as the one legal landing exception and must show its terminal result. An enemy arriving on the impact cell after preview is recomputed is handled by the commit-time plan and cannot be silently overwritten.
- The shared directional hit is resolved before crush. The crush result is a post-hit terminal effect, not damage, and therefore does not alter Guard or Defense numbers. The event stream must make both results observable without emitting duplicate death semantics.
- Non-center victims are considered in stable `entity.id` order after the center result. A victim that was killed by the shared hit, already terminal, or removed by an earlier effect receives no displacement.
- Forced displacement chooses the candidate at distance two before distance one along the dominant cardinal direction away from the impact center. A perfectly diagonal relationship resolves to the vertical direction; this tie rule must be explicit and tested.
- A destination is legal only when inside the arena, not a wall, not occupied by another active entity, and not reserved by another owner. Water is a valid forced-displacement destination and is terminalized immediately after placement validation.
- The player lands after crush/displacement resolution. A non-crush victim cannot remain on the landing cell; the landing plan must reject any state that would leave the player and an active enemy sharing occupancy.
- `enemy_crushed` is the terminal semantic for the explicit center effect. `enemy_knocked` carries the pre/post land cells. `enemy_entered_water` carries the pre/water cells and is followed by the existing visual sink timeline.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Smash impact cell is empty | No crush result; the player lands normally and surrounding victims still resolve hit/displacement. |
| Smash impact cell contains an enemy | Treat it as the crush victim only; resolve its shared hit, terminalize it as crushed, then allow player landing. |
| A non-center enemy has no legal destination | Keep its post-hit cell unchanged and emit no knockback event. |
| The farthest candidate is occupied but the nearer candidate is legal | Use the nearer candidate. |
| Both displacement candidates are water | Use the farthest water cell and enter drowning there. |
| A victim is killed by the shared hit | Emit the normal death result and do not also emit knockback or water-fall. |
| A victim is affected by an earlier displacement | Re-check live occupancy for its own destination; never overlap active entities. |
| Reset or scenario replacement occurs during a displacement timeline | Keep logical state from the fresh scenario and cancel all stale timelines through the existing generation boundary. |

## Acceptance Criteria

1. Smash preview and commit agree on the impact-cell crush, every victim's shared hit result, displacement destination, blocked movement, and water terminalization.
2. A center-cell enemy is crushed without bypassing the shared hit calculation, and its occupancy is released before the player lands.
3. Other eligible living victims are knocked back by a deterministic maximum of two cells, stop at the nearest legal fallback, or remain in place when no destination exists.
4. A victim displaced into water enters the existing drowning terminal phase immediately, releases occupancy, emits the water event, and leaves no orphan visual after presentation settles.
5. Knockback respects walls, boundaries, reservations, and active occupancy without creating a second movement or combat runtime.
6. Unit and Playwright coverage proves the complete deterministic Smash aftermath and clean reset/terminal behavior.
