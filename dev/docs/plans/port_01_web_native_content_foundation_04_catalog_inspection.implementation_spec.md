# Content Catalog Inspection

Parent Plan: `port_01_web_native_content_foundation.md`

## Goal

Integrate accepted actor, wave, and Artifact content into one immutable production catalog and expose representative resolved values through a deterministic browser scenario, so Port 1 proves its parity data is loadable and inspectable without creating mutable gameplay state.

## Summary

This child runs after the three concrete content children. It composes their accepted catalogs through one cross-catalog validation boundary, then derives a small read-only inspection projection for a static harness scenario. The scenario loads an empty world at tick zero, starts no animation or gameplay behavior, and presents exact resolved content in accessible DOM plus the existing browser debug API.

The final result proves the complete Port 1 inventory is available together: two characters, four Guards, fifteen attacks, seven enemies, seven groups, ten demo waves plus Endless, and nine Artifacts. It keeps catalog facts outside `WorldSnapshot`, preserves existing Smash training behavior, and introduces no run, wave, reward, or combat state.

## Relational Context

- This child implements only after Child 01 actor content, Child 02 wave content, and Child 03 Artifact content expose their validated frozen catalogs. It does not recreate or bypass any leaf validator.
- A core aggregate contract owns framework-independent full-catalog shape and cross-catalog diagnostics; the authored aggregate module imports accepted leaf catalogs, validates their relationships once, and exports one recursively frozen production catalog.
- Cross-catalog validation confirms every group enemy ID is present in actor content and every required Artifact Mobility has at least one shipped character. It preserves leaf and authored order without sorting or copying values into alternate definitions.
- The harness inspection projection reads the canonical aggregate and exposes selected resolved facts. It does not duplicate numeric content literals, own a second catalog, or leak mutable source references.
- `TestScenario` gains optional immutable inspection metadata and a command-enabled capability. `createWorld()` remains its sole world-construction contract; inspection metadata must not enter `World`, `WorldSnapshot`, entity state, core events, or Pixi sync.
- The inspection scenario uses the harness training arena after Child 01 relocation, creates no entities, and disables commands. It represents a static content view rather than canonical player/enemy spawn state or a playable run.
- The scenario registry continues auto-discovery; adding the new scenario file requires no registry edit. Its stable URL must be `?scenario=content-catalog-inspection`.
- `GameRuntime` remains world/scenario orchestration owner. It may read current scenario inspection metadata for debug exposure, but it does not store catalog or run state and does not execute commands for a disabled scenario.
- `window.__TICKSTRIKE__` keeps world state world-only and adds one read-only content-inspection getter. The getter returns a safe frozen projection or clone, never a mutable full catalog and never mutation APIs.
- `App` passes selected scenario metadata to the Testbed. It gates pointer and keyboard command dispatch when commands are disabled, while retaining existing default URL, selector, reset, and Smash behavior for training scenarios.
- `TestbedPanel` owns visible low-frequency inspection DOM. `SemanticMirror` remains hidden entity-only state and must not mirror catalog definitions. Pixi renders the empty arena normally and receives no catalog presentation objects.
- The inspection scenario starts no GSAP/Pixi timeline, effect, timer, or callback. Reset recreates the same empty world and immutable inspection projection; App cleanup unsubscribes only listeners it creates and runtime teardown continues destroying renderer state.
- Browser acceptance compares visible DOM and debug projection against the catalog while asserting empty world state. Existing Smash unit and Playwright tests remain regression coverage for the training path.

## Scope

### Included

- One validated immutable aggregate catalog and cross-catalog reference checks.
- A catalog-derived inspection projection and deterministic no-entity harness scenario.
- Read-only debug API exposure for that projection.
- Accessible Testbed inspection DOM, command gating, focused unit tests, and browser acceptance.

### Excluded

