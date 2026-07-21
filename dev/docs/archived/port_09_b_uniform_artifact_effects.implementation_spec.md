# Supported Artifact Effects Through One Build Path

Parent Plan: `port_09_artifacts_rewards_and_run_build.md`

Status: Done — shipped 2026-07-20; see the CHANGELOG "Rewards and Run Build" section.

## Goal

Extend the proved run build so every currently supported artifact effect applies through one acquisition path. Normal and Mobility channels, Guard Shredder, and Execution must change the existing combat rules without creating artifact-specific state owners.

## Summary

The current Child A worktree implements a minimal build with artifact-ID stack counts, a pending offer whose cards carry the resulting stack count, and a serialized selection path. This child generalizes the single inline normal-damage mutation in that path into one typed effect application transaction backed by the selected authored definition. It supports normal damage, Mobility damage, Mobility cooldown, Mobility range, and maximum health, plus the two approved Dash triggers. Acquired stacks and enabled triggers remain canonical build state; the player entity remains the effective combat-state owner.

`speed_up` and `chain_dash` stay unavailable. The former awaits an approved Speed-meter action model; the latter awaits its replacement multi-target route design. Their authored definitions remain validated and visible to content inspection, but neither can be generated or granted by this child.

## Relational Context

- This remains a draft until Child A is closed out. Promotion must reverify the landed selection transaction and archive relationship rather than preserving this document's status by assumption.
- Child A's `RunBuildState` currently owns only immutable-by-snapshot artifact stack counts, while `PendingRewardOffer` owns the cleared wave number and selected card's resulting stack count. This child extends that build with acquired trigger state; it does not replace either contract or add a second run owner.
- `WavePhaseContext.offerableArtifacts` is the only content-to-core value boundary for reward definitions. Selection resolves the chosen definition from that context, so `src/core` must not import the content catalog value or make offerability an artifact-ID allowlist.
- `resolveRewardSelection` currently clears the pending offer, records the selected stack count, then applies `normal-attack-damage` directly. This child replaces that one channel branch with a single selected-artifact transaction that processes every supported authored effect exactly once before the next wave's slots are installed.
- The player entity's normal attack and Mobility fields remain the values read by `previewAttack`, `previewDash`, `previewSmash`, and committed player actions. Channel effects mutate these effective fields once when the selection succeeds; they are never recomputed by React or a parallel player-stat record.
- World needs narrow validated mutations for effective maximum HP/current HP and configured Mobility fields. Existing `setNormalAttackDamage` and `setMobilityCooldown` retain their current responsibilities; `setMobilityCooldown` changes remaining cooldown and is not the configured-cooldown reward seam.
- Trigger ownership is snapshot-visible build state. `previewDash` reads that state to predict Guard Shredder and Execution, and `resolveDash` commits the same preview through the existing directional-hit, damage, terminal-event, and cleanup path. Normal attacks and Smash do not consume either trigger.
- Maximum-health selection raises maximum and current HP by the positive gain, capped at the new maximum. Mobility-cooldown selection changes configured cooldown only and leaves an already-counting remaining cooldown unchanged.

## Scope

### Included

- A selected-artifact transaction for normal damage, Mobility damage, Mobility cooldown, Mobility range, maximum health, and acquired Dash triggers.
- Guard Shredder for back-angle Dash hits and Execution for Dash hits against staggered targets.
- Mobility-compatible eligibility for supported artifacts, alongside Child A's existing minimum-wave and stack-cap checks.
- Focused unit, deterministic scenario, and browser coverage for each observable supported effect.

### Excluded

- `speed_up`, `chain_dash`, multi-target Dash routes, and any free-action mechanic.
- Offer-card cadence, three-card presentation, milestone rules, and build HUD.
- New combat commands, Pixi effects, or persistence.

## Files to Change

