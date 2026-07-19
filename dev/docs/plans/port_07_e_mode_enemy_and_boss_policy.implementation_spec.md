# Mode Enemy Attack Cycle and Boss Policy

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate Mode and the current Mode-based Boss placeholder as authored multi-attack enemies on the existing shared action lifecycle. Mode must select attacks deterministically, route the selected attack through shared geometry and commitment, and apply a locked post-Stagger retaliation modifier. Boss must use the same runtime with an explicit retaliation policy seam.

## Summary

The A/A1 action, navigation, reservation, commitment, event, and cleanup contracts and the A2 presentation path are already the baseline. This child adds selection state, selected-attack routing, retaliation state, and the Boss policy hook; it does not create a Boss loop or second combat runtime.

Mode selects uniformly from its authored five-attack list. The selected action is used consistently for movement planning, eligibility, footprint, warning, damage, recovery, and presentation. A failed movement or preparation attempt retains the selection. Reroll only at initial setup/reset, after a resolved attack, and after Stagger completion. The random source is `World.getRandomStream()` with a named enemy-specific domain so unrelated random calls cannot alter the sequence.

After Stagger completion, Mode enters a ten-accepted-Tick retaliation window. A commitment made while retaliation is active snapshots warning reduced by one with a minimum of one and damage multiplied by 1.25. Retaliation expiry cannot change an existing committed attack. The current `mode_boss` catalog entry defaults to the same inherited retaliation policy, while the runtime policy seam supports explicit `inherit`, `omit`, or authored replacement behavior without branching the enemy phase into Boss-only code.

## Relational Context

- A and A1 already own one-action phase processing, shape-driven candidate planning, movement arbitration, locked committed attacks, warning/recovery, event order, and terminal cleanup. Mode supplies the selected action and retaliation modifiers through those boundaries.
- The content/harness boundary expands every authored Mode and Mode Boss attack into an immutable `EnemyActionDefinition` option. Core stores resolved plain data and never imports the content catalog.
- The World owns the selected option, selection stream, retaliation countdown, Guard/Stagger interaction, commit-time modifiers, reset, death, and snapshot projection. Decision code must not own presentation state or mutate the catalog.
- The selected option remains stable when it cannot currently reach the player. Mode uses the existing A1 planner for the selected shape; it does not reroll to find a more convenient attack.
- A Guard break clears retaliation and cancels pending commitment before Stagger. Stagger completion restores Guard, starts retaliation, and rerolls the selected attack exactly once.
- The Boss policy is data-driven and resolved through the same World and enemy phase. It may alter retaliation start/modifiers, but it cannot add a Boss-specific command resolver, phase loop, or presentation runtime.
- Pixi, GSAP, and `SemanticMirror` expose selected attack kind/ID and remaining retaliation ticks from snapshots/events. They do not recompute empowered values.

## Scope

### Included

- Deterministic Mode and Mode Boss option selection and reroll boundaries.
- Tile, Charge, and Area selected-attack routing through shared geometry.
- Ten accepted-Tick retaliation lifecycle with commit-time warning and damage snapshots.
- Explicit Boss retaliation policy data and shared runtime hook.
- Selected attack and retaliation snapshot/event projection.
- Mode/Boss fixtures, sprite profiles, aura cleanup, unit, and browser coverage.

### Excluded

- A bespoke final Boss encounter, new Boss scene/runtime, waves, level scaling, rewards, or procedural attacks.
- New attack definitions, common Guard formula changes, or player attack changes.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Add immutable option data, selected attack projection, retaliation state, policy, and commit modifier metadata to canonical snapshots. |
| `src/core/world/world.ts` | Large | Own option selection, named random streams, reroll boundaries, retaliation countdown, commit modifiers, and cleanup. |
| `src/core/enemies/enemy-actions.ts` | Large | Route the selected Tile/Charge/Area action through common geometry and preserve selection on failed planning. |
| `src/core/actions/enemy-phase.ts` | Medium | Advance retaliation in stable accepted-Tick order and resolve selected attacks without a Boss-only loop. |
| `src/core/events/combat-events.ts` | Medium | Project selected attack, retaliation start/expiry, and empowered commitment semantics. |
| `src/content/enemies/enemy-definitions.ts` | Small | Validate Mode and Mode Boss attack assignments and explicit Boss policy data. |
| `src/harness/fixtures/shipped-arena.ts` | Large | Add deterministic Mode and Mode Boss spawns and expose a repeatable selection/retaliation scenario. |
| `src/content/enemies/assets/octopus-sprite-sheet.png` | Small | Package the shared Mode/Boss body sheet. |
| `src/content/enemies/assets/retaliation-aura-sprite-sheet.png` | Small | Package the retaliation aura sheet. |
| `src/presentation/pixi/enemy-sprites.ts` | Large | Add Mode/Boss body profiles, selected-kind poses, Boss tint, and aura control. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Small | Project selected attack and retaliation state through the existing actor view. |
| `src/presentation/timelines/PresentationDirector.ts` | Medium | Present selection, retaliation start/expiry, selected-kind commit feedback, and generation cleanup. |
| `src/ui/SemanticMirror.tsx` | Small | Expose selected attack ID/kind, retaliation ticks, and policy state for browser assertions. |
| `test/unit/core/enemies/mode-enemy-actions.test.ts` | Large | Assert selection, routing, retention, rerolls, retaliation modifiers, and Boss policy. |
| `test/unit/core/world/world.test.ts` | Medium | Assert stream isolation, countdown boundaries, snapshots, stagger/reset/death cleanup, and policy behavior. |
| `test/e2e/testbed.spec.ts` | Large | Exercise Mode/Boss selection, telegraph modifiers, Stagger recovery, expiry, death, reset, aura cleanup, and idle state. |

