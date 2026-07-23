# Port 13.5 Reward Surface and Visual Regression Gates

Parent Plan: `port_13_visual_parity_and_polish.md`

## Goal

Explore the final Port 13 shell slice: rebuild the placeholder reward offer into an authored, responsive card surface and establish the visual regression scenarios that protect the approved arena, feedback, HUD, and overlay presentation. Existing HUD, settings, milestone, and terminal flows remain functional and are changed only where composition with the reward surface requires it.

## Summary

The likely implementation keeps `RewardOverlay` read-only over snapshot-owned offer state while giving each card an authored icon, rarity caption, stack-scaled description, and stack badge. The offer itself needs a semantic presentation mode so normal, milestone, and curse-reveal titles and layouts are selected without the UI deriving progression meaning from wave numbers or card contents.

The current production model supports ordinary and milestone offers but has no curse artifact or curse-reveal route. This child may add the presentation contract and a deterministic visual fixture for single-card curse confirmation, but it must not invent curse acquisition, effects, eligibility, or progression rules. Production curse gameplay remains outside this plan until separately authored.

## Sketch

### Reward presentation model

- Extend the snapshot-owned pending offer with a semantic mode such as normal, milestone, or curse reveal. Existing reward generation should set normal versus milestone at the point that already owns offer policy; React should not recompute the mode from `waveNumber`.
- Keep each offered `artifactId` and resulting stack count authoritative. Card title, category, curse flag, description source, and presentation profile continue to come from the authored artifact catalog.
- Description formatting should expose the resulting stack-scaled value through one content/domain-owned formatter rather than duplicating arithmetic in `RewardOverlay`. The formatter must reflect the actual authored effect and handle non-numeric trigger descriptions without displaying placeholder implementation values such as `(1)`.
- The existing semantic artifact presentation id is the likely icon lookup key. A content-owned icon registry can pair package-imported assets with these ids while keeping asset URLs out of core. Missing mappings should have one intentional fallback for development, not silently ship as blank cards.

### Card and overlay composition

- Normal and milestone offers show up to three equal-priority cards with icon, title, `Minor`/`Major`/`Curse` caption, description, and an `xN` resulting-stack badge. Category and stack information should be scannable without relying on border color alone.
- Normal, milestone, and curse-reveal modes receive distinct headings. The milestone heading should communicate the elevated offer without changing selection semantics.
- Curse reveal uses the same card component in a one-card confirmation composition with one explicit confirmation action. It is a capability of the overlay, not a second reward engine.
- Preserve native button semantics, visible keyboard focus, disabled/busy behavior, dialog labelling, and one dispatch per selection. Initial focus and focus containment/return should be verified for keyboard operation rather than inferred from the current modal markup.
- Desktop keeps a strong three-card row. Narrow layouts stack cards with icons and text still readable, keep actions in view, and allow the panel body to scroll without scrolling the arena behind it. Long names, descriptions, and `xN` badges must not overlap.
- The overlay should use an authored visual language compatible with the existing HUD and pixel arena rather than restyling every preserved shell surface. Existing resource bars, cooldown, class/tick/wave labels, artifact strip, build inspection, settings, terminal result, milestone choice, and debug boundary remain stable.

### Visual regression gates

- Add deterministic capture scenarios for a normal three-card offer, a milestone mixed Minor/Major offer, a single-card curse confirmation fixture, and the existing terminal/milestone overlays at desktop and narrow viewport sizes.
- Add arena captures that make Port 13's major contracts visible together: terrain/frame composition, representative entity roles, cyan preview, each telegraph marker phase with countdown placement, representative impact/Guard/Smash feedback, drowning, and Mobility-kill terminal retention.
- Animated captures should expose a stable authored inspection frame or use an existing deterministic presentation-settled boundary. Screenshot assertions must not depend on arbitrary wall-clock sleeps or leave timelines active after capture.
- Include reduced-motion coverage for information parity and verify reset, visibility/focus interruption, route replacement, and renderer teardown at the established idle boundary.
- Prefer focused visual baselines over a single overloaded screenshot. Semantic assertions should continue to cover card labels, dispatch, mode, and cleanup so a baseline update cannot conceal a behavioral regression.

### Candidate files to inspect

- `src/core/model/types.ts` and `src/core/rewards/reward-offers.ts` for an explicit offer presentation mode and authoritative stack-description inputs.
- `src/content/artifacts/artifact-definitions.ts`, the artifact presentation schema, and a candidate `src/content/artifacts/assets/` registry for icons and display metadata.
- `src/ui/reward-overlay.tsx` and `src/app/styles.css` for the reusable card, confirmation composition, focus behavior, and responsive layout.
- `src/app/game-app.tsx` and `src/app/testbed-app.tsx` for overlay composition only if the live mode requires distinct callbacks or deterministic fixtures.
- Existing reward, run-lifecycle, presentation, and screenshot browser tests plus harness scenarios for deterministic visual states.

All coordinates and module shapes above are provisional and must be verified against the live codebase when the implementation spec is written.

## Non-Goals

1. Do not redesign or rebalance reward eligibility, deterministic draws, stack grants, artifact effects, or wave progression.
2. Do not add production curse acquisition or curse effects without a separately approved gameplay design.
3. Do not broadly restyle the shipped HUD, settings, build inspection, milestone decision, run result, or debug panel.
4. Do not move gameplay calculations into React or infer offer mode from visual styling.
5. Do not claim touch, gamepad, unsupported-browser, or mobile product support from narrow responsive screenshots alone.

## Acceptance Criteria

1. A reward offer presents up to three distinct authored cards with icon, title, Minor/Major/Curse caption, stack-scaled description, and `xN` stack badge at parity readability.
2. Normal, milestone, and curse-reveal steps have distinct semantic titles, and curse reveal supports an accessible single-card confirmation composition without adding new curse gameplay rules.
3. Reward selection remains snapshot-driven, deterministic, keyboard-operable, busy-safe, and dispatched exactly once; no gameplay outcome is calculated by React.
4. The reward surface loads cleanly at supported desktop and narrow widths without clipped content, overlapping labels, hidden actions, or background-scroll leakage.
5. Existing player resources, Mobility cooldown, class/tick/wave context, artifact strip, build inspection, settings, terminal result, milestone choice, and debug isolation remain functional and readable.
6. Deterministic visual regression coverage protects the approved Port 13 arena, entities, combat feedback, reward modes, terminal overlays, desktop/narrow layouts, reduced motion, and settled teardown state.
