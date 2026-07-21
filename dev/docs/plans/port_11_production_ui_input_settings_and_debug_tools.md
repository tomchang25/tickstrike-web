# Production Shell Around the Same Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Replace the temporary controls with the player-facing HUD and input shell while keeping the deterministic runtime as the only gameplay owner.

## Requirements

1. Show player, enemy, Tick, wave, reward, status, and Telegraph information from runtime snapshots.
2. Bind keyboard input to Move and Normal Attack; Dash and Smash stay unified as the pointer-driven Mobility mode entered with Alt. There is no Wait command (a whiffed Normal Attack is the deliberate pass-a-tick option) and no dedicated restart input: restart is offered only by terminal overlays and, later, the settings panel.
3. During an armed multi-tick action (Smash windup), left-click confirms and executes the smash, advancing the Tick; right-click cancels directly — no panel — returning the player to idle without advancing the Tick. The cancel is recorded in the command log so replay stays faithful.
4. Keep React responsible for low-frequency HUD and overlays; Pixi remains responsible for board entities and combat presentation.
5. Suppress gameplay input over UI and release held input on focus loss, visibility changes, and route changes.
6. Add only settings and debug controls that operate through the existing command boundary.
7. Split the oversized `test/e2e/testbed.spec.ts` (~1,024 lines, 18 flat tests) into focused specs as this shell reworks the browser input and HUD surface those tests drive. Test-hygiene only; no assertion or coverage change. Moved from engineering hardening, deferred until the e2e surface is next touched.

## Design

The shell is a projection and input adapter around the same Tick Arena. It may pause command admission for a reward or terminal overlay, but it never mutates entities directly. Debug actions use the same deterministic scenario setup and command path as normal input.

Pointer aim, overlays, and held-key repeat already exist from earlier plans. This plan formalizes the input layer, adds the windup-cancel flow, replaces the temporary HUD projections, and adds minimal persisted settings. HUD work here establishes a visual-consistency baseline only; full Pixi/React shell unification and reference parity belong to port_13 after its reference audit.

## Children

Execute top to bottom, one child per session, tests green before each commit. Shipped rows are retained with their spec named in plain text but no link, per `dev/workflows/closeout_standard.addendum.md`. Child 01 was a test-hygiene move (no changelog entry); child 02 is recorded in `CHANGELOG.md`.

| Child                             | Scope                                                                                                                                                                                                                                                                                                    | Handoff                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 01 e2e spec split                 | Split `test/e2e/testbed.spec.ts` into focused specs (harness/lifecycle, per-enemy behavior, input/UI groups); pure moves, no assertion change                                                                                                                                                            | Shipped — port_11_01_e2e_spec_split.implementation_spec.md                                       |
| 02 Windup cancel core and runtime | Core resolver clearing the armed Smash without consuming time plus a `smash_cancelled` event; runtime `cancelArmedSmash` entrance through the serialized queue; command-log entry kind; debug API; unit tests. Goldens must pass unregenerated                                                           | Shipped — port_11_02_windup_cancel.implementation_spec.md                                        |
| 03 Input layer                    | Extract keyboard handling from `use-game-session.ts` into `src/ui/input/` (pure keymap + driver hook) with no new bindings; blur/visibility/route release including the stuck Alt pointer mode; right-click during an armed windup dispatches the child 02 cancel (contextmenu suppressed on the canvas) | [port_11_03_input_layer.sketch.md](port_11_03_input_layer.sketch.md)                             |
| 04 Production HUD                 | Replace the temporary build row and hint line with snapshot-projected player, wave, and status HUD around the arena; consistency baseline only, parity deferred to port_13                                                                                                                               | [port_11_04_production_hud.sketch.md](port_11_04_production_hud.sketch.md)                       |
| 05 Settings and debug gating      | localStorage-backed settings through a platform adapter with a runtime owner (v1: debug overlay toggle, reduced motion); a settings-panel Restart action through the existing reset entrance; explicit DEV-only debug toggle; production build keeps excluding all debug code                            | [port_11_05_settings_and_debug_gating.sketch.md](port_11_05_settings_and_debug_gating.sketch.md) |

## Non-Goals

1. Do not add touch, gamepad, localization, tutorials, shops, or meta progression.
2. Do not make the HUD a second state owner or rerender individual combat entities through React.
3. Do not expose debug controls in a production build without an explicit debug mode.
4. Do not let settings silently change combat rules unless they are an approved gameplay option.

## Acceptance Criteria

1. Production input drives the same commands and outcomes as the deterministic browser scenario.
2. HUD and overlays reflect snapshots without recalculating combat.
3. Focus loss and reset release all held input and remove all pending presentation work.
4. Settings and debug controls cannot bypass the single runtime entry point.
5. Cancelling an armed windup leaves the Tick unchanged, returns the player to idle, and round-trips through command log replay.
