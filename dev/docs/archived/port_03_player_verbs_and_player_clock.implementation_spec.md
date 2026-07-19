# Player Verbs and One-Action Tick

Parent Plan: `port_03_player_verbs_and_player_clock.md`

Status: Implemented and verified

## Goal

Put Move, Normal Attack, and Dash on the existing Tick Arena command path before enemy behavior is added. Every accepted player verb must produce a deterministic player result and advance exactly one world tick; rejected verbs must leave the world unchanged.

## Summary

The core action boundary gains `attack` and `dash` beside the existing `move` and `smash` commands. Normal Attack targets the adjacent cell selected by its cardinal direction and consumes an action even when empty. Dash may traverse living enemy cells, lands on the farthest legal non-enemy cell within the selected distance, and applies the authored Mobility damage to enemies crossed when the player definition provides it.

The implementation adds two player-result events, preserves the single `command_resolved -> player result -> enemy phase -> world_advanced` stream, and reuses the runtime queue and GSAP presentation boundary. The shared `tick-arena` scenario places enemies at deterministic traversal and adjacent target cells so unit and browser tests exercise the same command path. Enemy response, cooldowns, Speed, class selection, and new screens remain outside this child.

## Relational Context

- `GameRuntime.execute()` accepts the `GameCommand` union, queues commands, calls `resolveCommand()`, publishes the resulting snapshot, and passes the complete `ActionResolution.events` stream to presentation; the runtime queue, generation cancellation, and snapshot ownership remain unchanged.
- `World` is the sole owner of tick, entity placement, occupancy, reservations, and snapshots. Resolvers read those values, mutate placement only through `moveEntity()`, and advance time only through `advancePlayerAction()`.
- Dash preview and commit share one path calculation. Land, bounds, reservations, and enemy traversal are resolved by the shared preview/world contract; only the final non-enemy landing must be unoccupied.
- `ActionResolution.events` is the one complete gameplay, snapshot, runtime, and presentation stream. Accepted commands record that same stream in `World.lastEvents`; rejected commands return no events and do not overwrite the previous snapshot event stream.
- Input direction is selected by React controls or keyboard mapping and is passed as a cardinal `Cell`; core must not read DOM, mouse coordinates, facing state, or aim mode.
- `PresentationDirector` consumes semantic events after core state is resolved. It may animate a player view or transient effect but must not decide landing, validity, tick advancement, or enemy outcomes.
- The existing Smash command, fixture, and presentation behavior remain compatible. Do not merge Dash into Smash or change Smash semantics.
- The scenario fixture owns deterministic setup; tests under `test/` own assertions. Do not add a second combat runtime or verb-specific screen.

## Scope

### Included

- Add deterministic cardinal Attack and Dash commands and their accepted/rejected action results.
- Add ordered player attack and dash semantic events.
- Add shared Tick Arena input adapters, keyboard bindings, pointer presentation, unit assertions, and one browser assertion.
- Adjust the shared foundation fixture so the test sequence has an adjacent attack target and a Dash blocker.

### Excluded

- Enemy movement or response, telegraphs, cooldowns, Speed, class selection, advanced aiming, production key-repeat settings, and new arenas or screens.
- Changes to authored character definitions; the Port 03 Dash range is fixed at three cells and does not read the later Ninja range value.

## Files to Change

