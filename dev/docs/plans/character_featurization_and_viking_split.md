# Character Featurization and the Ninja / Viking Split

> **Status**: Plan (design decisions recorded; child implementation specs to follow)
> **Prerequisites**: A6 Step 3 (RunBuildState extraction) before the artifact work; coordinate visuals with [port_13](port_13_visual_parity_and_polish.md). Run-start selection flow coordinates with the shipped run lifecycle (port_10) and its UI shell (port_11).
> **Related**: [gameplay_architecture_refactor.mega_plan.md](gameplay_architecture_refactor.mega_plan.md) — this plan applies the same feature/behavior/presenter pattern to the character axis

## Goal

Make the playable character a content axis like enemies already are: each character described in one feature module, mobility logic behind a registry, character-scoped presentation behind a presenter seam, and artifact pools that respect the active character. Ship Viking (smash) as the second playable character to prove the axis, mirroring the original game.

## Why this is not premature

The character axis already has two variants with real divergence — this plan removes hardcoded single-character assumptions that are already lying:

- `character-definitions.ts` ships both Ninja (dash) and Viking (smash); smash mechanics (`smash_armed`/`smash_impact`, crush/knockback/water displacement) are fully implemented in core.
- Reward generation already constrains offers by the active character's mobility (`requiredMobility`, port_09).
- But `artifact-schema.ts` hardcodes a Ninja-era rule: **major artifacts must have `requiredMobility === "dash"`** — Viking can never receive a major artifact today.
- `PixiGameRenderer` hardcodes `setNinjaSpriteSheet`; there is no Viking presentation profile or asset path.
- Eight harness fixtures hardcode `"ninja"`.

## Requirements

1. One feature module per character (definition, presentation profile, sprite/animation assets, character-scoped artifact content) plus one registry entry, mirroring `src/content/enemies/features/`.
2. Mobility remains the behavior key (`dash` | `smash`): mobility-specific command handling, preview, and cooldown rules resolve through a registry, not `if (kind === ...)` chains in shared code.
3. Artifact pools support both shared artifacts and mobility-gated uniques for **both** mobilities; the schema rule restricting majors to dash is replaced by per-mobility validation (every mobility shipped by a character must have a non-empty major pool).
4. Character-scoped presentation (player sprite, smash arm/impact visuals, death) moves behind a character presenter seam so the presentation coordinator holds no character-specific cases.
5. Scenario/harness fixtures take the character as a parameter with Ninja as default; nothing outside content modules names a specific character id.
6. A deterministic scenario exists for a full Viking command loop (smash arm → impact → displacement outcomes) at parity with existing Ninja coverage.

## Design

### Content: `src/content/characters/features/`

Mirror the enemy pattern: `defineCharacterFeature` writes each shared identifier once and derives the cross-references.

```text
features/
├── character-feature.ts   defineCharacterFeature + types
├── ninja.ts               definition, presentation profile, sprite assets, unique artifacts
├── viking.ts              same, smash-keyed
└── index.ts               roster + derived registries (definitions, profiles,
                           sprite sheet URLs, per-mobility artifact pools)
```

The renderer loads player sheets from the derived registry (kills `setNinjaSpriteSheet`), exactly as enemy sheets were generalized in A5.

### Core: mobility behavior registry

`dash` and `smash` command resolution, preview, and cooldown rules register per mobility kind (analogue of `enemy-behaviors`). `player-actions.ts` keeps command orchestration; mobility-specific branches move into the registered modules. Existing pure functions (targeting, displacement math) stay pure and move with their owner.

### Artifacts: mobility-keyed uniques

**Decision — key uniques by mobility kind, not character id**, matching the original design and the shipped `requiredMobility` field. Characters differing only in stats + mobility need no second key; introduce a `requiredCharacter` field only when a character diverges beyond its mobility (record that in this plan if it happens). Work items: lift the majors-are-dash schema rule, author Viking (smash) major artifacts from the original content, and validate per-mobility pool completeness in content-schema.

### Presentation: character presenter

`smash_armed`, `smash_impact`, and player damage/death visuals move from the coordinator's central cases into a character presenter registry keyed by the character presentation profile (analogue of `enemy-presenters`, including a generic fallback). The coordinator keeps only board motion, terminal views, and true globals.

### Selection flow

Which character a run uses is decided at run start; the choice is owned by the run lifecycle (port_10) and its UI (port_11). This plan only requires that `World`/scenario spawning accepts a character id and that nothing downstream assumes Ninja. The selection UI itself is out of scope here.

## Child implementation specs (expected)

- **A — Character features + fixture parameterization**: content registry, renderer generalization, harness/fixture character parameter.
- **B — Mobility registry + character presenter**: core and presentation seams.
- **C — Viking artifacts + schema lift + validation simplification**: after A6 Step 3 (done). Lifts the majors-are-dash rule, authors Viking (smash) major artifacts, and — because it already rewrites the same schema files — moves content validation to test time (deferred from the engineering hardening work and owned here): keep the semantic checks (cross-references, uniqueness, kind/shape compatibility, per-mobility pool completeness) as a vitest catalog sweep; delete the runtime shape-validation plumbing (TS already guarantees shape for compiled-in content, and the diagnostics have no UI consumer).
- **D — Viking visual slice**: assets and animation parity, coordinated with port_13.

## Non-goals

- No third character or speculative character metadata.
- No changes to smash/dash combat rules or displacement outcomes.
- No character select UI (port_10/11 owns it).
- No per-character enemy or wave variation.

## Acceptance criteria

1. Adding a character touches only `src/content/characters/features/` plus registry entries (content-only characters: 2–3 files), consistent with the file-budget rule in `dev/standards/gameplay_feature_architecture.md` extended to characters.
2. A Viking run is playable end-to-end in the harness: spawn as Viking, smash loop verified by a deterministic scenario, mobility-gated rewards offer smash uniques and never dash uniques.
3. Schema validation fails content where any shipped mobility lacks major artifacts, and no longer requires majors to be dash.
4. No file outside `src/content/characters/` (and tests/scenarios that explicitly target a character) contains the string `"ninja"` or `"viking"`.
5. PresentationDirector contains no character-specific event cases.
