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

- [shared_rework] Upgrade the pinned foundation to v0.11.0, then align local debug and ordinary-route composition with its shared Web development-tool route contract.
- [telegraph_rework] Rework telegraph readability: move the turn order bar to top-center (wave display moves below), draw each attacker's telegraph as a faint outline around its whole attack-cell set, replace floor countdown numbers with a countdown over the attacker's head, cue imminent execution on the turn order bar plus a red flash on the enemy and its telegraph outline, and add a setting that numbers each board entity with its turn-order index - [ref plans/telegraph_rework.implementation_spec.md]
- [charge_targeting] Make Charge commit to the farthest legal cell along the player's direction up to its range instead of tracking the player's cell — the committed target never changes, blocked paths replan to a suitable origin, and an illegal landing cell (wall/water) falls back one cell at a time until legal - [spec pending]
- [knockback_feel] Make charge pushes read as impacts: player keeps facing with a jolt, pushes fire as the charger passes each cell, dash scales with distance, and the dead time between charge arrival and knockback is eliminated - [ref plans/charge_knockback_feel.implementation_spec.md]
- [enemy_presentation_audit] Inventory every enemy's per-state sprite and VFX implementation status, add an Action Lab Move preview for every enemy base sheet, and tune the visibly over-fast per-enemy timings - [spec pending]
- [debug_hub] Unify the dev-only Lab and testbed pages (scenario testbed, wall, entity, action) behind one `/debug` hub with a shared route catalog, header shell, and dev-only guard, moving the scenario testbed to `/debug/game` - [ref plans/debug_hub_shell.implementation_spec.md]
- [debug_actions] Add in-game debug actions to the game session — god mode, no-damage mode, instant normal-attack kill, instant mobility kill, no mobility cooldown, and instant kill-all-enemies - [spec pending]
- [port_13_4] Replace placeholder combat feedback with authored windup loops, hit/Guard/Smash/Major-trigger and deny effects, and clean terminal presentation; telegraph danger markers are superseded by the telegraph rework - [ref plans/port_13_04_combat_feedback_and_terminal.sketch.md]
- [port_13_5] Rebuild the reward offer as an authored responsive card surface with semantic normal/milestone/curse-reveal modes and add the Port 13 visual regression gates - [ref plans/port_13_05_reward_surface_and_regression.sketch.md]

---

## Plan

Queued work that has a plan in `dev/docs/plans/`. Execute the port entries from top to bottom and promote only the next eligible line to `## Active`. Retire stale parity work to `## Port Draft` and non-parity work to `## Future Draft`.

- [port_14_hardening] Harden responsive behavior, shell lifecycle, teardown, and browser/Windows packaging for the same path - [ref plans/port_14_platform_and_release_hardening.md]
- [action_points] Replace the Speed free-action model with player-round Action Points, an AP HUD, and overflow-aware Chain Dash - [ref plans/tick_arena_action_points_and_relative_timing.md]

---

## Chore

One line, no rationale, no backing document.

