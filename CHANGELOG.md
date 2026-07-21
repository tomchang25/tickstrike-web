# Changelog

Append-only record of shipped Tickstrike Web outcomes.

Rules:

- Record shipped work only; do not keep forward-looking items or Done lists here.
- Each entry uses `- YYYY-MM-DD - [scope] one-line summary`.
- `##` headings are version headings only. Entries live under `###` section headings; only version notes may sit directly under a `##` heading.
- `###` headings group related entries. Use plain section names, not Phase or Stage labels.
- Keep entries concise and outcome-focused per `dev/foundation/core/standards/change_summary_standard.md`.
- When a phase ships, append its outcome here and remove the shipped work from its TODO or plan source.
- Do not add entries for development-process-only maintenance, including TODO or CHANGELOG edits, plan archival, or tracking cleanup.

---

## [unreleased]

### Web-Native Content Foundation

- 2026-07-18 - [content] Shipped gameplay content is now validated through immutable actor, wave, Artifact, and browser inspection catalogs

### Deterministic Tick Arena Foundation

- 2026-07-18 - [port_02] The Web port now has a deterministic twelve-by-twelve Tick Arena with reset-safe occupancy, reservations, Telegraph ownership, seeded streams, and runtime generation boundaries

### Player Verbs and One-Action Tick

- 2026-07-18 - [port_03] The shared Tick Arena now resolves Move, Normal Attack, Dash, pointer Mobility, accepted/rejected commands, and one-tick advancement through one command path

### Basic Enemy Tick Combat and Directional Guard

- 2026-07-18 - [port_04] Thrust and Slash now move, commit locked Telegraph attacks, resolve damage, directional Guard, Stagger, Protection, presentation feedback, and deterministic combat events

### Smash Mobility Scenario

- 2026-07-18 - [migration] A Web-native Smash scenario now resolves center crush, knockback, and water drowning through deterministic core events with completed Pixi/GSAP presentation and browser acceptance coverage

### First Playable Tick Arena

- 2026-07-18 - [port_05] The deterministic Tick Arena now reaches victory or defeat, presents terminal feedback, and restarts without stale combat or presentation state

### Mobility Combat Refinement in the Same Arena

- 2026-07-19 - [port_06] The Tick Arena now resolves deterministic Dash and Smash mobility through shared directional Guard combat, cooldown, invulnerability, and terminal cleanup rules

### Mobility Combat Refinement

- 2026-07-19 - [port_06] Dash and Smash now share preview and committed directional hit results without a second mobility combat path

### Smash Displacement and Terrain

- 2026-07-19 - [port_06a] Smash now deterministically crushes, knocks back, or sends eligible victims into water while preserving synchronous occupancy cleanup

### Preview Victim Indicators

- 2026-07-19 - [port_06b] Action previews now expose lethal victims, Smash terminal outcomes, and predicted displacement destinations before commit

### Ninja Visual Slice

- 2026-07-19 - [port_06c] The fixed Ninja player now uses the authored spritesheet with readable facing, movement, Dash, attack-facing, input-repeat, and presentation cleanup behavior

### Terminal Animation Lifecycle And Profile Reconciliation

- 2026-07-20 - [sprite_animation] Terminal water animations now hold their final authored frame and remove their Pixi view exactly once instead of respawning an idle sprite, and reused entity IDs reconcile to a changed `presentationId` instead of retaining a stale profile

### Additional Enemy Roles on the Shared Activity Model

- 2026-07-20 - [port_07] Ranged, Charge, and Bomb enemies now join Thrust and Slash in the same Tick Arena through one shared deterministic navigation, reservation, and locked-attack contract, with distance-band pressure, live-target impact displacement, and locked-area self-destruction respectively
- 2026-07-20 - [port_07] Small enemies now use authored Kappa sprite presentation with palette parity and state-driven animation feedback
- 2026-07-20 - [port_07] Deprecated Mode and Mode Boss enemy content is removed from the catalog

### Waves and Spawning in the Same Tick Arena

- 2026-07-20 - [port_08] Authored waves now schedule deterministic atomic spawn warnings and levelled enemies through the Tick Arena, with visible countdowns, terminal cleanup, and browser acceptance coverage

### Rewards and Run Build

- 2026-07-20 - [port_09] Clearing a wave now pauses the same arena on a reward offer that modifies the existing player and combat state through one resettable run build, covering normal and Mobility attack damage, cooldown, range, max health, and the Dash Guard Shredder and Execution triggers, with reset restoring the initial state
- 2026-07-21 - [port_09] Reward offers now present up to three distinct cards, every third wave is a Major milestone with a two-stack Minor slot, and a live read-only build HUD shows the acquired artifacts and stack counts beside the arena

### Engineering Hardening

- 2026-07-21 - [hardening] Layering, World-subsystem, and registry boundaries are now machine-enforced by dependency-cruiser inside `npm run check`, every pull request runs format, lint, boundaries, unit, build, and Chromium acceptance through GitHub Actions, and three committed golden scenarios fail CI on any determinism regression with a reviewable diff
- 2026-07-21 - [hardening] `PixiGameRenderer` no longer owns pointer input, preview painting, or board painting, and the enemy, player, and wave resolution phases now receive narrow capability contexts instead of the whole `World`, freezing the facade as the default growth surface

### Complete Run Lifecycle

- 2026-07-21 - [port_10] The home page now plays a full authored run through the same deterministic runtime: clearing the final authored wave opens an End Run / Continue Endless milestone choice that either finalizes victory with restart or continues into the endless template, with the reward pause and restart cleanup preserved
- 2026-07-21 - [port_10] The runtime now records every accepted command, reward, and milestone decision into a replayable per-run command log, so a seed and its log reproduce a run's final state through the same public entrances

### Production Shell

- 2026-07-21 - [port_11] An armed Smash windup can now be cancelled without spending a Tick: the player returns to idle, no enemy or presentation work runs, and the cancel is recorded in the command log so a seed and its log still replay faithfully
