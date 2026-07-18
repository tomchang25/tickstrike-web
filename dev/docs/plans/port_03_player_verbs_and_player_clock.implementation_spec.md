# Player Verbs and One-Action Tick

Parent Plan: `tickstrike_full_port_roadmap.md`

## Goal

Put Move, Normal Attack, and Dash on the existing Tick Arena command path before enemy behavior is added. Every accepted player verb must produce a deterministic player result and advance exactly one world tick; rejected verbs must leave the world unchanged.

## Summary

The core action boundary will gain `attack` and `dash` beside the existing `move` and `smash` commands. Normal Attack will target the adjacent cell selected by its cardinal direction and consume an action even when empty. Dash will move through at most three legal cells, stop before the first occupied, reserved, or illegal cell, and reject when it has no legal landing cell.

The implementation will add two semantic player-result events, preserve the existing `command_resolved -> player result -> world_advanced` ordering, and reuse the runtime queue and GSAP presentation boundary. The shared `tick-arena` scenario will place enemies at deterministic blocking and adjacent target cells so unit and browser tests exercise the same command sequence. No damage, enemy response, cooldown, Speed, class selection, or new screen is included.

## Relational Context

- `GameRuntime.execute()` accepts the `GameCommand` union, queues commands, calls `resolveCommand()`, publishes the resulting snapshot, and passes accepted `semanticEvents` to `PresentationDirector`; the runtime queue, generation cancellation, and snapshot ownership remain unchanged.
- `World` is the sole owner of tick, entity placement, occupancy, reservations, and snapshots. Resolvers read those values, mutate placement only through `moveEntity()`, and advance time only through `advancePlayerAction()`.
- `World.isWalkable()` is the authoritative Dash-cell predicate. It already rejects out-of-bounds, non-land, occupied, and reserved cells; do not duplicate terrain or occupancy rules in the resolver.
- `ActionResolution.events` remains the gameplay-result view, while `semanticEvents` remains the ordered presentation/runtime stream. Accepted new commands must record the semantic stream in `World.lastEvents`; rejected commands must return no events and must not overwrite the previous snapshot event stream.
- Input direction is selected by React controls or keyboard mapping and is passed as a cardinal `Cell`; core must not read DOM, mouse coordinates, facing state, or aim mode.
- `PresentationDirector` consumes semantic events after core state is resolved. It may animate a player view or transient effect but must not decide landing, validity, tick advancement, or enemy outcomes.
- The existing Smash command, fixture, and presentation behavior remain compatible. Do not merge Dash into Smash or change Smash semantics.
- The scenario fixture owns deterministic setup; tests under `test/` own assertions. Do not add a second combat runtime or verb-specific screen.

## Scope

### Included

- Add deterministic cardinal Attack and Dash commands and their accepted/rejected action results.
- Add ordered player attack and dash semantic events.
- Add shared Tick Arena controls, keyboard bindings, presentation, unit assertions, and one browser assertion.
- Adjust the shared foundation fixture so the test sequence has an adjacent attack target and a Dash blocker.

### Excluded

