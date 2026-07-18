# First Playable Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Finish the first real integration point: one player fights three basic enemies on one deterministic board. This is the playable gate for the port, not a vertical slice for one enemy.

## Requirements

1. Apply basic damage from Normal Attack and Dash to enemies and from enemy attacks to the player.
2. Remove dead entities from logical occupancy immediately while allowing a short presentation cleanup.
3. Allow the player to avoid a locked Telegraph by moving before its attack resolves.
4. End the scenario when the player dies or all three enemies are dead, then allow a clean reset.
5. Drive Pixi/GSAP from snapshots and semantic events for movement, Telegraph, impact, damage, death, and reset.

## Design

The scenario is the single browser-visible proof for plans 02 through 05. A normal loop is:

```text
player move/attack/dash -> enemy move or Telegraph/Attack -> snapshot -> presentation
```

The player can win by clearing the three enemies and can lose by standing in a committed attack. The exact enemy role differences stay small: Thrust pressures a line, Slash pressures a nearby pattern, and Ranged pressures a cross from distance. Their state transitions remain shared.

Logical death is immediate. Visual death is an event timeline that must finish before reset or scenario replacement is considered idle.

## Non-Goals

1. Do not add waves, rewards, class selection, permanent progression, or production menus.
2. Do not implement every enemy role before this scenario is playable.
3. Do not add a second runtime, arena, or enemy-specific integration testbed.
4. Do not make a presentation timeline responsible for damage, death, or Tick advancement.

## Acceptance Criteria

1. A deterministic browser scenario lets the player move, attack, Dash, avoid Telegraphs, kill enemies, and die.
2. The same command sequence produces the same snapshots, events, damage, and terminal result.
3. Winning, dying, and resetting leave no active Telegraph, pending animation, stale callback, or orphan visual.
4. This single scenario passes the focused logic assertions and Playwright browser assertion required by the project completion contract.
