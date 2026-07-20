# Spawn-Warning Presentation and Wave Scenario Acceptance

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

Status: Draft implementation spec

## Goal

Make authored spawn warnings visible in the shared Pixi telegraph layer and provide a deterministic wave-driven browser scenario that proves a group warns, spawns, clears, and yields the next group's warning in the same arena. Preserve fixed-fixture scenarios as combat regressions while the new scenario exercises the existing runtime and wave boundary.

## Summary

Child C already creates spawn reservations, `spawning` telegraphs with `remainingTicks`, and semantic wave events; this child makes that state visible and browser-verifiable. Spawn telegraphs reuse the existing cell marker and countdown label pipeline, but receive a distinct spawn color and source their countdown directly from `Telegraph.remainingTicks` instead of an entity committed attack.

A new fixed-seed `waves` scenario starts with the regular player and an installed Wave 1 runtime, but no initial enemies. The first accepted command admits the first authored group and displays its warning; the following accepted command expires the warning and uses Child C's normal spawn path. The scenario reuses shipped arena geometry, runtime composition, content-backed enemy input projection, and Pixi presentation without replacing `tick-arena`.

Browser acceptance drives normal commands through the debug API until the first group clears, then observes the next wave warning and spawn. Only after that single-wave loop is covered does the scenario context return the authored endless template for waves beyond the final demo wave.

## Relational Context

- Children B, C, and C1 are prerequisites. D reads the `WorldSnapshot.waveRuntime`, `Telegraph.remainingTicks`, `spawning` telegraphs, wave events, and terminal-free entity snapshots they define; it does not change wave scheduling, completion, terminal cleanup, reservations, or outcome policy.
- `PixiGameRenderer.drawTelegraphs()` is a snapshot projection. It must prefer `telegraph.remainingTicks` when defined, including zero, and otherwise preserve the existing lookup of `committedAttack.warningTicks` for attack telegraphs. The generic `aggregateTelegraphLabels` and `placeTelegraphLabels` helpers remain the sole label layout pipeline.
- A spawn reservation has no backing entity during its warning. D must not create an entity view, temporary spawn sprite, or terminal ghost for it; Child C creates real enemies at warning expiry and ordinary snapshot reconciliation renders them.
- Spawn telegraph markers use a distinct spawn color while retaining the existing telegraph layers, label overlap rules, canvas test datasets, and attack warning/active colors. Attack telegraph visual behavior must remain unchanged.
- The `waves` scenario supplies `WavePhaseContext` through `TestScenario.waveContext`; `GameRuntime` already passes that context to `resolveCommand`. Scenarios without it, including `tick-arena`, keep the wave phase as a no-op.
- The wave fixture owns scenario composition: it creates the shipped arena and player, initializes Wave 1 slot state from the world `waves` random stream, and supplies a context backed by `waveCatalog` plus `buildEnemySpawnInput`. `src/core` continues to receive content only through `WavePhaseContext`; it must not import content catalogs.
- The context returns the nine authored demo waves by 1-based wave number and returns `endlessTemplate` for every subsequent number. This is the only D endless behavior; it reuses Child C's normal queue expansion, placement, reservation, spawn, and level path.
- Browser tests use `window.__TICKSTRIKE__.execute`, `getState`, `isIdle`, and the readonly `isWalkable` query; they do not mutate world state or call scheduling helpers directly. The canvas telegraph-label and spawn-count datasets prove the browser-visible countdown and spawn projection, while `isWalkable` proves the warned cell is blocked.
- Terminal entities disappear from snapshots under C1. The browser driver detects group clearance from live wave entity ids and wave runtime/telegraph progression, never from `phase: "dead"` records.

## Scope

### Included

- Spawn-phase marker color and `remainingTicks` countdown projection in the existing telegraph renderer.
- A fixed-seed `waves` scenario and harness fixture that installs Wave 1 and supplies the catalog-backed wave context.
- Focused harness coverage for deterministic initial wave setup and endless-template lookup.
- Browser acceptance for visible warning countdown, reservation blocking, spawn, first-wave clear, next-wave warning/spawn, reservation cleanup, and deterministic reset.

### Excluded

- Replacing or changing the fixed `tick-arena` fixture.
- Production wave HUD, progression UI, rewards, result overlays, or settings controls.
- New spawn visual actors, VFX, audio, or forced player displacement.
- Scheduling, placement, stat projection, reservation arbitration, wave completion, and terminal lifecycle changes from earlier children.
- Any endless-specific combat system or alternative presentation path.

## Files to Change

