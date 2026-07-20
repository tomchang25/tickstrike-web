# Waves and Spawning in the Same Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Replace the fixed enemy fixture with authored waves while preserving the existing world, command boundary, enemy state machine, and presentation path.

## Requirements

1. Schedule authored groups in order and advance their warnings only on accepted world ticks.
2. Admit a group atomically when all required cells can be placed; never create a partial authored group.
3. Reserve warned cells, show them in the same Telegraph layer, and revalidate them before enemies appear.
4. Keep enemy stat growth and placement deterministic from the scenario seed and wave inputs.
5. Preserve the same enemy phase after every player action regardless of whether enemies came from a fixture or a wave.

## Design

Wave scheduling is a producer of enemy spawn intents, not a second combat system. A warning is a temporary world claim with a visible expiry. When it expires, the group either spawns completely or remains pending according to the placement rule. Spawned enemies immediately enter the existing enemy state machine.

The authored content shape already exists: ordered spawn groups, waves that reference those groups through slots, per-slot warning ticks and level offsets, and a stat-growth progression profile are all authored data with a validated catalog. This plan wires that inert catalog into the running world; it does not redesign the content shape.

### Scheduling and Atomic Admission

Groups enter through ordered slots. Each slot names a spawn group, a start condition, and a warning duration in accepted ticks. A slot becomes eligible when its start condition is met: the previous group fully cleared, the previous group reduced to at most an authored survivor threshold, or immediate overlap with no wait. Eligibility latches — once a slot is eligible it stays eligible — and a cleared or survivor condition only trusts a living count of zero after the predecessor has actually spawned at least once, so an empty board at wave start does not falsely satisfy it.

Admission is all-or-nothing. The earliest eligible slot with remaining members is admitted as one batch of its entire remaining count. If the arena's free population headroom (the wave's population cap minus living enemies) cannot hold the whole batch, or placement cannot find exactly that many distinct legal cells, nothing spawns this tick and no later slot jumps ahead. A partial authored group is never created.

Placement strategies are authored per group: a player-ring spreads members at a short Manhattan distance around the player, an anchor-cluster picks a random anchor at mid distance and fills the nearest cells to it, and a scatter selects random legal land cells. All strategies draw from a wave-dedicated deterministic stream kept separate from reward randomness so encounter composition and reward rolls never disturb each other.

### Spawn Warning Lifecycle

A warning is a temporary world claim with a visible expiry. When a batch is admitted, its target cells are reserved and shown in the shared Telegraph layer with a spawn phase and a remaining-tick count. The countdown advances only on accepted world ticks, matching enemy attack warnings. Spawn reservations block conflicting movement into their cells, and the block is authoritative regardless of any attack telegraph drawn over the same cell.

At expiry the reserved cells are revalidated against live occupancy and the player's position. A cell that is no longer legal is replaced with a strategy-consistent alternative or its member is requeued — cells are never silently dropped, preserving all-or-nothing admission. Surviving cells spawn their members, which immediately enter the existing enemy state machine in the Ready activity. A warning duration of zero spawns immediately with no telegraph.

### Enemy Level and Stat Growth

A spawned member's level is its wave number plus the group slot's authored level offset. Each of maximum HP, attack damage, and defense scales from the Level-1 authored base through its own authored two-segment growth curve: a standard term that applies from Level 1 and a steeper lethal term that only begins past Level 9 (the authored lethal start is Level 10). HP and damage multiply the base by one plus the growth; defense adds the growth to the base, because combat already reduces defense non-linearly. Guard does not follow level: it is derived from the base wave number through an authored guard curve — a base value until the authored standard wave limit (20), then one added lethal tier for every authored tier cadence (5) of waves beyond it. The slot's level offset never affects Guard. Every projection is a pure function of authored data plus wave and offset, so it is fully deterministic with no randomness.

### Endless

There is no separate Endless combat system. Waves beyond the last authored demo wave reuse a single authored endless template, re-expanded each wave so weighted compositions redraw from the wave stream, while the level keeps climbing with the wave number so pressure grows without bound. Endless is introduced only after wave completion and cleanup are observable in the same scenario.

### Child Overview

The plan lands as five ordered children in the same Tick Arena scenario. They are executable only in this order; each later child rides on the seams the earlier ones install and does not create a second runtime, route, or presentation boundary.

| Child | Focus                                                                                          | Current document                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A     | Pure wave scheduling, spawn placement, and deterministic level projection with no world wiring | [Implementation Spec](port_08_a_wave_scheduling_and_level_core.implementation_spec.md)              |
| B     | World-owned wave runtime state, spawn reservations, spawning telegraphs, and snapshot exposure | [Draft Implementation Spec](port_08_b_world_spawn_reservation_and_telegraph.implementation_spec.md) |
| C     | Wave phase orchestration on the accepted-tick boundary and the spawn/clear event stream        | [Sketch](port_08_c_wave_phase_orchestration.sketch.md)                                              |
| C1    | Terminal entity lifecycle, retained Pixi ghosts, and terminal-free semantic snapshots          | [Draft Implementation Spec](port_08_c1_terminal_entity_lifecycle.implementation_spec.md)            |
| D     | Spawn-warning presentation and a wave-driven browser scenario with acceptance                  | [Sketch](port_08_d_spawn_presentation_and_wave_scenario.sketch.md)                                  |

Child A establishes the deterministic decision core with no world dependency, so it is testable in isolation before anything is wired. Child B gives the world the state and claim vocabulary the scheduler drives through. Child C connects that vocabulary to the accepted-tick boundary and establishes wave-aware completion. Child C1 removes terminal entities from canonical snapshots while retaining their Pixi visuals only for terminal timelines. Child D makes the wave behavior visible and asserts it in the browser, and only then introduces Endless.

## Non-Goals

1. Do not add procedural encounter generation, terrain mutation, curses, or new spawn mechanics.
2. Do not add rewards or lifecycle overlays here.
3. Do not create a wave simulator outside the Tick Arena runtime.
4. Do not optimize population or pathfinding before the authored behavior is correct.

## Acceptance Criteria

1. The same scenario can progress from a fixed fixture to authored groups without a route or runtime change.
2. Spawn warnings are visible, block conflicting movement, expire deterministically, and never leave stale cells.
3. Group admission is all-or-nothing and spawned enemies use the existing state machine.
4. Browser acceptance observes one wave ending and the next group entering the same arena.
