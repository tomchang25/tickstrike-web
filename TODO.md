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

- [input_feel] Fast-forward the previous turn's pending VFX when new input is enqueued and pace held-move at a fixed cadence so input stops waiting on animation tails - [ref plans/input_feel_vfx_fast_forward.implementation_spec.md]

---

## Plan

Queued work that has a plan in `dev/docs/plans/`. Execute the port entries from top to bottom and promote only the next eligible line to `## Active`. Retire stale parity work to `## Port Draft` and non-parity work to `## Future Draft`.

- [port_13_visual_parity] Audit port-ref and match the reference board, entities, feedback, HUD, and presentation quality - [ref plans/port_13_visual_parity_and_polish.md]
- [port_14_hardening] Harden responsive behavior, shell lifecycle, teardown, and browser/Windows packaging for the same path - [ref plans/port_14_platform_and_release_hardening.md]

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

- [e2e_regression] Fix 7 failing Playwright e2e specs on `port` (bomb-enemy, charge-enemy, harness-lifecycle, mobility-combat, pointer-input, rewards, settings) where the debug harness never exposes `window.__TICKSTRIKE__`/active-mobility and held-move facing settles wrong

---

## Port Draft

Preliminary parity work that is not yet owned by the ordered Main Plans. Use one `###` heading per idea. Promote actionable work into the applicable Main Plan as a child rather than creating an independent TODO line.

### Arena Terrain And Decoration Rework

The shipped 13.2 terrain and decoration (through the 13.2d decorative frame) is a placeholder: it establishes the layered-arena structure but not the target art quality. Rework items, to be promoted into the port_13_2 plan (plans/port_13_2_layered_arena.md) once the approach is settled:

- Replace the shore transition with a better autotile or waterbank approach and matching assets (approach under discussion)
- Add the water surface ripple as an animated sprite (existing deferred sub-child 13.2e)
- Remake the objects sitting on the water surface
- Remake the decorative outer frame
- Remake the tree shadows
- Add water reflections, which are currently missing entirely

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

### Mobility Dash Effect Layer

Add the Chain Dash lightning effect and the Speed-funded free-Dash aura effect as a presentation layer only after the Chain Dash route rework and the future Speed action model settle what those actions are; port 13 visual parity ships without them.

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
