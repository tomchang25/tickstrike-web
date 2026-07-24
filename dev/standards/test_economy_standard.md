# Test Economy Standard

Owns how a new or changed test is authored in this repository: which layer it belongs to, how much it may cost, and how it reaches its target state. Which capability needs verification at all is owned by `dev/standards/verification_tiers.md`; the platform layer contract is `dev/foundation/platforms/web-react/standards/testing_standard.md`; concrete commands live in `dev/agent_rules/test_operations.md`.

## Layer Selection

1. **Unit first.** If an assertion reads semantic state — snapshots, events, tick math, wave phases, reward composition, replay equality, catalog content — it belongs in Vitest under `test/unit/`, where the same deterministic core runs in milliseconds. Scenario-level semantics use a `test/unit/harness/<scenario>.scenario.test.ts` file, not a browser.
2. **Browser only when the browser is the subject.** Playwright is reserved for behavior a headless unit cannot observe: real pointer/keyboard/gesture input, `AudioContext` unlock, `localStorage` across reload, PixiJS/GSAP presentation timing (mid-tween vs settled state, retained ghosts, cleanup), canvas hit geometry, and boot/reset/scenario-swap lifecycle.
3. A test that drives the world only through `api.execute()` and asserts only `getState()` is a unit test wearing a browser costume; move it.

## Cost Budget

- Every Playwright test pays roughly 3–5 seconds of app boot before its first assertion. Adding a browser test is a per-push cost on every future CI run; treat it as a budget decision, not a default.
- A new e2e test should stay in single-digit seconds locally. A test that needs tens of accepted commands to reach its target state is set up wrong — see Setup below.
- Prefer extending an existing spec's page session over adding a new one-boot-one-assert test **only** when the addition shares the same scenario and does not obscure the test's single subject.

## One Extreme Scenario, Not Assert Stuffing

- A browser test verifies **one capability at its most demanding representative case**, not a tour of every attribute the page exposes. Pick the extreme that subsumes the easy cases (the multi-victim smash, the full fuse countdown) and assert the few observations that prove the capability.
- Do not restate presenter mappings, catalog values, or schema facts that a unit test already owns; those assertion walls make every rename a multi-file edit while proving nothing new.
- Per-content variants never multiply browser tests (capability rule, `testing_standard.md`). One profile proves the sheet-playback capability; content completeness is a unit concern over the catalog.

## Setup Through Interfaces, Not Simulation

- Reach the target state through an authored interface: a scenario fixture that starts on the brink of the state under test (enemy adjacent, one hit from death, reward pending next tick), a debug-API call, or a recorded command log.
- Do not embed gameplay AI — pathfinding, threat evaluation, kiting loops — inside `page.evaluate` to play the game until the state emerges. Such loops are slow, duplicate core logic, and fail for reasons unrelated to the subject under test.
- If no fixture or API reaches the state, author the missing scenario or harness hook first; that investment is reusable, the in-test loop is not.

## Review Checklist

Before adding a test, answer in order:

1. Can Vitest observe the behavior? Then it is a unit test.
2. Which browser-only observation justifies Playwright, in one sentence?
3. What is the single extreme scenario, and which existing test already covers part of it?
4. Does setup use a fixture or interface, with zero gameplay simulation?
5. What does the test cost per CI run, and did the spec it joins stay within budget?