| File                                            | Change Size | Purpose                                                                                            |
| ----------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `src/core/rewards/run-build.ts`                 | Large       | Classify supported effects, update trigger state, and filter Mobility-incompatible candidates.     |
| `src/core/model/types.ts`                       | Medium      | Extend run-build snapshot state with acquired triggers.                                            |
| `src/core/world/world.ts`                       | Medium      | Add validated effective-stat mutations for channel application.                                    |
| `src/core/actions/wave-phase.ts`                | Medium      | Replace Child A's inline normal-damage branch with the selected-artifact transaction.              |
| `src/core/actions/action-preview.ts`            | Medium      | Project Guard Shredder and Execution into Dash previews from run-build triggers.                   |
| `src/core/actions/player-actions.ts`            | Medium      | Commit trigger-adjusted Dash previews through the existing event path.                             |
| `src/harness/fixtures/reward-arena.ts`          | Medium      | Supply deterministic supported-effect offer contexts.                                              |
| `src/harness/scenarios/rewards.scenario.ts`     | Small       | Register deterministic effect coverage without a second runtime.                                   |
| `test/unit/core/rewards/run-build.test.ts`      | Large       | Assert effect classification, trigger ownership, Mobility eligibility, and deferred exclusions.    |
| `test/unit/core/actions/action-preview.test.ts` | Medium      | Assert qualifying and non-qualifying Dash trigger previews.                                        |
| `test/unit/core/actions/wave-phase.test.ts`     | Large       | Assert each selection applies its effect atomically and preserves Child A's pause/resume contract. |
| `test/unit/core/world/world.test.ts`            | Medium      | Assert maximum-health and configured-Mobility mutations.                                           |
| `test/e2e/rewards.spec.ts`                      | Large       | Assert supported effects through the same visible reward overlay and arena.                        |

## Execution Outline

1. Extend the run-build model and pure helpers first: classify effects by authored channel or trigger, record acquired triggers, and reject Mobility-incompatible, Speed, and Chain Dash candidates.
2. Add the World mutations required by channel effects, then replace the inline normal-damage branch in reward selection with one ordered selected-artifact transaction. Test every channel, including immediate maximum-health gain and unchanged active cooldown countdown.
3. Project acquired Dash triggers in `previewDash`, then commit that preview unchanged through `resolveDash` so preview, semantic events, terminal cleanup, and presentation stay aligned.
4. Expand the existing reward fixture and browser test with deterministic effect cases. Re-run Child A's pause, selection, next-wave, and reset assertions against the generalized selection path.

## Implementation Notes

- A card already carries its resulting stack count, and the selection transaction runs once for that accepted card. Apply the selected effect's authored amount once; do not recalculate Child A's existing normal-attack stacks or compound the prior effective value a second time.
- Process channel effects through their authored channel identifiers, not artifact IDs. A trigger effect records its trigger as acquired and has no channel mutation. Definitions remain single-effect as enforced by content validation.
- Clamp configured Mobility cooldown at zero. Preserve Mobility kind, damage, range, stagger multiplier, and remaining cooldown unless the selected channel explicitly changes the corresponding configured field.
- Guard Shredder turns only a qualifying back-angle Dash directional hit into an immediate guard break before downstream stagger handling. Execution turns only a Dash hit against a target already in the staggered activity into a terminal hit through the established event and cleanup path.
- The reward fixture may vary its `offerableArtifacts` projection for deterministic tests, but it must keep the same World, Wave phase, runtime queue, React overlay, and browser entry point installed by Child A.
- Unsupported effects are absent from every context's offerable projection, never offered as inert cards, and do not require compatibility behavior.

## Edge Cases

| Case                                     | Expected Handling                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Maximum-health reward while injured      | Increase current HP by the gained maximum amount, capped at new maximum.                   |
| Cooldown reward while cooldown is active | Preserve remaining cooldown; subsequent Mobility use applies the reduced configured value. |
| Artifact requires Dash on a Smash player | Exclude it before offer generation; do not create a disabled card.                         |
| Guard Shredder on front or side Dash hit | Use ordinary guard calculation.                                                            |
| Execution on a non-staggered target      | Use ordinary Dash damage and terminal rules.                                               |
| Viking run                               | Dash-only majors remain ineligible.                                                        |

## Acceptance Criteria

1. Every supported artifact changes the existing player or Dash combat result through Child A's same serialized selection and run-build path.
2. Each accepted card applies its authored effect exactly once, while Child A's existing stack cap, deterministic reward stream, pause, and reset behavior remain intact.
3. Guard Shredder and Execution are previewed and committed only on their qualifying Dash hits; ordinary Dash, Normal Attack, and Smash outcomes remain unchanged.
4. `speed_up` and `chain_dash` are never generated or granted, and Dash-only artifacts are excluded for Smash runs.
5. Deterministic browser coverage observes each supported reward through the existing overlay and verifies its resulting player or combat state.
