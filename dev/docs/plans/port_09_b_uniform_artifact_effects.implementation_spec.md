# Supported Artifact Effects Through One Build Path

Parent Plan: `port_09_artifacts_rewards_and_run_build.md`

Status: Draft implementation spec

## Goal

Extend the proved run build so every currently supported artifact effect applies through one acquisition path. Normal and Mobility channels, Guard Shredder, and Execution must change the existing combat rules without creating artifact-specific state owners.

## Summary

This child generalizes Child A's single reward application into an effect interpreter backed by the authored artifact definitions. It supports normal damage, Mobility damage, Mobility cooldown, Mobility range, and maximum health, plus the two approved Dash triggers. Acquired stacks remain canonical build state; the player entity remains the effective combat-state owner.

`speed_up` and `chain_dash` stay unavailable. The former awaits an approved Speed-meter action model; the latter awaits its replacement multi-target route design. Their authored definitions remain validated and visible to content inspection, but neither can be generated or granted by this child.

## Relational Context

- This is a draft until Child A has landed and port_08's wave context is stable; promotion must preserve Child A's reward pause and reverify every changed combat coordinate.
- Child A owns the pending-offer, runtime selection, and pause contract. This child extends its artifact application path rather than adding a direct debug or UI stat-mutator.
- Authored channel and trigger records are the input vocabulary. The core effect interpreter consumes the definitions passed through context and must not switch on artifact IDs to calculate supported effects.
- The player entity's normal attack and Mobility fields are the values read by existing preview and resolution. Build contributions project into those fields once per successful acquisition.
- The build retains immutable player baseline values needed to recompute additive effects. It is not a second mutable player-stat object; effective HP, damage, range, cooldown, and cooldown countdown remain on the entity.
- Dash hit resolution is the only trigger consumer. Guard Shredder and Execution inspect the acquired build there; normal attacks and Smash retain their existing behavior.
- Maximum-health acquisition raises maximum and current HP by the positive gain, capped at the new maximum. Cooldown reduction changes configured cooldown only, not an already-counting remaining cooldown.

## Scope

### Included

- Uniform application and snapshot projection of normal damage, Mobility damage, Mobility cooldown, Mobility range, and maximum health.
- Guard Shredder for back-angle Dash hits and Execution for Dash hits against staggered targets.
- Eligibility that exposes only implemented, active-Mobility-compatible artifacts and enforces stack, exclusivity, and minimum-wave limits.
- Focused unit and deterministic scenario coverage for each supported effect.

### Excluded

- `speed_up`, `chain_dash`, multi-target Dash routes, and any free-action mechanic.
- Offer-card cadence, three-card presentation, milestone rules, and build HUD.
- New combat commands, Pixi effects, or persistence.

## Files to Change

| File | Change Size | Purpose |
| ---- | ----------- | ------- |
| `src/core/rewards/run-build.ts` | Large | Project supported channels and trigger ownership from authored effects. |
| `src/core/model/types.ts` | Medium | Represent build baselines and derived reward state. |
| `src/core/world/world.ts` | Medium | Apply projected effects safely to the player. |
| `src/core/actions/action-preview.ts` | Medium | Include supported Dash-trigger outcomes in previews. |
| `src/core/actions/player-actions.ts` | Large | Commit Guard Shredder and Execution through the existing hit event path. |
| `src/content/artifacts/artifact-definitions.ts` | Small | Mark deferred definitions unavailable without removing content. |
| `test/unit/core/**` | Large | Assert channels, trigger conditions, caps, and unsupported exclusions. |
| `src/harness/**` | Medium | Add deterministic effect scenarios. |

## Execution Outline

1. Define supported-effect projection and eligibility tests against authored definitions, including unavailable Speed and Chain Dash exclusions.
2. Extend build baselines and World application, then test each additive channel and immediate maximum-health gain.
3. Extend Dash preview and commit consistently for the two triggers, including semantic events and terminal cleanup.
4. Add deterministic scenario coverage and rerun Child A reward-boundary assertions against the generalized path.

## Implementation Notes

- Recompute additive values from the immutable baseline plus all acquired stacks; do not compound already-effective entity values when a second stack is acquired.
- Clamp configured Mobility cooldown at zero. Preserve the active Mobility kind and all unrelated player fields.
- Guard Shredder turns a qualifying back-angle Dash directional hit into an immediate guard break before downstream stagger handling. Execution turns a qualifying Dash hit on an already staggered target into a terminal hit through the established event and cleanup path.
- Unsupported effects are ineligible, never offered as inert cards, and do not require fallback behavior.

## Edge Cases

| Case | Expected Handling |
| ---- | ----------------- |
| Maximum-health reward while injured | Increase current HP by the gained maximum amount, capped at new maximum. |
| Cooldown reward while cooldown is active | Preserve remaining cooldown; subsequent Mobility use applies the reduced configured value. |
| Guard Shredder on front or side Dash hit | Use ordinary guard calculation. |
| Execution on a non-staggered target | Use ordinary Dash damage and terminal rules. |
| Viking run | Dash-only majors remain ineligible. |

## Acceptance Criteria

1. Every supported artifact changes the existing player or Dash combat result through the same run-build acquisition path.
2. Stacks are capped, deterministic, and never compound an already-derived player value.
3. Guard Shredder and Execution apply only to their qualifying Dash hits and preserve ordinary outcomes otherwise.
4. `speed_up` and `chain_dash` are never generated or granted.
