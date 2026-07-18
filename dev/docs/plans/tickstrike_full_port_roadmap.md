# Tickstrike Full Port Roadmap

## Purpose

This roadmap coordinates the behavior-complete port of Tickstrike from the Godot `main` reference into the Web-native runtime. It is an ordering and scope map only; each batch has a separate Main Plan that owns its requirements, design, non-goals, and acceptance criteria.

Batch 0, reference capture, is intentionally outside this roadmap's Main Plan set and is complete. Batch 1 is now complete; the remaining Main Plans are the ordered execution scope.

## Reference Baseline

- Source: Godot `main`
- Baseline codebase: [port-ref/tickstrike](../../../port-ref/tickstrike)
- Reference commit: `742f50678af54300fa41b0b983d0abfeb1befb29`
- Status: Batch 0 and Batch 1 complete; Batch 2 is the next execution item.

## Source Authority

- The Godot `main` behavior at the recorded reference commit is the parity authority.
- When Web input, content, timing, state, or presentation semantics disagree with the reference, the Godot behavior wins unless the user explicitly approves a product change.
- Godot plans, drafts, dormant scaffolds, and unshipped systems are not parity requirements. They remain tracked in the Web TODO Future Draft section.
- The port reproduces behavior and content, not Godot scenes, nodes, autoloads, signals, resources, UIDs, or lifecycle patterns.

## Execution Contract

1. Execute the twelve Main Plans in numeric order.
2. Keep later Main Plans queued until every acceptance criterion of the preceding Main Plan is satisfied or the user explicitly accepts a documented gap.
3. Add child sketches only beneath the Main Plan that owns the behavior; each child sketch references this roadmap and its parent Main Plan, and child sketches do not receive independent TODO entries.
4. Create implementation specifications lazily against the live codebase when a child is next to implement.
5. Preserve one forward-work owner: the TODO points to Main Plans, Main Plans point to any child handoff, and shipped history belongs in the changelog.

## Completion Contract

Every applicable gameplay slice must include:

1. A core rule or authored content definition.
2. A deterministic scenario setup.
3. Unit assertions for logical results and event order.
4. Pixi/GSAP presentation driven by semantic state and events.
5. Playwright assertion for the browser-visible result.
6. No pending animation, stale callback, or orphan visual after completion, reset, or route change.

## Ordered Main Plans

| Batch | Main Plan | Depends on | Roadmap outcome |
| --- | --- | --- | --- |
| 1 | Web-Native Content Foundation | Reference baseline complete | Canonical Web content represents the shipped Godot data and defaults. |
| 2 | Deterministic Grid, World, and Tick Foundation | Batch 1 | Board state, occupancy, reservations, time, and semantic outcomes have stable ownership. |
| 3 | Player Verbs and Player Clock | Batch 2 | Move, Wait, Normal Attack, aiming, Speed, and cooldown timing match the reference. |
| 4 | Directional Guard Combat | Batch 3 | Damage, Guard, Defense, Stagger, Protection, prediction, and resolution match the reference. |
| 5 | First Enemy Combat Vertical Slice | Batch 4 | One complete enemy proves player action through enemy detonation and presentation. |
| 6 | Character Classes and Mobility | Batch 5 | Ninja Dash and Viking Smash match their reference command and combat contracts. |
| 7 | Complete Enemy Roster and Navigation | Batch 6 | Every shipped enemy role, path rule, reservation rule, and presentation is available. |
| 8 | Authored Waves, Spawning, and Enemy Levels | Batch 7 | The ten-wave demo and Endless encounter grammar run deterministically. |
| 9 | Artifacts, Rewards, and Run Build | Batch 8 | The shipped reward pool and run-scoped build projection are complete. |
| 10 | Complete Run Lifecycle | Batch 9 | A run can progress, branch at the demo milestone, end, restart, and return safely. |
| 11 | Production UI, Input, Settings, and Debug Tools | Batch 10 | The testbed is complemented by the shipped player-facing shell and controls. |
| 12 | Assets, Audio, Platform, and Release Hardening | Batch 11 | The port reaches presentation parity and robust browser/desktop delivery readiness. |

## Deferred Scope

Future Godot plans and dormant scaffolds remain outside these Main Plans unless a shipped reference behavior depends on them. They may be promoted from Future Draft only after the twelve parity batches complete or the user explicitly changes the roadmap.
