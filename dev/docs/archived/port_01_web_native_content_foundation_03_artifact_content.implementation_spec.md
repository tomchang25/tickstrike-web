# Artifact Content Foundation

Parent Plan: `port_01_web_native_content_foundation.md`

## Goal

Convert the nine shipped Artifacts and their effect declarations into validated immutable Web-native content so later reward and combat systems consume one stable parity pool without Godot resources, implicit defaults, or display-text inference.

## Summary

This child adds exactly six Minor and three Major Artifact definitions in the Godot registry order. It records explicit category, stack declaration, eligibility inputs, semantic effect declaration, presentation profile, and every omitted resource value while preserving distinctions between authored metadata and later runtime behavior.

The result is one frozen, validated Artifact catalog. It validates IDs, categories, effects, Mobility references, stack declarations, eligibility inputs, numeric domains, and authored order. It does not offer, acquire, apply, cap, or execute Artifacts; Port 9 owns reward selection and mutable Run Build behavior.

## Relational Context

- This child implements after Child 01. Artifact contracts reuse Child 01's semantic Mobility IDs; Artifact content does not import character definitions, actor runtime state, or combat rules.
- Core Artifact contracts and validation are framework-independent and may import only core content types. Authored Artifact definitions import core contracts; core never imports authored content.
- The canonical Artifact-content entry point assembles the nine definitions, validates them once, and exports only recursively frozen accepted content.
- An Artifact owns immutable identity, name, description template, category, declared maximum stacks, exclusivity group, curse flag, minimum wave, magnitude, optional Mobility requirement, semantic effects, and presentation profile. Owned stacks, offers, selected cards, reward RNG, and Run Build totals are runtime state.
- Category is explicit Web content: Godot's effective Common maps to `minor`, Legendary maps to `major`, and no shipped Artifact is a curse. Do not retain Godot rarity ordinals or defer this mapping to reward runtime.
- A channel effect owns a stable channel ID and positive amount per stack. A trigger effect owns a stable trigger ID. The later Run Build interprets channel direction and trigger behavior; content must not implement effects.
- The declared `maxStacks` is immutable metadata. Child 03 must not turn it into an acquisition cap: Godot enforces only unique artifacts (`maxStacks <= 1`) and current repeatable declarations are not hard-capped. Port 9 decides runtime acquisition behavior from the captured reference.
- Required Mobility is an offer-eligibility input, not a generic effect constraint. Only Guard Shredder, Execution, and Chain Dash require `dash`; Impact Dash remains unrestricted despite its name and description.
- Artifact registry order is authored and must be preserved. Validation and catalog construction never sort or shuffle it; future reward generation owns candidate shuffling.
- Semantic Artifact presentation IDs point to future asset resolution. No definition imports the Godot placeholder icon, texture, Vite URL, UI, or audio asset.
- Validation follows Child 01's deterministic aggregate diagnostics and recursive freezing contract. It must not manufacture defaults, infer restrictions from text, or retain resource paths/UIDs.
- Unit tests prove immutable content only. Child 04 later aggregates Artifacts with actor and wave content for browser inspection; Port 9 later owns offers, card multiplicity, acquisition, and effects.

## Scope

### Included

- Nine complete Artifact definitions in shipped registry order.
- Minor/Major category mapping and zero-Curse shipped inventory.
- Channel and trigger effect declarations.
- Declared stack, uniqueness, exclusivity, minimum-wave, magnitude, and Mobility requirement content.
- Semantic Artifact presentation profiles.
- Deterministic validation, diagnostics, immutability, and unit coverage.

### Excluded

- Reward cadence, offer filtering, random selection, card layout, choice UI, ownership, acquisition, stack enforcement, and Run Build state.
- Applying channels, activating triggers, damage/Guard/Speed/HP projection, or Dash-only trigger execution.
- New effects, curse content, other rarity tiers, class-specific Major effects, assets, audio, or browser inspection.
- Actor, wave, world, combat, or run behavior.

## Files to Change

| File                                              | Change Size | Purpose                                                                                             |
| ------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `src/core/content/artifact-content.ts`            | Large       | Own readonly Artifact/effect contracts, validation diagnostics, and recursive freezing.             |
| `src/content/artifacts/artifact-definitions.ts`   | Large       | Author all nine shipped Artifacts and their semantic effect declarations in registry order.         |
| `src/content/artifact-content.ts`                 | Medium      | Assemble and validate the canonical Artifact catalog.                                               |
| `test/unit/core/content/artifact-content.test.ts` | Large       | Prove malformed Artifact diagnostics, Mobility references, effect domains, order, and immutability. |
| `test/unit/content/artifact-content.test.ts`      | Large       | Prove every shipped Artifact's effective values, category, effects, restrictions, and order.        |

## Execution Outline

1. Add framework-independent Artifact/effect contracts and focused malformed-content tests.
2. Implement deterministic validation and freezing for definitions, effects, categories, Mobility IDs, and nested values.
3. Author the six Minor channel Artifacts and three Major trigger Artifacts in their shipped registry order, explicitly recording omitted defaults.
4. Assemble the canonical Artifact catalog and add exact inventory assertions, including unrestricted Impact Dash and declared-but-not-enforced stack metadata.
5. Run focused Artifact tests and `npm run check`; Child 04 later verifies representative browser-visible resolved content.

