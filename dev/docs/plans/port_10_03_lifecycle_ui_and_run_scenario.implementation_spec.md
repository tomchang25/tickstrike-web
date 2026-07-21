# Port 10 Child 03: Lifecycle UI And Full-Run Scenario

Parent Plan: `port_10_complete_run_lifecycle.md`

## Goal

Make the complete run playable and testable in the browser: a milestone decision overlay in both shells, a full-run scenario that becomes the home page, a shortened milestone scenario for fast deterministic e2e, and the run-lifecycle browser spec. This closes the parent plan's browser-level acceptance criteria and finishes port_10.

## Summary

Children 01 and 02 made the milestone flow fully drivable through core and the runtime; nothing player-facing consumes it yet. This child is projection and composition only — no new state owners.

- **Milestone overlay**: a new `MilestoneOverlay` in `src/ui/` copying `RewardOverlay`'s shape — renders from `snapshot.pendingMilestone`, offers End Run / Continue Endless buttons, dispatches through a callback. Reuses the existing reward overlay panel styles plus a small action-row addition.
- **Session hook**: `use-game-session.ts` gains `selectMilestoneDecision` (wired to the child 02 runtime entrance through the shared `execute` busy-wrapper) and adds `!pendingMilestone` to the supplementary `interactive` gate. Both `GameApp` and `TestbedApp` render the overlay inside the canvas frame beside `RewardOverlay`.
- **Full-run scenario** (`run`): the existing `wave-arena` fixture world plus a context extending `waveScenarioContext` with the shipped artifact catalog and `milestoneWaveNumber = waveCatalog.demoWaves.length` (currently 9). The home page switches its direct scenario-module import from `tick-arena` to `run`; the testbed keeps every scenario via the registry.
- **Shortened milestone scenario** (`milestone`): a new fixture modeled on `reward-arena` (one passive 1-HP enemy per wave) whose `waveFor` serves waves indefinitely with `milestoneWaveNumber = 2`, so an e2e reaches reward, milestone, both branches, and the endless continuation in a handful of commands.
- **Verification**: a fixture unit test (initial-state and same-seed determinism, matching the existing scenario-test shape), a `run-lifecycle.spec.ts` e2e covering the continue-endless and end-run-then-restart paths plus a home-page smoke test, and the existing production-bundle exclusion check (direct scenario import keeps the registry glob out).

Death/restart cleanup is already covered by the existing testbed defeat spec and is not duplicated.

## Relational Context

- `MilestoneOverlay` renders purely from `snapshot.pendingMilestone` and dispatches a `MilestoneChoice`; it never decides outcomes, generates rewards, or owns pause state — core installed the pause and `resolveMilestoneDecision` (via the runtime queue) is the only exit. This mirrors `RewardOverlay`'s contract exactly.
- The runtime rejects gameplay commands during the pause at the core admission gate (child 01); the hook's `interactive` computation is supplementary UI disabling only, exactly like the existing `pendingReward` handling. Keyboard and pointer effects read `interactive` and need no other change.
- `use-game-session.ts` is the single wiring point between both shells and the runtime; the overlay callback must route through its `execute` wrapper so `busy` disables the overlay buttons during resolution, as `selectReward` does.
- Scenario worlds and contexts pair per module: the `run` scenario reuses `createWaveArena` (world) with a new context object; the `waves` scenario keeps `waveScenarioContext` untouched because the determinism goldens (`test/unit/determinism/golden-harness.ts`) import the `waves` and `rewards` scenario modules directly — those modules and their fixtures' existing exports must be byte-for-byte behavior-identical.
- A context with `milestoneWaveNumber` must keep `waveFor` defined for every wave number: after continue-endless, `resolveRewardSelection` starts `waveFor(milestone + 1)`, and in the shipped catalog that is the endless template via the existing fallback. The shortened fixture satisfies this by serving its builder wave for any number.
- The wave-clear reward pause and the milestone pause interact by design: with `offerableArtifacts` present, pre-milestone waves pause on ordinary rewards, and the milestone wave skips its reward until a continue decision (child 01 behavior). The e2e drives both pauses in one run.
- `game-app.tsx` imports its scenario module directly (never the registry) so the production bundle excludes `import.meta.glob` and every other scenario; the `run` scenario module's import chain reaches only `@harness/fixtures/wave-arena` and `@content` catalogs, which are production-legitimate. The testbed and debug API continue to reach every scenario through the registry, auto-discovered per the scenario contract.
- The e2e drives the shortened scenario through `?scenario=milestone` on `/debug`, the debug API (`getState`, `execute`, `exportCommandLog`), and the overlay testids; `getState().pendingMilestone` is the wait condition, so `SemanticMirror` needs no new attributes.
- The home smoke test uses the dev server's `/` route where the debug API and semantic mirror are DEV-mounted; production exclusion is proven by the build, not by e2e.
- Victory/defeat terminal banners in both shells already render from `snapshot.outcome`; End Run produces `victory` through existing paths, so no banner change is needed. Restart (`reset`) reloads the scenario wholesale, which clears every overlay because all three render from the snapshot.

## Scope

### Included

- `MilestoneOverlay`, hook and both-shell wiring, overlay styles.
- `run` scenario (context + module) and the home-page scenario switch.
- `milestone` fixture and scenario, its fixture unit test, the run-lifecycle e2e, and a home-page smoke test.

