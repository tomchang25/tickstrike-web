# Hardening d — Capability Interfaces for Phases (Implementation Spec)

> **Parent**: [engineering_hardening.md](engineering_hardening.md)
> **Prerequisite**: spec b (golden gate live). Independent of spec c.
> **Suggested tier**: interface design (d1) is an Opus/Fable-class decision; the per-phase migrations (d2–d4) are mechanical once the shape is fixed — Sonnet-class, one phase per session.
> **Status**: d1 done (2026-07-21) — capability surface landed, shapes recorded below. d2–d4 not started.

## Goal

Change the shape of extension so `World`'s facade stops being where new capabilities land. Phases and behaviors receive narrow capability handles (the subsystems A6 extracted, plus a read-only entity view) instead of the whole `World`. What a phase does not receive, it physically cannot mutate — extending the determinism stance from discipline to construction.

## Premise correction (recorded)

The improvement report that motivated this spec proposed extracting an "EnemyCombatState owner" from `World`. **That extraction already happened**: A6 Step 4b moved the entire enemy combat lifecycle (facing/decision/activity/recovery/rest/commit/warning/resolution, damage and guard application) into `CombatOperations`; `world.ts` retains 42 substantive methods plus 40 single-line delegations. The remaining work is the part the A6 Step 5 audit recorded as "candidates for later caller migration, deliberately not done": handing callers the subsystem handles and freezing the facade.

## Design

### d1 — Capability surface

`World` exposes its composed subsystems as readonly handles plus a small read-only view for entity queries. The per-phase context types compose that view with the narrow handles each phase mutates, so a phase declares exactly the capabilities it uses and physically cannot reach the rest of `World`.

**Decisions (recorded 2026-07-21, landed in code):**

