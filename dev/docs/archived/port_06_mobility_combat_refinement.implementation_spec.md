# Mobility Combat Refinement

Parent Plan: `port_06_character_classes_and_mobility.md`

## Goal

Make Dash and Smash deterministic combat actions in the existing Tick Arena. Mobility must use the established directional Guard, Stagger, Telegraph, event, and presentation boundaries while keeping player class selection out of this milestone.

## Summary

The active player gains one authored Mobility state containing its kind, damage, range, cooldown duration, remaining cooldown, and temporary invulnerability. The default Tick Arena remains fixed to Ninja and Dash; deterministic Smash coverage uses a scenario-authored Smash player rather than an application class-selection flow.

Dash calculates a cardinal path, victims, and landing from one shared read-only plan. Smash retains the existing armed landing commitment, but its release resolves its 3x3 victims from that locked landing. Both Mobility actions pass each target through the same directional hit calculation as Normal Attack, including Guard, Defense, Stagger, pending-Telegraph interruption, and terminal cleanup. The current Smash-specific crush, knockback, and water outcomes are removed from the Mobility action because they bypass that contract and do not exist in the reference behavior.

Pointer previews render the same accepted plan and per-target results that a command commits. Cooldown and i-frame state is visible through the HUD/semantic mirror, and deterministic browser coverage proves an enemy attack cannot damage the player during a Mobility release while normal enemy resolution remains unchanged.

## Relational Context

- Immutable character definitions remain content-owned; scenario fixtures choose one definition and pass its already-authored Mobility values into `World.spawn`. Core modules never import the actor catalog or React/Pixi code.
- `World` is the sole mutable owner of player Mobility cooldown, armed Smash target, and the one enemy-phase invulnerability window. `WorldSnapshot` exposes cloned read-only state for UI, renderer, harness, and tests.
- An accepted player action advances Mobility cooldown upkeep exactly once; rejected commands do not mutate cooldown or invulnerability. A Dash or Smash release starts invulnerability before the enemy phase, and the action boundary clears it after that same phase rather than animation completion.
- `resolveCommand` remains the only path from a player command to player mutation, enemy phase, encounter outcome, and recorded event list. Mobility must not call the enemy phase or advance ticks independently.
- Shared action-preview functions read either `World` or `WorldSnapshot` without mutation and return Mobility geometry plus predicted directional hit results. Player-action resolution consumes that same calculation and only applies its returned hits to `World`; it must not recompute targets, damage, or hit angles in a second branch.
- `calculateDirectionalHit` remains the one calculator for Normal Attack and Mobility. Dash supplies the cell immediately before each victim as its attack origin; Smash supplies its locked landing cell. Mobility may select its authored stagger multiplier, but may not add a separate Guard or Defense formula.
- Applying a predicted directional hit through `World` retains the existing Guard-break behavior: it clears reservations and Telegraphs, emits interruption/stagger events when appropriate, and releases terminal occupancy synchronously before presentation.
- `CombatEvent` remains the semantic handoff from core to `GameRuntime` and `PresentationDirector`. Pixi may render paths, landings, and resolved feedback, but it may not decide Mobility victims, cooldown, invulnerability, damage, or terminal lifetime.
- The React testbed derives the active Mobility from the player snapshot. It may expose fixed scenario state for testing, but must not become a player-facing class-selection or per-class combat runtime.
- Harness scenarios construct deterministic worlds; Vitest asserts core results directly, while Playwright observes the semantic mirror, pointer preview, HUD, and renderer idle state through the existing debug API.

## Scope

### Included

- One active authored Mobility state for each spawned player, including range, cooldown, and release i-frame state.
- Shared Dash and Smash geometry, previewed victims, and directional hit predictions.
- Dash range five/cooldown four and Smash range three/cooldown six from existing character content.
- Dash path traversal through enemies to the selected legal landing; Smash's existing armed target and 3x3 release area.
- Directional Guard, Defense, Stagger multiplier, Telegraph interruption, reset, terminal, Pixi/GSAP, unit, scenario, and browser coverage for Mobility.

### Excluded

