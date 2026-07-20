# TODO

The single forward surface: open this file to see every open item and emerging idea. Each forward item lives in exactly one section here or, once it needs durable structure, in `dev/docs/plans/`. There is deliberately no Done tier: remove shipped lines and record their outcome in `CHANGELOG.md`.

> The actionable tiers (`Plan`, `Chore`, and `Bug`) contain one line per item: no paragraphs, tables, or rationale. An item that needs explanation belongs in `## Port Draft` or `## Future Draft` under one `###` heading. When a Draft item gains sub-structure, becomes actionable, or needs a durable link, promote it to its own file in `dev/docs/plans/`.
>
> In Draft sections, use no `####` headings or bold-label patterns. Use plain text and lists for sub-structure.
>
> Scope tags in actionable lines use short, lowercase `snake_case` identifiers, such as `[player_verbs]` or `[bugfix]`.

Actionable line format: `[scope] one sentence - [ref plans/<name>.md if any]`

`## Active` holds in-flight or implementation-ready work promoted from `## Plan`.

---

## Active

> Do not delete this reminder text.
> Flows currently being implemented or ready to implement. Each entry is a one-line pointer in the same format as `## Plan`.
> Phase detail and progress live in the linked `dev/docs/plans/` file.
> Ship a phase: remove it from that file and append its outcome to `CHANGELOG.md`, leaving this line until every phase ships.
> When every phase ships: archive the plan file and delete this line.

Nothing currently in progress.

---

## Plan

Queued work that has a plan in `dev/docs/plans/`. Execute the port entries from top to bottom and promote only the next eligible line to `## Active`. Retire stale parity work to `## Port Draft` and non-parity work to `## Future Draft`.

- [port_09_rewards] Add deterministic reward selection and run-scoped build effects to the same arena - [ref plans/port_09_artifacts_rewards_and_run_build.md]
- [port_10_run] Connect wave completion, rewards, death, restart, and the milestone branch through the same runtime - [ref plans/port_10_complete_run_lifecycle.md]
- [port_11_shell] Put production HUD, input, settings, and debug controls around the same runtime - [ref plans/port_11_production_ui_input_settings_and_debug_tools.md]
- [port_12_hardening] Harden assets, audio, responsive behavior, teardown, browser delivery, and Windows packaging for the same path - [ref plans/port_12_assets_audio_platform_and_release_hardening.md]
- [port_13_visual_parity] Audit port-ref and match the reference board, entities, feedback, HUD, and presentation quality - [ref plans/port_13_visual_parity_and_polish.md]

---

## Chore

One line, no rationale, no backing document.

---

## Bug

One line, no rationale, no backing document.

---

## Port Draft

Preliminary parity work that is not yet owned by the ordered Main Plans. Use one `###` heading per idea. Promote actionable work into the applicable Main Plan as a child rather than creating an independent TODO line.

No unplanned port drafts. The ordered parity scope is owned by the twelve Main Plans under the Tickstrike Full Port Roadmap.

---

## Future Draft

Godot plans, dormant scaffolds, and post-parity product ideas live here. They are not reference-parity requirements and must not enter an ordered port batch unless the user explicitly promotes them.

### Action Points And Relative Timing

Replace the shipped Speed-funded free-action model with player-round Action Points, overflow-aware Chain Dash, and round-relative timing only after parity is complete and the new behavior is approved for the Web product.

### Enemy Commitment And Replanning

Remove the current facing action tax, replace the shipped delayed hit-facing response with immediate hit-facing, add multi-step movement commitments, and replan movement conflicts within one enemy-phase action as a post-parity enemy-system redesign.

### Enemy Mobility And Forced Displacement

Rework Charge into a collision charge, add a DashEnemy backline role, and establish shared forced displacement. Keep Smash knockback and spawn displacement behind the shared contract rather than introducing isolated displacement rules during parity.

### Knockback Collision Damage

When knockback is blocked by another entity, apply collision damage to the blocked entity regardless of faction and apply double damage to the knocked-back entity; define ordering, terminal handling, and preview/commit behavior before implementation.

