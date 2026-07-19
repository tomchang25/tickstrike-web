# Bomb Enemy Guardless Self-Destruct

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate Bomb on the existing enemy activity model as a guardless Special enemy. Bomb must commit only from the player's adjacent ring, lock a radius-four Manhattan explosion around its own cell, and self-destruct exactly once when the fuse resolves.

## Summary

The A/A1 shared action lifecycle already owns accepted-Tick gating, commitment, telegraph countdown, reservations, event ordering, and terminal cleanup. This child adds Bomb's adjacent-ring decision, self-centered area geometry, guardless countdown handling, and terminal detonation follow-up.

`bomb_enemy` uses `bomb_area`, 50 HP, no Guard, 3 warning ticks, 1 authored recovery tick, and a Manhattan radius-four area. The adjacent commitment ring includes all eight neighboring cells and excludes Bomb's own cell. On commitment, Bomb snapshots its own cell as the explosion center and keeps that center fixed through the fuse. At resolution, the post-action player cell is checked against the locked area, the result is emitted, and Bomb transitions directly to terminal state. Bomb never enters Guard, Stagger, or recovery.

Killing Bomb before warning reaches zero disarms it. World clears its pending attack and telegraph through the existing terminal path, so no later phase can detonate or display a stale logical effect.

## Relational Context

- A and A1 own the role-neutral committed snapshot, one-action Tick, reservation arbitration, telegraph ownership, event ordering, and terminal cleanup. Bomb must not add a second runtime or bypass those operations.
- The content/harness boundary resolves `bomb_enemy` with `role: "bomb"`, `{ type: "bomb", commitment: "adjacent" }` metadata, `bomb_area` timing/damage, and normalized Manhattan offsets.
- `EntityState.guard` remains optional. `advanceEnemyStatuses()` and all generic attack countdown paths must not require Guard for an enabled Bomb; the absence of Guard must not disable countdown processing for other enemies.
- World remains authoritative for HP, phase, occupancy, reservations, telegraphs, and encounter outcome. The self-destruct transition must be atomic with pending-attack cleanup.
- Bomb detonation must use the same `enemy_attack_detonated` and player damage events as other enemies, plus a semantic self-destruct result so browser assertions can distinguish a miss from an enemy that simply recovered.
- A2's presentation director owns timeline lifetime. Bomb uses a standalone profile and fuse-blink visual, but the fuse visual is never a gameplay timer and must be killed on disarm, reset, terminal removal, or generation replacement.

## Scope

### Included

- Guardless Bomb activation in the shared arena.
- Eight-cell adjacent-ring eligibility.
- Radius-four Manhattan footprint centered on Bomb's commit cell.
- Three accepted-Tick warning countdown and locked hit/miss resolution.
- Atomic self-destruction, kill-before-fuse disarm, reset cleanup, unit, and browser coverage.
- Standalone Bomb sprite profile and independent fuse-blink presentation.

### Excluded