### Excluded

- Production HUD, wave indicator, settings, input rework, or explicit production debug mode (port_11).
- Terminal-banner copy changes or visual polish (port_13).
- Endless balance or wave-content changes; the endless template ships as authored.
- Save, meta progression, record replay, undo, checkpoint revive (Future Draft).
- Any change to `src/core`, the `waves`/`rewards` scenarios, or the determinism goldens.

## Files to Change

| File                                           | Change Size | Purpose                                                                            |
| ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `src/ui/milestone-overlay.tsx`                 | Small       | End Run / Continue Endless dialog rendered from `pendingMilestone`                 |
| `src/app/styles.css`                           | Small       | Milestone action-row styles reusing the reward overlay panel look                  |
| `src/app/use-game-session.ts`                  | Small       | `selectMilestoneDecision` through the busy-wrapper; `interactive` gate addition    |
| `src/app/game-app.tsx`                         | Small       | Switch the direct scenario import to `run`; render the overlay                     |
| `src/app/testbed-app.tsx`                      | Small       | Render the overlay                                                                 |
| `src/harness/fixtures/wave-arena.ts`           | Small       | Add the run context (artifact catalog + `milestoneWaveNumber`) beside the wave one |
| `src/harness/scenarios/run.scenario.ts`        | Small       | The full-run scenario module the home page imports                                 |
| `src/harness/fixtures/milestone-arena.ts`      | Medium      | Shortened two-authored-wave fixture with endless continuation and 1-HP enemies     |
| `src/harness/scenarios/milestone.scenario.ts`  | Small       | The shortened scenario module for e2e                                              |
| `test/unit/harness/milestone.scenario.test.ts` | Small       | Fixture initial state and same-seed determinism, matching the waves scenario test  |
| `test/e2e/run-lifecycle.spec.ts`               | Medium      | Continue-endless path, end-run-plus-restart path, home-page smoke                  |

## Execution Outline

1. Add the `milestone-arena` fixture and scenario module, then its unit test — the deterministic substrate everything else drives.
2. Add the `run` context to `wave-arena.ts` and the `run.scenario.ts` module; run the goldens to confirm the `waves` scenario is untouched.
3. Add `MilestoneOverlay`, its styles, and the hook's `selectMilestoneDecision` and `interactive` change; wire the overlay into both shells and switch the home page's scenario import to `run`.
4. Add `run-lifecycle.spec.ts`: one test driving clear → reward → milestone → Continue Endless → next wave started; one driving milestone → End Run → victory → reset → initial snapshot equality; one home-page smoke asserting the run scenario is live on `/`.
5. Run `npm run verify`, the targeted e2e selection, and confirm the production bundle still contains no registry glob or testbed strings.

## Implementation Notes

- Overlay testids: `milestone-overlay`, `milestone-end-run`, `milestone-continue-endless`. Buttons disable on `busy` like reward cards.
- The shortened fixture keeps `warningTicks: 0` on wave 1 and a warned later wave like `reward-arena`, and must include `offerableArtifacts` so both the ordinary reward pause and the milestone-continue reward are exercised.
- In the e2e, assert command rejection during the milestone pause via a tick-unchanged check (the same pattern the rewards spec uses for the reward pause), and assert the exported command log contains a `milestone` entry after a decision — closing the child 02 note that the milestone log kind lacked live coverage.
- Restart-equality assertion: capture `getState()` at initial load (tick 0) and compare the post-reset `getState()` to it wholesale; `lastEvents` is part of the snapshot, so reset must land both at the freshly-created state. If the freshly loaded state records no events, both sides are equal by construction.
- Home smoke: `goto("/")`, wait for the debug API, assert `getState().waveRuntime?.waveNumber === 1` and that the scenario's wave slots come from the shipped catalog (population of demo wave 1), distinguishing `run` from the old `tick-arena` fixture arena.

## Edge Cases

| Case                                                  | Expected Handling                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Milestone overlay clicked twice quickly               | `busy` disables buttons during resolution; the queue serializes; the second resolves rejected with no state change  |
| Reset while the milestone overlay is open             | Scenario reload replaces the world; every overlay disappears because all render from the snapshot                   |
| Keyboard/pointer input during the milestone pause     | Core rejects at the admission gate; the supplementary `interactive` gate keeps UI affordances disabled              |
| End Run with the reward overlay somehow also expected | Impossible by construction: child 01 installs the milestone pause instead of the reward offer on the milestone wave |
| Home page production build                            | Bundle contains the `run` scenario chain and `@content` catalogs but no scenario registry glob or testbed code      |

## Acceptance Criteria

1. One deterministic browser run can start, clear waves, select a reward, reach the milestone branch, and take either path: End Run to a terminal victory with restart, or Continue Endless through the milestone reward into the next wave.
2. Gameplay input is inert while the milestone decision is open, and the decision buttons are the only exits.
3. Restart from the terminal End Run state reproduces the fresh initial state with no stale overlays.
4. The home page plays the full authored run; the production bundle still excludes the scenario registry and testbed-only code.
5. A recorded run's command log contains the milestone decision, and the existing determinism goldens pass unregenerated.
