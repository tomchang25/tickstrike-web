# Basic Enemy Tick Combat and Directional Guard

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Make Thrust and Slash the first complete enemies in the shared Tick Arena. They must take and deal damage, make one deterministic action after each accepted player action, commit locked Telegraph attacks, and use the shipped directional Guard lifecycle without introducing a Godot-style runtime FSM.

## Requirements

1. Establish one data-owned basic-enemy model with HP, player hit resolution, enemy damage, immediate logical death, and semantic combat results.
2. Run one shared Thrust/Slash enemy activity model after each accepted player action; each ready or recovery-complete enabled enemy receives at most one action per Tick, because this port deliberately does not retain the reference Speed/Energy scheduler.
3. Give enemies cardinal facing, one-cell deterministic movement with local fallback directions, locked attack commitment, Telegraph countdown, attack resolution, and recovery without creating per-role state-machine implementations.
4. Preserve one global Tick order: player result, all committed attack detonations, all status countdowns, recovery-complete eligibility, then at most one action for each eligible enemy in stable scenario order.
5. Add Front, Side, and Back Guard results, Defense, Guard break, Stagger, Guard restoration, and Protection as canonical deterministic state; preview and committed hits must use the same calculation.
6. Present HP, facing, Telegraphs, attack impacts, Guard, Stagger, Protection, and terminal cleanup through the shared scenario, Pixi/GSAP boundary, and browser harness.

## Design

The shared scenario continues to own deterministic fixtures. This plan develops only Thrust and Slash behavior; Ranged remains content for a later enemy-role plan and must not acquire a temporary parallel runtime.

Enemy state is data, not a Node, signal, or autonomous frame loop. The persistent activity values are:

| Activity | Meaning |
| --- | --- |
| `ready` | The enemy may face its attack or movement direction and move, commit an attack, or wait once this Tick. |
| `telegraphing` | A committed attack holds immutable cells, damage, and warning ticks. |
| `recovering` | The enemy cannot decide or act until its recovery countdown ends; when it reaches zero, it may act once in that same Tick. |
| `staggered` | Guard break prevents movement and attack commitment until the Stagger countdown ends. |

Movement, attack commitment, attack resolution, Guard break, and death are semantic actions or events rather than extra persistent states. Facing is updated as part of movement or attack selection; there is no separate turn action. Terminal entity lifecycle remains separate from enemy activity, so a dead entity cannot retain a valid Telegraph or recovery state.

For each accepted player action, resolve this order:

1. Resolve the player command and its direct combat result.
2. Advance the world Tick.
3. Detonate every expired committed attack against the player's post-action cell in stable scenario order.
4. Advance every recovery, Stagger, and Protection countdown in stable scenario order.
5. Let each eligible enemy move one legal cardinal cell, commit an attack, or wait once in stable scenario order; a blocked preferred move may use a fixed local fallback direction.
6. Publish the snapshot and ordered semantic result; presentation observes this completed result and cannot alter it.

Attack commitment is the Web equivalent of WindupAttackPrep. It does not deal damage: it locks the attack ID, rotated cells, outgoing damage, and warning duration, then exposes those same cells as a Telegraph. Moving the player changes only a later `ready` decision; it never retargets a committed attack. Thrust uses its three-cell forward line and Slash uses its three-cell forward row. A simple local movement rule with fixed fallback directions is sufficient for this plan; general pathfinding and action-energy scheduling are not required. Pixi presents the current cardinal facing with an entity marker, and Debug mode presents the current activity or latest action directly on the enemy.

Directional Guard resolves from the attacker cell relative to the target's cardinal facing. The current reference resolver uses Guard damage of 4 from the front, 16 from the side, and 32 from directly behind. While Guard survives, HP damage is multiplied by 0.2; the Guard-breaking hit deals full HP damage after Defense. This plan follows that effective resolver behavior rather than the unused directional HP-bypass constants retained elsewhere in the reference. Guard break cancels that enemy's committed attack and recovery, enters a three-Tick Stagger, restores Guard on exit, and begins five Ticks of Protection that halves ordinary Guard damage.

### Child Sketches

| Child | Focus | Current document |
| --- | --- | --- |
| 04.1 | Base enemy HP, player damage, and shared hit result | [Draft Implementation Spec](port_04_01_base_enemy_hit_resolution.implementation_spec.md) |
| 04.2 | Data-owned enemy activity, simple movement, and locked attacks | [Implemented Spec](port_04_02_basic_enemy_tick_actions.implementation_spec.md) |
| 04.3 | Directional Guard, Stagger, and Protection | [Draft Implementation Spec](port_04_03_directional_guard_stagger.implementation_spec.md) |
| 04.4 | Shared presentation and browser acceptance | [Draft Implementation Spec](port_04_04_enemy_combat_presentation_acceptance.implementation_spec.md) |
| 04.5 | One ordered combat event stream across core, runtime, snapshots, and presentation | [Draft Implementation Spec](port_04_05_combat_event_stream_consolidation.implementation_spec.md) |

Land the children in numeric order. Each becomes executable only when its implementation spec is written against the then-current codebase.

## Non-Goals

1. Do not retain or port the reference Speed/Energy scheduler; every enabled basic enemy acts at most once per accepted Tick.
2. Do not add Ranged behavior, Charge, Bomb, Mode, Boss, waves, spawn selection, or general pathfinding.
3. Do not add Dash/Smash-specific damage, invulnerability, cooldowns, Artifact triggers, or class selection.
4. Do not introduce a generic Node-style FSM, per-role FSMs, timers, or frame-driven combat ownership.
5. Do not let React state, animation duration, or presentation callbacks resolve combat outcomes.
6. Do not create a separate enemy showcase scene or combat runtime.

## Acceptance Criteria

1. Thrust and Slash take player damage, deal damage through committed attacks, die deterministically, and immediately release logical occupancy on death.
2. Each ready or recovery-complete enabled Thrust and Slash receives at most one deterministic action after an accepted player action; rejected commands do not advance their activity.
3. A visible Telegraph holds its committed cells and damage while the player moves, resolves once when its warning ends, and allows one new action when recovery reaches zero.
4. Facing, one-cell movement, attack footprints, conflicts, and stable scenario order produce the same result from the same command sequence.
5. Front, Side, and Back hits produce the specified Guard and HP results; Guard break cancels pending attacks, Stagger prevents action, and Protection reduces later Guard damage.
6. The shared browser scenario visibly shows HP damage, facing, movement, Telegraph, attack impact, recovery, Guard, Stagger, Protection, death, reset, and cleanup with no orphan visual or stale Telegraph.