- Guard, Stagger, Protection, or Bomb recovery behavior.
- Damage falloff, physics, terrain destruction, waves, spawn warnings, rewards, and additional Special roles.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/model/types.ts` | Medium | Add the narrow guardless/self-destruct and terminal follow-up snapshot data required by World and events. |
| `src/core/enemies/enemy-actions.ts` | Medium | Add adjacent-ring eligibility and self-centered Manhattan geometry. |
| `src/core/actions/enemy-phase.ts` | Medium | Resolve Bomb detonation without requiring Guard or entering recovery. |
| `src/core/world/world.ts` | Medium | Apply locked Bomb damage, clear telegraph, and atomically transition Bomb to terminal state. |
| `src/core/events/combat-events.ts` | Medium | Add an observable Bomb self-destruct result while retaining standard terminal events. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Add deterministic Bomb placement and a kill-before-fuse scenario setup. |
| `src/content/enemies/assets/lantern_red_sprite_sheet.png` | Small | Package the authored Bomb runtime sprite. |
| `src/presentation/pixi/enemy-sprites.ts` | Medium | Add Bomb profile and fuse-blink controls. |
| `src/presentation/timelines/PresentationDirector.ts` | Medium | Present fuse blink, explosion, self-destruct, cancellation, and terminal cleanup without orphan effects. |
| `test/unit/core/enemies/bomb-enemy-actions.test.ts` | Large | Assert commitment, footprint lock, fuse, disarm, hit/miss self-death, and reset. |
| `test/unit/core/world/world.test.ts` | Medium | Assert guardless countdown, atomic terminal cleanup, occupancy release, and no later detonation. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Bomb fuse, hit/miss detonation, self-destruction, kill-before-fuse, reset, and idle cleanup. |

## Execution Outline

1. Add pure adjacent-ring and Manhattan footprint tests using the authored Bomb data.
2. Normalize Bomb role metadata in the fixture/action boundary and implement the guardless decision branch without changing generic countdown behavior.
3. Resolve the locked explosion and terminal transition atomically, emitting the self-destruct event exactly once and never starting recovery.
4. Add Bomb to the same deterministic arena and presentation registry, then cover hit, miss, kill-before-fuse, reset, and browser cleanup.

## Implementation Notes

- Adjacent eligibility is `max(abs(dx), abs(dy)) === 1`; it includes diagonal neighbors and excludes zero distance.
- Generate the explosion from Bomb's commit cell, not the player cell. Include all in-bounds cells whose Manhattan distance from the center is at most 4; remove duplicates.
- The committed snapshot must include the center and a terminal/self-destruct marker, for example `{ center, selfDestruct: true }`. Warning, damage, recovery, and attack ID remain copied from authored data.
- The fuse decrements only during accepted world advancement. Rejected commands do not decrement it. With warning 3 at commitment, three subsequent accepted enemy phases reach detonation.
- At detonation, clear the telegraph, evaluate the post-action player cell against the locked cells, apply player damage if present, emit `enemy_attack_detonated`, emit the player result events, emit `enemy_self_destructed`, and transition Bomb to terminal state.
- The terminal operation must release occupancy, reservations, telegraph, committed attack, and activity in one World-owned mutation. Presentation may retain an explosion/death visual after the logical transition.
- Bomb self-destructs on both hit and miss and does so exactly once. It must not call the generic recovery path.
- If Bomb becomes terminal before fuse completion, existing terminal cleanup clears the committed attack and telegraph; the countdown loop must skip it.
- Do not use a missing Guard as a signal to skip generic processing for other enabled enemies.

## Sprite Requirements

Bomb uses a standalone profile and adds a fuse blink independent from the damage-flash tint channel.

| Asset | Source | Sheet Layout | Scale | Palette | Notes |
| --- | --- | --- | --- | --- | --- |
| `lantern_red_sprite_sheet.png` | `bomb_enemy/assets/lantern_red_sprite_sheet.png` | 4×4: columns down, up, left, right; rows idle, move, prepare, commit | 5× | Dark red/black tones | Standalone sheet |

- Use nearest-neighbour filtering, the shared directional frame selector, and the A2 cell-relative scale convention.
- Use standard move/prepare/commit/damage/death feedback plus a profile-local alpha blink: 0.22s interval during fuse start and 0.09s interval after commitment, with a minimum alpha of 0.35.
- Keep blink on the sprite alpha/self-modulate channel separate from damage tint/modulate. Kill it on disarm, detonation, death, reset, and presentation generation cancellation.
- Do not add a presentation-owned gameplay timer or a Godot `force_death()` equivalent. The director reacts to semantic events and the World owns terminal state.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Player is diagonally adjacent | Bomb may commit because the full eight-cell ring is valid. |
| Player shares Bomb's cell | Bomb does not commit from zero distance. |
| Player leaves the footprint before detonation | Resolve with no player damage, then self-destruct. |
| Bomb dies before the fuse ends | Clear attack, telegraph, reservations, fuse visual, and later explosion. |
| Reset occurs during the fuse | Replacement World has no Bomb attack, telegraph, reservation, or transient fuse effect. |
| Bomb has no Guard | It still decrements warning and resolves normally; no Guard/Stagger access is attempted. |
| Bomb reaches an arena edge | Commit only in-bounds cells; do not create duplicate footprint cells. |

## Acceptance Criteria

1. Bomb commits only from the authored eight-cell adjacent ring and locks a radius-four Manhattan footprint centered on Bomb.
2. The footprint and 50 damage remain fixed through three accepted world advances and resolve against the post-action player cell.
3. Bomb self-destructs exactly once on hit or miss, never enters Guard/Stagger/recovery, and is fully disarmed by earlier death.
4. Unit and browser assertions prove terminal occupancy release, telegraph/event cleanup, fuse cancellation, and an idle presentation.
