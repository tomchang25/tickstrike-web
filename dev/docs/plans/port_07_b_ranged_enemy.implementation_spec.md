# Ranged Enemy Distance-Band Pressure

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

Status: Draft implementation spec

## Goal

Activate the authored Ranged enemy as a backline role that maintains a Manhattan distance band and locks a player-centered Cross attack. It must use the shared enemy action lifecycle without falling back to melee behavior.

## Summary

Ranged uses the existing `ranged_enemy` content definition: minimum distance 3, maximum distance 5, and the authored five-cell Cross attack. When the player is inside the band, Ranged commits immediately without spending a separate facing action and snapshots the Cross around the player's current cell. When outside the band, it chooses a deterministic one-cell move that reduces the distance to the band; when crowded, it moves away rather than attacking at melee range.

## Relational Context

- Child A owns the role-neutral enemy snapshot, commitment, reservation, and one-action phase contract; this child supplies only Ranged decision and footprint rules.
- Ranged reads the post-player-action cell from the World and writes movement, facing, and commitment through the shared World operations.
- The authored Cross definition remains the source of damage, warning, recovery, and offsets. Ranged behavior must not duplicate those values in a role script.
- The commitment center is the player's cell at commit time. Later player movement changes hit membership only and never recenters the locked Cross.
- Pixi and GSAP present the existing enemy movement, telegraph, damage, and recovery events; they do not calculate distance or attack cells.

## Scope

### Included

- Ranged activation in the shared deterministic scenario.
- Manhattan distance-band eligibility and one-cell repositioning.
- Player-centered Cross commitment and locked resolution.
- Ranged guard/activity/status projection and focused unit/browser coverage.

### Excluded

- General BFS/pathfinding or multi-cell movement.
- New Ranged variants, waves, spawn placement, or level scaling.
- Changes to Thrust, Slash, Charge, Bomb, Mode, or Boss behavior.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/enemies/basic-enemy-actions.ts` | Medium | Add the Ranged decision and player-centered Cross geometry to the shared action boundary. |
| `src/core/actions/enemy-phase.ts` | Medium | Dispatch Ranged through the shared decision/commit flow. |
| `src/core/world/world.ts` | Small | Preserve target-center metadata in the committed snapshot when required. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Turn the existing passive Ranged fixture into an active deterministic enemy. |
| `src/content/enemies/enemy-definitions.ts` | Small | Change only authored data required by validation or fixture integration. |
| `test/unit/core/enemies/ranged-enemy-actions.test.ts` | Large | Assert band decisions, Cross geometry, lock behavior, and no melee fallback. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Ranged activity, telegraph, locked cells, and recovery in `tick-arena`. |

## Execution Outline

1. Add pure distance-band and Cross-center decision tests using the existing authored attack data.
2. Implement Ranged eligibility, approach/retreat candidate ordering, and commit snapshot integration through Child A's shared contract.
3. Activate the deterministic Ranged fixture without adding a route or runtime, then add browser assertions for commitment and player movement during warning.
4. Verify that Ranged never commits outside distance 3 through 5 and never uses a melee fallback.

## Implementation Notes

- Use Manhattan distance, not Chebyshev distance, for the authored band.
- The Cross center is the player cell observed at commitment, and the footprint is clipped to legal in-bounds cells using the common geometry helper.
- Ranged may turn toward the player as part of commitment, but turning must not consume a second enemy action.
- If no legal one-cell candidate improves or restores the band, Ranged waits deterministically rather than entering an invalid melee state.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Player is distance 2 | Ranged retreats or waits; it does not commit the Cross. |
| Player is distance 3 through 5 | Ranged commits the Cross immediately when otherwise eligible. |
| Player moves after commitment | The Cross center and cells remain unchanged; damage checks the new player cell against that snapshot. |
| Cross reaches the arena edge | Only legal cells are committed, with no duplicate cells. |
| All band-restoring cells are blocked | Ranged waits without changing occupancy or leaving a reservation. |

## Acceptance Criteria

1. Ranged commits only when the player is in the authored Manhattan distance band.
2. The committed attack is a five-cell player-centered Cross snapshot that does not recenter during warning.
3. Ranged restores or maintains its band through deterministic movement and never falls back to melee behavior.
4. The same browser scenario visibly shows Ranged movement, telegraph, resolution, and recovery through the shared presentation path.
