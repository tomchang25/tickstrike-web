# Bomb Enemy Guardless Self-Destruct

Parent Plan: `port_07_complete_enemy_roster_and_navigation.md`

## Goal

Activate Bomb on the existing enemy activity model as a guardless Special enemy. Bomb must commit only from the player's adjacent ring, lock a radius-four Manhattan explosion around its own cell, and self-destruct exactly once when the fuse resolves.

## Summary

The A/A1 shared action lifecycle already owns accepted-Tick gating, commitment, telegraph countdown, reservations, event ordering, and terminal cleanup. This child adds Bomb's adjacent-ring decision, self-centered area geometry, guardless countdown handling, and terminal detonation follow-up.

`bomb_enemy` uses `bomb_area`, 50 HP, no Guard, 3 warning ticks, 1 authored recovery tick, and a Manhattan radius-four area. The adjacent commitment ring includes all eight neighboring cells and excludes Bomb's own cell. On commitment, Bomb snapshots its own cell as the explosion center and keeps that center fixed through the fuse. At resolution, the post-action player cell is checked against the locked area, the result is emitted, and Bomb transitions directly to the same terminal/death path used elsewhere (not recovery), reusing existing terminal cleanup. Bomb never enters Guard, Stagger, or recovery.

Killing Bomb before warning reaches zero disarms it. World clears its pending attack and telegraph through the existing terminal path, so no later phase can detonate or display a stale logical effect.

## Relational Context

- A and A1 own the role-neutral committed snapshot, one-action Tick, reservation arbitration, telegraph ownership, event ordering, and terminal cleanup. Bomb must not add a second runtime or bypass those operations.
- The content/harness boundary resolves `bomb_enemy` with `role: "bomb"`, `{ type: "bomb", commitment: "adjacent" }` metadata, `bomb_area` timing/damage, and normalized Manhattan offsets.
- `EntityState.guard` remains optional. `advanceEnemyStatuses()` and all generic attack countdown paths must not require Guard for an enabled Bomb; the absence of Guard must not disable countdown processing for other enemies.
- World remains authoritative for HP, phase, occupancy, reservations, telegraphs, and encounter outcome. The self-destruct transition must be atomic with pending-attack cleanup.
- Bomb detonation must use the same `enemy_attack_detonated` and player damage events as other enemies, plus a semantic `enemy_self_destructed` result so browser assertions can distinguish a miss from an enemy that simply recovered. Bomb's terminal transition also emits the standard `enemy_died` (`attackerId` = Bomb's own entity id) to reuse existing death teardown and presentation view-removal unchanged.
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
| `src/core/enemies/area-shapes.ts` | Small (new) | Generic shape→offsets resolver (starting with `{ shape: "manhattan", radius }`) shared by content validation and runtime geometry, so validated shapes and generated offsets cannot diverge. |
| `src/core/enemies/enemy-actions.ts` | Medium | Add adjacent-ring eligibility and self-centered area geometry via the new shape resolver. |
| `src/core/actions/enemy-phase.ts` | Medium | Resolve Bomb detonation without requiring Guard; route to the terminal/death path instead of recovery. |
| `src/core/world/world.ts` | Medium | Apply locked Bomb damage, clear telegraph, and atomically transition Bomb through the existing terminal/death path (`resolveCommittedEnemyAttack` branches on `metadata.selfDestruct` to skip `recovering`). |
| `src/core/events/combat-events.ts` | Medium | Add `enemy_self_destructed`; Bomb's terminal transition also emits the standard `enemy_died` (with `attackerId` set to Bomb's own entity id) so existing death teardown applies unchanged. |
| `src/harness/fixtures/shipped-arena.ts` | Medium | Generalize `actionFor` to resolve `shape: "manhattan"` (via the new shape resolver) and to omit `guardDefinition` when `guardId` is null; add deterministic Bomb placement and a kill-before-fuse scenario setup. |
| `src/content/enemies/assets/lantern-red-sprite-sheet.png` | Small | Package the authored Bomb runtime sprite (kebab-case, matching `kappa-green-sprite-sheet.png` convention). |
| `src/presentation/pixi/enemy-sprites.ts` | Medium | Extend `EnemySpriteSheetKey`/`EnemySpritePalette` for Bomb; add a generic independent alpha/blink channel to `EnemyPresentation` (separate from `tintTimeline`), reusable by future Special roles. |
| `src/presentation/timelines/PresentationDirector.ts` | Medium | Present fuse blink, explosion, self-destruct, cancellation, and terminal cleanup without orphan effects. On `enemy_self_destructed`, drive the blink/explosion visual; on the accompanying `enemy_died`, reuse the existing terminal view-removal path. |
| `test/unit/core/enemies/bomb-enemy-actions.test.ts` | Large | Assert commitment, footprint lock, fuse, disarm, hit/miss self-death, and reset. |
| `test/unit/core/world/world.test.ts` | Medium | Assert guardless countdown, atomic terminal cleanup, occupancy release, and no later detonation. |
| `test/e2e/testbed.spec.ts` | Medium | Observe Bomb fuse, hit/miss detonation, self-destruction, kill-before-fuse, reset, and idle cleanup. |

