# Waves and Spawning in the Same Tick Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Replace the fixed three-enemy fixture with authored waves while preserving the existing world, command boundary, enemy state machine, and presentation path.

## Requirements

1. Schedule authored groups in order and advance their warnings only on accepted world ticks.
2. Admit a group atomically when all required cells can be placed; never create a partial authored group.
3. Reserve warned cells, show them in the same Telegraph layer, and revalidate them before enemies appear.
4. Keep enemy stat growth and placement deterministic from the scenario seed and wave inputs.
5. Preserve the same enemy phase after every player action regardless of whether enemies came from a fixture or a wave.

## Design

Wave scheduling is a producer of enemy spawn intents, not a second combat system. A warning is a temporary world claim with a visible expiry. When it expires, the group either spawns completely or remains pending according to the placement rule. Spawned enemies immediately enter the existing enemy state machine.

Start with the first authored wave in the current browser scenario. Add later waves and Endless only after wave completion and cleanup are observable in that same scenario. Keep wave and reward random choices separate when randomness is first required.

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
