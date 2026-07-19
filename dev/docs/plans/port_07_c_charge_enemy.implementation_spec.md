# Charge Enemy Line Threat and Landing

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate Charge on the existing A/A1 locked-attack lifecycle as a Heavy enemy. Charge is an attack kind within that shared lifecycle, not a separate enemy runtime or state machine. It must commit a legal five-cell forward line, detonate only that locked line, and perform an authoritative one-resolution landing before recovery.

## Summary

The shared `enemy-actions.ts`, movement planner, reservation rounds, `World.commitEnemyAttack()`, telegraph countdown, and semantic event path are already implemented for Thrust and Slash. This child adds Charge line geometry and a post-detonation landing follow-up; it does not create a Charge runtime or bypass World placement validation.

`charge_enemy` uses the authored `charge` attack, Heavy Guard, 150 HP, 8 damage, 2 warning ticks, and 2 recovery ticks. A line starts one cell forward from Charge and contains five cells. Charge commits when its current position and a deterministic cardinal facing produce a legal line containing the player. If its current position cannot produce such a line, it uses the existing one-cell movement candidate contract toward a valid line origin or waits. Facing is selected as part of a move or commitment; no separate second action is introduced.

At detonation, damage is evaluated against the post-action player cell using the locked line. Damage resolves first. Charge then attempts to move to the farthest legal cell on that locked forward line, stopping before the first blocker and remaining in place if no legal landing exists. Only after the damage and landing follow-up are complete does Charge enter recovery.

## Relational Context

- A and A1 own the one-action Tick, shape-derived candidate planning, reservation arbitration, committed snapshots, telegraph cleanup, event ordering, and terminal invariants. Charge only supplies line eligibility and a deterministic resolution follow-up.
- Charge decision code declares an ordinary move, attack, or wait decision; it does not mutate World or own an independent `charging` activity. The shared phase resolves and commits the decision alongside every other enemy.
- The content/harness boundary expands the authored `line` shape into local forward offsets `{ x: 1..5, y: 0 }` and passes the Heavy Guard definition into `World.spawn()`.
- `enemy-actions.ts` must reject a line with an illegal, out-of-bounds, occupied, or blocking cell when selecting a commit or valid origin. It must not use generic shape-origin behavior that allows Charge to attack through blockers.
- `World` remains the sole owner of occupancy and landing validation. Landing must use the same atomic placement validation as `moveEntity()` and must not partially update the entity or occupancy map.
- `resolveEnemyPhase()` keeps the shared order: detonation, player damage/death events, cleared-telegraph projection, Charge landing, then recovery. A committed line is never rebuilt from the live player cell.
- Presentation consumes the existing movement, commit, detonation, landing, recovery, death, and reset events. The Charge visual presenter cannot apply the landing or damage itself.

## Scope

### Included

- Charge role activation and Heavy Guard integration.
- Five-cell cardinal line construction and legal-line validation.
- Deterministic movement toward a valid line origin.
- Locked detonation and farthest-legal landing.
- Ordered landing event, terminal cleanup, recovery, unit, and browser coverage.
- Standalone Charge sprite profile and feedback through the existing presentation path.

### Excluded