- **Handle names**: `world.board`, `world.combat`, `world.waves`, `world.run` — the existing private field names, now `public readonly`. The spatial handle stays `board` (not the sketch's `grid`) so no field is renamed inside the determinism-critical `world.ts`; the class is still `GridBoard`. Exposing four private fields as public is a visibility widening only — zero runtime effect, so determinism cannot be touched.
- **Entity view = a new interface, `WorldView`** (`getEntity`/`requireEntity`/`listEntities`/`listActiveEntities`/`playerCell`/`armedSmashTarget`/`arena`/`tick`/`outcome`), re-typing existing facade reads. It lives in `src/core/world/world.ts` (not `actions/`) so `World implements WorldView` needs no `world -> actions` import, which would cycle with `actions -> world`. `World` gained **zero methods**; `implements WorldView` is a compile-time assertion that proves the read model matches the real facade.
- **`resolveCommittedAttackTransaction` surfacing**: it stays a `World`-owned orchestration entry (the sole composer that spans board placement + combat damage, per the A6 audit) and is named on `EnemyPhaseContext` as a single method. The object it yields is already the narrow `AttackResolutionTransaction`. Naming the one entry point does not re-expose the rest of `World`.

**Per-phase context shapes (decided here; each `.ts` is written in its migration step, co-located with the phase, so no interface lands without its consumer):**

- `EnemyPhaseContext` = `WorldView` + `board` (spatial reads: `isWalkable`/`isInside`/`isLegalCell`; movement reservations: `requestMovementReservations`/`releaseReservation`; telegraph reads) + `combat` (status/recovery/rest advance, decision/facing/resting setters, `commitEnemyAttack`/`decrementEnemyAttackWarning`/`retargetCommittedAttack`) + orchestration `moveEntity` and `resolveCommittedAttackTransaction`.
- `PlayerActionContext` = `WorldView` + `board` (`isWalkable`, `getReservation`, `getTelegraph`) + `combat` (`applyBasicHit`/`applyDirectionalHit`) + orchestration `moveEntity`/`moveEntityToPhase`/`setPhase`/`preparePlayerAction`/`beginMobilityInvulnerability`/`setMobilityCooldown`/`armSmash`/`clearArmedSmash`.
- Wave context = the **existing** content-projection `WavePhaseContext` (groups/progressionProfile/`waveFor`/`buildEnemySpawnInput`/offerableArtifacts) paired with a new capability half: `WorldView` + `board` (spawn-placement legality + reservation/telegraph writes) + `waves` + `run` handles + the `random` streams + orchestration `spawn`.

**Two blast-radius notes for the migration steps, decided here:**

1. **Enemy behavior hooks migrate with d2.** `EnemyBehavior.retarget(world, …)` and `resolveAttack(world, …)` (`src/core/enemies/enemy-behavior.ts`) take `World` and mutate through `world.resolveCommittedAttackTransaction` and the shared resolution. d2 migrates these two hook signatures to receive the `EnemyPhaseContext` (or a behavior-scoped subset of it) alongside the phase, gated by the golden. `EnemyBehavior.decide` already takes the narrow `EnemyDecisionContext` and is untouched. This is the widest single reach in the spec and is why d2 is the highest-tier migration.
2. **Preview functions accept `WorldView`.** `previewAttack`/`previewDash`/`previewSmash` only read; because `World implements WorldView`, they can be retyped to take `WorldView` when `player-actions` migrates in d3. Optional nicety, not required for the freeze.

The reward-selection player-stat mutators (`setNormalAttackDamage`/`setMobilityDamage`/`setMobilityCooldownConfig`/`setMobilityRange`/`raiseMaxHealth`) surface on the wave/reward capability half for now; the A6 audit already assigns them to the character/Viking artifact work, so d4 names them but does not try to relocate them.

### d2–d4 — Migrate one phase per step

`enemy-phase` (widest use of the combat cluster), then `player-actions`, then `wave-phase`. Each migration: construct the context in `action-resolver`, change the phase's signature, leave the facade delegations in place (tests and harness still use them — Step 5 decision stands).

### d5 — Freeze the facade

Add the rule to `dev/standards/gameplay_feature_architecture.md`: new capabilities land on a subsystem and are reached through a context; adding a `World` facade method requires justifying why it is world-level orchestration (the bar `resolveCommittedAttackTransaction` meets). If dependency-cruiser can express "phases must not import `World`'s type" after migration, add the rule; otherwise this stays a review rule.

## Out of scope

- Removing the existing facade delegations (tests and harness keep them; revisit only if they decay naturally).
- Entity-lifecycle subsystem (`setPhase` cascade) — the A6 audit's "sixth subsystem" note stands; it is not needed for this spec and would widen the blast radius.
- Any behavior change; golden suite must stay byte-identical.

## Acceptance criteria

1. No phase function takes `World` as a parameter; each declares a context naming exactly the capabilities it uses.
2. Golden determinism suite and full unit/e2e suites pass unmodified.
3. The facade-freeze rule is in the standard, and `world.ts` gained zero methods during this spec.
4. A deliberately misplaced capability (e.g. a new setter added to `World` instead of a subsystem) is caught by the standard's rule — mechanically if expressible, otherwise by the documented review bar.

## Outcome

### d1 — Capability surface (completed 2026-07-21)

`world.ts` now exposes `board`/`combat`/`waves`/`run` as `public readonly` handles and declares `class World implements WorldView`, where `WorldView` is the read-model interface defined in the same file. No method was added to `World`; the change is a visibility widening plus one `implements` clause, so it is behavior-preserving by construction. `npm run check` passes (335 unit tests including the determinism goldens, plus the production build); the golden suite is byte-identical, confirming zero core behavior change.

The per-phase context shapes and the two migration blast-radius notes (enemy behavior hooks in d2, preview retyping in d3) are recorded in the Design section above. Each context interface's `.ts` is deliberately deferred to its migration step so no interface lands without its consumer; `WorldView` is the only type landed now, and it has an immediate consumer in the `implements` clause. d2 (`enemy-phase` + its behavior hooks) is the next step and the highest-tier of the three migrations.
