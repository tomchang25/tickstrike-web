# Basic Enemy Combat Presentation and Acceptance

Parent Plan: `port_04_basic_enemy_tick_combat_and_directional_guard.md`

Status: Implemented; browser coverage partial

## Goal

Make the completed Port 04 Thrust/Slash combat contract observable on the existing Tick Arena screen and browser harness. Pixi and GSAP must present snapshots and semantic events for HP, activity, Telegraph, Guard, Stagger, Protection, impact, death, and reset without becoming gameplay authorities.

## Summary

The presentation now owns board, entity, reservation, Telegraph, pointer-preview, transient-impact, and generation-scoped GSAP projection for enemy HP, activity, facing, Guard, status, and terminal feedback. The semantic mirror and testbed expose the same canonical snapshot data. This child extends those seams and the existing `tick-arena` scenario rather than creating an enemy showcase.

Focused presentation tests and the shared browser flows verify projection, event playback, terminal cleanup, reset, and idle behavior. Direct browser assertions for every intermediate Stagger and Protection state remain a coverage follow-up rather than an implementation gap.

The browser proof should use a deterministic command sequence against Thrust and Slash. It must observe a committed Telegraph, a player dodge or hit, one attack resolution, HP/Guard feedback, Guard break and Stagger, Protection, death, reset, and idle cleanup. Assertions must read semantic state or stable test attributes, not rely on arbitrary sleeps.

## Relational Context

- `GameRuntime` resolves core commands and publishes snapshots before awaiting `PresentationDirector.play()`. The runtime generation remains the boundary that cancels stale timelines during reset, scenario replacement, and destroy.
- `PixiGameRenderer.sync()` owns persistent projection from `WorldSnapshot`; it must render current positions, activity, facing, HP, Guard, Protection, and Telegraphs from snapshot data. It must not calculate enemy outcomes from event payloads.
- `PresentationDirector.play()` owns one-shot GSAP timelines for movement, attack commitment, impact, damage, Guard break, Stagger, death, and reset feedback. It must not mutate `World`, HP, Guard, phase, tick, or Telegraph state.
- `SemanticMirror` is the browser-visible projection of canonical snapshot data. It should expose stable attributes for enemy activity, facing, HP, Guard, Protection, and committed attack/Telegraph counts without adding a second state store.
- `TestbedPanel` remains the existing command and event-log surface. It may display compact combat metrics and reset controls, but it must not own enemy state or decide when an encounter outcome occurs.
- `createFoundationArena()` and the `tick-arena` scenario remain the sole deterministic integration fixture. The current passive Ranged fixture may remain attached for regression compatibility, but the P4 browser assertions exercise Thrust and Slash behavior only.
- Existing terminal cleanup removes entity views after tracked presentation completes. New enemy death and Guard-break timelines must use the same tracked cleanup and generation checks so a delayed callback cannot affect a reset world.

## Scope

### Included

- Persistent Pixi projection for enemy activity, facing, HP, Guard, Stagger, Protection, and Telegraphs.
- GSAP presentation for enemy move, attack commit, detonation, hit, Guard break, Stagger, and death.
- Semantic mirror and panel visibility for browser assertions.
- Deterministic Thrust/Slash Playwright sequence and focused presentation assertions.
- Reset, scenario replacement, Guard-break cancellation, death, and destroy cleanup.

### Excluded

- Final enemy art, audio polish, production HUD, settings, accessibility shell, waves, and release packaging.
- A second scenario, renderer, event stream, combat simulation, or presentation-owned state machine.
- Changes to Port 04 core damage, activity, Telegraph, or Guard rules for visual convenience.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/presentation/pixi/PixiGameRenderer.ts` | Large | Project enemy activity, facing, status, Telegraph, and persistent combat visuals. |
| `src/presentation/timelines/PresentationDirector.ts` | Large | Present new semantic combat events through generation-scoped GSAP timelines and cleanup. |
| `src/ui/SemanticMirror.tsx` | Medium | Expose stable enemy combat attributes from the canonical snapshot. |
| `src/ui/TestbedPanel.tsx` | Medium | Show compact HP/status information and preserve command/reset/event controls. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Keep deterministic Thrust/Slash positions and provide a browser-observable combat sequence. |
| `test/unit/presentation/pixi/PixiGameRenderer.test.ts` | Medium | Assert persistent state projection and cleanup metadata. |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Large | Assert event-to-timeline cleanup and generation cancellation. |
| `test/e2e/testbed.spec.ts` | Large | Assert browser-visible enemy activity, Telegraph, Guard, damage, death, reset, and idle state. |

## Execution Outline

1. Extend persistent renderer and semantic mirror projection from the new canonical snapshot fields; keep event timelines out of gameplay mutation.
2. Add PresentationDirector cases for enemy movement and combat feedback, using tracked transient objects and existing generation cancellation.
3. Add compact panel/status output and stable browser selectors without introducing React-owned entity state.
4. Add focused presentation tests and extend the shared Playwright scenario to prove the full Thrust/Slash sequence, reset, replacement, and idle cleanup.

## Implementation Notes

- Telegraph visuals must be redrawn from the current snapshot and cleared when the source disappears; do not retain a visual Telegraph solely because an earlier event was received.
- Persistent HP, Guard, activity, and facing visuals follow snapshots. One-shot flashes and impacts follow semantic events.
- Death visuals may outlive logical death, but the renderer must remove the view only after the matching generation's timeline completes. Reset must cancel and clear the old view/effects before the new snapshot is shown.
- Browser selectors should expose data, not implementation details: entity ID, activity, HP, Guard, Protection, facing, cell, and Telegraph count are sufficient.
- Use `PresentationDirector.isIdle` as the completion boundary. Do not add arbitrary sleeps or have Playwright infer completion from animation duration.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Snapshot arrives without a prior event | Project the complete current state, including HP, activity, facing, Guard, and Telegraphs. |
| Guard break clears a Telegraph during its visual timeline | Core snapshot removes it; renderer clears the marker and timeline feedback without resolving another attack. |
| Enemy dies while a movement or attack timeline is active | Keep logical death authoritative, cancel conflicting visual work, then finish only the matching death presentation. |
| Reset or scenario replacement during a timeline | Cancel old timelines and transient effects; stale completion cannot remove or mutate replacement views. |
| Passive Ranged fixture remains in the arena | Keep it visible as a normal passive entity and exclude it from P4 behavior assertions. |
| Runtime destroy | Remove listeners, timelines, transient effects, and Pixi views without callbacks touching the disposed runtime. |

## Acceptance Criteria

1. The shared browser scenario visibly distinguishes Thrust and Slash movement, facing, HP damage, locked Telegraphs, attack impact, recovery, Guard, Stagger, Protection, death, and reset.
2. Persistent visuals follow snapshots and one-shot feedback follows semantic events; neither path decides combat outcomes or Tick advancement.
3. Unit and Playwright assertions observe the same deterministic combat sequence and terminal result.
4. Reset, scenario replacement, Guard break, death, and runtime teardown leave no pending timeline, stale Telegraph, status marker, callback, or orphan visual.
