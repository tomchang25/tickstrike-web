# Hardening d — Capability Interfaces for Phases (Implementation Spec)

> **Parent**: [engineering_hardening.md](engineering_hardening.md)
> **Prerequisite**: spec b (golden gate live). Independent of spec c.
> **Suggested tier**: interface design (d1) is an Opus/Fable-class decision; the per-phase migrations (d2–d4) are mechanical once the shape is fixed — Sonnet-class, one phase per session.

## Goal

Change the shape of extension so `World`'s facade stops being where new capabilities land. Phases and behaviors receive narrow capability handles (the subsystems A6 extracted, plus a read-only entity view) instead of the whole `World`. What a phase does not receive, it physically cannot mutate — extending the determinism stance from discipline to construction.

## Premise correction (recorded)

The improvement report that motivated this spec proposed extracting an "EnemyCombatState owner" from `World`. **That extraction already happened**: A6 Step 4b moved the entire enemy combat lifecycle (facing/decision/activity/recovery/rest/commit/warning/resolution, damage and guard application) into `CombatOperations`; `world.ts` retains 42 substantive methods plus 40 single-line delegations. The remaining work is the part the A6 Step 5 audit recorded as "candidates for later caller migration, deliberately not done": handing callers the subsystem handles and freezing the facade.

## Design

### d1 — Capability surface

`World` exposes its composed subsystems as readonly handles (`world.grid`, `world.combat`, `world.waves`, `world.run` — final names decided here) plus a small read-only view for entity queries (`getEntity`/`requireEntity`/`listEntities`/`playerCell`/`tick`/`outcome`). Define per-phase context types, e.g.:

- `EnemyPhaseContext`: combat handle, grid reads + movement reservations, entity view, the attack-resolution transaction entry point.
- `PlayerActionContext`: entity view, grid reads, combat damage application, mobility/smash operations.
- `WavePhaseContext` (extends the existing one): waves + run handles, spawn placement via grid, entity view.

Decisions to make in d1 and record here: exact handle names; whether the entity view is a new interface or the existing facade methods re-typed; how `resolveCommittedAttackTransaction` (World-owned composer, per the A6 audit) surfaces on a context without re-exposing all of `World`.

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
