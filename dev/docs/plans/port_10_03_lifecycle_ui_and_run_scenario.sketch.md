# Port 10 Child 03: Lifecycle UI And Full-Run Scenario

Parent Plan: `port_10_complete_run_lifecycle.md`

## Goal

Make the complete run playable and testable in the browser: a milestone decision overlay, a full-run scenario with waves, rewards, and the milestone branch, a shortened scenario for deterministic e2e, and the home page switched from the fixture arena to the real run. This closes plan acceptance criteria 1, 3, and 4 at the browser level.

## Summary

The favored direction reuses every seam the previous children and the port_09 reward flow already established: the overlay copies `RewardOverlay`, the session hook exposes the milestone decision the same way it exposes `selectReward`, and the scenarios are fixture-level compositions of existing content. No new state owners appear; the lifecycle stays a projection of the snapshot.

Expected outcome if the sketch holds: the home page plays wave 1 through the milestone choice, End Run shows a run-complete terminal state with restart, Continue Endless keeps going through endless waves, and an e2e spec drives the whole loop — clear, reward, milestone, death, restart — on a shortened scenario in seconds.

## Sketch

- Overlay: a `MilestoneOverlay` in `src/ui/` modeled directly on `reward-overlay.tsx` — two buttons (End Run / Continue Endless), `busy` prop, fired through a callback. It renders when `snapshot.pendingMilestone` exists. Keep copy minimal; port_11 owns real HUD styling.
- Session hook: `use-game-session.ts` gains `selectMilestoneDecision` wired to the child 02 runtime entrance, mirroring `selectReward`. The `interactive` computation likely needs `!pendingMilestone` alongside `!pendingReward` — supplementary only, since core already rejects commands during the pause. Verify the pointer/keyboard effects need no other change.
- Terminal presentation: the home shell and testbed currently render a Victory/Defeat banner off `snapshot.outcome`. After End Run the outcome is `victory`; candidate copy change ("Run complete") is cosmetic and optional. Restart via the existing reset path must clear overlays — verify the banner, reward overlay, and milestone overlay all derive purely from the snapshot so restart needs no extra cleanup.
- Full-run scenario: a new harness scenario (candidate id `run`) composing the existing `wave-arena` fixture with `offerableArtifacts: artifactCatalog.artifacts` (the reward scenario already demonstrates this) and `milestoneWaveNumber: waveCatalog.demoWaves.length`. Verify `waveScenarioContext` can be extended rather than duplicated — it currently supplies no artifacts, and the existing `waves` scenario/golden must keep its current no-reward, no-milestone behavior unchanged.
- Shortened e2e scenario: a scenario whose `waveFor` serves one or two tiny authored waves before the milestone (the reward scenario's custom `buildRewardWave` pattern with 1-HP enemies is the likely template), with `milestoneWaveNumber` set accordingly. This keeps the full-lifecycle e2e to a handful of commands. Playwright drives it via the existing debug API and semantic-mirror waits.
- e2e coverage (capability-level, per the verification tiers standard): one spec for clear → reward → milestone → Continue Endless → endless wave starts; one for milestone → End Run → victory → restart produces the fresh initial state; death/restart is likely already covered by existing specs — verify before duplicating. A debug-API `exportCommandLog`/`replayCommandLog` round-trip assertion can ride along here if child 02 could not prove it at the unit level.
- Home page switch: `game-app.tsx` currently imports `tick-arena.scenario` directly to keep the production bundle free of the registry glob. The run scenario must be importable the same way (its own module, direct import); verify what the import chain pulls in — wave and artifact catalogs are production content and belong in the bundle, but the registry glob must not come along.
- Hint text and `RunBuildHud` on the home shell already exist; a wave-number indicator is tempting but belongs to port_11's HUD work — leave it out.
- Candidate files to inspect: `src/ui/reward-overlay.tsx`, `src/app/use-game-session.ts`, `src/app/game-app.tsx`, `src/app/testbed-app.tsx`, `src/harness/fixtures/wave-arena.ts`, `src/harness/fixtures/reward-arena.ts`, `src/harness/scenarios/waves.scenario.ts`, `src/harness/scenarios/rewards.scenario.ts`, `test/e2e/waves.spec.ts`, `test/e2e/rewards.spec.ts`.

## Non-Goals

1. Production HUD, input rework, settings, or an explicit production debug mode — port_11 owns the shell.
2. Endless-mode balance, wave-content changes, or new enemies; the endless template ships as authored.
3. Save, meta progression, or any Future Draft feature (record replay, undo, checkpoint revive).
4. Start-menu or lobby screens; the run starts immediately, per the parent plan's non-goal of no separate main-menu runtime.

## Acceptance Criteria

1. One deterministic browser run can start, clear waves, select a reward, reach the milestone branch, and take either path: End Run to a terminal run-complete state, or Continue Endless into endless-template waves.
2. Death resolves after the current tick and restart rebuilds the same fresh initial state with no stale overlays, entities, telegraphs, or timelines.
3. The full lifecycle runs through the same runtime entry point from first input to terminal outcome, on both the home page and the testbed.
4. The home page plays the full run scenario; the production bundle still excludes the harness registry and testbed-only code.