### Execution Resistance

Replace Execution instant kills with triple Mobility damage against bosses and other resistant enemies after the shipped instant-kill behavior has been ported and verified.

### Meta Progression

Add save-backed Coin, Ninja-clear Viking unlock, Main Menu character selection, purchasable Artifact-pool unlocks, and any associated settlement flow only after the run parity and persistence boundaries are stable.

### Runtime Structure Reorganization

Reassess source ownership and consolidate arena-owned entities, grid, combat, and presentation while keeping only proven portable infrastructure shared. This is a future architecture evaluation, not a reason to reproduce the Godot folder or scene structure.

### Data-Oriented Gameplay Model

Keep the [deferred partial ECS gameplay-model plan](dev/docs/plans/future_partial_ecs_gameplay_model.md) dormant until approved content needs several shared-interaction entity categories such as specialized enemies, autonomous structures, projectiles, hazards, and grid triggers. Do not assign it to a Port or implement it merely to standardize architecture.

### Dormant Save And Runtime Scaffolds

Evaluate the unowned save-provider framework, scene payload handoff, tutorial event seam, node-pool concept, and unused runtime channels only when a concrete Web feature needs them. Do not port scaffolding solely because it exists in Godot.

### Dormant Content And Presentation Scaffolds

Evaluate curse offer APIs, terrain mutation APIs, music and UI-audio capabilities, and the placeholder SFX synthesis pipeline only when approved content consumes them. The shipped parity run does not currently use these capabilities.

### Future Mobility-Specific Major Effects

Expand Dash and Smash with additional Mobility-specific Major effects after Ninja and Viking parity proves class eligibility and runtime seams. Future effects must remain tied to the active class Mobility rather than restoring generic payload replacement.

### Chain Dash Route Rework

Keep `chain_dash` as validated but unavailable authored content until its replacement is designed. The approved direction is a player-directed multi-target Dash route that automatically resolves Slash-style Dash hits from A to B to C, never targets the same enemy twice within one route, and defines its route selection, legality, timing, cooldown, interruption, preview, and presentation rules before implementation. The reference cooldown-clear and prepared free-action behavior remains deferred with the future Speed action model.

### Player Baseline Balance Pass

Playtest Ninja and Viking across the authored ten-wave demo after parity and any approved enemy timing redesign. Keep resulting changes in authored balance data rather than hidden runtime compensation.

### Smash Occupied Landing Resolution

Replace the shipped occupied-landing rejection only after the product rule for kill, displacement, resistant targets, and failed displacement is approved. Until then, the port preserves the captured reference result.

### Forced Trade-Off Curses And Nemesis

Explore three-choice run mutators and a persistent pressure enemy after the core reward economy is stable. Do not reintroduce hidden enemy-stat pressure as a substitute for behavior-changing trade-offs.

### Stable-Base Obstacles And Defensive Structures

Explore obstacle cells, Corrupt Land, Fortified Land, Tower, and Archer Tower on top of the stable arena only after obstacle placement, connectivity, spawn weighting, ownership, and deadlock prevention are designed.

### Spawn Telegraph Forced Displacement

Revisit spawning onto a player-occupied warned cell only after shared forced displacement exists and direction, legal destination, pinned-player, damage, ordering, and warning agreement are fully defined.

### Normal Attack Variants

Explore line, arc, wide, and other Normal Attack footprints only after Ninja and Viking parity. Preview, committed hits, and auto-attack-on-move must share one footprint and obstacle contract.

### Samurai Character Class

Defer Samurai until the fixed-Mobility identity of Ninja and Viking is proven. Samurai requires an independently designed Mobility identity and associated Major eligibility rather than reusing Dash by default.

### Future Reward Economy

Explore card rarity beyond the shipped Minor/Major categories, weighted rolls, deck-building, final card art, and additional class-specific rewards after the shipped reward cadence and Artifact pool are complete.

### Future Distribution Integrations

Consider Steamworks, achievements, cloud saves, analytics, PWA, service worker, offline support, gamepad, and touch only after browser and Tauri parity builds are stable and each integration has an explicit release requirement.
