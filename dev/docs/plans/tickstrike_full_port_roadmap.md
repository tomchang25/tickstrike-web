# Tickstrike Web Port Roadmap

## Purpose

Build one playable Tickstrike integration point first, then extend that same point until the full run exists. The first milestone is not a collection of enemy demos: it is one deterministic Tick Arena containing one player, three basic enemies, player movement, Normal Attack, Dash, enemy movement, enemy state transitions, WindupAttackPrep, Telegraph, and attack resolution.

## Single Integration Point

There is one gameplay entry point: the Tick Arena screen and its runtime. Every command follows this path:

```text
input -> player command -> player result -> enemy phase -> tick snapshot/events -> Pixi/GSAP presentation
```

An accepted player action advances exactly one world tick. The enemy phase reads the player's post-action cell. Rejected commands do not advance time. The runtime owns the command queue and reset boundary; the deterministic core owns outcomes; Pixi/GSAP only presents snapshots and events.

## First Playable Target

Use one fixed deterministic scenario:

- One player with Move, Normal Attack, and cardinal Dash.
- Three basic enemy roles: Thrust, Slash, and Ranged.
- One shared enemy state machine: Move, WindupAttackPrep, Telegraph, Attack, Recover, Stunned, and Dead.
- Enemy movement and attack choice happen once per accepted player action.
- Windup locks the attack intent. Telegraph exposes the locked cells. Player movement changes the next enemy decision, not an already committed attack.
- The browser shows the board, player, enemy movement, telegraph cells, damage, death, and reset on this same screen.

## Execution Rules

1. `port_02` through `port_05` form one implementation milestone. Do not split them into independent vertical slices.
2. Every later plan changes the same Tick Arena and deterministic scenario. No plan may create a second combat runtime or separate integration path.
3. Add the smallest rule that makes the next visible behavior work. Do not add waves, rewards, classes, save data, or production menus before the basic Tick loop is playable.
4. Keep one scenario, one command boundary, and one presentation boundary until the first playable target passes.
5. Each plan has one focused logic test set and one browser assertion against the shared scenario. Do not create a separate testbed for every enemy or mechanic.

## Ordered Plans

| Plan | Focus | Result in the same Tick Arena |
| --- | --- | --- |
| 02 | Deterministic arena and runtime seam | A resettable board with one player and three enemy fixtures. |
| 03 | Player verbs and Tick boundary | Move, Normal Attack, Dash, accepted/rejected commands, and one-tick advancement. |
| 04 | Enemy state machine | Movement, WindupAttackPrep, Telegraph, locked attacks, and post-player-action decisions. |
| 05 | First playable Tick Arena | Player damage, enemy damage, death, presentation, and cleanup form one playable loop. |
| 06 | Basic combat expansion | Directional results, Guard/Stagger, and Dash refinement are added without changing the entry point. |
| 07 | Additional enemies | More roles reuse the same state machine and navigation contracts; no role-specific runtime. |
| 08 | Waves and spawning | Authored waves and spawn warnings feed the same world and Tick boundary. |
| 09 | Rewards and run build | Rewards modify the existing player state after an encounter; no parallel combat state. |
| 10 | Run lifecycle | Start, wave completion, death, restart, and the endless branch reuse the same runtime. |
| 11 | Production shell | HUD, input, settings, and debug controls project the existing runtime. |
| 12 | Presentation and release | Assets, audio, responsive behavior, teardown, and packaging harden the same path. |

## Done When

The port is complete when the single Tick Arena can run the intended content from start to terminal outcome, deterministic scenarios reproduce the same command sequence, browser assertions observe the result, and reset/restart leaves no pending animation, callback, telegraph, or orphan visual.
