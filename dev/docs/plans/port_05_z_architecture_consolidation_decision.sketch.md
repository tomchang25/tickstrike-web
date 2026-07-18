# Post-Playable Architecture Consolidation Decision

Parent Plan: `port_05_first_playable_tick_arena.md`

## Goal

After Port 05 proves one complete playable encounter, evaluate whether the gameplay architecture should be consolidated without weakening deterministic simulation, focused unit testing, or reset-safe presentation cancellation. Preserve the current discussion as decision context, but do not authorize an architecture rewrite before the playable gate supplies real evidence.

## Summary

The currently required properties are deterministic command resolution, extensive core unit coverage, and safe reset, cancellation, and generation handling around asynchronous Pixi/GSAP presentation. Replay/event history, renderer replacement, and multi-agent worktree isolation are optional and must not be used to justify additional abstraction.

Two candidate shapes are understandable and viable. The later decision should select the smallest shape that preserves the required properties after Port 05 proves victory, defeat, reset, terminal presentation, and idle cleanup. This sketch records a decision gate, not a preferred implementation or permission to start an ECS migration.

## Sketch

### Preserved Constraints

- The simulation must produce the same World state, ordered effects, and terminal result for the same seed and command sequence.
- Unit tests must exercise combat rules without mounting React, Pixi, GSAP, or a browser.
- Logical state transitions must complete independently of animation duration or presentation callbacks.
- Reset, scenario replacement, and runtime destroy must cancel pending timelines and prevent an old completion callback from altering the replacement presentation.
- Core gameplay must not import React, Pixi, GSAP, DOM, browser, or asset modules.
- A single complete event stream remains the candidate result contract after the Port 04.5 consolidation child; a second gameplay-only compatibility stream must not be reintroduced.

### Candidate A: State, Controller, Feedback, and Content Database

```text
ContentDatabase
  + validated definitions

GameState / World
  + entity state
  + Health data
  + Position data
  + enemy state

GameController
  + execute(command)
  + mutate GameState
  + return events

FeedbackController
  + consume events
  + play Pixi / GSAP
```

- This is the closest candidate to a conventional Entity Base plus Controller design.
- `GameController` would be a direct command boundary rather than a set of forwarding layers. It may contain small focused helpers where combat rules need separation, but helpers must own real calculations or state transitions.
- `FeedbackController` remains presentation-only. It receives completed results and never determines damage, death, Tick advancement, or terminal outcomes.
- `ContentDatabase` is immutable authored data. It initializes state through scenarios or factories; it is not a mutable gameplay owner.

### Candidate B: Simulation Core and Runtime Boundary

```text
Content Definitions
        |
        v
GameSimulation
  + entity state or ECS components
  + deterministic systems/controllers
  + execute(command)
        |
        +-- state result
        +-- feedback events
        |
        v
GameRuntime
  + command queue
  + reset
  + generation
  + presentation cancellation
        |
        v
Pixi / React / GSAP
```

- This candidate treats the simulation as one cohesive deterministic core. Its internal entity representation may remain the current `World` plus state records, use a smaller controller arrangement, or later use ECS only if measured gameplay needs require component queries and system scheduling.
- `GameRuntime` remains outside simulation because queueing, generation invalidation, renderer mounting, and GSAP cancellation are asynchronous presentation-lifecycle concerns rather than ECS or combat-system concerns.
- This candidate does not require interfaces for hypothetical renderer replacement. The required boundary is only that the simulation remains independent of presentation libraries.

### What the Candidates Share

- Both candidates can be deterministic, unit-testable, reset-safe, and compatible with Pixi/React/GSAP presentation.
- ECS, Entity Base, and a state-record World are alternative ways to organize simulation data and rules. None is inherently deterministic, testable, reset-safe, or multi-agent-safe without explicit ordering and ownership rules.
- The later decision is not "ECS versus current architecture." It is whether the existing `World`, resolver, runtime, and presentation boundaries have proven useful or contain forwarding-only surface that can be removed.

### Evidence Required After Port 05

- Verify the completed P5 command flow from player input through victory, defeat, reset, terminal animation, scenario replacement, and idle cleanup.
- Trace one normal command and one terminal command. Identify every layer that owns mutation, ordering, state projection, queueing, or asynchronous cancellation; identify any layer that only forwards parameters or duplicates authoritative state.
- Verify whether `World`, command resolution, and event construction can be understood as one cohesive simulation seam without making presentation responsible for gameplay.
- Check that the resolved Port 04.5 event stream is the only event contract consumed by snapshots, runtime, browser debug state, and presentation.
- Evaluate concrete future Port 06 changes against both candidate shapes. Prefer the shape that reduces touched ownership seams without adding speculative component registries, adapters, or compatibility aliases.

### Candidate Files to Inspect

- `src/core/world/world.ts`, `src/core/actions/action-resolver.ts`, and `src/core/actions/action-preview.ts` likely define the current simulation and command seams; re-read them at spec time rather than trusting this sketch.
- `src/runtime/GameRuntime.ts` and `src/presentation/timelines/PresentationDirector.ts` likely define queueing, generation, cancellation, and timeline ownership; verify their reset and destroy behavior after P5 lands.
- `src/content/*-catalog.ts`, `src/core/content/*-schema.ts`, and scenario fixtures likely define immutable data initialization; do not turn them into runtime state owners.
- `test/unit/` and `test/e2e/testbed.spec.ts` likely provide the evidence for deterministic logic and terminal browser cleanup; re-map the precise test surface in a later implementation spec.
- `dev/docs/world-resolver-content-flow.report.md` records the current architecture explanation and P4.5 event-stream target. It is reference context, not implementation authority.

### Decision Rule

After P5 passes, make exactly one of these outcomes explicit before P6 begins:

1. Retain the existing boundaries, with only already-planned local consolidation such as the unified event stream.
2. Create an implementation spec for a bounded consolidation that removes proven forwarding-only or duplicate-state surface while preserving the required constraints.

Do not choose ECS merely for familiarity, testability, determinism, or multi-agent work. Consider it only if the completed and near-term gameplay demonstrably needs large homogeneous entity sets, recurring component combinations, query-driven behavior, or explicit system scheduling that a smaller simulation seam cannot express clearly.

## Non-Goals

1. Do not begin an ECS migration, rename architecture concepts, move source files, or merge classes while Port 05 remains incomplete.
2. Do not weaken deterministic seeds, ordered command resolution, unit-level gameplay assertions, or presentation cancellation to make a consolidation easier.
3. Do not add replay, event sourcing, renderer replacement adapters, generic plugin seams, multi-worktree coordination, or new persistence work as part of this decision gate.
4. Do not create a second combat resolver, presentation-owned gameplay state, or a second event stream.
5. Do not fold Port 06 class, Mobility, Guard, or enemy-role scope into the post-P5 architecture assessment.

## Acceptance Criteria

1. Port 05 provides deterministic browser and unit evidence for victory, defeat, reset, terminal presentation, and idle cleanup before any architecture reorganization is selected.
2. Before Port 06 begins, the project records either retention of the current boundaries or one bounded consolidation implementation spec; no architecture rewrite begins from this sketch alone.
3. Any selected consolidation preserves deterministic command outcomes, unit-testable combat rules, logical independence from animation completion, and generation-safe presentation cancellation.
4. Optional replay history, renderer substitution, and multi-agent concerns do not create new abstractions unless a concrete approved feature requires them.
