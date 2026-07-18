# First Playable Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Finish the first real integration point: one player fights the enabled basic enemies on one deterministic board from initial setup to victory, defeat, or reset. This is the playable gate for the port, not a vertical slice for one enemy.

## Requirements

1. Build win, defeat, and reset flow on the existing Port 04 combat outcomes without adding a second combat resolver or enemy runtime.
2. Allow the player to avoid a locked Telegraph by moving before its attack resolves and to complete the encounter through the existing HP, Guard, and death rules.
3. End the scenario when the player dies or every enabled enemy is dead, then allow a clean reset.
4. Present the terminal outcome, restart affordance, and idle boundary from completed snapshots and semantic events.

## Design

The scenario is the single browser-visible proof for plans 02 through 05. A normal loop is:

```text
player move/attack/dash -> enemy move or Telegraph/Attack -> snapshot -> presentation
```

The player can win by clearing the enabled enemies and can lose by standing in a committed attack. Thrust pressures a line and Slash pressures a nearby pattern; later roles extend the same combat activity model without changing this entry point.

Logical death is immediate. Visual death is an event timeline that must finish before reset or scenario replacement is considered idle.

### Child Sketches

| Child | Focus | Current document |
| --- | --- | --- |
| 05.z | Post-playable architecture-consolidation decision gate | [Sketch](port_05_z_architecture_consolidation_decision.sketch.md) |

The parent plan is currently executed by [Implementation Spec](port_05_first_playable_tick_arena.implementation_spec.md). Do not execute the 05.z architecture decision until the acceptance criteria below pass.

Do not execute an architecture reorganization while Port 05 is incomplete. Revisit this sketch after the Port 05 acceptance criteria pass and before starting Port 06; a later implementation spec must select and verify any code change.

## Non-Goals

1. Do not add waves, rewards, class selection, permanent progression, or production menus.
2. Do not implement every enemy role before this scenario is playable.
3. Do not add a second runtime, arena, or enemy-specific integration testbed.
4. Do not make a presentation timeline responsible for damage, death, or Tick advancement.

## Acceptance Criteria

1. A deterministic browser scenario lets the player move, attack, use the currently available Mobility behavior, avoid Telegraphs, kill enabled enemies, and die.
2. The same command sequence produces the same snapshots, events, damage, and terminal result.
3. Winning, dying, and resetting leave no active Telegraph, pending animation, stale callback, or orphan visual.
4. This single scenario passes the focused logic assertions and Playwright browser assertion required by the project completion contract.
