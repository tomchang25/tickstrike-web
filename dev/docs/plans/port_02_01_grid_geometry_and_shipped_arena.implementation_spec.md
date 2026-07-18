# Grid Geometry and Shipped Arena

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Replace the prototype board assumptions with the deterministic shipped arena contract used by later gameplay. Establish renderer-independent cell geometry, terrain, bounds, distance, direction, and footprint rules for the twelve-by-twelve board.

## Summary

The current Web scenarios construct a hand-authored ten-by-eight training map, while the reference arena scene uses a twelve-by-twelve grid with a centered ten-by-ten land region. This draft introduces one immutable arena representation and a shipped-arena factory, then routes a deterministic harness scenario through it. Existing combat-only training fixtures remain available until their owning later batch is migrated, but production-facing foundation scenarios use the shipped board.

The implementation must keep gameplay coordinates independent from Pixi dimensions. The Godot tile size is reference presentation data only; Web pixel scale remains owned by the renderer child.

## Relational Context

- `src/core/model/types.ts` owns framework-independent cell and terrain value types; arena queries consume these values and never import presentation code.
- The arena representation owns terrain dimensions and row-major indexing; `World` consumes the arena as immutable board state and remains the future owner of mutable occupancy and tick state.
- Harness fixtures create deterministic worlds; they must not manufacture a second board geometry contract for the shipped scenario.
- Pixi reads arena dimensions and terrain from snapshots but does not provide bounds, terrain, or coordinate rules back to core.
- The existing training fixture and Smash scenario are legacy combat coverage, not authority for the shipped arena dimensions.
- Avoid encoding pixel size, canvas size, scene origin, or renderer bounds in cell operations.

## Scope

### Included

- Immutable cell helpers for equality, stable keys, addition, cardinal direction, Manhattan distance, Chebyshev distance, and deterministic iteration.
- A twelve-by-twelve shipped arena with land cells `(1..10, 1..10)` and sea perimeter cells.
- Bounds, terrain, walkability, legal-cell, and explicit footprint queries.
- A deterministic foundation scenario and focused unit coverage.

### Excluded

- Terrain mutation, connected-land algorithms, obstacles, and per-wave terrain changes.
- Occupancy, reservations, telegraphs, entity terminal phases, and world advancement.
- Pixi tile sizing and browser coordinate conversion.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Extend cell and terrain value contracts while retaining only concrete legacy fixture compatibility needed by current tests. |
| `src/core/world/arena.ts` | Large | Add immutable arena construction and renderer-independent geometry and terrain queries. |
| `src/core/world/world.ts` | Small | Consume the arena representation without moving mutable occupancy responsibilities into the arena. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Provide deterministic shipped-board world setup for scenarios and tests. |
| `src/harness/scenarios/empty-arena.scenario.ts` | Small | Use the shipped arena for the basic browser scenario. |
| `test/unit/core/world/arena.test.ts` | Medium | Assert board dimensions, terrain counts, bounds, distances, directions, and footprints. |

## Execution Outline

1. Add the immutable arena and cell operations before changing scenario construction so all later callers share one geometry authority.
2. Adapt the world and shipped-arena fixture to consume the new board while keeping legacy training terrain isolated from the production scenario.
3. Update the empty-arena scenario and focused unit assertions for the twelve-by-twelve contract.
4. Confirm that later occupancy and presentation children can consume the arena through snapshots without introducing renderer dependencies.

## Implementation Notes

- Use row-major indexing consistent with the existing snapshot and renderer loops.
- The center start cell is `(6,6)` and is land under the shipped rectangle.
- Out-of-bounds queries return non-walkable results and never masquerade as in-bounds sea.
- Explicit footprint queries operate on cell collections; do not derive gameplay footprints from display-object bounds.
- Preserve the legacy fixture only where current combat tests concretely require it; do not let it define production arena defaults.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Negative or edge coordinate | Bounds query is false and terrain/walkability query is non-walkable. |
| Center cell | `(6,6)` is land and is the deterministic player start. |
| Diagonal direction input | Direction validation rejects it for cardinal-only consumers. |
| Empty footprint | Query returns no occupied cells and does not invent a default cell. |
| Duplicate footprint cells | The arena normalizes or rejects them consistently before gameplay consumers use the footprint. |

## Acceptance Criteria

1. A deterministic scenario produces a twelve-by-twelve board with exactly one hundred land cells and forty-four sea cells.
2. The initial land rectangle is `(1..10, 1..10)`, and the deterministic player start is `(6,6)`.
3. Bounds, terrain, walkability, direction, distance, iteration, and footprint queries are stable and independent of Pixi, browser globals, and scene coordinates.
4. Existing legacy combat fixtures remain explicitly isolated from the shipped arena contract.
