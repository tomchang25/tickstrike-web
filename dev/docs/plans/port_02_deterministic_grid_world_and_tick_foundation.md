# Deterministic Grid, World, and Tick Foundation

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)

## Goal

Deliver Batch 2 of the Tickstrike Full Port Roadmap by establishing the deterministic board, world-state ownership, occupancy, reservations, and player-clocked time model required by all later combat. This batch replaces prototype assumptions with the shipped arena contract.

## Requirements

1. Model the shipped twelve-by-twelve logical board with its initial centered ten-by-ten land area and surrounding sea.
2. Own terrain, player cell, entity occupancy, movement reservations, spawning reservations, and telegraph sources as deterministic gameplay state.
3. Resolve coordinate, cardinal direction, distance, bounds, walkability, and cell-footprint rules without renderer or browser dependencies.
4. Establish immediate terminal gameplay resolution so presentation lifetime never determines occupancy or whether an entity remains logically active.
5. Establish deterministic random streams that can be isolated by gameplay domain and reproduced by scenarios.
6. Establish a player-clocked world-advance boundary and ordered semantic events without implementing later combat rules prematurely.

## Design

The board distinguishes land and sea and has no shipped per-wave terrain mutation. Occupancy is authoritative for legal movement and spawning. Reservations are explicit claims used by movement and spawning rather than temporary visual markers.

The world owns canonical entities and terminal phases. Presentation may retain a visual after logical death while its semantic timeline completes, but it cannot remove or mutate canonical gameplay state.

Randomness uses explicit seeded streams. Wave placement, rewards, and debug actions must be able to consume independent streams so a reward roll cannot alter a later encounter.

## Non-Goals

1. Do not implement player damage, Guard, enemy AI, waves, or rewards.
2. Do not port terrain mutation scaffolds or proposed obstacle-grid mechanics.
3. Do not reproduce Godot terrain-rendering, scene-tree, signal, or tween ownership.
4. Do not finalize production terrain art in this batch.

## Acceptance Criteria

1. Deterministic scenarios reproduce the shipped arena dimensions, terrain, bounds, and initial legal cells.
2. Occupancy and reservation conflicts resolve identically for the same initial state and command sequence.
3. Terminal entities stop affecting gameplay occupancy immediately even when their visuals remain temporarily present.
4. Reset and scenario replacement cannot allow an older presentation timeline to mutate the new world.
5. Unit coverage proves board geometry, walkability, occupancy, reservations, seeded replay, and terminal-state ownership.
6. Browser acceptance proves the board and representative entity state are visible and leave no stale visual after reset.