- [model_ownership] Move the wave queue, slot, and admitted-batch shapes into `core/model/types.ts` so the model vocabulary stops importing `core/waves/` and the type cycle disappears
- [boundary_tooling] Raise the `no-circular` rule to error and drop the swc parser once dependency-cruiser supports TypeScript 7 and can classify type-only imports again
- [dead_code] Burn the `npm run check:unused` baseline (mostly deliberate extension surface awaiting its consumer, judged per item — delete a real orphan or give the export its consumer) to zero, then add it to `verify`
- [desktop_deps] Confirm whether the Tauri shell needs `@tauri-apps/api` before removing it as unused
- [determinism_golden] Add reward-selection coverage to the determinism golden by driving the reward arena to a wave clear on the command path (adapt `wave-phase.test.ts`'s `clearWaveOne`, do not script the bot), or accept the existing `wave-phase.test.ts` coverage
- [strict_ts] Enable `exactOptionalPropertyTypes`, `noImplicitOverride`, and app-level `verbatimModuleSyntax` in one dedicated commit, never bundled (it forces rewriting the `restTicks: undefined`-style assignments in the A6 world code), now that CI is live

---

## Bug

One line, no rationale, no backing document.

- [input_feel] Enqueue-triggered fast-forward snaps the player's own move/dash motion track along with enemy VFX, so inputs faster than the ~0.26 s turn window render as a teleport chain instead of a fast advance; scope `finishActive()` to the tails the player is not watching

---

## Port Draft

Preliminary parity work that is not yet owned by the ordered Main Plans. Use one `###` heading per idea. Promote actionable work into the applicable Main Plan as a child rather than creating an independent TODO line.

### Arena Terrain And Decoration Rework

The shipped 13.2 layered arena, including the subsequent walled-contour shore, static wall reflections, and actor-alignment correction, establishes the presentation structure but not the target decoration quality. Promote each approved rework into Port 13 as a new child or compact implementation spec:

- Add the water surface ripple as an animated sprite (existing deferred sub-child 13.2e)
- Remake the objects sitting on the water surface
- Remake the decorative outer frame
- Remake the tree shadows
- Rework the north, west, and east arena borders so they preserve full grid-cell dimensions without reading as a raised enclosure; keep the south wall's platform-depth perspective

### Smash Jump And Ground Shadow Response

Add the Viking Smash body motion after its authored player presentation exists and the landing timing is approved:

- Lift only `actorRoot` during the jump so the shared shadow stays on `groundRoot`
- Animate shadow scale and alpha independently to communicate height and landing weight
- Synchronize the landing compression and ground response with the committed Smash impact without changing gameplay timing

### Smash-Kill Terminal Animation

Add a distinct per-direction Smash-kill terminal animation after Port 13's Dash-kill body-split terminals ship. Decide its visual treatment when promoted rather than assuming it reuses the Dash body split, and drive it from explicit death-cause semantics through the existing terminal lifecycle.

### Data-Driven Animated Entity Presentation

Extend the entity presentation profile catalog only after Port 13's shared authored frame playback has landed and its body/weapon synchronization contract is stable:

- Add animation identifiers, direction mapping, frame durations, loop or finite playback, and cleanup semantics without embedding Pixi or GSAP objects in profile data
- Decide whether animation-level or frame-level body-foot anchors are necessary from the approved sheets rather than predicting the schema in advance
- Keep jump, water, terminal, body, weapon, and shadow channels explicit so one animation transform does not silently move every presentation layer

---

## Future Draft

Godot plans, dormant scaffolds, and post-parity product ideas live here. They are not reference-parity requirements and must not enter an ordered port batch unless the user explicitly promotes them.

### Enemy Commitment And Replanning

Remove the current facing action tax, replace the shipped delayed hit-facing response with immediate hit-facing, add multi-step movement commitments, and replan movement conflicts within one enemy-phase action as a post-parity enemy-system redesign.

### Enemy Mobility And Forced Displacement

Rework Charge into a collision charge, add a DashEnemy backline role, and establish shared forced displacement. Keep Smash knockback and spawn displacement behind the shared contract rather than introducing isolated displacement rules during parity.

### Knockback Collision Damage

When knockback is blocked by another entity, apply collision damage to the blocked entity regardless of faction and apply double damage to the knocked-back entity; define ordering, terminal handling, and preview/commit behavior before implementation.

### Execution Resistance

Replace Execution instant kills with triple Mobility damage against bosses and other resistant enemies after the shipped instant-kill behavior has been ported and verified.

### Boss Redesign

Replace the removed Mode Boss with a fully redesigned boss encounter instead of porting the deprecated reference content. Preliminary concept, to be designed in full before promotion:

- A 2x2-footprint boss fixed in place; it never moves.
- Ranged area attacks, including an attack covering a quarter of the arena.
- Summons additional enemies during the encounter.
- Temporarily mutates terrain with temporary fire cells and temporary rock cells; align with the terrain model in Stable-Base Obstacles And Defensive Structures when both directions land.
- At half HP the boss becomes immune to damage until the player destroys a destroyable lock object that removes the immunity.

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

### Mobility Dash Effect Layer

Add the Chain Dash lightning effect and the Speed-funded free-Dash aura effect as a presentation layer only after the Chain Dash route rework and the Action Points plan settle what those actions are; port 13 visual parity ships without them.

### Chain Dash Route Rework

Keep `chain_dash` as validated but unavailable authored content until its replacement is designed. The approved direction is a player-directed multi-target Dash route that automatically resolves Slash-style Dash hits from A to B to C, never targets the same enemy twice within one route, and defines its route selection, legality, timing, cooldown, interruption, preview, and presentation rules before implementation. The reference cooldown-clear and prepared free-action behavior remains deferred with the Action Points plan.

### Player Baseline Balance Pass

Playtest Ninja and Viking across the authored ten-wave demo after parity and any approved enemy timing redesign. Keep resulting changes in authored balance data rather than hidden runtime compensation.

### Smash Occupied Landing Resolution

Replace the shipped occupied-landing rejection only after the product rule for kill, displacement, resistant targets, and failed displacement is approved. Until then, the port preserves the captured reference result.

### Forced Trade-Off Curses And Nemesis

Explore three-choice run mutators and a persistent pressure enemy after the core reward economy is stable. Do not reintroduce hidden enemy-stat pressure as a substitute for behavior-changing trade-offs.

### Stable-Base Obstacles And Defensive Structures

Explore obstacle cells, Corrupt Land, Fortified Land, Tower, and Archer Tower on top of the stable arena only after obstacle placement, connectivity, spawn weighting, ownership, and deadlock prevention are designed.

Two interior-obstacle cell types are already specified for when this lands (from the port_13 arena discussion): a water-obstacle cell blocks movement, lets attacks pass through, and drowns a knocked-back victim; a rock-obstacle cell blocks movement and attacks and cannot be drowned into. Both require the core terrain model to grow past land/sea, attack resolution to respect attack-blocking terrain, enemy navigation to route around obstacles, and a placement/connectivity/deadlock design. The port_13 14×8 island ships clean without them.

### Spawn Telegraph Forced Displacement

Revisit spawning onto a player-occupied warned cell only after shared forced displacement exists and direction, legal destination, pinned-player, damage, ordering, and warning agreement are fully defined.

### Normal Attack Variants

Explore line, arc, wide, and other Normal Attack footprints only after Ninja and Viking parity. Preview, committed hits, and auto-attack-on-move must share one footprint and obstacle contract.

### Samurai Character Class

Defer Samurai until the fixed-Mobility identity of Ninja and Viking is proven. Samurai requires an independently designed Mobility identity and associated Major eligibility rather than reusing Dash by default.

### Future Reward Economy

Explore card rarity beyond the shipped Minor/Major categories, weighted rolls, deck-building, final card art, and additional class-specific rewards after the shipped reward cadence and Artifact pool are complete.

### Record Replay

Add an end-of-run trajectory replay (Shadow Gambit-style highlight playback, not a full re-simulation player) built from the recorded semantic-event stream or the port_10 command log. Presentation-only feature; defer until after parity.

### Undo Action

Allow undoing the last player action by re-simulating the run's command log from the scenario seed to the previous entry. Cheap only because the deterministic core and command log exist; decide after parity whether the product wants it at all.

### Checkpoint Revive On Death

On death, offer a Restart From Checkpoint option beside the end summary that rebuilds the state at the current wave's start, limited to three revives per run; once exhausted only the end summary remains. Rebuild via the deterministic substrate (replay the command log to the wave boundary or capture a wave-start rebuild point); define how revives interact with the command log, endless waves, and the run summary before implementation.

### Future Distribution Integrations

Consider Steamworks, achievements, cloud saves, analytics, PWA, service worker, offline support, gamepad, and touch only after browser and Tauri parity builds are stable and each integration has an explicit release requirement.

### Special-Result And Artifact SFX

Add the reference's result-override combat cues (execution, mobility-kill, and the Guard Shredder artifact) that swap in for the default hit or death sound on a special outcome. Deferred until the artifacts and special-kill effects are reworked and those outcomes are distinguishable in the semantic event stream. Design is parked in `dev/docs/plans/audio_special_result_sfx.sketch.md`.
