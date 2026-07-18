# Mode Enemy Attack Cycle and Boss Policy

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

Status: Draft implementation spec

## Goal

Activate Mode and the current Mode-based Boss placeholder as authored multi-attack enemies with deterministic selection and post-Stagger retaliation. Keep Boss variation as a policy seam rather than creating a separate combat runtime.

## Summary

Mode selects one authored attack from its attack list and uses that selection for eligibility, movement, footprint, warning, damage, and recovery. Selection is deterministic from the scenario seed and an enemy-specific random stream, and rerolls only at the documented cycle boundaries: initial setup/reset, resolved attack, and Stagger completion.

After Stagger recovery, Mode enters a ten-tick retaliation window. Attacks committed during the window reduce warning by one tick with a floor of one and multiply damage by 1.25. Both values are snapshotted at commitment, so expiry cannot alter an existing telegraph. The Boss placeholder uses the same Mode mechanics but exposes an explicit policy seam that may omit or replace retaliation.

## Relational Context

- Child A owns the shared action lifecycle and committed snapshot; Mode supplies attack selection, attack-kind routing, and retaliation state.
- Authored attack IDs and role tuning remain the only source of Mode attack values. Runtime selection stores a resolved attack snapshot and does not mutate the content catalog.
- The World owns retaliation countdown, Guard/Stagger interaction, telegraph lock, reset, death, and snapshot projection. Mode decision code does not own presentation state.
- The random stream is named and enemy-specific so adding another enemy or changing unrelated random calls cannot change an existing Mode sequence.
- The Boss placeholder remains an authored Mode variant. A policy hook may change retaliation behavior, but it must use the same World, command resolver, enemy phase, and presentation path.
- Presentation and semantic mirror expose the selected attack kind and retaliation countdown; they do not recompute empowered warning or damage.

## Scope

### Included

- Deterministic Mode attack selection and reroll boundaries.
- Tile, Charge, and Area attack routing through shared geometry and commitment.
- Ten-tick retaliation with commit-time warning and damage snapshots.
- Mode-based Boss policy seam, cleanup, unit, and browser coverage.

### Excluded

- A bespoke final Boss encounter or new Boss scene/runtime.
- New attack definitions, wave scheduling, level scaling, rewards, or procedural selection.
- Changes to common Guard formulas or player attack rules.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Expose selected attack and retaliation state in canonical enemy snapshots. |
| `src/core/world/world.ts` | Large | Own selection snapshots, retaliation countdown, commit modifiers, and cleanup. |
| `src/core/enemies/basic-enemy-actions.ts` | Large | Route Mode attack kinds through shared eligibility and geometry decisions. |
| `src/core/actions/enemy-phase.ts` | Medium | Advance retaliation and resolve selected attacks in stable phase order. |
| `src/core/events/combat-events.ts` | Medium | Project selection, retaliation start/expiry, and empowered commitment semantics. |
| `src/content/enemies/enemy-definitions.ts` | Small | Preserve and validate Mode and Mode Boss authored attack assignments. |
| `src/harness/fixtures/shipped-arena.ts` | Large | Add deterministic Mode and Mode Boss fixtures without a second scenario. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Small | Display selected attack/retaliation status through existing actor projection. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Present retaliation start/expiry and selected attack commit feedback. |
| `src/ui/SemanticMirror.tsx` | Small | Expose selected attack kind and retaliation countdown for browser assertions. |
| `test/unit/core/enemies/mode-enemy-actions.test.ts` | Large | Assert selection, attack routing, retaliation modifiers, and rerolls. |
| `test/unit/core/world/world.test.ts` | Medium | Assert retaliation cleanup, commit snapshots, and Boss policy behavior. |
| `test/e2e/testbed.spec.ts` | Large | Exercise Mode/Boss selection, telegraph modifiers, Stagger recovery, and reset. |

## Execution Outline

1. Add deterministic selection and attack-kind geometry tests against the existing Mode and Mode Boss catalog entries.
2. Implement selection ownership and reroll boundaries, then route the selected attack through the shared decision and commitment contract.
3. Add retaliation lifecycle state, commit-time warning/damage modifiers, semantic projection, and policy override behavior.
4. Add Mode and Boss fixtures to the same scenario and verify attack lock, Stagger cleanup, expiry, death, reset, and browser idle state.

## Implementation Notes

- Select uniformly from the authored attack list; do not recreate a Mode enum or select based on presentation labels.
- A failed movement or preparation attempt retains the selected attack. Reroll only after a resolved attack, reset/setup, or Stagger completion.
- Retaliation countdown advances on normal accepted world Ticks through movement, warning, detonation, and recovery. It is not consumed by rejected or free actions.
- A new Guard break clears retaliation before entering Stagger. A committed attack retains its empowered warning and damage even if retaliation expires before detonation.
- The Boss policy must be explicit in authored/runtime data and must not branch the shared enemy phase into a Boss-only loop.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Retaliation is active at commitment | Warning is reduced to at least one and damage is multiplied by 1.25 in the locked snapshot. |
| Retaliation expires during warning | The committed attack keeps its empowered values. |
| Mode is Guard-broken during retaliation | Retaliation clears and the pending attack is cancelled before Stagger. |
| Selected attack cannot currently reach the player | Mode keeps that selection and repositions or waits rather than rerolling. |
| Boss omits retaliation | Boss uses ordinary authored warning and damage while retaining shared Mode lifecycle and cleanup. |
| Reset or death during retaliation | Countdown, selection presentation, and retaliation visual state clear immediately. |

## Acceptance Criteria

1. Mode and Mode Boss select authored attacks deterministically and use the selected attack consistently for planning, commitment, warning, damage, and recovery.
2. Mode retaliation lasts ten accepted world Ticks, visibly reduces warning by one with a one-tick floor, and multiplies committed damage by 1.25.
3. Empowered values remain locked after retaliation expiry, while new Stagger, death, and reset clear the window and its presentation.
4. Boss policy can omit or replace retaliation without creating a separate runtime or entry point.
5. The same browser scenario observes role identity, selected attack, retaliation, terminal cleanup, and presentation idle state.
