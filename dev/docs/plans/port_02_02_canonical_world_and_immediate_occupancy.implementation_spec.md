# Canonical World and Immediate Occupancy

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Make the world the sole authority for canonical entities, player position, footprints, occupancy, and terminal gameplay phases. Ensure terminal gameplay state releases occupancy immediately without allowing presentation lifetime to control logical activity.

## Summary

The current world stores entities in a map but derives occupancy by scanning only alive entities. The presentation director also removes entities from the world after animation. This draft replaces those two implicit ownership paths with an explicit occupancy index and world-owned terminal state. Presentation will receive terminal state and may finish a visual timeline, but it will not remove or mutate canonical entities.

## Relational Context

- `World` owns entity records, player cell, occupancy index, terminal phases, and snapshot construction.
- Spawn and move operations write entity state and occupancy as one atomic world transition; action resolution requests these transitions rather than maintaining a second collision map.
- Terminal phase transitions release the entity footprint and all owned claims immediately; the terminal record remains canonical until an explicit world lifecycle operation, not until a GSAP callback.
- `PresentationDirector` reads semantic events and renderer views only. It must not call world removal or phase mutation.
- `PixiGameRenderer` projects snapshots and event-driven visuals; it cannot be used as an occupancy query.
- Snapshot values are copied before leaving core so harness, UI, and presentation cannot mutate world state.
- The legacy Smash scenario may keep its current event behavior while its entity transitions use the new world occupancy contract; later combat batches own any rule expansion.

## Scope

### Included

- Explicit entity footprints and authoritative cell-to-entity occupancy.
- Spawn, move, phase transition, terminal release, and snapshot behavior.
- Player-cell ownership and player/entity conflict checks.
- Unit coverage for atomic rejection and immediate release.
- Removal of presentation-to-core entity deletion.

### Excluded

- Damage, Guard, enemy AI, pathfinding, drowning rules, and death timing.
- Reservation arbitration and telegraph sources, owned by child 03.
- Generation cancellation and final visual cleanup, owned by child 06.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Define explicit footprints, terminal phases, and snapshot-compatible entity values. |
| `src/core/world/world.ts` | Large | Own entity records, player cell, occupancy index, atomic transitions, and terminal release. |
| `src/core/actions/action-resolver.ts` | Medium | Route existing movement and terminal-producing prototype actions through world-owned transitions. |
| `src/presentation/timelines/PresentationDirector.ts` | Medium | Stop presentation callbacks from deleting canonical world entities. |
| `test/unit/core/world/world.test.ts` | Large | Cover spawn, movement, terminal release, conflicts, copies, and occupancy queries. |
| `test/unit/core/actions/action-resolver.test.ts` | Small | Extend current action assertions to prove terminal occupancy is released before presentation. |

## Execution Outline

1. Define footprint and phase values, then add the world occupancy index behind the existing entity API.
2. Convert spawn, movement, and phase transitions to atomic world operations with no partial mutation on rejection.
3. Update action resolution and existing unit scenarios to use the authoritative occupancy behavior.
4. Remove presentation-side world mutation and assert that terminal visuals can complete without changing core records.

## Implementation Notes

- Occupancy must be indexed by cell and resolved against active gameplay phases, not reconstructed by filtering the entity map.
- A terminal entity remains queryable as terminal state but is absent from legal occupancy and active-entity queries.
- Reject duplicate IDs, out-of-bounds footprints, non-walkable cells, occupied cells, player conflicts, and duplicate footprint cells before mutation.
- Keep entity snapshot data immutable through deep copies of cells and footprint arrays.
- Do not introduce Godot pooling, `queue_free`, scene ownership, or signal-style lifecycle plumbing.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Terminal entity still has a visual | It remains a canonical terminal record, but its cells are immediately free. |
| Move into a terminal entity's former cell | Accepted when terrain and other claims allow it in the same logical sequence. |
| Multi-cell spawn with one invalid cell | Entire spawn is rejected and no cells are indexed. |
| Snapshot mutation attempt | Only copied data is exposed; canonical occupancy is unchanged. |
| Unknown entity transition | Returns the existing structured failure or throws according to the established world API, without partial state changes. |

## Acceptance Criteria

1. The world owns canonical entities, player position, footprints, and occupancy.
2. Invalid spawn and movement attempts leave entity and occupancy state unchanged.
3. Terminal phase resolution releases occupancy immediately while retaining canonical terminal state for presentation coordination.
4. Presentation completion cannot delete or mutate a canonical entity.
5. Unit tests prove a released cell can be reused before any visual timeline completes.
