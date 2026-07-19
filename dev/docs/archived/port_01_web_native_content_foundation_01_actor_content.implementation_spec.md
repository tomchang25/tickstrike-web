# Actor Content Foundation

Parent Plan: `port_01_web_native_content_foundation.md`

## Goal

Convert the shipped character classes, enemy archetypes, attacks, and Guard profiles into complete, validated Web-native content so later gameplay ports consume one stable parity authority instead of rediscovering Godot resources, scene inheritance, and script defaults.

## Summary

This child lands concrete actor content rather than an extensible content framework. It records the effective shipped values for Ninja, Viking, seven enemy definitions, fifteen attacks, and four Guard profiles, including values currently split across Godot resources, inherited scenes, and script constants.

The result is one framework-independent actor-content contract and one canonical authored catalog that validates stable semantic IDs, references, enums, required fields, numeric domains, attack payloads, and presentation/audio profile identifiers before exposing recursively frozen content. Definitions use semantic references rather than Godot UIDs, resource paths, scene paths, enum ordinals, asset imports, or object identity.

The existing Web arena and Smash content remains behaviorally unchanged but moves from production content ownership into harness fixtures and stops using canonical parity archetype names. This child does not connect the new catalog to `World`, combat execution, React, Pixi, or GSAP; later ports add mutable state and behavior by consuming these accepted definitions.

## Relational Context

- The actor-content contract and validator live in framework-independent core and may import only core modules; authored content imports that contract, while core never imports authored definitions.
- Character definitions own immutable starting HP, Speed fill, normal-attack values, fixed Mobility identity and values, and semantic presentation/audio profile IDs. Current HP, Speed meter, cooldowns, aiming, and armed actions remain future runtime state.
- Enemy definitions own immutable Level 1 stats, tick speed, role tuning, ordered attack ID references, optional Guard ID, and semantic presentation/audio profile IDs. Current HP, Guard, energy, commitment, recovery, status, level, and projected stats remain future runtime state.
- Guard and attack definitions are enemy-owned content because no other current content domain consumes them. Enemies reference them by stable IDs; validation resolves every non-null reference before the catalog is exposed.
- Attack order is authored data. Validation and catalog construction must preserve Mode and Mode Boss attack order because later seeded selection indexes those arrays.
- The canonical actor-content module assembles raw definitions, invokes validation exactly once at module initialization, and exports only accepted recursively frozen content. It is the production-facing entry point for later content and runtime consumers.
- Validation never mutates, sorts, defaults, clamps, normalizes, or drops authored input. Invalid input produces deterministic structured diagnostics and prevents catalog construction.
- Semantic presentation and audio profile IDs point outward to later presentation mappings. Core and authored definitions do not import textures, audio files, Vite URLs, Pixi, or GSAP.
- Godot reference files are development evidence only and never enter the Web module graph, build, or runtime package.
- Synthetic arena and enemy setup move from `src/content/` to `src/harness/fixtures/`. Scenarios and the existing action-resolver test import those fixtures; canonical actor content does not participate in the experimental Smash path.
- The scenario registry continues discovering scenario modules through `import.meta.glob`, and `GameRuntime` continues receiving only a scenario-created `World`; neither contract changes in this child.
- `World`, `WorldSnapshot`, and `EntityState.archetype` remain unchanged. Harness entities use explicit training-only archetype IDs so they cannot be mistaken for canonical Ninja, Viking, or enemy definitions.
- Existing browser acceptance remains a regression check for fixture relocation and unchanged Smash behavior. The parent plan's representative content-inspection scenario belongs to the final integration child after waves and Artifacts exist.
- Unit tests mirror core validation and authored content ownership. Existing Vitest, TypeScript, Vite, and Playwright configuration already discovers and compiles the required files, so configuration and dependencies remain unchanged.

## Scope

### Included

- Complete Ninja and Viking definitions.
- Complete Small, Heavy, Elite, and Boss Guard profiles.
- Complete shipped attack definitions and seven enemy definitions.
- Stable semantic identifiers for identity, role, Mobility, attack kind, cell shape, presentation, and audio profiles.
- Pure deterministic validation, actionable aggregate diagnostics, reference resolution, and recursive immutability.
- Harness-only relocation and renaming of the current synthetic training content.
- Unit coverage for malformed content and every shipped actor definition, plus regression verification for the existing browser scenario.

### Excluded

