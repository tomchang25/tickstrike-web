# Full Reward Offers and Build HUD

Parent Plan: `port_09_artifacts_rewards_and_run_build.md`

Status: Draft implementation spec

## Goal

Turn the single-card reward proof into the regular run reward experience: deterministic three-card offers, milestone choices, and a compact view of the acquired build in the same arena.

## Summary

Ordinary cleared waves present up to three distinct eligible supported artifacts at one stack each. Every third completed wave is a milestone: one distinct Minor reward grants two stacks, while the remaining cards prefer eligible Major rewards and otherwise use distinct Minor two-stack fallbacks. All draws use the reward stream and preserve the Wave stream sequence.

React renders the offer and a compact build HUD from snapshots. The HUD is read-only and shows acquired artifacts and stack counts; it does not decide availability or combat results. Browser coverage proves the complete visible flow, including cleanup after selection, reset, and scenario replacement.

## Relational Context

- This is a draft until Children A and B have landed; promotion must reverify the established build and selection shapes instead of preserving these current coordinates by compatibility.
- Child A owns pending offer creation and selection; this child replaces only its single-card generator with the full offer policy and keeps the same pause contract.
- Child B determines which definitions are supported and eligible. Offer generation consumes only that eligible set, so deferred `speed_up` and `chain_dash` never appear.
- Offer selection remains one choice from one immutable pending offer. Selecting a card applies exactly its displayed stack count through Child B's build path before next-wave initialization.
- The World snapshot is the sole UI data source for offers, acquired stacks, and derived player values. React formats labels and descriptions but does not recreate eligibility or effects.
- Runtime generation cancellation and World replacement remain the cleanup authority. The UI owns no independent animation or timeout whose completion could select or retain a card.
- The reward HUD is limited to build information. Broader production HUD and shell controls remain owned by port_11.

## Scope

### Included

- Deterministic ordinary and every-third-wave offer generation with distinct-card, stack-cap, Mobility, exclusivity, and fallback rules.
- Three-card accessible React overlay and compact acquired-artifact HUD.
- Deterministic generator, full flow unit, and Playwright assertions for offers, selection, resume, and cleanup.

### Excluded

- Speed and Chain Dash, curse cards, rarity systems, shops, saves, and meta progression.
- Wave-10 end-run and Endless branch decisions from port_10.
- New Pixi card effects, reward audio, or final card art.

## Files to Change

| File                             | Change Size | Purpose                                                        |
| -------------------------------- | ----------- | -------------------------------------------------------------- |
| `src/core/rewards/run-build.ts`  | Large       | Generate ordinary and milestone offer sets deterministically.  |
| `src/core/model/types.ts`        | Small       | Carry multi-card offer and HUD snapshot data.                  |
| `src/core/actions/wave-phase.ts` | Small       | Supply completed-wave cadence to the existing reward boundary. |
| `src/ui/RewardOverlay.tsx`       | Medium      | Render selectable accessible cards from snapshots.             |
| `src/ui/RunBuildHud.tsx`         | Medium      | Render acquired artifacts and stack counts read-only.          |
| `src/app/App.tsx`                | Medium      | Compose overlay and build HUD with runtime callbacks.          |
| `src/app/styles.css`             | Medium      | Provide responsive card and HUD layout.                        |
| `src/harness/**`                 | Medium      | Expose deterministic offer inspection for browser tests.       |
| `test/unit/core/**`              | Large       | Assert offer pools, cadence, fallback, and RNG isolation.      |
| `test/e2e/*.spec.ts`             | Large       | Assert visible cards, HUD, input pause, resume, and teardown.  |

## Execution Outline

1. Replace the single-card generator with pure ordinary and milestone policies and test deterministic output, eligibility, and fallback behavior.
2. Extend pending-offer snapshot data and selection assertions for displayed stack counts.
3. Build the overlay and read-only build HUD from snapshot state, preserving keyboard and pointer command blocking.
4. Add deterministic browser flow coverage, including reset and scenario replacement while an offer is visible.

## Implementation Notes

- Ordinary offers contain up to three distinct eligible cards. A smaller eligible pool renders only the available cards; no disabled phantom choices are added.
- Milestone waves are completed-wave numbers divisible by three. Card one is a distinct Minor times two. Cards two and three prefer distinct eligible Majors times one, then distinct Minor times two fallbacks.
- A card's displayed description resolves its authored magnitude and displayed stack count. Selection grants exactly that count, subject to the remaining stack cap; generator eligibility prevents partial grants.
- Use semantic test IDs and dialog semantics for the overlay. The compact HUD remains useful on narrow screens without covering the reward choice.

## Edge Cases

| Case                                                | Expected Handling                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Fewer than three eligible ordinary artifacts        | Render only valid, distinct cards.                                     |
| No eligible Major at a milestone                    | Fill remaining positions with distinct eligible Minor times-two cards. |
| Artifact is one stack from its cap                  | Do not generate a two-stack card that would partially grant.           |
| Reset or scenario replacement while overlay is open | Remove all cards and HUD state from the old run immediately.           |

## Acceptance Criteria

1. Ordinary waves and every-third-wave milestones produce deterministic, valid offers without disturbing Wave randomness.
2. Every visible card is selectable, grants its displayed stack count, and resumes the existing arena only after selection.
3. The browser displays a compact acquired-build HUD that matches the canonical snapshot.
4. No stale card, input handler, callback, or presentation work remains after selection, reset, or scenario replacement.
