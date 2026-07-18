# Production UI, Input, Settings, and Debug Tools

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../port-ref/tickstrike)

## Goal

Deliver Batch 11 of the Tickstrike Full Port Roadmap by complementing the migration testbed with the shipped production HUD, overlays, browser input grammar, settings, navigation, toast, and debug surfaces. React remains the low-frequency interface owner while combat entities remain in the game presentation layer.

## Requirements

1. Present player health, Speed, active Mobility cooldown, class, tick, wave, owned Artifacts, enemy health, Guard, statuses, and danger countdowns from canonical snapshots.
2. Implement build inspection, reward cards, wave-end, Demo Complete, run result, Smash cancellation confirmation, Settings, Main Menu, toast, and debug interfaces with their reference pause and input-lock behavior.
3. Bind keyboard and pointer input to the shipped grammar, including movement, free mouse aim, Alt mode hold/release, confirm, cancel, Wait, restart, Settings, and authored repeat cadence.
4. Suppress gameplay pointer input over UI and prevent focused DOM controls from also issuing gameplay commands.
5. Persist shipped settings for volume, fullscreen, Smash cancellation confirmation, auto-attack-on-move, debug preference, and any reference-visible legacy option without inventing behavior for an unconnected setting.
6. Handle focus loss, visibility changes, fullscreen transitions, and route changes by releasing held input and preserving deterministic pause behavior.

## Design

The production HUD is a projection of runtime state. React does not own per-frame combat entities or recompute combat outcomes. Preview badges, danger cells, enemy bars, and combat movement remain presentation responsibilities where appropriate, while menus and low-frequency overlays remain DOM interfaces.

Input repeat uses the shipped cadence: Move and Wait repeat at 0.24 seconds, while Confirm repeats at 0.32 seconds. Raw gameplay input is suppressed whenever the pointer or focused control belongs to UI.

The saved dash-direction option is displayed by the reference but does not change combat behavior. It remains inert during parity; connecting it requires a separate approved product change.

## Non-Goals

1. Do not add touch, gamepad, localization, tutorial, or remappable controls; none are shipped reference behavior.
2. Do not implement Coin, unlock, character-selection, shop, or meta-progression UI.
3. Do not make semantic test mirrors substitute for accessible production UI.
4. Do not allow debug controls in builds that are not debug-capable.

## Acceptance Criteria

1. Every shipped HUD value and overlay transition reflects canonical state and reference pause/input ownership.
2. Browser input produces the same command grammar and repeat behavior as the reference without UI click-through or duplicate focused-control commands.
3. Focus loss and route changes cannot leave Alt, pointer, Wait, repeat, or confirmation state stuck.
4. Settings survive reload, invalid stored values recover safely, and inert legacy settings do not silently alter combat.
5. Unit and component coverage prove formatting, settings validation, modal ownership, command binding, repeat, and focus cleanup.
6. Playwright acceptance proves production keyboard/pointer flows, overlays, settings persistence, fullscreen fallback, debug gating, and accessible focus behavior.
