# Complete Run Lifecycle

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)

## Goal

Deliver Batch 10 of the Tickstrike Full Port Roadmap by connecting combat, waves, rewards, milestone branching, death, restart, and navigation into the complete shipped run lifecycle. This is the first batch that must support an end-to-end playable demo run.

## Requirements

1. Start a fresh run with the selected parity class, reset build state, initialize the arena, and begin Wave 1 deterministically.
2. Detect wave completion only after queued slots, pending spawn warnings, debug spawn queues, and living enemies are all empty.
3. Sequence wave-end presentation, reward choice, and the next wave without stale input, duplicate advancement, or overlapping pause ownership.
4. Branch after Wave 10 into Demo Complete with End Run and Continue Endless outcomes matching the reference.
5. Finalize player death after the current tick, stop wave activity, lock gameplay input, clear remaining encounter state, and expose restart and return options.
6. Restart in place with a fresh logical run and clean presentation while preserving only settings and other state that the reference preserves.

## Design

Ordinary wave completion shows its authored wave-end transition before reward entry. Every third wave uses the reward cadence owned by the reward system. Wave 10 completion opens Demo Complete rather than immediately entering a reward.

End Run creates a successful terminal outcome. Continue Endless enters the ordinary Wave 10 reward behavior and then the Endless template. Player death creates a terminal failed outcome only after all outcomes of the consumed tick finish.

Restart reuses the application route but reconstructs canonical run state. Old timers, command queues, presentation timelines, debug work, and callbacks cannot survive into the replacement run.

## Non-Goals

1. Do not add active-run save, settlement currency, permanent unlocks, or partial Endless settlement.
2. Do not make the Main Menu the startup route; the shipped reference starts directly in the Tick Arena.
3. Do not add tutorial progression or new run modes.
4. Do not redesign the Wave 10 reward cadence or milestone result.

## Acceptance Criteria

1. A deterministic end-to-end run can progress through waves, rewards, Wave 10 completion, and either terminal or Endless branches.
2. Wave completion cannot fire while any scheduled, warned, queued, debug-queued, or living enemy remains.
3. Death finalizes after tick resolution and prevents later wave, reward, enemy, or presentation callbacks from mutating the terminal run.
4. Restart produces the same fresh-run state as initial start and leaves no stale entity, input lock, overlay, timeline, or callback.
5. Unit coverage proves lifecycle transitions, pause/input ownership, outcomes, branching, restart, and stale-work rejection.
6. Playwright acceptance proves complete browser-visible success, Endless, death, restart, and return flows with no pending animation or orphan visual.
