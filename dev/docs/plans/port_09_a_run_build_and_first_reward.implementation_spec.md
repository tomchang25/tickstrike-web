# Run Build and First Reward Pause

Parent Plan: `port_09_artifacts_rewards_and_run_build.md`

Status: Draft implementation spec

## Goal

Add one resettable run build to the existing arena so clearing a wave presents and applies one deterministic `attack_up` reward before the next wave begins. This proves rewards are a pause inside the same runtime rather than a second combat path.

## Summary

The World gains canonical run-build state containing acquired stacks and an optional pending offer. Wave completion creates a single `attack_up` choice from a reward-specific random stream and leaves the cleared wave installed until it is selected. Selecting the card updates normal-attack damage, clears the offer, and initializes the next wave without consuming a tick.

The runtime exposes a serialized reward-selection boundary and rejects player commands while an offer is pending. React renders the snapshot-owned card and dispatches intent only; reset and scenario replacement rebuild the World, so no card, callback, or build state survives the old generation.

## Relational Context

- This is a draft until port_08's wave completion and scenario context seams have landed; promotion must reverify the clear boundary and replace only changed code coordinates.
- The World owns mutable run-build and pending-offer state and exposes defensive snapshot copies; authored artifact definitions remain immutable content passed through the existing scenario-to-core context boundary.
- Wave resolution detects the clear after enemy resolution. Its current clear-to-next-wave transition becomes clear-to-pending-offer; it must not initialize the next wave until a successful selection.
- The reward generator is pure over eligible artifact content and an injected draw. Its World caller uses only the named `"rewards"` stream, never the `"waves"` stream.
- Effective normal-attack damage remains on the player entity used by preview and resolution. The build records why that value changed but must not become a second combat-stat owner.
- Runtime command serialization is authoritative. React input disabling is supplementary and cannot be the only protection against a command advancing a paused world.
- Reward selection mutates core state and emits its semantic result without running the accepted-player-action path, enemy phase, or presentation timeline.
- React reads the pending offer from snapshots and calls the runtime selection API. It does not select eligibility, roll randomness, calculate damage, or advance waves.

## Scope

### Included

- Run-build, artifact-stack, pending-offer, and reward-event core types with cloned snapshot exposure.
- A deterministic single-card `attack_up` offer at a cleared wave and strict `maxStacks` enforcement.
- Selection, normal-attack-damage application, command blocking, and next-wave initialization in the same World.
- A React reward overlay, deterministic reward-boundary harness coverage, unit tests, and browser acceptance.

### Excluded

- All artifacts other than `attack_up`, multi-card offers, milestones, and build HUD.
- Speed, major trigger effects, persistence, shops, and lifecycle states from port_10.
- Pixi reward rendering or GSAP card animation.

## Files to Change

| File | Change Size | Purpose |
| ---- | ----------- | ------- |
| `src/core/model/types.ts` | Medium | Add run-build and reward snapshot types. |
| `src/core/world/world.ts` | Medium | Own, clone, apply, and clear build state. |
| `src/core/rewards/run-build.ts` | Medium | Add pure eligibility, offer, and stack rules. |
| `src/core/actions/wave-phase.ts` | Medium | Pause at a cleared wave and resume only after selection. |
| `src/core/actions/action-resolver.ts` | Small | Reject accepted-tick commands during a pending offer. |
| `src/runtime/GameRuntime.ts` | Medium | Serialize and publish reward selection. |
| `src/app/App.tsx` | Medium | Render and submit the reward overlay. |
| `src/app/styles.css` | Medium | Style the accessible reward overlay responsively. |
| `src/harness/*` | Medium | Provide a deterministic reward-boundary scenario and debug selection API. |
| `test/unit/core/**` | Large | Cover build, selection, pause, damage, and reset behavior. |
| `test/e2e/*.spec.ts` | Medium | Assert the visible offer, blocked input, selection, resume, and reset. |

## Execution Outline

1. Add pure build and offer rules with unit tests before wiring state, using only `attack_up` as offerable content.
2. Add World ownership and snapshot cloning, then change wave completion to create a pending offer instead of advancing.
3. Add the serialized runtime selection entry point and command rejection, verifying selection changes damage without advancing time.
4. Add the deterministic harness scenario, React overlay, and browser acceptance including reset and scenario replacement.

## Implementation Notes

- A selected stack may not exceed its authored maximum. Once `attack_up` reaches its cap, no replacement no-op offer is created; a cleared wave with no eligible reward starts the next wave directly.
- The selection result must identify the selected artifact and its resulting stack count. A stale, unknown, or absent offer is rejected without state change.
- Preserve the cleared wave's empty state while the card is visible. The next wave begins only after selection and follows the existing warning path on a subsequent accepted command.
- The overlay has a dialog label, a real button for the card, and no local timer or retained card state. Snapshot replacement removes it.

## Edge Cases

| Case | Expected Handling |
| ---- | ----------------- |
| Player command while card is open | Reject without tick, enemy phase, or wave change. |
| Selection after reset or scenario replacement | Reject as stale; the replacement snapshot has no offer. |
| Reset while card is visible | Fresh World has base damage, no stacks, no offer, and no card. |
| Fixed seed and command sequence | Produces the same offer without changing wave randomness. |
| `attack_up` has reached its cap | Start the next wave without an offer; never leave the arena paused on an inert card. |

## Acceptance Criteria

1. Clearing a wave with an eligible `attack_up` pauses the same arena and displays one valid reward.
2. Selecting the reward increases the existing player's normal-attack damage deterministically without advancing a tick.
3. Combat commands cannot progress the world while a reward selection is pending.
4. Selection resumes the next wave through its existing spawn-warning flow.
5. Reset and scenario replacement remove the offer and restore initial player damage with no stale UI or callback.
