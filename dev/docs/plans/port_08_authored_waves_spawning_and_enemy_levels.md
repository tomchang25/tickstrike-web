# Authored Waves, Spawning, and Enemy Levels

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../port-ref/tickstrike)

## Goal

Deliver Batch 8 of the Tickstrike Full Port Roadmap by running the shipped ten-wave demo and Endless encounter grammar from authored content. This adds deterministic group scheduling, spawn warning, placement, population, and enemy-level projection on top of the complete roster.

## Requirements

1. Process authored wave slots in order with their group, warning, level offset, role, and start condition.
2. Admit a group only when population headroom and a complete legal placement plan exist, because partial group spawning changes authored encounter composition.
3. Reserve warned spawn cells, block enemy pathing through them, count warnings only on world-advancing player actions, and revalidate placement at resolution.
4. Implement Player Ring, Anchor Cluster, and Scatter placement with deterministic tie-breaking and replacement behavior.
5. Project enemy health, damage, Defense, Guard, and post-wave-ten lethal growth from the correct base wave and final level inputs.
6. Keep wave, reward, and debug random streams independent and support deterministic replay from scenario seeds.

## Design

The ten demo waves preserve their authored group order and roster introduction. Wave 10 contains the Mode Boss role with warning two and a positive level offset. Wave 11 and later use the fixed Endless grammar and population cap from authored content.

Group admission is atomic. A warning reserves every planned cell. At warning completion, invalid cells are replaced using the original placement strategy and anchor rules; failure does not silently spawn a partial group.

Final enemy level combines base wave and slot offset. Health, damage, and Defense use their shipped standard and post-ten growth formulas. Guard growth uses base wave rather than final level, and its lethal tier advances on the shipped five-wave cadence beginning after wave twenty.

## Non-Goals

1. Do not add procedural wave generation beyond the shipped Endless template.
2. Do not add terrain mutation, obstacles, curses, Nemesis, or spawn-owned forced displacement.
3. Do not implement rewards or run-completion overlays.
4. Do not rebalance encounter composition, population caps, or growth formulas.

## Acceptance Criteria

1. Deterministic scenarios reproduce all ten authored demo waves, their ordered groups, warnings, level offsets, and population behavior.
2. Atomic admission, warning countdown, reserved path blocking, revalidation, and replacement match the reference.
3. Speed-funded free actions do not advance spawn warnings or wave-facing time.
4. Enemy stat projection matches reference values across ordinary, offset, wave-ten, and late-Endless examples.
5. Unit coverage proves catalog validity, scheduler ordering, placements, population pressure, warning resolution, independent RNG, and growth formulas.
6. Pixi/GSAP and Playwright acceptance prove visible spawn warnings, group arrival, wave progression, and complete cleanup of expired warnings and defeated waves.
