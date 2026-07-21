# Port 11 Child 01: Testbed E2E Spec Split

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Split the 1,024-line `test/e2e/testbed.spec.ts` (18 flat `test()` calls) into focused spec files before the shell rework touches the browser input and HUD surface those tests drive. Test hygiene only: verbatim test bodies, no assertion or coverage change.

## Summary

The file has no `describe` blocks and no ordering or shared-mutable-state coupling between tests, so it splits cleanly along capability lines into six files; `testbed.spec.ts` is then deleted. Playwright auto-discovers new `*.spec.ts` files under `test/e2e/` (`testDir` glob, no `testMatch` filtering), so no config change is needed.

| New file                    | Tests moved (current start lines)                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `water-animations.spec.ts`  | Smash scenario completes (L40); templated water-sheet test with its driving array (L127–174); water scenario switch (L176)                                              |
| `charge-enemy.spec.ts`      | Charge sequential motion (L186); Charge telegraph retention (L262)                                                                                                      |
| `ranged-enemy.spec.ts`      | Ranged band/Cross/recover/reset (L539)                                                                                                                                  |
| `bomb-enemy.spec.ts`        | Bomb commit/detonate (L761); Bomb disarm on kill (L860); Bomb reset mid-fuse (L954)                                                                                     |
| `pointer-input.spec.ts`     | Mobility controls panel (L427); Dash lands before enemy (L504); Pointer aiming preview (L634)                                                                           |
| `harness-lifecycle.spec.ts` | Navigation grid debug (L290); Empty arena start (L323); Held movement (L340); Generation reset (L382); Defeat/restart (L680); Terminal presentation cancellation (L709) |

Shared header material travels by need: the sibling-spec convention is per-file duplication of the `declare global` block for `__TICKSTRIKE__` (no shared helper module exists under `test/e2e/`), and only the water file needs the `recordRetainedPresentations` helper (current L12–38) plus the `__RETAINED_PRESENTATION_LOG__` window member.

## Relational Context

- Only the templated water test uses `recordRetainedPresentations` and `__RETAINED_PRESENTATION_LOG__`; that helper, the `__RETAINED_PRESENTATION_LOG__` half of the `declare global` block, and the five-entry scenario/profile array (L127–133) move exclusively into `water-animations.spec.ts`.
- Every other moved test needs at most the `__TICKSTRIKE__` half of the `declare global` block and the `TickstrikeDebugApi` type import. Two tests (water scenario switch L176, pointer aiming L634) touch neither; per-file headers carry only what that file's tests reference, or Oxlint will flag unused imports.
- The four Bomb-and-terminal tests carrying `test.setTimeout(30_000)` (L681, L710, L762, L861, L955) keep those calls verbatim inside their bodies; the timeout is per-test, not file-level, so the move changes nothing.
- `playwright.config.ts` runs one Chromium project with `fullyParallel: false` and a dev-server `webServer`; discovery is by glob, so deleting `testbed.spec.ts` and adding the six files requires no config edit.
- The `pointForCell` closures (L53, L638) are test-local, not module-level; they move inside their tests untouched.
- `dev/agent_rules/test_operations.md` forbids unfiltered local `test:e2e` runs (a PreToolUse hook enforces it); verification uses `npx playwright test --list` plus a targeted selection.

## Scope

### Included

- Creating the six spec files with verbatim test bodies and need-based headers; deleting `testbed.spec.ts`.

### Excluded

- Any assertion, selector, scenario, timeout, or coverage change.
- Shared e2e helper extraction (the per-file duplication convention stands until a real need appears).
- Renaming or regrouping the seven existing sibling specs.

## Files to Change

| File                                 | Change Size | Purpose                                                    |
| ------------------------------------ | ----------- | ---------------------------------------------------------- |
| `test/e2e/water-animations.spec.ts`  | Medium      | Water-sheet, smash-water completion, scenario-switch tests |
| `test/e2e/charge-enemy.spec.ts`      | Small       | Charge behavior tests                                      |
| `test/e2e/ranged-enemy.spec.ts`      | Small       | Ranged behavior test                                       |
| `test/e2e/bomb-enemy.spec.ts`        | Medium      | Bomb behavior tests                                        |
| `test/e2e/pointer-input.spec.ts`     | Small       | Pointer/input-facing tests                                 |
| `test/e2e/harness-lifecycle.spec.ts` | Medium      | Harness, reset, and cleanup tests                          |
| `test/e2e/testbed.spec.ts`           | Deleted     | Superseded by the six files above                          |

## Execution Outline

1. Run `npx playwright test --list` and record the current test count (17 plain instances plus 5 templated water instances).
2. Create the six files, cutting each test block verbatim and assembling each header from exactly the imports, `declare global` members, and helpers that file's tests use.
3. Delete `testbed.spec.ts`.
4. Run `npx playwright test --list` again and diff: the instance titles and count must be identical.
5. Run a targeted selection of one representative test per new file locally; run `npm run verify` for format/lint/build.

## Edge Cases

| Case                                            | Expected Handling                                              |
| ----------------------------------------------- | -------------------------------------------------------------- |
| A file's tests never reference `__TICKSTRIKE__` | Its header omits the type import and `declare global` entirely |
| Templated water test's array                    | Moves with its `for...of` loop wrapper as one unit             |
| Line-number drift from this spec                | Match tests by title, not line number, when cutting            |

## Acceptance Criteria

1. The browser suite lists exactly the same test instances before and after the split.
2. Every moved test body is byte-identical apart from file location.
3. The targeted local selection passes, and the full suite passes in CI.
