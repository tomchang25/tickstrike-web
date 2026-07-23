# Port 13.3e Dash-Kill Terminals

Parent Plan: `port_13_3_entity_visual_profiles.md`

## Goal

Present every enemy role's approved four-direction Dash-kill body-split animation through the existing terminal lifecycle. The presentation must be selected from an explicit Dash death semantic and must leave ordinary deaths, Smash kills, and drowning unchanged.

## Summary

The approved draft Dash-killed sheets become packaged feature-owned assets for Thrust, Slash, Ranged, Charge, and Bomb. A Dash that kills an enemy marks its existing death event with the narrow `dash` cause; the generic enemy presenter then plays the corresponding body-split sheet on the detached terminal view instead of the generic shrink-and-spin death.

The Action Lab lists every Dash-killed and drowning sheet as a preview-only action alongside the existing Bomb and Charge action sheets. It continues to mount the real enemy presentation rig and reads frame timing from each asset's approved metadata, so the Lab does not create a separate animation renderer or write these sheets into the action presentation catalog.

## Relational Context

- The deterministic action resolver owns event meaning: only its Dash resolution may add the optional `dash` cause to an existing enemy death event; presentation must not derive that outcome from damage, attacker identity, artifact state, or event ordering.
- The terminal entity collector remains the sole handoff from semantic terminal events to snapshot removal and detached presentation ghosts. The new cause changes neither the event type nor terminal membership.
- Enemy features own their base, water, action, and Dash-killed asset declarations. The roster registry derives renderer loading maps and Action Lab preview entries so neither integration hub knows individual enemy roles.
- The generic enemy presenter owns shared death selection. Its Dash branch plays the profile's terminal animation on the director-provided detached view; profiles without an authored terminal asset retain the generic death treatment.
- The enemy presentation owns sprite-frame state and must preserve the Dash-killed final frame until the terminal timeline completes. The director alone tracks, fast-forwards, cancels, and destroys terminal ghosts.
- The Action Lab's preview-only actions use the real enemy presentation rig and remain read-only. They must not be merged into or persisted through the player action presentation catalog.
- Drowning already has a separate motion-driven entry path and water-frame playback. Adding it to the Lab must not alter runtime water timing, shadow suppression, or terminal cleanup.

## Scope

### Included

- Promote and package the five approved Dash-killed sprite sheets and metadata.
- Add the minimal Dash death semantic and generic terminal playback.
- Expose Dash-killed and drowning sheets as Action Lab preview-only actions.
- Add focused event, presentation, asset, and browser capability coverage.

### Excluded

- Smash-kill terminal animation or a Smash death cause.
- Changes to damage, occupancy, timing, command acceptance, drowning runtime behavior, or audio result overrides.
- Editable Action Lab catalog entries for terminal or drowning sheets.

## Files to Change

| File                                                                     | Change Size | Purpose                                                                       |
| ------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| `src/core/events/combat-events.ts`                                       | Small       | Carry the optional Dash death semantic.                                       |
| `src/core/actions/player-actions.ts`                                     | Small       | Mark only Dash-originated enemy deaths.                                       |
| `src/content/enemies/features/`                                          | Medium      | Declare and derive feature-owned terminal and preview animation assets.       |
| `src/content/enemies/assets/`                                            | Medium      | Package approved Dash-killed sheets, metadata, and manifests.                 |
| `src/presentation/pixi/enemy-sprites.ts`                                 | Medium      | Play and retain the terminal sheet's final frame.                             |
| `src/presentation/pixi/pixi-game-renderer.ts`                            | Small       | Load and provide Dash-killed assets to enemy presentations.                   |
| `src/presentation/timelines/enemy-presenters/generic-enemy-presenter.ts` | Small       | Select Dash terminal playback from explicit semantics.                        |
| `src/presentation/actions/action-lab-preview-actions.ts`                 | Medium      | Derive terminal and water preview-only action entries.                        |
| `test/`                                                                  | Medium      | Cover semantic events, terminal playback, asset registry, and Lab capability. |

## Execution Outline

1. Promote the reviewed recipe and generate all five canonical Dash-killed assets into the enemy asset package before declaring their feature metadata.
2. Extend feature-owned animation declarations and derived registries, then load the terminal sheets into the renderer when it mounts an enemy presentation.
3. Mark only Dash-kill death events and route the generic terminal presenter to the retained-final-frame body animation.
4. Derive read-only Action Lab entries from the terminal and water registries without changing the Lab renderer or action catalog write path.
5. Add focused regression coverage, regenerate reviewed determinism goldens for the deliberate event-field change, and run scoped static, unit, sprite-tool, and targeted browser validation.

## Implementation Notes

- The `dash` cause is optional because existing non-Dash death events retain their serialized shape and treatment; adding a broader cause taxonomy is deferred with Smash-kill work.
- Dash's Execution artifact outcome remains a Dash kill and receives the same cause.
- The terminal animation uses the enemy's semantic facing, not Dash travel direction. The authored x8 metadata supplies its frame timing.
- Drowning's Lab entry plays the authored water sheet through ordinary frame playback for inspection only; it does not emulate water displacement or change the water runtime path.

## Edge Cases

| Case                                                             | Expected Handling                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dash kills multiple enemies                                      | Each death event carries `dash` and each detached view plays its own profile sheet.           |
| Dash kill lacks an authored presentation                         | The generic terminal animation remains the fallback.                                          |
| Reset, route replacement, or fast-forward during a Dash terminal | Existing director cancellation or completion releases every ghost without an orphan timeline. |
| Bomb self-destructs                                              | Its self-destruction path remains distinct and never selects Dash-killed playback.            |

## Acceptance Criteria

1. Every authored enemy role killed by Dash plays its approved directional body-split terminal and then cleans up at the normal idle boundary.
2. Ordinary attacks, Smash outcomes, Bomb self-destruction, and drowning retain their current terminal treatments.
3. The Action Lab exposes read-only, directional frame inspection for every Dash-killed and drowning enemy sheet.
4. The deterministic event stream changes only by the deliberate `dash` death-cause field on Dash kills.