- Player class-selection UI, unlocks, persistence, progression, Speed-meter free actions, and Artifact effects.
- Chain Dash, Guard Shredder, Execution, or other Mobility-specific Major triggers.
- New enemy roles, forced displacement rules, terrain damage, or a replacement for the general command/runtime architecture.
- Reintroducing Smash-specific crush, knockback, drowning, or animation-driven combat outcomes.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Define player Mobility runtime and snapshot state. |
| `src/core/world/world.ts` | Large | Own Mobility state, cooldown upkeep, invulnerability, and damage gating. |
| `src/core/combat/directional-hit.ts` | Medium | Parameterize the shared resolver for Mobility origins and stagger payoff. |
| `src/core/actions/action-preview.ts` | Large | Produce shared Dash/Smash plans and predicted hit results. |
| `src/core/actions/player-actions.ts` | Large | Commit shared Mobility plans and remove prototype Smash-only outcomes. |
| `src/core/actions/action-resolver.ts` | Small | Bound accepted-action Mobility upkeep and release cleanup around the enemy phase. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Spawn the default Ninja with authored Mobility state. |
| `src/harness/scenarios/smash-water.scenario.ts` | Medium | Replace the prototype water fixture with deterministic Smash Guard coverage. |
| `src/harness/scenarios/mobility-combat.scenario.ts` | Medium | Add a deterministic Dash, Telegraph, Guard, cooldown, and i-frame fixture. |
| `src/presentation/pixi/pointer-aim.ts` | Small | Accept the active authored Dash range when clamping pointer distance. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Large | Render shared Mobility previews and commit only the calculated path, landing, and target feedback. |
| `src/app/App.tsx` | Medium | Derive pointer Mobility mode from the active player instead of a local selector. |
| `src/ui/TestbedPanel.tsx` | Small | Surface active Mobility and its cooldown without a class picker. |
| `src/ui/SemanticMirror.tsx` | Small | Expose player Mobility state for browser assertions. |
| `README.md` | Small | Replace obsolete Smash crush/knockback/water sample behavior. |
| `test/unit/core/actions/action-preview.test.ts` | Large | Assert Mobility plan and prediction purity/equality. |
| `test/unit/core/actions/action-resolver.test.ts` | Large | Assert cooldown, i-frame, directional resolution, and cleanup. |
| `test/unit/core/combat/directional-hit.test.ts` | Medium | Assert Mobility-origin and stagger-multiplier use of the shared resolver. |
| `test/e2e/testbed.spec.ts` | Large | Replace prototype Smash assertions with shared-Mobility browser behavior. |
| `test/e2e/mobility-combat.spec.ts` | Medium | Assert deterministic Dash preview/commit, Telegraph avoidance, cooldown, and settled presentation. |

## Execution Outline

1. Add player Mobility runtime state and fixture projection from immutable character content, then establish deterministic Ninja Dash and fixed Smash scenario worlds before wiring presentation.
2. Extend the shared directional resolver for Mobility-specific origin and stagger multiplier, with focused tests proving Normal Attack behavior remains unchanged.
3. Replace independent Dash/Smash geometry and damage branches with pure plans that include legal path/landing, victims, and predicted hits; commit only those plans through the existing world hit application.
4. Put cooldown upkeep and the release-only invulnerability window at the accepted action/enemy-phase boundary, preserving rejected-command immutability and synchronous terminal/Telegraph cleanup.
5. Project the active Mobility state and shared preview results through Pixi and the testbed, removing the arbitrary Mobility selector and obsolete Smash prototype presentation contract.
6. Update deterministic unit, scenario, and Playwright coverage; run the focused unit and browser suites, then `npm run check` after implementation.

## Implementation Notes

- An armed Smash is not invulnerable and does not start cooldown; only its successful release does. A blocked release remains armed and leaves all Mobility state unchanged.
- A Dash may traverse living enemies but can land only on legal unoccupied land before the selected range. It predicts and commits each victim once in travel order.
- Each Smash target uses the locked landing as the attacker origin. A target on the landing cell therefore has no valid directional angle and must not receive an invented angle; preserve the shared resolver's explicit unresolvable-target handling.
- The current `enemy_crushed`, `enemy_knocked`, and `enemy_entered_water` event variants may remain available for future non-Mobility systems, but Smash must no longer emit them.
- Invulnerability suppresses player damage at world resolution, so no `player_damaged` or `player_died` event is emitted for the suppressed committed attack.
- Reset, player terminal state, scenario replacement, and presentation cancellation must clear or replace all Mobility state through their existing world/runtime ownership paths.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Selected Dash distance exceeds the active range | Clamp pointer intent to the active authored range; direct invalid commands reject without mutation. |
| Every reachable Dash cell is occupied, reserved, or non-land | Reject without tick, cooldown change, or i-frame. |
| Dash victim breaks Guard while Telegraphing | Apply the ordinary Guard-break interruption before the enemy phase; clear its reservation and Telegraph. |
| A different enemy detonates on the Dash/Smash release landing | Resolve the detonation but suppress player damage for that one release window. |
| Mobility is on cooldown | Reject without advancing the enemy phase or replacing an armed Smash target. |
| Reset or terminal outcome occurs during presentation | Logical Mobility state is fresh/cleared immediately; the existing generation cancellation removes all transient visuals. |

## Acceptance Criteria

1. The default Tick Arena remains a fixed Ninja/Dash encounter with no class-selection interface, while deterministic scenarios can exercise the authored Smash behavior.
2. Dash and Smash hit every eligible victim through the existing directional Guard, Defense, Stagger, Telegraph-interruption, and terminal-state rules rather than prototype-specific damage or death paths.
3. Pointer previews and committed Mobility commands agree on legal path, landing, victims, hit result, and resulting world state.
4. Accepted Mobility releases apply their authored cooldown and ignore committed enemy damage for exactly their following enemy phase; rejected or armed-only actions do neither.
5. Reset, victory, defeat, and scenario replacement leave no armed target, cooldown/i-frame state, pending effect, or orphaned visual from Mobility.
6. Unit and Playwright coverage proves the deterministic Mobility scenario, browser-visible preview/commit result, Guard interaction, cooldown/i-frame behavior, and idle presentation cleanup.
