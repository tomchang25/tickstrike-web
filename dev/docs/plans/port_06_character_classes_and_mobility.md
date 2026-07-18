# Character Classes and Mobility

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../port-ref/tickstrike)

## Goal

Deliver Batch 6 of the Tickstrike Full Port Roadmap by matching Ninja Dash and Viking Smash as fixed class Mobility identities. This replaces the experimental Web Smash behavior with the command, timing, targeting, damage, and cooldown behavior shipped by the Godot reference.

## Requirements

1. Initialize Ninja and Viking from their shipped class values, including health, Speed fill, Normal Attack, Mobility damage, range, and cooldown.
2. Implement Ninja Dash as cardinal traversal through enemies to the farthest legal empty landing within the selected distance and effective range.
3. Apply Dash hits to each crossed victim with directional combat results and Mobility invulnerability for the associated world advance.
4. Implement Viking Smash as a two-confirm action: windup locks a legal landing and consumes one action, then release applies the locked three-by-three impact and movement result.
5. Preserve Smash cancellation, armed-state retention, occupied-landing rejection, optional confirmation behavior, preview, and cleanup exactly as captured by the reference.
6. Present class identity, player sprites, Dash path and landing, Smash landing and impact, cooldown, and rejection feedback from deterministic state and events.

## Design

Dash uses four-direction aiming. Cursor distance selects the desired travel distance, clamped to effective range. Sea stops traversal. Enemies may be crossed and hit, but the final landing must be the farthest legal empty land cell available along the valid path.

Smash windup and release are separate consumed commands. Windup locks the landing; release does not retarget if aim changes. The shipped base Smash deals combat damage in a three-by-three area and moves the player to the landing. The existing Web knockback, crushing, and drowning demonstration is not parity behavior and must not remain in the production Smash path unless separately approved later.

Both Mobilities use the shared directional combat projection and the class's active Mobility cooldown.

## Non-Goals

1. Do not add Smash knockback, drowning, forced displacement, or an occupied-landing redesign.
2. Do not implement future classes or interchangeable Mobility payloads.
3. Do not implement Artifact Major effects in this batch.
4. Do not implement permanent class selection or Viking unlock progression.

## Acceptance Criteria

1. Ninja and Viking begin deterministic scenarios with the exact shipped class values and Mobility identity.
2. Dash victims, hit directions, damage, path blocking, and final landing match the reference for legal and rejected cases.
3. Smash windup, locked target, release footprint, player landing, cooldown, cancellation, and occupied-landing behavior match the reference.
4. Mobility world advancement and invulnerability interact correctly with committed enemy attacks.
5. Unit coverage proves plans, previews, command costs, cooldowns, victims, landings, cancellation, and event order.
6. Pixi/GSAP and Playwright acceptance prove both Mobility flows and leave no armed indicator, ghost, impact effect, or pending timeline after completion, cancellation, death, or reset.
