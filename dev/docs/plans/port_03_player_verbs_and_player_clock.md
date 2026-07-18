# Player Verbs and Player Clock

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)

## Goal

Deliver Batch 3 of the Tickstrike Full Port Roadmap by matching the shipped player command grammar, one-action clock, Speed resource, and cooldown upkeep. This gives later combat and enemy timing one authoritative command-to-tick contract.

## Requirements

1. Support Move, Wait, Normal Attack, free aiming, mode selection, confirmation, and cancellation with the same accepted and rejected outcomes as the reference.
2. Advance the world exactly once for each consumed player action and never for aiming, mode changes, cancellation, or rejected targets.
3. Preserve the shipped rule that a legal Normal Attack consumes its action even when it hits no target.
4. Implement the shipped Speed Meter so eligible Move or Normal Attack actions can be free to the world while still advancing player cooldown upkeep.
5. Preserve last valid aim for diagonal or zero-direction input and keep preview direction stable until valid aim changes.
6. Emit ordered semantic events that distinguish command acceptance, player action results, player-only upkeep, and world advancement.

## Design

The player clock separates player action consumption from world advancement. A Speed-funded Move or Normal Attack still resolves and advances player-owned cooldown state, but enemy attacks, recovery, energy, and spawn warnings do not advance.

The shipped input meaning is authoritative: Space represents Wait, mouse position supplies free aim, holding Alt selects Mobility mode, releasing Alt returns to Attack mode, left click confirms, and right click cancels. Production browser binding is completed later, but commands and behavior are established here.

Player action resolution precedes the enemy phase. This batch establishes the ordering seam but does not yet implement enemy behavior.

## Non-Goals

1. Do not implement Dash, Smash, Chain Dash, Guard Shredder, or Execution.
2. Do not implement enemy decisions or attack detonation.
3. Do not implement production input repeat, modal focus handling, or settings UI.
4. Do not adopt the proposed Action Point replacement for Speed.

## Acceptance Criteria

1. Legal Move, Wait, and Normal Attack scenarios consume the same ticks and resources as the reference.
2. Rejected movement and attack targets do not advance world time or partially mutate player state.
3. A legal attack with no victim consumes one action and emits the expected ordered result.
4. A Speed-funded action updates player cooldown upkeep without advancing enemy-facing world time.
5. Unit coverage proves acceptance, rejection, aim fallback, Speed thresholds, cooldown timing, and event order.
6. Pixi/GSAP and Playwright acceptance prove visible movement, attack, wait feedback, free-action behavior, and complete presentation cleanup.