## Execution Outline

1. Add pure adjacent-ring and Manhattan footprint tests using the authored Bomb data.
2. Normalize Bomb role metadata in the fixture/action boundary and implement the guardless decision branch without changing generic countdown behavior.
3. Resolve the locked explosion and terminal transition atomically, emitting `enemy_self_destructed` and `enemy_died` exactly once each and never starting recovery, reusing the existing die/terminal path.
4. Add Bomb to the same deterministic arena and presentation registry, then cover hit, miss, kill-before-fuse, reset, and browser cleanup.

## Implementation Notes

- Adjacent eligibility is `max(abs(dx), abs(dy)) === 1`; it includes diagonal neighbors and excludes zero distance.
- Generate the explosion from Bomb's commit cell, not the player cell, using the generic `{ shape: "manhattan", radius }` resolver in `src/core/enemies/area-shapes.ts`. Include all in-bounds cells whose Manhattan distance from the center is at most 4; remove duplicates. This resolver is the single source of truth for manhattan-shape geometry — content-schema validation and runtime offset generation must not diverge.
- The committed snapshot must include the center and a terminal/self-destruct marker, for example `{ center, selfDestruct: true }`. Warning, damage, recovery, and attack ID remain copied from authored data.
- The fuse decrements only during accepted world advancement. Rejected commands do not decrement it. With warning 3 at commitment, three subsequent accepted enemy phases reach detonation.
- At detonation, clear the telegraph, evaluate the post-action player cell against the locked cells, apply player damage if present, emit `enemy_attack_detonated`, emit the player result events, emit `enemy_self_destructed`, then emit `enemy_died` with `attackerId` set to Bomb's own entity id, and transition Bomb through the existing terminal/death path. Event order is fixed: `enemy_attack_detonated` → player result events → `enemy_self_destructed` → `enemy_died` → terminal transition.
- `resolveCommittedEnemyAttack` branches on `attack.metadata.selfDestruct` to skip setting `activity: "recovering"` and instead routes to the terminal/death transition; `enemy-phase.ts` must not emit `enemy_recovering` for this path.
- Reusing the existing `enemy_died` path means Bomb's terminal transition gets standard death teardown (view removal, occupancy/reservation/telegraph/committed-attack/activity cleanup) for free — the operation is still one atomic World-owned mutation.
- Bomb self-destructs on both hit and miss and does so exactly once. It must not call the generic recovery path.
- If Bomb becomes terminal before fuse completion, existing terminal cleanup clears the committed attack and telegraph; the countdown loop must skip it.
- Do not use a missing Guard as a signal to skip generic processing for other enabled enemies.
- Generalize `shipped-arena.ts`'s `actionFor` helper to resolve `shape: "manhattan"` (via the shared shape resolver, alongside the existing `custom-offsets` handling) and to omit `guardDefinition` when `guardId` is null, so Bomb (and future guardless/area roles such as Charge) can be spawned through the same fixture helper.

## Sprite Requirements

Bomb uses a standalone profile and adds a fuse blink independent from the damage-flash tint channel.

| Asset | Source | Sheet Layout | Scale | Palette | Notes |
| --- | --- | --- | --- | --- | --- |
| `lantern-red-sprite-sheet.png` | `bomb_enemy/assets/lantern-red-sprite-sheet.png` | 4×4: columns down, up, left, right; rows idle, move, prepare, commit | 5× | Dark red/black tones | Standalone sheet, kebab-case filename matching the existing `kappa-green-sprite-sheet.png` convention |

- Use nearest-neighbour filtering, the shared directional frame selector, and the A2 cell-relative scale convention.
- Extend `EnemySpriteSheetKey`/`EnemySpritePalette` in `enemy-sprites.ts` with the Bomb entry, and register the new import alongside the other sheets.
- Add a generic independent alpha/blink channel to `EnemyPresentation` (e.g. `blinkTimeline`, parallel to the existing `tintTimeline`), not a Bomb-only field, so future Special roles can reuse it. Bomb uses standard move/prepare/commit/damage/death feedback plus this channel: 0.22s interval during fuse start and 0.09s interval after commitment, with a minimum alpha of 0.35.
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
3. Bomb self-destructs exactly once on hit or miss via the existing die/terminal path (`enemy_self_destructed` followed by `enemy_died`), never enters Guard/Stagger/recovery, and is fully disarmed by earlier death.
4. Unit and browser assertions prove terminal occupancy release, telegraph/event cleanup, fuse cancellation, and an idle presentation via the reused death view-removal path.
