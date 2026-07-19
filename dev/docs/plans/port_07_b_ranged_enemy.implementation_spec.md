# Ranged Enemy Distance-Band Pressure

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate the authored Ranged enemy on the existing A/A1 enemy action contract. Ranged must maintain an authored Manhattan distance band, commit a player-centered Cross attack, and never fall back to the generic melee-origin planner.

## Summary

The shared `enemy-actions.ts`, `enemy-path-planner.ts`, `resolveEnemyPhase()`, World commitment lifecycle, movement arbitration, and A2 presentation path are already the baseline. This child adds only the Ranged decision and footprint rules.

`ranged_enemy` uses `ranged_cross`, minimum Manhattan distance 3, and maximum distance 5. At a distance inside that inclusive band, Ranged commits immediately and snapshots the Cross around the player's current cell. At a distance above the band, it proposes legal one-cell moves that reduce distance. At a distance below the band, it proposes legal one-cell moves that increase distance. If no candidate improves the position, it waits without committing an attack.

The Cross center and clipped cells are copied into `CommittedAttack.metadata` and `CommittedAttack.cells` at commitment. Later player movement changes only whether the live player cell is a member of the locked cells.

## Relational Context

- A and A1 already own the role-neutral action snapshot, one completed enemy action per accepted Tick, shape-derived navigation, movement reservation rounds, locked attacks, event ordering, and terminal cleanup. This child must extend those seams rather than create a Ranged phase or runtime.
- `enemy-actions.ts` may read normalized Ranged tuning from the enabled `EnemyActionDefinition`; core must not import `enemy-definitions.ts` or any presentation module.
- The content/harness boundary resolves `ranged_enemy` and `ranged_cross` into an `EnemyActionDefinition` with `role: "ranged"`, the authored damage/timing, Cross offsets, and normalized `{ minDistance: 3, maxDistance: 5 }` role metadata.
- Ranged decision code uses `World.playerCell`, `World.isInside()`, and the existing placement predicates. It mutates only through the existing World-facing decision and movement operations.
- `commitEnemyAttack()` remains the only commitment boundary. The Ranged branch must pass the player center as commit metadata; it must not recalculate the center during warning or detonation.
- A2's sprite profile and `PresentationDirector` remain the presentation boundary. Presentation displays movement, telegraph, damage, and recovery events but does not calculate range or Cross cells.

## Scope

### Included

- Normalized Ranged role metadata in the action fixture/runtime input.
- Inclusive Manhattan distance-band eligibility.
- Deterministic one-cell approach and retreat candidates.
- Player-centered Cross geometry with in-bounds clipping and duplicate removal.
- Ranged activity, telegraph, locked resolution, reset, and cleanup coverage.
- Ranged sprite profile using the existing small-enemy presentation seam.

### Excluded

- General BFS for Ranged band correction, multi-cell movement, waves, spawn placement, or level scaling.
- New Ranged variants or authored attack data.
- Changes to Thrust, Slash, Charge, Bomb, Mode, or Boss rules.

## Files to Change

