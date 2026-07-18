# Deterministic Tick Arena Foundation

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)
Draft Implementation Spec: [Merged deterministic Tick Arena foundation spec](port_02_deterministic_grid_world_and_tick_foundation.implementation_spec.md)

## Goal

Create the one resettable Tick Arena used by every later plan. This is the smallest deterministic world that can host the player, three basic enemy fixtures, reservations, Telegraph ownership, seeded replay, and the shared Tick boundary without introducing a second runtime or speculative systems.

## Requirements

1. Provide a deterministic twelve-by-twelve arena with stable land, sea, bounds, cardinal directions, and walkability.
2. Own one player and three enemy fixtures in the same canonical world state; the scenario must always start from the same cells.
3. Make occupancy authoritative for movement and spawning, and release terminal entities from occupancy immediately.
4. Own all-or-nothing movement/spawn reservations and source-owned Telegraph state without making visible Telegraphs occupancy authority.
5. Carry an explicit scenario seed with independent named streams so reset and replay return to the same sequence.
6. Expose one accepted-action boundary that can advance the world exactly once and publish a snapshot plus semantic events.
7. Allow the scenario to reset to the exact initial state without old commands, claims, Telegraphs, or presentation work changing the new state.

## Design

The scenario is intentionally boring: one player, one Thrust enemy, one Slash enemy, and one Ranged enemy on legal land cells. The fixtures, claims, and Telegraph data are visible before combat behavior exists so the integration point is established first.

The core stores state and outcomes without React, PixiJS, GSAP, or browser APIs. The runtime loads the scenario, sends snapshots to the renderer, serializes commands, and owns reset. The seed contract exists for replay and future content, but no wave or reward randomization is part of this plan.

## Non-Goals

1. Do not add waves, rewards, classes, Guard, enemy AI, or production menus.
2. Do not create child plans or separate per-enemy scenarios.
3. Do not add pathfinding, combat damage, or enemy decision behavior.
4. Do not polish final art or audio.

## Acceptance Criteria

1. The same scenario setup produces the same board, cells, entities, and initial snapshot every time.
2. Occupied and illegal cells reject movement without partial state changes.
3. Reservation conflicts are deterministic and failed multi-cell claims acquire nothing; overlapping Telegraph sources clear independently.
4. A terminal entity no longer blocks a cell before its visual cleanup finishes.
5. The same seed and command setup reproduce the same world and reset sequence.
6. The browser shows one board with one player and three enemies, and reset returns to the identical starting view with no stale claim, Telegraph, or visual.