- Waves, spawn groups, progression curves, Artifacts, rewards, or the final content-inspection scenario.
- Mutable world, combat, Guard, enemy AI, cooldown, status, or run behavior.
- Attack footprint calculation, damage resolution, Guard growth formulas, or enemy level projection.
- Runtime asset packaging, asset URL resolution, animation, VFX, or audio playback.
- Godot importers, resource parsers, compatibility re-exports, content services, stores, managers, or a generic effect language.
- Dormant reference fields with no shipped consumer, including enemy default recovery duration and attack damage interval, charge duration, and charge speed.

## Files to Change

| File                                                                                                | Change Size | Purpose                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/core/content/actor-content.ts`                                                                 | Large       | Own readonly actor-content contracts, validation diagnostics, catalog construction, reference checks, and recursive freezing. |
| `src/content/characters/character-definitions.ts`                                                   | Medium      | Author the two complete shipped character definitions.                                                                        |
| `src/content/enemies/enemy-definitions.ts`                                                          | Large       | Author four Guard profiles, fifteen attacks, and seven enemy definitions with stable references.                              |
| `src/content/actor-content.ts`                                                                      | Small       | Assemble and validate the canonical production actor catalog.                                                                 |
| `src/content/arenas/training-arena.ts` -> `src/harness/fixtures/training-arena.ts`                  | Small       | Move the synthetic arena under harness ownership without changing its layout.                                                 |
| `src/content/enemies/spawn-training-enemies.ts` -> `src/harness/fixtures/spawn-training-enemies.ts` | Small       | Move synthetic enemy setup under harness ownership and use training-only archetype identity.                                  |
| `src/harness/scenarios/empty-arena.scenario.ts`                                                     | Small       | Import the moved fixture and stop labeling its synthetic player as a canonical class.                                         |
| `src/harness/scenarios/smash-water.scenario.ts`                                                     | Small       | Import the moved fixtures and stop labeling its synthetic player as a canonical class.                                        |
| `test/unit/core/actions/action-resolver.test.ts`                                                    | Small       | Import the moved fixtures and preserve the existing experimental Smash assertions with training identity.                     |
| `test/unit/core/content/actor-content.test.ts`                                                      | Large       | Prove malformed content diagnostics, reference validation, ordering preservation, and recursive immutability.                 |
| `test/unit/content/actor-content.test.ts`                                                           | Large       | Prove the exact shipped actor inventory, effective values, assignments, and semantic identifiers.                             |

## Execution Outline

1. Add the core actor-content contracts and tests for malformed IDs, enums, numbers, references, attack payloads, diagnostics, order preservation, and nested immutability.
2. Implement validated catalog construction so accepted input is recursively frozen and invalid input fails as one deterministic aggregate error without normalization.
3. Add complete character definitions from the resolved class resources and shared combat constants, then assert their exact effective values.
4. Add complete Guard, attack, and enemy definitions from resolved resources, scene inheritance, and role constants, then assert inventory, order, guardlessness, references, and every omitted effective value.
5. Assemble the canonical actor catalog through the validating boundary and prove that no Godot artifact or package asset enters its module graph or semantic identifiers.
6. Move the two synthetic training modules into harness fixtures, update all consumers atomically, and replace canonical-looking training archetypes while preserving world setup and scenario behavior.
7. Run the focused actor-content and action-resolver unit tests, `npm run check`, and `npm run test:e2e`; distinguish a missing Chromium installation from an application failure.

## Implementation Notes

### Content Shape

- Use semantic string unions for Mobility (`dash`, `smash`), enemy role (`thrust`, `slash`, `ranged`, `charge`, `bomb`, `mode`), attack kind (`tile`, `charge`, `area`), and cell shape (`line`, `wide`, `square`, `full-line`, `custom-offsets`, `manhattan`). Numeric Godot enum values never cross the boundary.
- Model shape payloads as a discriminated union so irrelevant Godot defaults do not become Web content. A full-line attack has no bounded line length; a custom-offset attack owns ordered integer cells.
- Preserve stable definition IDs and ID references as authored strings. Do not replace references with object identity or retain source paths.
- Use semantic presentation profiles `character.ninja`, `character.viking`, `enemy.thrust`, `enemy.slash`, `enemy.ranged`, `enemy.charge`, `enemy.bomb`, `enemy.mode`, and `enemy.mode-boss`. Use audio profiles `player.combat`, `enemy.guarded`, `enemy.guardless`, and `enemy.mode`; later presentation work resolves those profiles to packaged assets and cues.

### Character Values

| ID       | Name   |  HP | Speed Fill | Normal Damage / Range | Mobility | Damage / Range / Cooldown | Presentation / Audio                 |
| -------- | ------ | --: | ---------: | --------------------- | -------- | ------------------------- | ------------------------------------ |
| `ninja`  | Ninja  | 100 |         20 | 20 / 1 cardinal cell  | `dash`   | 30 / 5 / 4                | `character.ninja` / `player.combat`  |
| `viking` | Viking | 100 |         10 | 20 / 1 cardinal cell  | `smash`  | 30 / 3 / 6                | `character.viking` / `player.combat` |

Normal hits use the shipped Stagger multiplier `1.0`; Mobility hits use `2.0`. These are immutable attack inputs, not mutable class state.

### Guard And Enemy Values

| Guard ID | Base | Lethal Tier Gain | Stagger | Protection | Protection Multiplier |
| -------- | ---: | ---------------: | ------: | ---------: | --------------------: |
| `small`  |   32 |                8 |       3 |          5 |                   0.5 |
| `heavy`  |   64 |               16 |       3 |          5 |                   0.5 |
| `elite`  |   96 |               24 |       3 |          5 |                   0.5 |
| `boss`   |  128 |               32 |       3 |          5 |                   0.5 |

| Enemy ID       | Role     | Speed |  HP | Defense | Guard   | Ordered Attacks                  | Role Tuning                                                       | Presentation / Audio             |
| -------------- | -------- | ----: | --: | ------: | ------- | -------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `thrust_enemy` | `thrust` |    75 | 100 |       0 | `small` | `thrust`                         | None                                                              | `enemy.thrust` / `enemy.guarded` |
| `slash_enemy`  | `slash`  |    75 | 100 |       0 | `small` | `slash`                          | None                                                              | `enemy.slash` / `enemy.guarded`  |
| `ranged_enemy` | `ranged` |    75 | 100 |       0 | `small` | `ranged_cross`                   | Distance band 3-5                                                 | `enemy.ranged` / `enemy.guarded` |
| `charge_enemy` | `charge` |   100 | 150 |       0 | `heavy` | `charge`                         | None                                                              | `enemy.charge` / `enemy.guarded` |
| `bomb_enemy`   | `bomb`   |    75 |  50 |       0 | None    | `bomb_area`                      | Adjacent commitment                                               | `enemy.bomb` / `enemy.guardless` |
| `mode_enemy`   | `mode`   |   100 | 180 |       0 | `elite` | Five `mode_*` attacks below      | Retaliation 10 ticks, warning reduction 1, damage multiplier 1.25 | `enemy.mode` / `enemy.mode`      |
| `mode_boss`    | `mode`   |   100 | 600 |       5 | `boss`  | Five `mode_boss_*` attacks below | Same Mode retaliation; distinct boss identity                     | `enemy.mode-boss` / `enemy.mode` |

Mode Boss is not a separate AI role. Bomb's missing Guard is intentional. Guard lethal-tier cadence and projection belong to the wave/progression child; this child stores only profile inputs.

### Attack Values

Every attack has finite positive damage, integer warning and recovery ticks, and the shown shape payload. Omitted Godot values below are recorded explicitly.

| Attack ID               | Kind / Shape          | Damage | Warning | Recovery | Payload                               |
| ----------------------- | --------------------- | -----: | ------: | -------: | ------------------------------------- |
| `thrust`                | tile / custom offsets |     10 |       1 |        1 | `(1,0), (2,0), (3,0)`                 |
| `slash`                 | tile / custom offsets |     10 |       2 |        1 | `(1,-1), (1,0), (1,1)`                |
| `ranged_cross`          | tile / custom offsets |     10 |       2 |        1 | `(0,0), (1,0), (-1,0), (0,1), (0,-1)` |
| `charge`                | charge / line         |      8 |       2 |        2 | Length 5                              |
| `bomb_area`             | area / manhattan      |     50 |       3 |        1 | Radius 4                              |
| `mode_tile_wide`        | tile / wide           |     12 |       2 |        1 | Width 3, depth 2                      |
| `mode_tile_square`      | tile / square         |     12 |       2 |        1 | Radius 1                              |
| `mode_tile_line`        | tile / line           |     12 |       2 |        1 | Length 4                              |
| `mode_charge`           | charge / full-line    |     10 |       3 |        2 | Unbounded line                        |
| `mode_area`             | area / square         |     14 |       2 |        1 | Radius 1                              |
| `mode_boss_tile_wide`   | tile / wide           |     20 |       2 |        1 | Width 3, depth 2                      |
| `mode_boss_tile_square` | tile / square         |     20 |       2 |        1 | Radius 1                              |
| `mode_boss_tile_line`   | tile / line           |     20 |       2 |        1 | Length 4                              |
| `mode_boss_charge`      | charge / full-line    |     10 |       3 |        2 | Unbounded line                        |
| `mode_boss_area`        | area / square         |     22 |       2 |        1 | Radius 1                              |

The two Mode charge attacks deal 10 because they inherit the attack-resource default; do not normalize them to their role's surrounding damage. Recovery values remain authored ticks and do not include the later runtime `+1` recovery-counter rule. Ranged's `(0,0)` offset is valid because its cross is centered on the locked target cell.

### Validation And Diagnostics

- A diagnostic contains a stable code, content path, and actionable message. Catalog construction throws one aggregate actor-content error containing diagnostics in deterministic input order.
- Validate non-empty format-safe and domain-unique IDs; trimmed display names and semantic profile IDs; runtime enum membership; finite numbers; integer tick, dimension, radius, range, and coordinate values; positive HP, speed, damage, ranges, dimensions, and base Guard; non-negative defense, cooldown, recovery, Guard growth, and protection ticks; and protection multiplier within `[0,1]`.
- Validate every enemy attack and non-null Guard reference, non-empty attack lists, no repeated attack reference within one enemy, and the supported shipped kind/shape combinations.
- Line length, wide width/depth, square and Manhattan radius, and custom offsets must satisfy their shape. Custom offsets must be non-empty and unique; `(0,0)` remains legal.
- Canonical inventory assertions require exactly 2 characters, 4 Guards, 15 attacks, and 7 enemies, including Bomb as the only guardless shipped enemy and exact Mode attack order.
- Recursive freezing covers the catalog, definitions, nested role tuning, attack lists, payloads, offsets, and semantic profile objects. TypeScript `readonly` alone is insufficient.

### Training And Verification

- Rename synthetic scenario archetypes to `training-player` and `training-grunt`; do not initialize them from canonical definitions or alter the existing Smash rules.
- Focused verification: `npx vitest run test/unit/core/content/actor-content.test.ts test/unit/content/actor-content.test.ts test/unit/core/actions/action-resolver.test.ts`.
- Canonical non-browser verification: `npm run check`.
- Browser regression: `npm run test:e2e`.

## Edge Cases

| Case                                                     | Expected Handling                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| Duplicate definition ID                                  | Reject with the domain, duplicate ID, and deterministic content path. |
| Unknown Guard or attack reference                        | Reject catalog construction; never expose a dangling reference.       |
| Bomb has no Guard                                        | Accept; canonical assertions prove Bomb alone is guardless.           |
| `NaN`, infinity, or fractional tick/cell value           | Reject explicitly.                                                    |
| Empty or duplicate custom offset                         | Reject; preserve valid offset order.                                  |
| Custom offset `(0,0)`                                    | Accept for target-centered footprints such as Ranged.                 |
| Invalid enum introduced through a cast or external value | Reject at runtime despite TypeScript typing.                          |
| Mutation through a cast after import                     | Recursively frozen nested content remains unchanged.                  |
| Validation sorts definitions or attack references        | Forbidden; input and Mode attack order remain intact.                 |
| Old training module path retained as a re-export         | Forbidden; harness-only ownership must be explicit.                   |
| Current experimental Smash sees canonical Viking content | Forbidden; training behavior remains isolated.                        |

## Acceptance Criteria

1. The complete shipped inventory of two characters, four Guard profiles, fifteen attacks, and seven enemies loads through one validated immutable Web catalog.
2. Every effective value, including inherited defaults, script-backed tuning, Mode attack order, Mode charge damage, and Bomb guardlessness, matches the recorded Godot reference.
3. Invalid identifiers, enums, values, payloads, duplicates, and references prevent catalog construction with deterministic actionable diagnostics.
4. Accepted content cannot be mutated, including nested role tuning, attack references, payloads, and cell offsets.
5. Production actor content contains only stable semantic identifiers and has no dependency on Godot UIDs, resource or scene paths, imported assets, or engine metadata.
6. Existing training scenarios and experimental Smash behavior remain available and browser-visible only through harness-owned fixtures with non-canonical archetype identities.
7. No mutable combat, enemy, Guard, wave, reward, or run behavior is introduced by this child.
