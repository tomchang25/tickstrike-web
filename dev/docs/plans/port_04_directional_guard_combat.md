# Enemy Tick State Machine

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Connect the three basic enemies to the same player-clocked Tick Arena. They must move toward the player, enter `WindupAttackPrep`, expose a `Telegraph`, and resolve a locked attack according to the player's movement on each accepted Tick.

## Requirements

1. Use one explicit state machine for Thrust, Slash, and Ranged: Move, WindupAttackPrep, Telegraph, Attack, Recover, Stunned, and Dead.
2. Run the enemy phase only after an accepted player action has resolved.
3. Let each enemy observe the player's post-action cell when choosing movement or starting WindupAttackPrep.
4. Lock attack shape and target cells during WindupAttackPrep, expose them as Telegraph state, and resolve the same locked cells after the warning.
5. Keep enemy decisions deterministic and process enemies in stable scenario order.
6. Make state transitions and attack cells semantic data so the renderer does not decide whether an attack exists.

## Design

For each accepted player action, run this exact order:

1. Resolve the player command.
2. For each enemy, resolve an existing Telegraph or Recover state.
3. Otherwise move one legal step toward the player's new cell, or enter WindupAttackPrep when its attack condition is met.
4. Publish the new state, telegraph cells, and tick result.

WindupAttackPrep does not deal damage. It creates the intent. Telegraph displays the intent for one or more ticks. Moving the player changes the next decision, but does not retarget a committed telegraph. Thrust uses a short forward line, Slash uses a short lateral pattern, and Ranged keeps distance and uses a cross pattern. All three use the same transitions and cleanup.

## Non-Goals

1. Do not add Guard, Defense, waves, random spawn selection, or advanced pathfinding.
2. Do not add a different state-machine implementation for each enemy.
3. Do not let animation duration, timers, or React state resolve combat outcomes.
4. Do not create separate enemy showcase scenes.

## Acceptance Criteria

1. Each basic enemy moves or prepares deterministically after the player moves on the shared Tick.
2. A visible Telegraph remains locked to its committed cells while the player moves.
3. An attack resolves only when its warning ends and never resolves twice.
4. The browser scenario shows movement, WindupAttackPrep, Telegraph, attack resolution, and recovery for the same three enemies.