| File                                                 | Change Size | Purpose                                                                                                                         |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/actions/commands.ts`                       | Small       | Add `attack` and `dash` command variants and include both in `commandConsumesTime()`.                                           |
| `src/core/actions/action-resolver.ts`                | Medium      | Validate and resolve Attack and Dash, preserving the shared acceptance and tick boundary.                                       |
| `src/core/events/combat-events.ts`                   | Small       | Define the player attack and dash event payloads.                                                                               |
| `src/harness/fixtures/shipped-arena.ts`              | Small       | Place foundation enemies at deterministic adjacent and Dash-blocking cells.                                                     |
| `src/presentation/timelines/PresentationDirector.ts` | Small       | Present attack impact and fast Dash movement, including transient cleanup.                                                      |
| `src/ui/TestbedPanel.tsx`                            | Medium      | Preserve the Mobility selector and browser-visible command/status surface; direct directional command buttons are not required. |
| `src/app/App.tsx`                                    | Small       | Dispatch the new commands and bind directional keyboard input.                                                                  |
| `test/unit/core/actions/action-resolver.test.ts`     | Medium      | Assert command validity, outcomes, event order, and one-tick behavior.                                                          |
| `test/e2e/testbed.spec.ts`                           | Small       | Assert the shared browser sequence and visible ordered result.                                                                  |
| `dev/docs/plans/tickstrike_full_port_roadmap.md`     | Small       | Point roadmap item 03 to this implementation spec.                                                                              |

## Execution Outline

1. Extend the core command and event unions first so every later layer has one typed contract.
2. Add Attack and Dash resolver branches. Keep Attack target validation limited to actor liveness and cardinal direction; walkability is not required for a whiff. For Dash, use the shared path preview, allow living enemy traversal, land on the last legal non-enemy cell within the selected distance, apply authored Mobility damage to crossed enemies, and finish through the existing accepted-action helper.
3. Update the foundation fixture to use player `{x: 6, y: 6}`, an adjacent enemy at `{x: 5, y: 6}`, and a second blocker at `{x: 8, y: 6}`. Keep the third enemy at `{x: 6, y: 4}` and preserve all existing IDs.
4. Add presentation cases, then retain keyboard Move/Attack and the Alt-held Pointer/Mobility input path. Keep the Mobility toggle and pointer preview as the browser-facing selection surface rather than adding duplicate directional buttons.
5. Add focused unit coverage for the exact fixture coordinates and browser coverage for pointer Attack, selected Mobility, traversal damage, tick advancement, and reset. Update the roadmap link after the spec is installed.

## Implementation Notes

- `attack` has shape `{ type: "attack"; actorId: EntityId; direction: Cell }`; `dash` has shape `{ type: "dash"; actorId: EntityId; direction: Cell; distance?: number }`. Both consume time when accepted.
- Attack computes `target = actor.cell + direction`, emits `{ type: "player_attacked", actorId, target }`, and does not inspect or mutate the target entity. An out-of-bounds or empty adjacent target is a valid whiff and still advances the tick.
- Dash emits `{ type: "player_dashed", actorId, from, to, path }`, where `path` contains every traversed land cell in order and may include living enemy cells. The landing is the last legal non-enemy cell; if no such cell exists, return rejected with no placement, damage, event, or tick mutation.
- Accepted Attack and Dash results expose the complete ordered stream, including command boundary, player result, enemy-phase events when applicable, and world advancement.
- Normal Attack presentation should reuse the renderer's existing transient impact primitive at `target`. Dash should animate the existing actor view from its current position to `to` with a short leap duration. Both paths must resolve through `PresentationDirector`'s tracked timeline mechanism.
- App keyboard mapping remains Move on arrows/WASD and Attack on `I/J/K/L` for up/left/down/right. Mobility is selected through the existing toggle and committed through the Alt-held pointer path; direct keyboard Mobility shortcuts must not bypass that selection.
- Browser coverage uses the shared Tick Arena to verify pointer Attack, selected Mobility preview/commit, traversed enemy damage, ordered events, and reset-safe presentation. The deterministic fixture retains one player and three enemy entities.

## Edge Cases

| Case                                                        | Expected Handling                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-cardinal Attack or Dash direction                       | Reject with no world mutation, no stored events, and no tick advancement.                                                                    |
| Inactive actor                                              | Reject with the existing inactive-actor behavior and no tick advancement.                                                                    |
| Attack target empty, blocked, or outside the arena          | Accept as a whiff; emit `player_attacked` and advance one tick.                                                                              |
| Dash encounters an enemy cell after at least one legal step | Include the enemy cell in the path, apply authored Mobility damage once to that enemy, and continue toward the last legal non-enemy landing. |
| Dash encounters a blocking cell immediately                 | Reject; do not emit a Dash event or advance the tick.                                                                                        |
| Dash reaches three legal cells                              | Land on the third cell and do not inspect or traverse a fourth cell.                                                                         |
| Runtime reset during Attack or Dash presentation            | Cancel the tracked timeline and transient effect through the existing generation/reset path; the new scenario has no stale visual.           |

## Acceptance Criteria

1. The same Tick Arena screen provides keyboard Move/Attack and pointer-selected Dash/Smash Mobility, while existing Smash behavior remains intact.
2. Every accepted Move, Normal Attack, or Dash advances the displayed tick exactly once; every rejected command leaves the world snapshot and tick unchanged.
3. Normal Attack targets exactly the adjacent cell represented by its cardinal command, consumes time on a whiff, and routes an occupied enemy target through the shared hit-resolution contract without changing the command boundary.
4. Dash lands deterministically on the last legal non-enemy cell within the selected range, never occupies an illegal, reserved, or occupied cell, and applies authored Mobility damage to traversed enemies.
5. Accepted command results expose the complete ordered stream, including `command_resolved`, player and applicable enemy results, and `world_advanced`, to both focused logic assertions and the browser event log.
6. Attack and Dash presentation completes before the runtime reports idle, and reset leaves no pending timeline, transient effect, or orphan visual.