| File                                        | Change Size | Purpose                                                                                                            |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/presentation/pixi/PixiGameRenderer.ts` | Small       | Render spawning telegraphs with their distinct appearance and countdown source while preserving attack telegraphs. |
| `src/runtime/GameRuntime.ts`                | Small       | Expose the world's readonly walkability predicate to the browser debug boundary.                                   |
| `src/harness/debug-api.ts`                  | Small       | Publish the readonly walkability query for deterministic browser acceptance.                                       |
| `src/harness/fixtures/wave-arena.ts`        | Medium      | Construct the deterministic player-only wave world and its catalog-backed `WavePhaseContext`.                      |
| `src/harness/scenarios/waves.scenario.ts`   | Small       | Register the new `waves` scenario through the existing glob registry.                                              |
| `test/unit/harness/waves.scenario.test.ts`  | Medium      | Assert fixed-seed initial setup, Wave 1 slots, content-backed context, and endless fallback.                       |
| `test/e2e/waves.spec.ts`                    | Large       | Drive the browser-visible warning-to-spawn and first-wave-to-next-wave acceptance path.                            |

## Execution Outline

1. Extend telegraph projection first and add focused assertions that a spawning telegraph with `remainingTicks` receives a visible label without changing existing attack warning/active output.
2. Add the wave fixture and `waves` scenario with the shipped arena, regular player setup, Wave 1 slot initialization, `waveCatalog` context, fixed seed, and endless fallback; do not spawn fixture enemies.
3. Add harness tests proving fresh worlds have no enemies or telegraphs, reproduce the same initial wave runtime under the fixed seed, and resolve demo versus endless definitions by wave number.
4. Add browser acceptance using only accepted commands: observe warning/reservation state, expiry spawn, deterministic clear of the first group, next-wave transition, and cleanup of obsolete spawn telegraphs/reservations.
5. After the single-wave acceptance passes, include the endless context fallback assertion and run the focused unit, renderer, browser, lint, format, and build checks required by the project contract.

## Implementation Notes

- Use `telegraph.remainingTicks ?? committedAttack.warningTicks`; do not use truthiness because a countdown of `0` is a valid label value at the expiry boundary.
- The renderer's spawn color should match the existing reservation visual language rather than the yellow warning or red active attack states. Do not alter reservation behavior or add another overlay layer.
- Initialize Wave 1 with `createInitialSlotStates` using `world.random.get("waves")`, exactly as Child C initializes later waves. The scenario's `waveContext` is shared immutable setup; the mutable queue state stays solely in `World`.
- Construct wave enemies through `buildEnemySpawnInput`, not the fixed-fixture helper or copied action definitions. This preserves charge/ranged tuning, presentation ids, guard projection, and level scaling.
- The browser driver may issue rejected movement attempts to prove a spawn-reserved cell blocks movement, but must assert the unchanged tick/snapshot rather than relying on the debug API return value, which intentionally resolves without exposing `ActionResolution`.
- Clear the first group through normal player commands. Keep the driver bounded, deterministic, and based on the live snapshot; do not add a debug damage or wave-completion bypass solely for acceptance.

## Edge Cases

| Case                                           | Expected Handling                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spawn telegraph has `remainingTicks: 0`        | When projected, the shared label pipeline uses `0` rather than falling back to an entity lookup; Child C never decrements below zero before resolving the batch. |
| Attack telegraph has no `remainingTicks`       | Its existing committed-attack countdown and warning/active colors remain unchanged.                                                                              |
| Wave scenario loads or resets before a command | It contains only the player, Wave 1 slots, no spawn reservation, no telegraph, and no enemy.                                                                     |
| Spawn warning is cancelled or expires          | The corresponding reservation and telegraph disappear; later wave warnings do not reuse stale cells or source ids.                                               |
| Wave number exceeds the final demo definition  | The scenario context returns the one authored endless template, retaining the same deterministic wave stream and presentation path.                              |

## Acceptance Criteria

1. Spawn warnings appear in the shared telegraph layer with a distinct appearance and a visible `remainingTicks` countdown, while attack telegraphs retain their current appearance and countdown behavior.
2. The fixed-seed `waves` scenario starts in the shipped arena with the normal player and Wave 1 runtime but no fixture enemies, then produces enemies only through the existing wave phase.
3. Browser acceptance observes an accepted-tick spawn warning, its reservation block, warning expiry, enemy spawn, first-wave clearance, and the next wave's warning/spawn without a route or runtime change.
4. Cleared or cancelled batches leave no stale spawn reservation, spawning telegraph, terminal ghost, or semantic entity record behind.
5. Waves beyond the final authored demo wave use the endless template through the same deterministic scheduling and presentation path.
