# Basic Combat Expansion in the Same Arena

Roadmap: [Tickstrike Web Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Add the next combat rules only after the basic Tick Arena is playable. Directional results, Guard/Stagger, and a more complete Dash must extend the existing player and enemy state; they must not create class-specific combat runtimes.

## Requirements

1. Add Front, Side, and Back hit results to the existing attack resolver.
2. Add Guard, Guard break, Stagger, Protection, and Defense as explicit state and deterministic outcomes.
3. Refine the existing Dash path and damage using the same command and enemy phase boundary.
4. Keep the first player identity fixed while combat rules stabilize; class selection is later content, not a prerequisite.
5. Present previews and committed results from the same calculation so Telegraph and damage cannot disagree.

## Design

Combat resolution remains synchronous inside the Tick. A hit calculates direction, Guard damage, HP damage, status transition, and semantic events before presentation starts. Stagger disables enemy movement and attack preparation for its duration. A Guard break cancels that enemy's pending Telegraph so no later orphan attack can resolve.

Dash remains a cardinal player command. Its path, victims, landing, cooldown, and invulnerability are data in the same player state used by Move and Normal Attack. No two-confirm Smash flow is required for this milestone.

## Non-Goals

1. Do not add Viking, Smash, Artifact triggers, or permanent class progression.
2. Do not rebalance the first playable scenario while adding the shared combat rules.
3. Do not create separate previews, combat calculators, or per-class runtime paths.
4. Do not use animation frames to decide damage, Guard, Stagger, or invulnerability.

## Acceptance Criteria

1. The existing three-enemy scenario visibly distinguishes directional damage, Guard break, Stagger, and Protection.
2. A committed Telegraph and its resolved hit use the same locked target cells and combat result.
3. Dash remains deterministic around occupied cells and committed enemy attacks.
4. Reset and terminal outcomes clean every new combat status and presentation effect.
