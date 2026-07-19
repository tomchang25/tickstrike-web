# Web-Native Content Foundation

Roadmap: [Tickstrike Full Port Roadmap](../plans/tickstrike_full_port_roadmap.md)
Reference baseline: [port-ref/tickstrike](../../../port-ref/tickstrike)

## Goal

Deliver Batch 1 of the Tickstrike Full Port Roadmap by representing all shipped Godot gameplay content as validated, stable Web-native definitions. This removes implicit resource defaults and scene inheritance from the parity boundary before gameplay systems depend on the data.

## Requirements

1. Represent the two shipped character classes with stable identifiers and complete authored combat values.
2. Represent all shipped enemy archetypes, attacks, and four Guard profiles, including values inherited or omitted in the Godot resources.
3. Represent the ten demo waves, the Endless template, reusable spawn groups, placement strategies, slot order, warnings, population limits, and level offsets.
4. Represent all nine shipped Artifacts, their effects, Minor/Major category, eligibility, uniqueness, stack declarations, and Mobility restrictions.
5. Validate references, identifiers, enums, required values, and domain constraints before content can enter a run, because silent fallback would make parity failures difficult to diagnose.
6. Use semantic identifiers for presentation assets and audio without importing package assets into deterministic gameplay definitions.

## Design

Content is immutable authored input. Mutable health, cooldown, wave progress, ownership, and reward state belong to the deterministic runtime rather than the definitions.

Godot numeric enums become stable semantic identifiers. Godot UIDs, scene inheritance, omitted resource properties, and engine import metadata do not cross the boundary. The conversion records the effective shipped values after defaults and overrides are applied.

The initial inventory is:

| Domain                    | Shipped content                                             |
| ------------------------- | ----------------------------------------------------------- |
| Character classes         | Ninja, Viking                                               |
| Enemy presentations/roles | Thrust, Slash, Ranged, Charge, Bomb, Mode, Mode Boss        |
| Guard profiles            | Small, Heavy, Elite, Boss                                   |
| Wave content              | Ten demo waves, one Endless template, seven reusable groups |
| Rewards                   | Six Minor Artifacts and three Major Artifacts               |

The existing Web training content may remain as harness-only material only when it is clearly separated from parity content and cannot be selected by the production run.

### Child Overview

| Child | Focus                                                                         | Current document                                                                                          |
| ----- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 01    | Complete Character, Enemy, Attack, and Guard content with concrete validation | [Implementation Spec](port_01_web_native_content_foundation_01_actor_content.implementation_spec.md)      |
| 02    | Spawn Groups, demo waves, Endless, and progression content                    | [Implementation Spec](port_01_web_native_content_foundation_02_wave_content.implementation_spec.md)       |
| 03    | Artifact definitions, effects, categories, eligibility, and restrictions      | [Implementation Spec](port_01_web_native_content_foundation_03_artifact_content.implementation_spec.md)   |
| 04    | Integrated catalog and deterministic browser content inspection               | [Implementation Spec](port_01_web_native_content_foundation_04_catalog_inspection.implementation_spec.md) |

Recommended landing order: 01 -> 02 -> 03 -> 04. Each child extends the concrete shipped catalog; no child creates a speculative general content framework.

## Non-Goals

1. Do not implement mutable combat, wave, reward, or run behavior.
2. Do not preserve Godot resource syntax, scene inheritance, engine UIDs, or import files.
3. Do not add planned classes, enemies, Artifacts, additional rarity tiers, meta progression, or other unshipped source ideas.
4. Do not redesign shipped balance values while extracting them.

## Acceptance Criteria

1. The complete shipped content inventory can be loaded without Godot runtime artifacts or implicit defaults.
2. Invalid identifiers, broken references, and invalid domain values fail deterministically with actionable diagnostics.
3. Effective Web values match the Batch 0 reference for every shipped definition.
4. A deterministic browser scenario can load representative class, enemy, wave, and Artifact content and expose the resolved values for acceptance.
5. Unit coverage proves content validation, reference resolution, defaults, and representative complete definitions.
6. No runtime package depends on Godot UIDs, resource paths, scene inheritance, or generated Godot imports.
