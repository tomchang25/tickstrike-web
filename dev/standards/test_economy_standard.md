# Test Economy Standard

The general rules for authoring a test — verification scoped to change risk, cheapest-observing-layer selection (a browser test that only drives public APIs and asserts semantic state belongs in the unit layer), per-suite cost budgets, one extreme scenario per capability, fixture-based setup instead of gameplay simulation, and the browser acceptance cadence — are owned by `dev/foundation/platforms/web-react/standards/testing_standard.md`. Which capability needs verification at all is owned by `dev/standards/verification_tiers.md`; concrete commands live in `dev/agent_rules/test_operations.md`. This standard records only Tickstrike's presentation-testing delta: where PixiJS/GSAP presentation observations belong, and the one browser assertion that genuinely needs a browser.

## Presentation, Sprites, and VFX

A browser assertion on a presentation attribute — which sprite profile, palette, pose, facing, or animation the runtime selected (`data-enemy-presentations`, `data-player-animation`, `data-player-facing`, `data-retained-presentations`, `data-action-*`) — verifies a _selection_, not a _picture_. It proves the runtime chose the right presenter, which is a pure mapping already owned by the presentation unit suites (`enemy-sprites`, `character-sprites`, `presentation-director`, `frame-playback`, `pixi-game-renderer`). A passing attribute is not evidence that the sprite renders correctly, animates smoothly, or is free of visual glitches; that confidence comes only from a screenshot/visual-regression tool or human review, never from an attribute string. Such an assertion is the worst of both layers: it neither proves the visual nor needs the browser.

Therefore:

- Assert presenter selection (profile, palette, pose, facing, animation frame) in the presentation unit layer, never in Playwright.
- The one presentation concern that genuinely needs a browser is that a terminal ghost is retained and then cleaned up under real GSAP / `requestAnimationFrame` timing. Keep exactly one representative capability assertion for that — never one per enemy, effect, or content variant. This is the single "Playwright cleanup assertion" named in the terminal/animation row of `verification_tiers.md`.
- Keep the authored dev scenarios (the water, dash-killed, and action-lab harnesses) for manual visual inspection; that is where visual correctness is actually judged. Do not re-encode that judgement as an automated attribute assertion on the per-push gate.

## Review Checklist

Before adding a test, answer in order:

1. Can Vitest observe the behavior? Then it is a unit test.
2. Which browser-only observation justifies Playwright, in one sentence?
3. Is the observation a presentation _selection_ (unit's job) rather than a real-browser cleanup or visual? If so, it is not a browser test.
4. What is the single extreme scenario, and which existing test already covers part of it?
5. Does setup use a fixture or interface, with zero gameplay simulation?
6. What does the test cost per CI run, and did the spec it joins stay within budget?