- Damage, hit outcomes, enemy movement or response, telegraphs, cooldowns, Speed, class selection, advanced aiming, production key-repeat settings, and new arenas or screens.
- Changes to authored character definitions; the Port 03 Dash range is fixed at three cells and does not read the later Ninja range value.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/actions/commands.ts` | Small | Add `attack` and `dash` command variants and include both in `commandConsumesTime()`. |
| `src/core/actions/action-resolver.ts` | Medium | Validate and resolve Attack and Dash, preserving the shared acceptance and tick boundary. |
| `src/core/events/combat-events.ts` | Small | Define the player attack and dash event payloads. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Place foundation enemies at deterministic adjacent and Dash-blocking cells. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Present attack impact and fast Dash movement, including transient cleanup. |
| `src/ui/TestbedPanel.tsx` | Medium | Add directional Attack and Dash controls and callback props. |
| `src/app/App.tsx` | Small | Dispatch the new commands and bind directional keyboard input. |
| `test/unit/core/actions/action-resolver.test.ts` | Medium | Assert command validity, outcomes, event order, and one-tick behavior. |
| `test/e2e/testbed.spec.ts` | Small | Assert the shared browser sequence and visible ordered result. |
| `dev/docs/plans/tickstrike_full_port_roadmap.md` | Small | Point roadmap item 03 to this implementation spec. |

## Execution Outline

1. Extend the core command and event unions first so every later layer has one typed contract.
2. Add Attack and Dash resolver branches. Keep Attack target validation limited to actor liveness and cardinal direction; walkability is not required for a whiff. For Dash, scan steps one through three with `World.isWalkable()`, stop at the first failure, reject an empty path, move to the last path cell, and finish through the existing accepted-action helper.
3. Update the foundation fixture to use player `{x: 6, y: 6}`, an adjacent enemy at `{x: 5, y: 6}`, and a second blocker at `{x: 8, y: 6}`. Keep the third enemy at `{x: 6, y: 4}` and preserve all existing IDs.
4. Add presentation cases, then add UI callbacks and controls. Use four directional buttons for each verb with test IDs `attack-up`, `attack-left`, `attack-down`, `attack-right`, `dash-up`, `dash-left`, `dash-down`, and `dash-right`. Preserve existing Move and Smash controls.
5. Add focused unit coverage for the exact fixture coordinates and a browser sequence of Move right, Attack right, then Dash left. Update the roadmap link after the spec is installed.

## Implementation Notes

- `attack` has shape `{ type: "attack"; actorId: EntityId; direction: Cell }`; `dash` has shape `{ type: "dash"; actorId: EntityId; direction: Cell }`. Both consume time when accepted.
- Attack computes `target = actor.cell + direction`, emits `{ type: "player_attacked", actorId, target }`, and does not inspect or mutate the target entity. An out-of-bounds or empty adjacent target is a valid whiff and still advances the tick.
- Dash emits `{ type: "player_dashed", actorId, from, to, path }`, where `path` contains every legal cell traversed in order and includes `to`. If the first candidate fails `isWalkable()`, return rejected with no placement or event mutation. If a later candidate fails, land on the last path cell.
- Accepted Attack semantic events are exactly `command_resolved`, `player_attacked`, `world_advanced`. Accepted Dash semantic events are exactly `command_resolved`, `player_dashed`, `world_advanced`. `events` contains only the middle player-result event.
- Normal Attack presentation should reuse the renderer's existing transient impact primitive at `target`. Dash should animate the existing actor view from its current position to `to` with a short leap duration. Both paths must resolve through `PresentationDirector`'s tracked timeline mechanism.
- App keyboard mapping remains Move on arrows/WASD and Smash on Space. Add Attack on `I/J/K/L` for up/left/down/right and Dash on Shift plus arrows/WASD. Check the Dash modifier before the Move branch so Shift input cannot also move.
- The browser sequence is: Move right from `{x: 6, y: 6}` to `{x: 7, y: 6}`; Attack right at `{x: 8, y: 6}`; Dash left through `{x: 6, y: 6}` and stop before the occupied `{x: 5, y: 6}`. The final player cell is `{x: 6, y: 6}` and the enemy count remains three.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Non-cardinal Attack or Dash direction | Reject with no world mutation, no stored events, and no tick advancement. |
| Inactive actor | Reject with the existing inactive-actor behavior and no tick advancement. |
| Attack target empty, blocked, or outside the arena | Accept as a whiff; emit `player_attacked` and advance one tick. |
| Dash encounters an occupied, reserved, wall, water, or out-of-bounds cell after at least one legal step | Stop before that cell and accept the landing on the last legal path cell. |
| Dash encounters a blocking cell immediately | Reject; do not emit a Dash event or advance the tick. |
| Dash reaches three legal cells | Land on the third cell and do not inspect or traverse a fourth cell. |
| Runtime reset during Attack or Dash presentation | Cancel the tracked timeline and transient effect through the existing generation/reset path; the new scenario has no stale visual. |

## Acceptance Criteria

1. The same Tick Arena screen provides cardinal Move, Normal Attack, and Dash controls, while existing Smash behavior remains intact.
2. Every accepted Move, Normal Attack, or Dash advances the displayed tick exactly once; every rejected command leaves the world snapshot and tick unchanged.
3. Normal Attack targets exactly the adjacent cell represented by its cardinal command, consumes time on a whiff, and does not change enemy HP or phase.
4. Dash lands deterministically on the last legal cell within a maximum of three cells and never occupies an illegal, reserved, or occupied cell.
5. Accepted command results expose the ordered stream `command_resolved`, player result, `world_advanced` to both focused logic assertions and the browser event log.
6. Attack and Dash presentation completes before the runtime reports idle, and reset leaves no pending timeline, transient effect, or orphan visual.
