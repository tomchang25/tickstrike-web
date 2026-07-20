# Wave Phase Orchestration on the Accepted-Tick Boundary

Parent Plan: `port_08_authored_waves_spawning_and_enemy_levels.md`

## Goal

Explore how the pure wave core (Child A) and the world wave surface (Child B) connect to the accepted-tick command boundary: where the wave phase runs relative to the enemy phase, how warnings count down, how admitted batches revalidate and spawn, and what events the stream must carry — without freezing a spec before B's world API is settled.

## Summary

The wiring shape is clear; the open decisions are ordering, the event taxonomy, and the empty-board/victory gate. This sketch records the favored shape so the eventual spec can be written quickly once B lands.

Favored direction: add a wave phase that runs once per accepted player action, immediately after the enemy phase, inside the existing accepted-command path — the same place the enemy phase already runs. The wave phase does three things in order each accepted tick: (1) advance any pending warning countdown and, at expiry, revalidate cells and spawn survivors through the world's existing `spawn`; (2) evaluate slot eligibility and admit the next atomic batch if headroom allows, installing its spawn reservations and spawning telegraph; (3) advance the wave number when the current wave is fully cleared and no batch is pending. Each step is Child A logic fed by Child B world state; the wave phase is glue, not new logic.

The reviewer/spec author must verify against the post-B codebase: the exact `World` accessors B exposed, the wave-runtime record shape, whether spawn cell placement happens at admission or at expiry (this sketch favors placing at admission for the telegraph, then revalidating at expiry), and the final event names.

Expected outcome if this holds: `resolveCommand` gains one more phase call, a new `wave-phase` module mirrors `enemy-phase`, a handful of new `CombatEvent` variants flow to presentation/tests, and the encounter-outcome gate learns to ignore an empty board while a wave is still producing.

## Sketch

- **Hook point (likely).** `finishAccepted` in `src/core/actions/action-resolver.ts` currently runs `world.advancePlayerAction()` → `resolveEnemyPhase(world)` → `updateEncounterOutcome()`, then assembles events. Candidate change: insert `resolveWavePhase(world)` after `resolveEnemyPhase` and before the outcome check, and splice its events into the ordered `completeEvents` array between enemy events and the terminal `encounter_ended`. Verify the ordering the presentation director expects; enemy deaths this tick must be visible to the wave phase's clear/eligibility check, which is why it runs after the enemy phase.
- **New module (likely).** `src/core/waves/wave-phase.ts` (or `src/core/actions/wave-phase.ts` to sit beside `enemy-phase.ts` — decide at spec time; `enemy-phase.ts` lives under `src/core/actions/`, so matching that is the candidate). It orchestrates Child A calls against Child B world state and returns `CombatEvent[]`, exactly like `resolveEnemyPhase`.
- **Countdown source.** Warnings decrement only on accepted ticks. Since the wave phase only runs inside `finishAccepted` (accepted commands), a plain per-call decrement of the pending batch's `remainingTicks` satisfies "advance only on accepted world ticks." Confirm rejected commands never reach `finishAccepted` — they return early in `resolveCommand`, so they do not tick the warning. Good.
- **Admission vs placement timing (open).** Two candidate shapes: (a) place cells at admission, reserve+telegraph them, and revalidate the same cells at expiry; (b) reserve a strategy intent at admission and place cells only at expiry. Favored: (a), because the telegraph must show concrete warned cells during the countdown, and the plan requires warned cells to be visible and to block movement. Revalidation at expiry then only needs to repair cells that became illegal, per the plan's "replaced with a strategy-consistent alternative or requeued" rule. The spec must define the repair path precisely.
- **Revalidation/repair (needs spec precision).** At expiry, for each reserved cell: if still legal (unoccupied except by its own spawn reservation, not the player), spawn there; if not, ask the planner for one strategy-consistent replacement among currently-legal cells; if none exists, requeue that member into its slot rather than dropping it. All-or-nothing at admission already guaranteed N cells existed; repair handles drift during the countdown. Decide whether a partial-repair failure requeues the whole batch or only the un-repairable members — favor requeuing only the un-repairable members since the rest were validly warned.
- **Event taxonomy (candidate).** New `CombatEvent` variants, matching the existing discriminated-union style in `src/core/events/combat-events.ts`: `wave_group_warned` (cells + ticks, for telegraph onset), `wave_group_spawned` (spawned member ids + cells), `wave_group_deferred` (headroom or placement blocked this tick), `wave_advanced` is already taken by tick advancement — use `wave_started`/`wave_cleared` for wave-number transitions. Names are provisional; settle them with Child D's presentation needs in view so the director keys off stable types.
- **Encounter-outcome gate (must change carefully).** `updateEncounterOutcome()` treats "all enabled enemies terminal" as victory. Between a cleared group and the next warning the board is momentarily empty, which would false-trigger victory. Candidate: the wave phase, or the resolver, suppresses the victory transition while the wave runtime still has remaining queues or a pending batch; victory is only real when the final authored wave is exhausted with no living enemies and no pending batch. Endless never terminates by clear. This is the riskiest seam — the spec must state exactly who owns the gate (favor: the wave phase reports "run complete", and `finishAccepted` only calls the victory path when that is true). Child B deliberately left `updateEncounterOutcome` untouched for this reason.
- **Scenario bootstrap (defer to D).** Something must seed the wave runtime (wave 1, expanded queues) when the wave-driven scenario loads. This sketch assumes Child D's scenario constructor installs the initial wave runtime via Child B's operator; the wave phase only advances an already-installed runtime. If no wave runtime is present (the legacy fixed fixtures), the wave phase is a no-op, preserving every existing scenario.
- **Determinism.** The wave phase pulls its seeded source from `world.getRandomStream("waves")` (separate from rewards) and hands it to Child A's planner/expansion. Confirm the stream domain name with Child D/Child 09 so waves and rewards never share a stream.

## Non-Goals

1. Do not implement presentation of warnings or the wave number (Child D).
2. Do not build the wave-driven scenario or browser acceptance (Child D).
3. Do not add reward randomness or run-lifecycle overlays (port_09 / port_10).
4. Do not re-derive scheduling, placement, or level logic here; call Child A.
5. Do not alter enemy combat, guard, or movement resolution.

## Acceptance Criteria

1. A wave phase runs once per accepted player action, after the enemy phase, and is a no-op when no wave runtime is installed.
2. Spawn warnings advance only on accepted ticks, and at expiry surviving cells spawn through the existing spawn path with no stale reservation or telegraph.
3. Group admission is all-or-nothing and a later slot never bypasses a blocked earlier slot.
4. An empty board between a cleared group and the next warning is not read as victory; victory is only declared when the authored waves are exhausted.
5. The wave phase emits a stable event stream that presentation and tests can key off.
