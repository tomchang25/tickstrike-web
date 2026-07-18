# Production Shell Around the Same Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Replace the temporary controls with the player-facing HUD and input shell while keeping the deterministic runtime as the only gameplay owner.

## Requirements

1. Show player, enemy, Tick, wave, reward, status, and Telegraph information from runtime snapshots.
2. Bind keyboard and pointer input to Move, Normal Attack, Dash, confirm, cancel, Wait, restart, and lifecycle actions.
3. Keep React responsible for low-frequency HUD and overlays; Pixi remains responsible for board entities and combat presentation.
4. Suppress gameplay input over UI and release held input on focus loss, visibility changes, and route changes.
5. Add only settings and debug controls that operate through the existing command boundary.

## Design

The shell is a projection and input adapter around the same Tick Arena. It may pause command admission for a reward or terminal overlay, but it never mutates entities directly. Debug actions use the same deterministic scenario setup and command path as normal input.

Start with keyboard Move, Attack, Dash, and Reset. Add pointer aim, overlays, settings persistence, and repeat behavior only after the basic browser flow remains deterministic.

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
