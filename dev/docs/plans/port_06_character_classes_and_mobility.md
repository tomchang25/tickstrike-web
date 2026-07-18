# Mobility Combat Refinement in the Same Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)
Implementation Spec: [Mobility Combat Refinement](port_06_mobility_combat_refinement.implementation_spec.md)
Follow-up Draft: [Smash Displacement and Terrain](port_06a_smash_displacement_and_terrain.implementation_spec.md)

## Goal

Refine Dash and Smash only after the basic Tick Arena is playable. Mobility-specific damage, cooldown, invulnerability, and later class ownership must extend the existing combat state; they must not create class-specific combat runtimes.

## Requirements

1. Refine Dash path, victims, landing, damage, cooldown, and invulnerability using the existing command and enemy-phase boundary.
2. Apply the existing directional and Guard resolver to Mobility hits rather than creating a Mobility-only combat calculator.
3. Keep the first player identity fixed while Mobility behavior stabilizes; class selection is later content, not a prerequisite.
4. Present previews and committed Mobility results from the same calculation so path, victims, damage, and Telegraph interaction cannot disagree.

## Design

Combat resolution remains synchronous inside the Tick. A Mobility hit consumes the existing direction, Guard, HP, status, and semantic-result rules before presentation starts. Existing Stagger disables enemy movement and attack preparation, and a Guard break still cancels the pending Telegraph.

Dash remains a cardinal player command. Its path, victims, landing, cooldown, and invulnerability are data in the same player state used by Move and Normal Attack. No two-confirm Smash flow is required for this milestone.

## Non-Goals

1. Do not reimplement base Normal Attack direction, Guard, Defense, Stagger, or Protection rules from Port 04.
2. Do not add Artifact triggers or permanent class progression.
3. Do not create separate previews, combat calculators, or per-class runtime paths.
4. Do not use animation frames to decide damage, Guard, Stagger, or invulnerability.

## Acceptance Criteria

1. Dash and Smash use the existing directional and Guard results without a second combat calculation.
2. Mobility pathing, victims, landing, cooldown, and invulnerability remain deterministic around occupied cells and committed enemy attacks.
3. Previewed and committed Mobility outcomes agree on path, victims, damage, and resulting combat state.
4. Reset and terminal outcomes clean every Mobility status and presentation effect.

## Implementation Sequence

1. [Implementation Spec](port_06_mobility_combat_refinement.implementation_spec.md): establish shared Mobility combat, cooldown, invulnerability, and preview/commit truth.
2. [Draft Implementation Spec](port_06a_smash_displacement_and_terrain.implementation_spec.md): add Smash's post-hit crush, forced displacement, and water-fall outcomes without changing the shared Mobility hit path.