| File                                                  | Change Size | Purpose                                                                                                                       |
| ----------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/core/enemies/enemy-actions.ts`                   | Medium      | Add Ranged distance-band decisions, deterministic cardinal candidate ordering, and player-centered Cross helpers.             |
| `src/core/actions/enemy-phase.ts`                     | Small       | Preserve the shared decision/commit flow while passing Ranged commit metadata and clipping through the common World boundary. |
| `src/core/model/types.ts`                             | Small       | Add the narrow typed metadata or normalized action shape required to distinguish Ranged tuning without content imports.       |
| `src/harness/fixtures/shipped-arena.ts`               | Medium      | Activate Ranged with authored action data, deterministic tuning, and a stable position in `tick-arena`.                       |
| `src/content/enemies/assets/eye-sprite-sheet.png`     | Small       | Package the authored Ranged runtime sprite.                                                                                   |
| `src/presentation/pixi/enemy-sprites.ts`              | Medium      | Add the Ranged directional sprite profile and reuse A2 small-enemy feedback values.                                           |
| `src/presentation/pixi/PixiGameRenderer.ts`           | Small       | Resolve the Ranged profile while preserving the generic fallback.                                                             |
| `test/unit/core/enemies/ranged-enemy-actions.test.ts` | Large       | Assert band decisions, candidate ordering, Cross geometry, clipping, lock behavior, and no melee fallback.                    |
| `test/e2e/testbed.spec.ts`                            | Medium      | Observe Ranged movement, commitment, locked telegraph cells, resolution, recovery, and presentation idle state.               |

## Execution Outline

1. Add pure tests for Manhattan band decisions and player-centered Cross cells using the authored `ranged_cross` data.
2. Normalize Ranged tuning at the content/harness boundary and implement the role branch in `enemy-actions.ts`; do not route it through `attackOriginCellsFromShape()` or BFS.
3. Activate Ranged in the existing deterministic arena, preserving stable entity order and the A/A1 one-action phase contract.
4. Add the eye sprite profile through A2's registry and verify that its timelines settle through the existing director generation cleanup.
5. Add browser assertions for in-band commitment, out-of-band movement, player movement during warning, locked cells, recovery, reset, and no melee fallback.

## Implementation Notes

- Use `manhattanDistance(enemy.cell, playerCell)`, not Chebyshev distance.
- The inclusive eligibility check is `minDistance <= distance && distance <= maxDistance`.
- For an out-of-band enemy, enumerate cardinal destinations in the existing fixed order, reject the player cell, walls, water, occupied cells, and reservations, then rank by distance to the nearest band boundary and destination coordinates.
- When the player is too far, only candidates with a strictly smaller distance are valid. When the player is too close, only candidates with a strictly larger distance are valid. If none remain, return `wait`.
- Preserve the current enemy facing when it is usable; otherwise choose the first deterministic cardinal facing. Turning for commitment does not consume another action.
- Build Cross cells as `playerCell + rotatedCrossOffset`, clip with `World.isInside()`, and remove duplicates before commitment. The Cross center is always the player cell observed by the decision.
- `CommittedAttack.metadata` must include a stable target-center record, for example `{ targetCenter: { x, y } }`. Resolution must use the already committed `cells`, not this metadata or the live player cell to recenter the attack.
- The authored warning, damage, recovery, and attack ID remain the only tuning source. Do not duplicate those values in `PresentationDirector` or sprite code.

## Sprite Requirements

Ranged reuses the A2 small-enemy presentation boundary but has an authored eye sheet rather than the Kappa sheet used by Thrust and Slash.

| Asset                  | Source                                     | Sheet Layout                                                         | Scale | Palette                   | Notes                                                       |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------- | ----- | ------------------------- | ----------------------------------------------------------- |
| `eye_sprite_sheet.png` | `ranged_enemy/assets/eye_sprite_sheet.png` | 4×4: columns down, up, left, right; rows idle, move, prepare, commit | 5×    | Source green/yellow tones | Same nearest-neighbour and directional frame contract as A2 |

- Package the sheet under the enemy content asset owner and load it through the existing Pixi asset path.
- Use `hframes = 4`, `vframes = 4`, nearest-neighbour filtering, and the shared directional frame selector. Do not add a Godot scene, lifecycle, or presentation-owned gameplay state.
- Reuse A2 move, prepare, commit, damage-flash, stagger, death, cancellation, and idle-cleanup values. No Ranged-specific VFX is required.

## Edge Cases

| Case                                  | Expected Handling                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Player is distance 2                  | Ranged retreats when a legal distance-increasing cell exists; otherwise waits and does not commit.                                 |
| Player is distance 3 through 5        | Ranged commits the Cross immediately when alive and ready.                                                                         |
| Player is distance 6 or more          | Ranged takes one legal distance-reducing step or waits.                                                                            |
| Player shares Ranged's cell           | Ranged never commits; it attempts a legal distance-increasing step or waits.                                                       |
| Player moves after commitment         | The committed center and cells remain unchanged; resolution checks the new player cell against the locked cells.                   |
| Cross reaches an arena edge           | Only in-bounds cells are committed, with no duplicates.                                                                            |
| All improving cells are blocked       | Ranged waits and leaves no reservation or telegraph.                                                                               |
| Ranged becomes terminal while warning | World clears its committed attack, telegraph, occupancy, and reservations immediately; presentation may finish its death timeline. |

## Acceptance Criteria

1. Ranged commits only when the player is in the authored inclusive Manhattan distance band.
2. The committed attack is a five-offset player-centered Cross snapshot, clipped only by arena bounds, and never recenters during warning.
3. Ranged uses deterministic one-cell approach/retreat decisions, never invokes the generic melee-origin fallback, and waits safely when no improving cell exists.
4. The same browser scenario visibly shows Ranged movement, telegraph, locked resolution, recovery, reset cleanup, and a settled presentation.