## Implementation Notes

### Shared Rules

- Use `minor` and `major` category IDs, channel effect kind `channel`, and trigger effect kind `trigger`. Do not retain Godot rarity values or effect script classes.
- All shipped Artifacts have empty exclusivity group, `isCurse=false`, a semantic presentation profile `artifact.<id>`, and no package asset reference.
- Validate non-empty format-safe unique IDs, trimmed display names/descriptions, known categories/effect kinds/channels/triggers/Mobility IDs, finite values, positive integer `maxStacks`, positive integer `minWave`, positive finite magnitude, and non-empty effect lists.
- Minor definitions use exactly one channel effect. Major definitions use exactly one trigger effect. Do not support speculative effect forms.

### Shipped Registry

| Order | ID                       | Category | Stacks | Min Wave | Mobility | Effect                                      |
| ----: | ------------------------ | -------- | -----: | -------: | -------- | ------------------------------------------- |
|     1 | `attack_up`              | minor    |      3 |        1 | none     | channel `normal-attack-damage`, amount 10   |
|     2 | `speed_up`               | minor    |      5 |        1 | none     | channel `speed`, amount 1                   |
|     3 | `dash_attack_up`         | minor    |      3 |        1 | none     | channel `mobility-attack-damage`, amount 20 |
|     4 | `mobility_cooldown_down` | minor    |      3 |        1 | none     | channel `mobility-cooldown`, amount 1       |
|     5 | `mobility_range_up`      | minor    |      3 |        1 | none     | channel `mobility-range`, amount 1          |
|     6 | `max_health_up`          | minor    |      2 |        1 | none     | channel `max-health`, amount 20             |
|     7 | `guard_shredder`         | major    |      1 |        2 | dash     | trigger `guard-shredder`                    |
|     8 | `execution`              | major    |      1 |        2 | dash     | trigger `execution`                         |
|     9 | `chain_dash`             | major    |      1 |        2 | dash     | trigger `chain-dash`                        |

- Minor magnitudes match their channel amount: 10, 1, 20, 1, 1, and 20 respectively. Major effective magnitude is 1. Do not omit values in Web definitions.
- Preserve display names and templates: Sharpened Edge, Fleet Step, Impact Dash, Light Footwork, Extended Mobility, Vital Spark, Guard Shredder, Execution, and Chain Dash. The descriptions remain immutable display content; validators must not parse them into behavior.
- `mobility-cooldown` has positive amount 1; later combat projection interprets that as a one-tick reduction. Do not encode a negative amount because the display wording says “-”.

### Runtime Boundary

- `maxStacks` is a declaration. Preserve 2/3/5 repeatable declarations and 1 for Majors without enforcing an acquisition cap in content code.
- `requiredMobility=dash` applies only to the three Major definitions. Do not add an unstated Dash restriction to `dash_attack_up`.
- Channel/trigger semantics belong to Port 9 and later combat ports. This child must not add a Run Build, eligibility function, formatter, offer helper, or effect application method.

## Edge Cases

| Case                                                           | Expected Handling                                         |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| Duplicate Artifact ID                                          | Reject with deterministic content path and ID.            |
| Unknown Mobility, channel, trigger, category, or effect kind   | Reject at catalog construction.                           |
| Empty effect list or unsupported effect combination            | Reject.                                                   |
| Zero/negative/fractional stack or minimum-wave value           | Reject.                                                   |
| Non-finite or non-positive channel amount/magnitude            | Reject.                                                   |
| Major without Dash requirement or Minor with a shipped trigger | Reject the concrete authored catalog through exact tests. |
| Impact Dash inferred as Dash-only from its text                | Forbidden; it remains unrestricted.                       |
| Declared repeatable stack count becomes a hard cap             | Forbidden in this child.                                  |
| Validation sorts registry order                                | Forbidden; preserve the nine-definition authored order.   |
| Caller mutates nested effect through a cast                    | Accepted catalog remains recursively frozen.              |

## Acceptance Criteria

1. The nine shipped Artifacts load through one validated immutable catalog in registry order, with six Minor, three Major, and zero Curse definitions.
2. Every Artifact preserves its effective name, description, category, magnitude, declared stacks, minimum wave, exclusivity, curse state, Mobility restriction, presentation identity, and effect declaration.
3. Invalid IDs, categories, effects, Mobility references, values, stacks, and duplicate definitions fail before content is exposed with deterministic actionable diagnostics.
4. Impact Dash remains unrestricted, only the three shipped Majors require Dash, and repeatable stack declarations are preserved without implementing acquisition behavior.
5. Accepted Artifact definitions and nested effects cannot be mutated and contain no Godot paths, UIDs, imports, assets, reward state, or effect execution.
6. No reward offer, ownership, Run Build, combat, or UI behavior is introduced by this child.
