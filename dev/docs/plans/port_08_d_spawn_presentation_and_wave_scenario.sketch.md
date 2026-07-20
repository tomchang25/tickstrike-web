# Spawn-Warning Presentation and the Wave-Driven Scenario

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

## Goal

Explore how spawn warnings become visible in the shared Telegraph layer, how the wave-driven world is introduced as a browser scenario, and how the parent plan's browser acceptance ("one wave ending and the next group entering the same arena") is asserted — while leaving the two genuinely open forks (scenario strategy, telegraph label source) for resolution before the spec.

## Summary

This is the furthest-out child and carries the most open decisions, so it stays a sketch. Two forks drive it.

Fork 1 — **scenario strategy.** Either (a) switch the existing `tick-arena` scenario from the fixed five-enemy fixture to a wave-driven world, or (b) add a new `waves` scenario id alongside the untouched fixture. Favored: (b) first — add a new wave-driven scenario so the fixed fixture stays as a regression baseline for every existing unit/e2e test — then let the parent plan's "same scenario can progress from a fixed fixture to authored groups without a route or runtime change" be satisfied by the wave scenario reusing the same arena geometry, runtime, and presentation, not by mutating `tick-arena`. Confirm with the reviewer whether the acceptance criterion demands the literal `tick-arena` id switch or just the same runtime/route.

Fork 2 — **telegraph label source.** The renderer today derives tick labels from `entitiesById.get(sourceId)?.committedAttack?.warningTicks`, which finds nothing for a spawn telegraph (no backing entity). Child B adds `Telegraph.remainingTicks`. Favored: `drawTelegraphs` prefers `telegraph.remainingTicks` when present and falls back to the `committedAttack` lookup otherwise, and spawning telegraphs get a distinct fill color from warning/active attack telegraphs so a spawn warning reads as a spawn, not an incoming attack.

The spec author must verify against the post-C codebase: the exact spawn telegraph `sourceId`/`phase`/`remainingTicks` shape B produced, the wave-runtime snapshot fields available for a wave-number HUD readout, and the event names C settled so any GSAP onset/spawn cue keys off stable types. Endless is introduced here, last, once single-wave completion and cleanup are observable.

Expected outcome: a spawn-warning visual reusing the existing telegraph layer/label pipeline, a wave-driven scenario registered through the existing glob registry, an optional wave-number readout, and a browser spec that drives accepted actions until a wave clears and observes the next group's warning then spawn.

## Sketch

- **Renderer change (likely small).** `drawTelegraphs` in `src/presentation/pixi/PixiGameRenderer.ts` rebuilds `telegraphLayer`/`telegraphLabelLayer` each frame from `snapshot.telegraphs`. Candidate: branch the fill color on `telegraph.phase === "spawning"`, and build the label source list preferring `telegraph.remainingTicks ?? entitiesById.get(sourceId)?.committedAttack?.warningTicks`. The `aggregateTelegraphLabels`/`placeTelegraphLabels` pipeline in `src/presentation/pixi/telegraph-labels.ts` already handles cells + ticks generically, so no label-pipeline change is expected — verify.
- **Spawn marker vs enemy sprite.** During the warning no entity exists, so there is nothing to reconcile in `projectSnapshot()`; the warning is purely a telegraph. At expiry Child C spawns real entities, which the existing entity reconciliation renders through the normal path. Confirm no "ghost sprite" is needed — the plan's presentation boundary reuses the Telegraph layer, not a new ephemeral entity view.
- **Scenario constructor (open).** A wave-driven world needs a constructor that builds the shipped arena geometry, spawns the player, and installs the initial wave runtime (wave 1 with expanded queues) via Child B's operator — but spawns no enemies up front. Candidate location: a new fixture beside `src/harness/fixtures/shipped-arena.ts`, plus a `src/harness/scenarios/waves.scenario.ts` picked up by the existing `import.meta.glob` registry (`src/harness/scenario-registry.ts`). Reuse the `EnemyDefinition + AttackDefinition -> EnemyActionDefinition` resolution currently inlined in `createFoundationArena`; Child C's spawn path needs the same resolution, so factoring that helper out (shared by the fixture and the wave spawn path) is a candidate the spec should weigh.
- **Enemy action resolution reuse (risk).** `createFoundationArena` inlines `actionFor()` and a special `chargeAction` builder. Wave spawning must produce the same `EnemyActionDefinition` for a spawned `enemyId`, including charge's line-shape tuning and ranged's distance band. Favor extracting one shared "build enemy spawn input from content + level projection" helper so the fixture and the wave path cannot drift. This helper also applies Child A's level projection to HP/damage/defense/guard at spawn. The spec must place this helper on the content/harness side, not in `core/world`, to keep core free of content imports.
- **Wave-number readout (optional).** If a HUD readout is wanted, read the wave number from the wave-runtime snapshot field Child B added. Keep it minimal; the production HUD is port_11, so this is a debug-grade readout at most.
- **Browser acceptance (the core assertion).** A new `test/e2e/*.spec.ts` (or an addition to `testbed.spec.ts`) that loads the wave scenario, drives accepted commands via `window.__TICKSTRIKE__.execute`, and asserts: the first group's spawn warning is visible and blocks movement into its cells; the warning expires and the group spawns; the group is cleared; and the next group's warning then spawn appears in the same arena. Use `isIdle()`/generation gating already exposed on the debug API for settle points. Confirm the debug API exposes wave-runtime state or that telegraph/entity snapshot fields are enough to assert progress.
- **Endless introduction (last).** Only after single-wave completion and cleanup are observable, extend the scenario/flow so waves past the last demo wave reuse the endless template. This is a small addition once the loop is proven — do not build it before the single-wave path passes acceptance.
- **Determinism in the browser.** The scenario uses a fixed seed like the existing fixtures (`SHIPPED_SCENARIO_SEED` style) so the browser run reproduces the same compositions and placements. Confirm the wave stream domain name matches what Child C reads.

## Non-Goals

1. Do not build the production HUD, input, or settings shell (port_11).
2. Do not add rewards, run lifecycle, or milestone overlays (port_09 / port_10).
3. Do not add scheduling, placement, level, or orchestration logic here; consume Children A–C.
4. Do not replace the fixed-fixture scenarios that existing tests depend on.
5. Do not add spawn-onto-player forced displacement (explicitly deferred in the parent TODO's Future Draft).

## Acceptance Criteria

1. Spawn warnings render in the shared Telegraph layer with a visible countdown and a distinct spawn appearance, reusing the existing label pipeline.
2. A wave-driven scenario runs on the same arena geometry, runtime, and presentation as the fixed fixtures, without a route or runtime change.
3. Browser acceptance observes one wave ending and the next group entering the same arena, with no stale warning, reservation, or telegraph left behind.
4. The run reproduces deterministically from a fixed scenario seed.
5. Endless continues past the last authored demo wave using the same scenario and presentation, introduced only after single-wave completion is observable.