## Execution Outline

1. Add normalized option data and pure tests for deterministic selection, selected-kind geometry, reroll boundaries, and Boss policy defaults.
2. Implement World-owned selection and named stream usage, then route the selected action through the existing decision/commit contract.
3. Add retaliation state and countdown at accepted-Tick boundaries. Apply warning/damage modifiers only while creating the committed snapshot.
4. Add selection/retaliation event and SemanticMirror projection, then add Mode/Boss profiles and aura cleanup through A2's presentation path.
5. Add both roles to the same deterministic arena and verify selected attack lock, Stagger cleanup, expiry, death, reset, and browser idle state.

## Implementation Notes

- Store the immutable authored option list separately from the currently selected option. The selected option must be directly inspectable in the canonical snapshot without mutating `enemy-definitions.ts`.
- Use a stream domain derived from the stable enemy ID, such as `enemy-mode:${enemyId}:attack-selection`, and call `pick()` uniformly over the authored option list. The stream must not be shared with navigation or another enemy.
- Select once during spawn/setup/reset. Reroll after the current attack has resolved and after Stagger completion. Do not reroll after a failed movement attempt, failed preparation, blocked target, or rejected command.
- Retaliation is active for 10 accepted World Ticks after `enemy_stagger_ended`. The Tick that starts the window sets the counter to 10; subsequent accepted phases decrement it once, while rejected commands leave it unchanged.
- A Guard break clears retaliation and cancels a pending committed attack before entering Stagger. A committed attack retains its reduced warning and multiplied damage even if the counter reaches zero before detonation.
- At commitment, calculate `warningTicks = max(1, authoredWarning - warningReduction)` and `damage = authoredDamage * damageMultiplier` only when the policy is active. Store the resulting values in `CommittedAttack`; never recompute them during warning.
- Selected Tile, Charge, and Area actions use the existing local-offset and geometry helpers after content normalization. Mode Charge uses the same locked-line and landing extension defined by the Charge child; Mode Area uses the shared clipped area geometry.
- The Boss policy must be explicit in authored/runtime data. Set the current `mode_boss` default to `inherit` so its existing authored tuning preserves retaliation, while allowing a future policy value to omit or replace the modifier without a separate runtime.
- Reset, death, and terminal cleanup clear selection presentation, retaliation countdown, aura state, pending telegraph, committed attack, and reservations. A replacement World must not inherit old stream state or visual timelines.

## Sprite Requirements

Mode and Mode Boss share the octopus body and retaliation aura profiles. Boss uses a larger scale and purple tint rather than a second body texture.

| Asset | Source | Sheet Layout | Scale | Palette | Notes |
| --- | --- | --- | --- | --- | --- |
| `octopus_sprite_sheet.png` | `mode_enemy/assets/octopus_sprite_sheet.png` | 4×4: columns down, up, left, right; rows idle, move, prepare, commit | 5× Mode, 8× Boss | Source warm pink/red; Boss purple tint | Shared body sheet |
| `retaliation_aura_sprite_sheet.png` | `mode_enemy/assets/retaliation_aura_sprite_sheet.png` | 1×5, one horizontal row | 5× Mode, 8× Boss | Bright white/yellow | Visible only while retaliation is active |

- Use nearest-neighbour filtering and the shared directional frame selector for the body. Boss applies `Color(0.72, 0.35, 0.85, 1)` through the profile, not core state.
- The aura loops its five frames at 0.08s while active and kills its tween on expiry, Guard break, death, reset, or generation replacement.
- Prepare and commit feedback follow the selected `kind`: Tile/Area use squash/pop; Charge uses pull-back/forward lunge. These are local presentation choices and do not alter warning or damage.
- Facing markers, fallback bodies, telegraphs, and terminal removal remain existing renderer responsibilities. No Godot scene, signal, or state machine is ported.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Selected attack cannot reach the player | Retain the selection and use its shape-derived movement candidates or wait. |
| Retaliation is active at commitment | Snapshot warning reduction with a one-tick floor and damage multiplier 1.25. |
| Retaliation expires during warning | Existing committed warning and damage remain empowered. |
| Mode is Guard-broken during retaliation | Clear retaliation, cancel pending attack, and enter normal Stagger cleanup. |
| Reroll boundary is reached twice in one Tick | Reroll once for the resolved attack or Stagger completion event; do not consume an extra random value. |
| Boss omits retaliation | Use ordinary authored warning and damage while retaining shared selection, phase, and cleanup. |
| Boss replaces retaliation | Apply only the explicit policy values at commitment; do not branch the enemy phase. |
| Reset or death during retaliation | Clear counter, selection projection, aura, telegraph, committed attack, and transient timelines immediately. |
| Unrelated random calls are added | Existing Mode sequence remains unchanged because selection uses its enemy-specific named stream. |

## Acceptance Criteria

1. Mode and Mode Boss select authored attacks deterministically and use the selected action consistently for planning, commitment, warning, damage, recovery, and presentation.
2. Selection is stable across failed decisions and rerolls only at setup/reset, resolved attack, and Stagger completion.
3. Mode retaliation lasts ten accepted World Ticks, reduces newly committed warning by one with a one-tick floor, and multiplies newly committed damage by 1.25.
4. Empowered values remain locked after retaliation expiry; Guard break, death, and reset clear the window and presentation.
5. Boss policy can inherit, omit, or replace retaliation without a separate runtime or phase loop.
6. The same browser scenario observes role identity, selected attack, retaliation countdown/aura, telegraph lock, terminal cleanup, reset, and idle presentation.
