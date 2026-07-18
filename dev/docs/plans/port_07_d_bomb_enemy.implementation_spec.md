# Bomb Enemy Guardless Self-Destruct

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

Status: Draft implementation spec

## Goal

Activate Bomb as a guardless Special enemy that approaches the player's adjacent ring, locks a Manhattan-area explosion, and self-destructs after the fuse. Killing Bomb before detonation must disarm it completely.

## Summary

Bomb uses the authored adjacent commitment tuning, radius-four Manhattan attack, 50 damage, and three-tick warning. The commitment center is Bomb's own cell at the moment of commitment and remains fixed through the fuse. Detonation checks the player's post-action cell, emits the explosion result, then transitions Bomb to terminal state without entering recovery or Guard/Stagger.

## Relational Context

- Child A owns generic attack commitment, terminal cleanup, and event ordering; Bomb supplies adjacent-ring eligibility and self-destruct resolution.
- Bomb has no Guard runtime. Shared status advancement must still handle its attack countdown and terminal transition without assuming every enabled enemy has Guard.
- World remains the sole owner of HP, terminal phase, occupancy, reservations, telegraph cleanup, and encounter outcome.
- A player hit during the fuse uses the normal damage path. If Bomb becomes terminal, its pending attack and telegraph are cleared before any later enemy phase.
- Presentation consumes Bomb commit, detonation, damage, and terminal events; the fuse visual is not a gameplay timer.

## Scope

### Included

- Guardless Bomb activation in the shared arena.
- Adjacent-ring commitment and radius-four Manhattan footprint.
- Three-tick locked fuse and self-destruction on resolution.
- Disarm, reset, terminal cleanup, unit, and browser coverage.

### Excluded

- Guard, Stagger, Protection, or Bomb recovery behavior.
- New explosion damage falloff, physics, or terrain destruction.
- Waves, spawn warnings, rewards, and additional Special roles.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Represent guardless self-destruct and terminal attack metadata in the runtime snapshot. |
| `src/core/world/world.ts` | Medium | Resolve Bomb's locked damage, terminal transition, and no-recovery cleanup. |
| `src/core/enemies/basic-enemy-actions.ts` | Medium | Add adjacent-ring eligibility and Manhattan geometry to the shared action boundary. |
| `src/core/actions/enemy-phase.ts` | Medium | Resolve Bomb detonation without requiring Guard status advancement. |
| `src/core/events/combat-events.ts` | Medium | Add an observable self-destruct result while preserving standard terminal events. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Add deterministic Bomb placement to the existing scenario. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Present Bomb explosion and terminal cleanup without orphan effects. |
| `test/unit/core/enemies/bomb-enemy-actions.test.ts` | Large | Assert commitment, footprint lock, fuse, disarm, self-death, and reset. |
| `test/unit/core/world/world.test.ts` | Medium | Assert guardless terminal cleanup and no later detonation. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Bomb fuse, hit/miss detonation, self-destruction, and idle cleanup. |

## Execution Outline

1. Add adjacent-ring and Manhattan footprint tests using authored Bomb data.
2. Implement guardless Bomb commitment and locked fuse through the shared lifecycle without adding a separate runtime.
3. Resolve the explosion and terminal transition atomically, including the self-destruct event and presentation cleanup.
4. Add kill-before-fuse, miss, reset, and browser scenarios in the same deterministic arena.

## Implementation Notes

- The adjacent ring includes all eight neighboring cells and excludes Bomb's own cell.
- The Manhattan footprint is centered on Bomb's commit cell, not the player cell, and includes only in-bounds legal cells.
- Bomb self-destructs on both hit and miss. It never starts recovery after detonation.
- A terminal Bomb must release occupancy and clear the telegraph immediately; the visual explosion may finish asynchronously.
- Do not make Bomb's absence of Guard disable generic attack countdown processing for other roles.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Player is diagonally adjacent | Bomb may commit because the full eight-cell ring is valid. |
| Player shares Bomb's cell | Bomb does not commit from zero distance. |
| Player leaves the footprint before detonation | The explosion resolves with no player damage but Bomb still self-destructs. |
| Bomb dies before the fuse ends | The pending attack, telegraph, and later explosion are cancelled. |
| Reset occurs during the fuse | The replacement world has no pending Bomb attack, telegraph, or transient effect. |

## Acceptance Criteria

1. Bomb commits only from the authored adjacent ring and locks a radius-four Manhattan footprint.
2. The footprint and damage remain fixed for three accepted world advances and resolve against the post-action player cell.
3. Bomb self-destructs exactly once on hit or miss, never enters Guard/Stagger/recovery, and is disarmed by earlier death.
4. Unit and browser assertions prove terminal occupancy, telegraph, event, and presentation cleanup.
