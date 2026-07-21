# A6 — World Ownership Split (Implementation Spec)

> **Parent**: [gameplay_architecture_refactor.mega_plan.md](gameplay_architecture_refactor.mega_plan.md) §5 A6
> **Status**: Done — completed 2026-07-21; see the Outcome section.
> **Prerequisites**: A1–A5 landed (behavior registry, attack transaction, presenter registry, feature registration)

## Goal

Split `src/core/world/world.ts` (~1,595 lines, ~97 methods) into subsystem modules that each own one kind of state, while `World` remains a delegating facade so no caller, test, or scenario changes its API. This is debt repayment, not firefighting: after A1–A5 no feature work touches `world.ts`, so the split is purely behavior-preserving and can be interleaved with content work between steps.

## Constraints (all steps)

1. Behavior-preserving: same seed + same commands → identical events, snapshots, occupancy, and outcome. No combat-rule, tick-order, or event-order change of any kind.
2. `World`'s public API is frozen during the split. Callers (`action-resolver`, `enemy-phase`, `wave-phase`, behaviors, harness, tests) keep compiling unchanged; facade methods delegate.
3. Full unit suite green after every step; a step is one commit.
4. Subsystems communicate through explicit references passed at construction, never through import-time singletons.
5. Determinism guards: `RandomStreams` stays owned by `World` and is passed down; no subsystem creates its own randomness; entity iteration order (registration index) is preserved exactly.

## Current ownership inventory (what moves where)

`World` state today: `entities`, `occupancy`, `reservations`, `telegraphs`, `currentPlayerCell`, `currentArmedSmashTarget`, `currentWaveRuntime`, `currentRunBuild`, `currentPendingReward`, `currentTick`, `currentOutcome`, `nextRegistrationIndex`, `lastEvents`, plus `RandomStreams` and arena geometry.

Target layout (all under `src/core/world/`):

```text
World (facade + entity repository + tick/outcome + snapshot)
├── GridBoard          occupancy, reservations, footprint claim/release,
│                      movement validation, walkability, atomic displacement,
│                      the staged half of resolveCommittedAttackTransaction
├── TelegraphBoard     telegraph set/clear/query (folds into GridBoard if trivial)
├── CombatOperations   applyDamage, guard/stagger/protection state advance,
│                      directional-hit application, committed-attack lifecycle
├── WaveRuntime        wave scheduler state, pending spawn batches, admission
└── RunBuildState      artifact stacks, triggers, pending reward offer
```

`World` keeps: entity map + registration order, player-cell cache, tick counter, encounter outcome, `snapshot()`, `RandomStreams`, and every existing public method as a delegation.

## Extraction order

Ordered by decreasing caller fan-in risk isolation — each step leaves the previous ones untouched.

### Step 1 — GridBoard

Move occupancy map, reservation map, footprint claim/release/translate, `isWalkable`/`isLegalCell`/`isInside` spatial checks, `requestMovementReservations`, `releaseReservation`, `moveEntity`'s spatial half, and the working-occupancy transaction internals of `resolveCommittedAttackTransaction` into `GridBoard`. `World` constructs one board from arena geometry and delegates. Entity data stays in `World`; the board indexes ids against cells only — it answers spatial questions and never reads hp, activity, or roles.

Risk note: `resolveCommittedAttackTransaction`'s commit interleaves spatial moves with damage application. Split it as: board provides `beginDisplacementTransaction()` (working view, staged moves, atomic apply); `World` keeps the commit orchestration (damage application order, telegraph clear, recovery) and composes the two. The externally visible transaction API and its ordering guarantees stay identical.

### Step 2 — WaveRuntime

Move `currentWaveRuntime`, pending spawn batch state, and every `wave*`/spawn-admission method into a `WaveRuntime` owned by `World`. Spawn placement still calls into `GridBoard` for legality via `World`.

### Step 3 — RunBuildState

Move `currentRunBuild` + `currentPendingReward` and their methods (stack application, trigger registration, offer lifecycle) into `RunBuildState`. This step is a prerequisite cleanup for the character/Viking plan's artifact work — land it before that plan executes.