- Gameplay catalog use by `World`, spawning, combat, waves, rewards, progression, ownership, or run state.
- Catalog asset resolution, sprites, audio, VFX, GSAP timelines, or catalog-specific Pixi objects.
- Changing existing Smash actions, scenarios, default scenario, renderer behavior, or training fixture data.
- Debug-driven scenario-selection synchronization, route navigation, or fixes for pre-existing transition races during an active animation.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/content/content-catalog.ts` | Medium | Own aggregate catalog contract and cross-catalog validation diagnostics. |
| `src/content/content-catalog.ts` | Medium | Assemble Child 01-03 accepted catalogs into one frozen production catalog. |
| `src/harness/content-inspection.ts` | Medium | Own readonly inspection projection derived from the canonical aggregate. |
| `src/harness/types.ts` | Small | Add optional immutable inspection metadata and command capability to scenarios. |
| `src/harness/scenarios/content-catalog-inspection.scenario.ts` | Medium | Define the deterministic empty inspection scenario. |
| `src/runtime/GameRuntime.ts` | Small | Expose current scenario inspection metadata and reject disabled scenario commands. |
| `src/harness/debug-api.ts` | Small | Expose the current inspection projection as read-only debug data. |
| `src/app/App.tsx` | Medium | Pass metadata to UI and gate keyboard/pointer command dispatch. |
| `src/ui/TestbedPanel.tsx` | Medium | Render accessible resolved-content inspection and disable command controls when required. |
| `src/app/styles.css` | Small | Style the static inspection section if existing panel rules are insufficient. |
| `test/unit/core/content/content-catalog.test.ts` | Medium | Prove aggregate inventory, cross references, ordering, diagnostics, and immutability. |
| `test/unit/harness/content-catalog-inspection.scenario.test.ts` | Medium | Prove deterministic empty scenario, projection derivation, and disabled commands. |
| `test/e2e/content-catalog-inspection.spec.ts` | Medium | Prove direct browser loading, visible values, debug parity, reset, and absence of mutable gameplay state. |

## Execution Outline

1. Add aggregate contracts and tests for cross-catalog references, complete inventory, ordering, diagnostics, and recursive immutability.
2. Assemble the production catalog solely from accepted Child 01-03 catalogs and validate it once without reauthoring values.
3. Add a catalog-derived read-only inspection projection and a static auto-discovered scenario that creates an empty harness world with commands disabled.
4. Extend scenario metadata, runtime getter, and debug API without adding catalog data to snapshots or runtime mutable state.
5. Render the projection in accessible Testbed DOM and gate buttons/keyboard commands for inspection mode while preserving all training interaction behavior.
6. Add unit/browser acceptance and run focused checks, `npm run check`, and `npm run test:e2e`.

## Implementation Notes

### Aggregate And Inspection

- The aggregate must expose exactly 2 characters, 4 Guards, 15 attacks, 7 enemies, 7 groups, 10 demo waves, 1 Endless template, 1 progression profile, and 9 Artifacts. Preserve all leaf ordering.
- Validate group-to-enemy references and Artifact Mobility availability across accepted leaf catalogs. Do not perform mutable offer eligibility, level projection, weighted expansion, or effect application.
- The inspection projection must read the aggregate rather than recreate values. Expose representative resolved facts: Ninja, Mode Boss with Boss Guard and ordered attacks, Demo Wave 10 with Boss group/slot values, and Guard Shredder with Major/Dash/trigger values.
- Use stable semantic test IDs for the inspection section and each representative value. Use visible labels and definition lists or equivalent accessible semantics; do not hide catalog facts in `SemanticMirror` or canvas pixels.

### Static Scenario And Commands

- Scenario ID is `content-catalog-inspection`; title and description identify it as a static parity-content inspection.
- Its deterministic world uses the training-arena fixture, starts at tick 0 with zero entities and zero events, and contains no player. It must never spawn canonical actor definitions.
- `commandsEnabled=false` disables movement, Smash, reset-safe keyboard dispatch, and direct runtime execution. Reset remains available and recreates the same static scenario.
- Keep `smash-water` as the default scenario. Existing keyboard and button behavior remains unchanged when commands are enabled.

### Browser And Debug Contract

- Add `getContentInspection()` to the debug API. It returns `undefined` outside an inspection scenario and a safe readonly projection inside one.
- `getState()` remains a `WorldSnapshot` only. The inspection browser assertion requires tick 0, no entities, no events, and no hidden training entity mirrors.
- The inspection path adds no presentation timeline. Do not broaden tests to switch away from an active Smash animation; pre-existing timeline cancellation is outside this child.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| A leaf catalog is incomplete or cross-reference is missing | Reject aggregate construction with deterministic diagnostics. |
| Inspection projection duplicates literals or exposes mutable definitions | Forbidden; derive and freeze/clone from aggregate. |
| Inspection data added to `WorldSnapshot` or entity state | Forbidden. |
| Inspection scenario receives a command by API, button, or keyboard | Reject without changing tick, entities, or events. |
| Reset inspection scenario | Recreate the same empty world and resolved inspection values with no timeline/effects. |
| Inspection UI leaks into training scenarios | Omit the section when metadata is absent; preserve existing controls. |
| Debug API called outside inspection scenario | Return `undefined`; do not throw or expose full catalog. |
| Browser test assumes debug loading updates React selector | Out of scope; test direct URL loading and read-only debug projection only. |

## Acceptance Criteria

1. One immutable production catalog loads the complete Port 1 inventory and validates cross-catalog references without Godot artifacts, implicit defaults, or duplicate content sources.
2. A deterministic direct-URL browser scenario visibly exposes catalog-derived Ninja, Mode Boss, Demo Wave 10/Boss group, and Guard Shredder resolved values, and the debug API returns matching read-only facts.
3. The inspection scenario remains tick 0 with no entities or events before and after reset, starts no new animation/effect, and cannot execute gameplay commands.
4. Catalog facts remain outside world/entity snapshots and semantic entity mirrors, while existing training scenarios, default selection, controls, rendering, and Smash browser acceptance remain unchanged.
5. Unit and browser coverage prove aggregate validation, projection derivation, static scenario behavior, visible values, debug parity, reset, and cleanup.
