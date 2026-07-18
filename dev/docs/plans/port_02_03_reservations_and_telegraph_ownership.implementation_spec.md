# Reservations and Telegraph Ownership

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Add deterministic movement and spawning claims plus source-owned telegraph state to the core world. Preserve reference reservation priority while keeping telegraph presentation independent from gameplay claim ownership.

## Summary

The Web core currently has no reservations or telegraph model; movement only checks current occupancy and presentation has no semantic telegraph layer. This draft adds all-or-nothing reservations, stable registration order, explicit claim purpose, and overlapping source-owned telegraphs. The model is designed for later enemy navigation and wave spawning without implementing either system now.

## Relational Context

- `World` owns reservation ownership, registration order, player-cell distance inputs, and telegraph source state.
- Movement and future spawning callers submit claims to `World`; they do not infer claims from display markers or animation state.
- Reservation arbitration is deterministic: active movement step, then attack intent, then shorter Manhattan distance to the published player cell, then earlier registration order.
- A request replaces the requesting owner's prior claim atomically. A losing multi-cell request acquires nothing; a winning request clears each losing owner's complete claim.
- Telegraph state is source-to-cell data separate from reservation state; multiple sources may overlap and phase rendering resolves a highest visible phase without changing claim legality.
- Terminal entity transitions and scenario reset clear claims owned by the departing identity and remove telegraph sources without calling presentation code.
- Child 06 will project telegraphs to Pixi; this child exposes semantic state and events only.

## Scope

### Included

- Reservation owner, purpose, active-step metadata, and registration index.
- Preview and mutating reservation requests with all-or-nothing conflict handling.
- Source-owned telegraph phases and clearing behavior.
- Reservation-loss and telegraph-change semantic events where required by existing event transport.
- Unit scenarios for every priority tier, overlap, cleanup, and deterministic replay.

### Excluded

- Enemy pathfinding, actor decisions, wave scheduling, population caps, and spawn placement algorithms.
- Attack footprint generation and combat damage.
- Pixi telegraph art, colors, and animation timelines.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Add claim purpose, reservation, and telegraph snapshot values. |
| `src/core/world/world.ts` | Large | Own reservation indexes, registration order, arbitration, telegraphs, and cleanup. |
| `src/core/events/combat-events.ts` | Medium | Carry deterministic reservation and telegraph semantic events. |
| `src/core/actions/action-resolver.ts` | Small | Route movement legality through occupancy plus reservation-aware world queries. |
| `test/unit/core/world/reservations.test.ts` | Large | Assert priority, atomicity, loss, source overlap, and cleanup. |

## Execution Outline

1. Add immutable claim and telegraph values and world-owned indexes without changing presentation.
2. Implement registration and all-or-nothing arbitration using the reference priority order.
3. Add source-owned telegraph mutation and cleanup, then expose deterministic semantic events.
4. Update movement legality and unit scenarios to consume world claim queries.

## Implementation Notes

- Use stable entity IDs and world-local registration counters; never use object identity or Map iteration as a priority tie-breaker.
- Distance uses the last published player cell and the claimant's deterministic representative footprint cell.
- Active movement claims cannot be displaced by ordinary or attack claims.
- A telegraph phase must not by itself reserve a cell. A spawning claim and a spawning telegraph may be emitted together by a later spawn system.
- Keep preview operations side-effect free, including registration, event emission, and loss cleanup.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Multi-cell claim conflicts on one cell | Reject the entire request unless the claimant wins every conflict. |
| Owner renews an existing claim | Replace its old claim atomically without self-conflict. |
| Two sources mark one cell | Retain both source entries and resolve only the displayed phase for projection. |
| One overlapping source clears | Remove only that source's entry. |
| Terminal owner or reset | Clear all claims and telegraphs owned by that entity/world identity. |

## Acceptance Criteria

1. Reservation winners and losers are identical for identical initial state and claim sequences.
2. Priority is active movement, attack intent, player distance, then registration order.
3. Failed multi-cell claims acquire no partial ownership.
4. Telegraph sources overlap and clear independently without becoming movement or spawn authority.
5. Terminal resolution and reset leave no stale claim or telegraph ownership.