### Step 4 — CombatOperations

Move `applyDamage`, guard/stagger/protection advancement, committed-attack commit/decrement/resolve, and directional-hit application into `CombatOperations` (reads entities via `World`, mutates through explicit setters or a narrow interface). This is last because it has the widest fan-in.

### Step 5 — Facade audit

Measure what remains in `world.ts` (expect roughly entity repository + delegation + snapshot, on the order of a few hundred lines). Decide explicitly which delegations to keep forever (public contract) versus which callers should migrate to subsystem handles later — record the decision in the mega plan; do not migrate callers in this pass.

## Out of scope

- Any caller migration off the `World` facade.
- Snapshot format, event ordering, or `GameRuntime` changes.
- Stateful entity/component work (Phase B; gated separately).
- Moving subsystems out of `src/core/world/` (layout stays; only ownership moves).

## Acceptance criteria

1. `world.ts` no longer directly owns occupancy, reservation, telegraph, wave, run-build, or pending-reward fields; each lives in exactly one subsystem module.
2. Every existing unit test passes unmodified except mechanical import/type updates; scenario and e2e suites pass unmodified.
3. Same-seed determinism spot check: `charge-enemy`, `rewards`, and `waves` scenarios produce identical event sequences before and after the split.
4. No subsystem imports another subsystem's internals; composition happens only in `World`'s constructor.

## Outcome (Step 5 audit)

Completed 2026-07-21. `world.ts` went from 1,658 lines to 963. Subsystems: `grid-board.ts` (496), `combat-operations.ts` (390), `wave-runtime.ts` (95), `run-build.ts` (65). All 332 unit tests, the same-seed determinism harness, and 25 e2e tests pass; the harness compared full event sequences plus final snapshots for `charge-enemy`, `rewards`, and `waves` against a pre-split capture and matched exactly at every step.

### Deviations from the plan as written

- **Telegraphs folded into `GridBoard`** rather than becoming a separate `TelegraphBoard`, as the layout permitted. Telegraphs are a source-keyed cell index validated against arena bounds and queried by cell — structurally identical to the reservation index already there. Landed as its own commit before the combat extraction so the two moves stayed bisectable.
- **Step 4 split into two commits** (telegraph fold, then combat extraction) because it was the highest-risk step and a single commit would not have isolated a determinism regression.
- **`RunBuild` rather than `RunBuildState`** as the class name, to avoid colliding with the `RunBuildState` value it holds.
- **`resolveCommittedAttackTransaction` stayed in `World`** as the composer of board placement and combat damage, as the Step 1 risk note directed. It is the only remaining method that spans two subsystems.

### Delegation decisions

**Keep as permanent facade.** Spatial reads (`isWalkable`, `isInside`, `isLegalCell`, `tileAt`, `isOccupied`, `getOccupantAt`), `playerCell`, and `snapshot` are the world's read model. Core rules, previews, and pathfinding call them everywhere; routing those callers through `world.board` would be churn with no ownership benefit.

**Candidates for later caller migration, deliberately not done here.** The combat cluster (13 delegations, called almost entirely from `enemy-phase` and the enemy behaviors) and the wave/run clusters (8 delegations, called from `wave-phase` and the reward flow) have narrow, identifiable call sites. If a follow-up is ever justified, those callers could take a subsystem handle directly. Nothing depends on this happening.

### Findings for later work

- `setPhase` is the remaining cross-cutting cascade: a terminal transition releases placement, reservations, and telegraphs, and clears an armed smash. It is the sole reason `CombatOperations` needs a world handle at all. If a sixth subsystem is ever justified, it is entity lifecycle — not any of the four extracted here.
- The player-stat mutators (`setNormalAttackDamage`, `setMobilityDamage`, `setMobilityCooldownConfig`, `setMobilityRange`, `raiseMaxHealth`) are artifact-effect application on entities, not world-state ownership. They belong to the character/artifact work in `character_featurization_and_viking_split.md`, not to a further World split.
