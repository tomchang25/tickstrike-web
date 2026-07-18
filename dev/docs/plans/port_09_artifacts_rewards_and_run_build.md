# Artifacts, Rewards, and Run Build

Roadmap: [Tickstrike Full Port Roadmap](tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Deliver Batch 9 of the Tickstrike Full Port Roadmap by porting the shipped Artifact pool, three-choice rewards, cadence, eligibility, and run-scoped build projection. This allows authored waves to modify player capability without dispersing mutable reward state across combat systems.

## Requirements

1. Own acquired Artifacts, stacks, legendary count, effect channels, and Mobility triggers in one resettable run-scoped build state.
2. Implement the six shipped Minor Artifacts and their exact damage, Speed, cooldown, range, and maximum-health contributions.
3. Implement Guard Shredder, Execution, and Chain Dash with their shipped Dash-only eligibility and trigger behavior.
4. Generate three distinct eligible offers using the shipped ordinary and every-third-wave reward cadence, including doubled Minor offers where authored.
5. Enforce the shipped legendary cap, uniqueness, required Mobility, and exclusivity behavior while preserving the reference behavior that stackable Artifacts may exceed their declared stack caps.
6. Present reward cards, acquisition, Artifact ownership, stacks, build inspection, and immediate stat effects without making UI the state owner.

## Design

The shipped Minor set is Sharpened Edge, Fleet Step, Impact Dash, Light Footwork, Extended Mobility, and Vital Spark. Impact Dash modifies shared Mobility damage despite its name, so it also affects Viking Smash. Vital Spark raises maximum health and heals the exact gained amount immediately.

The Major set is Dash-only:

- Guard Shredder bypasses Protection reduction only for qualifying Back Dash hits.
- Execution kills an already Staggered target.
- Chain Dash qualifies on kill, Guard break, already-Staggered target, or Back hit; it clears Dash cooldown and prepares one Speed-funded follow-up.

The reference declares stack limits but does not enforce them for stackable Artifacts. The parity runtime therefore permits stacks beyond the declaration; enforcing those limits is a later product correction rather than part of this port.

Wave 10 grants an ordinary Minor offer after Continue Endless. Major cadence remains tied to every third wave.

## Non-Goals

1. Do not add Coin, permanent unlocks, shops, card rarity, weighted decks, curses, or meta progression.
2. Do not add future Mobility-specific Major effects.
3. Do not redesign names, descriptions, balance, Minor/Major categories, cadence, or stack behavior without an explicit product decision.
4. Do not persist the active run.

## Acceptance Criteria

1. Every shipped Artifact has deterministic acquisition and effect scenarios matching the reference.
2. Offers are distinct, eligible for the active class and Mobility, and follow the ordinary and third-wave cadence.
3. Legendary cap, uniqueness, exclusions, unbounded stackable acquisition, and independent reward RNG match captured reference behavior.
4. Build projections update all consumers consistently, including immediate Vital Spark healing and all three Major triggers.
5. Unit coverage proves registry validity, offer generation, Wave 10 ordinary rewards, acquisition beyond declared stack caps, reset, channels, and trigger results.
6. React, Pixi/GSAP, and Playwright acceptance prove reward selection, build inspection, combat-visible effects, and complete dismissal/animation cleanup.
