# First Enemy Combat Vertical Slice

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)

## Goal

Deliver Batch 5 of the Tickstrike Full Port Roadmap through one complete shipped enemy from spawn state to decision, movement, commitment, detonation, damage, interruption, and death. The Thrust role is the initial proof because it exercises the shared enemy clock without introducing specialized movement.

## Requirements

1. Implement enemy energy accumulation and funded actions at the shipped speed, including more than one action when sufficient energy is available.
2. Implement pursuit, facing, attack-position selection, attack commitment, warning countdown, detonation, recovery, and interruption for the Thrust role.
3. Resolve enemy detonation against the player's post-action cell, because player action completes before committed enemy attacks detonate.
4. Prevent disabled enemies from acting or accumulating energy while Staggered, protected by an interruption state, recovering, or terminal as defined by the reference.
5. Present enemy facing, intent, warning cells, countdown, attack, health, Guard, status, damage, Guard break, and death from semantic state and events.

## Design

Enemy world advancement follows this order after the player action has fully resolved:

1. Advance and detonate existing committed attacks.
2. Advance enemy status, protection, and recovery.
3. Add energy to enemies that are allowed to accumulate it.
4. Spend each complete one-hundred-energy budget on a funded enemy action.
5. Publish world advancement after enemy outcomes are complete.
6. Publish player death only after the complete tick resolves.

The Thrust role uses its shipped health, Small Guard, speed 75, forward three-cell attack, and one-tick warning. Its first vertical slice must prove that prediction, telegraph, commitment, and detonation describe the same locked attack.

## Non-Goals

1. Do not implement Ranged, Charge, Bomb, Mode, or Boss behavior.
2. Do not implement wave scheduling or random group placement.
3. Do not reproduce Godot state nodes or signal plumbing.
4. Do not introduce the proposed enemy commitment or facing-action redesign.

## Acceptance Criteria

1. A fixed Thrust scenario matches reference decisions, energy, movement, facing, commitment cells, countdown, detonation, recovery, and damage.
2. Moving out of a committed cell avoids damage, while moving into it receives damage after the player action resolves.
3. Guard break and death cancel the enemy's pending combat state without a later orphan detonation.
4. Disabled enemies neither act nor accumulate energy outside the reference allowances.
5. Unit coverage proves every enemy-phase ordering boundary and exact semantic event order.
6. Pixi/GSAP and Playwright acceptance prove the full visible encounter and no pending telegraph, timeline, or enemy visual after completion or reset.