- Collision damage to enemies, forced displacement, multi-cell movement budgets, or Charge physics.
- General pathfinding beyond A1's existing bounded planner.
- Waves, spawn placement, enemy levels, or changes to player Mobility.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/enemies/enemy-actions.ts` | Medium | Add Charge line construction, blocker-aware eligibility, and landing metadata. |
| `src/core/actions/enemy-phase.ts` | Medium | Resolve Charge detonation, apply the locked landing follow-up, and preserve shared phase ordering. |
| `src/core/world/world.ts` | Medium | Add atomic Charge landing validation/application and keep terminal/occupancy invariants. |
| `src/core/events/combat-events.ts` | Small | Add the semantic Charge landing result while retaining generic attack events. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Spawn Charge at a deterministic line-origin setup with authored Heavy Guard data. |
| `src/content/enemies/assets/skull-sprite-sheet.png` | Small | Package the authored Charge runtime sprite. |
| `src/presentation/pixi/enemy-sprites.ts` | Medium | Add the standalone Charge profile and local feedback surface. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Present Charge-specific commit/detonation/landing feedback and track cleanup. |
| `test/unit/core/enemies/charge-enemy-actions.test.ts` | Large | Assert line geometry, blocker rules, lock, landing, miss, and recovery. |
| `test/unit/core/world/world.test.ts` | Medium | Assert atomic landing, occupancy preservation, and terminal cancellation. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Charge telegraph, detonation, landing, death/reset cleanup, and idle presentation. |

## Execution Outline

1. Add pure line tests for all four facings, edge clipping, blocker rejection, and valid origins using the authored Charge attack.
2. Implement Charge decision and commitment through the existing `EnemyDecision` and `CommittedAttack` boundaries. Keep facing changes inside the same action.
3. Add a locked landing descriptor to the committed snapshot and implement atomic farthest-legal landing after damage resolution and before recovery.
4. Add Charge to the deterministic arena and standalone sprite registry, then verify event and presentation cleanup after landing, death, and reset.

## Implementation Notes

- A line never includes the Charge origin. For facing `f`, its cells are `origin + f * 1` through `origin + f * 5`.
- A commit requires every line cell to be in bounds, legal terrain, and free of blocking occupancy except the player target where the existing attack contract permits target occupancy.
- Candidate facings use a fixed deduplicated order: current facing, cardinal direction toward the player when available, then the existing cardinal order. Choose the first valid line deterministically.
- If no facing at the current origin contains the player, derive valid origins from the line shape and let A1's one-cell candidate planner rank them. A failed candidate remains a movement failure, not an automatic attack or a second action.
- Store the committed line direction and origin in `CommittedAttack.metadata`, for example `{ landingOrigin, landingDirection, landingLength: 5 }`. The resolver must use this locked data and must not inspect the player's live cell to redirect landing.
- `enemy-phase.ts` may recognize the committed Charge kind only to order its landing follow-up after shared detonation and before shared recovery. It must not become a Charge-specific phase loop or direct destination authority.
- After damage is applied, test landing cells from farthest to nearest. Stop at the first illegal or occupied blocker; select the farthest legal cell before it. If no cell is legal, leave Charge at its origin.
- Emit `enemy_landed` only when Charge changes cell; preserve the shared `enemy_attack_detonated`, player damage/death, cleared-telegraph, and `enemy_recovering` order when no landing occurs.
- Landing must call an atomic World operation. A rejected landing leaves the original cell, footprint, occupancy, reservations, and phase unchanged.
- A Charge death during warning clears the pending line, telegraph, reservation, and landing metadata. No landing occurs later.

## Sprite Requirements

Charge uses a standalone profile rather than the A2 Kappa profile.

| Asset | Source | Sheet Layout | Scale | Palette | Notes |
| --- | --- | --- | --- | --- | --- |
| `skull_sprite_sheet.png` | `charge_enemy/assets/skull_sprite_sheet.png` | 4×4: columns down, up, left, right; rows idle, move, prepare, commit | 5× | Source orange/red tones | Standalone sheet |

- Use nearest-neighbour filtering, the shared directional frame selector, and the same cell-relative scale convention used by A2.
- Charge feedback is distinct but presentation-only: move lean/lunge, prepare pull-back/squash, commit forward lunge/stretch, damage flash, stagger tint, and terminal cleanup.
- Use the existing Charge windup/detonation visual hooks if present in the presentation layer; do not reproduce Godot scene or signal ownership. No presentation code may mutate landing or damage.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Player is not on a valid line | Charge moves toward a valid origin or waits; it does not commit an invalid line. |
| Player moves out of the locked line | Detonation misses damage but still resolves the line and landing lifecycle. |
| A line cell is blocked before commitment | That facing is invalid; try the next deterministic facing or movement candidate. |
| Landing cells are blocked | Land at the farthest legal cell before the blocker, or remain in place. |
| Landing overlaps another entity | World rejects the landing atomically; no partial movement occurs. |
| Charge dies while telegraphing | Clear line, telegraph, reservation, and pending landing immediately. |
| Charge reaches an arena edge | Out-of-bounds line cells are invalid; no clipped Charge attack is committed. |

## Acceptance Criteria

1. Charge commits only when an authored five-cell line containing the player is legal and the committed line remains stable through warning.
2. Detonation damages only the post-action player cell if it is contained in the locked line and never retargets from live state.
3. Charge lands atomically at the farthest legal cell on its committed line, or safely remains in place when blocked.
4. Damage precedes landing, landing precedes recovery, and the ordered semantic events and presentation reach idle after reset.
5. Charge uses Heavy Guard and the shared terminal cleanup, reservation, recovery, and browser contracts.
