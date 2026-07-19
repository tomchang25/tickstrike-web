# Wave Content Foundation

Parent Plan: `port_01_web_native_content_foundation.md`

## Goal

Convert every shipped spawn group, demo wave, Endless template, and enemy progression input into validated immutable Web-native content so later wave systems consume authored encounter structure without Godot scenes, resource defaults, or implicit references.

## Summary

This child extends the accepted actor catalog from Child 01 with seven reusable groups, ten ordered demo waves, one Endless template, and the complete HP, damage, and Defense growth curves. It records semantic group and wave IDs where Godot used resource paths, resolves group enemy references through canonical actor IDs, and makes every omitted resource default explicit.

The result is a frozen wave-content catalog that rejects malformed composition, references, scheduling fields, capacity relationships, and progression curves before a future run can consume it. It records encounter grammar only: weighted draws, slot scheduling, placement selection, warnings, reservations, spawn projection, and wave lifecycle remain later runtime behavior.

## Relational Context

- This child implements only after Child 01's accepted actor catalog exists. Wave content imports the actor catalog to resolve group enemy IDs; actor content remains independent of waves.
- Core wave-content contracts and validation are framework-independent and may import only core actor-content types. Authored wave definitions import core contracts; core never imports `src/content`.
- The canonical wave-content entry point assembles authored groups, demo waves, Endless template, and progression profile, validates them against actor content once, and exports only recursively frozen accepted content.
- Spawn groups own immutable composition and placement strategy. A wave slot owns an ordered occurrence of one group plus start condition, warning, level offset, survivor threshold, and boss flag; no group owns occurrence-specific scheduling values.
- Groups and waves require newly introduced semantic IDs because Godot resources have no authored stable IDs. IDs must not derive from or expose `res://`, UIDs, PackedScenes, or filenames at runtime.
- Group entry order and wave-slot order are authored. Validation must never sort them, because later fixed spawning and deterministic scheduling depend on their preserved order.
- A weighted group records total draws and weights, not a draw result or random stream. Fixed groups record counts, not spawned entities. Random selection and placement are later runtime state.
- The progression profile owns immutable curve coefficients and exponents. It does not project enemy HP, damage, Defense, or Guard in this child; later wave runtime supplies final level and base wave.
- Guard profile values come from Child 01. This child records that Guard growth uses base wave rather than slot offset/final level, but does not implement the projection formula or mutable Guard state.
- Wave definitions use actor enemy IDs, not scenes. `mode_enemy` remains valid actor content but intentionally does not occur in any shipped group; `mode_boss` occurs only in the boss group.
- Validation produces the same deterministic aggregate diagnostic behavior and recursive freezing promised by Child 01. It must not clamp invalid values, manufacture fallback groups/slots, or accept numeric Godot enum values.
- Unit tests cover content and validation without world, RNG, React, Pixi, GSAP, or browser APIs. Child 04 will aggregate wave content with actor and Artifact content for final browser inspection.

## Scope

### Included

- Seven complete reusable spawn groups.
- Ten complete demo waves and one Endless template.
- Semantic placement, composition, and start-condition identifiers.
- HP, damage, and Defense growth curves and the base-wave Guard growth rule inputs.
- Actor-reference, capacity, enum, domain, ordering, diagnostics, and immutability validation.
- Unit coverage for all shipped wave content and malformed definitions.

### Excluded

- Weighted draws, random streams, placement algorithms, occupancy, reservations, warnings, spawning, scheduling, or completion.
- Projecting spawned enemy stats, Guard points, final level, or damage multiplier.
- Reward cadence, Wave 10 completion flow, Endless transition, or run state.
- Characters, enemies, attacks, Guards, Artifacts, React UI, browser scenario, or package assets.

## Files to Change

| File                                          | Change Size | Purpose                                                                                                                |
| --------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/core/content/wave-content.ts`            | Large       | Own readonly wave contracts, validation diagnostics, reference checks, capacity checks, and recursive freezing.        |
| `src/content/waves/wave-definitions.ts`       | Large       | Author seven groups, ten demo waves, Endless template, and complete progression curves.                                |
| `src/content/wave-content.ts`                 | Medium      | Assemble the canonical validated wave catalog against Child 01 actor content.                                          |
| `test/unit/core/content/wave-content.test.ts` | Large       | Prove malformed group/wave/progression diagnostics, reference resolution, capacity checks, ordering, and immutability. |
| `test/unit/content/wave-content.test.ts`      | Large       | Prove exact shipped groups, wave slots, Endless grammar, and curve inputs.                                             |

## Execution Outline

1. Add framework-independent wave contracts and focused validation tests before introducing authored definitions.
2. Implement validation and freezing, including actor-reference resolution, fixed/weighted composition rules, slot constraints, population-cap fit, and curve domains.
3. Author the seven groups using Child 01 enemy IDs, preserving group-entry order, placement strategy, composition mode, counts, and weights.
4. Author Demo Waves 1-10, Endless, and progression curves with every omitted default explicit; validate the canonical wave catalog against accepted actor content.
5. Add exact content assertions for inventory, Wave 10, Endless, group composition, order, and representative progression inputs.
6. Run focused wave-content tests and `npm run check`; Child 04 later covers the final browser-visible full-catalog result.

## Implementation Notes

### Semantic Values

- Use `fixed` and `weighted` composition, `player-ring`, `anchor-cluster`, and `scatter` placement, and `previous-group-cleared`, `previous-group-survivors-at-most`, and `immediate-overlap` start conditions. Godot ordinals never cross the boundary.
- Use stable group IDs `small`, `small-ranged`, `small-ranged-charge`, `ranged`, `charge`, `bomb`, and `boss`; use demo wave IDs `demo-01` through `demo-10` and Endless ID `endless`. Group `small` is unrelated to Guard profile `small`.
- Every shipped slot uses `immediate-overlap`, warning `1`, survivor threshold `0`, level offset `0`, and `isBoss=false`, except Wave 10's only slot: warning `2`, offset `3`, `isBoss=true`.

### Spawn Groups

| Group                 | Composition      | Placement      | Entries                               |
| --------------------- | ---------------- | -------------- | ------------------------------------- |
| `small`               | Weighted total 3 | player-ring    | thrust weight 1; slash weight 1       |
| `small-ranged`        | Fixed            | anchor-cluster | 2 thrust; 1 slash; 2 ranged           |
| `small-ranged-charge` | Fixed            | anchor-cluster | 2 thrust; 1 slash; 1 ranged; 1 charge |
| `ranged`              | Fixed            | anchor-cluster | 2 ranged                              |
| `charge`              | Fixed            | scatter        | 2 charge                              |
| `bomb`                | Fixed            | scatter        | 2 bomb                                |
| `boss`                | Fixed            | scatter        | 1 Mode Boss                           |

### Waves And Progression

| Wave    | Cap | Ordered Group Slots                    |
| ------- | --: | -------------------------------------- |
| Demo 1  |   3 | small                                  |
| Demo 2  |   2 | ranged                                 |
| Demo 3  |   5 | small-ranged                           |
| Demo 4  |   2 | charge                                 |
| Demo 5  |   5 | small-ranged-charge                    |
| Demo 6  |   6 | small, ranged, charge                  |
| Demo 7  |   7 | ranged, small, charge                  |
| Demo 8  |   8 | small, ranged, charge, bomb            |
| Demo 9  |   9 | charge, ranged, small, bomb            |
| Demo 10 |   1 | boss (warning 2, level offset 3, boss) |
| Endless |  10 | charge, ranged, small, bomb            |

- The three growth curves have standard exponent `1`: HP `0.08`, damage `0.05`, Defense `0.60`. Their lethal coefficients/exponents are HP `0.15`/`1.2`, damage `0.10`/`1.1`, and Defense `1.20`/`1`.
- Lethal level growth begins at level 10 through `max(level - 9, 0)`. Record this as profile data rather than precomputing a table or capping levels.
- Guard growth uses Child 01 profile base and tier-gain values with standard-wave limit `20` and lethal-tier cadence `5`; final-level and slot-offset use is forbidden for Guard. The formula belongs to Port 8.

### Validation

- Require format-safe unique group/wave IDs, enum membership, finite numeric values, integer counts, thresholds, warnings, offsets, and caps, plus positive finite weights and curve exponents.
- Require non-empty groups and waves. Fixed entries require positive count; weighted entries require positive weight and a positive total draw count. Every enemy ID resolves through actor content.
- Require each slot's group ID to resolve. Validate non-negative warning/offset, and only permit a non-negative survivor threshold for the threshold start condition.
- Reject a wave when any referenced group can expand beyond its population cap: sum fixed counts or use weighted total. Do not simulate a draw to validate the cap.
- Require non-negative curve coefficients and positive finite exponents. Keep curve values as immutable content; no normalization of below-one levels/waves belongs here.

## Edge Cases

| Case                                                      | Expected Handling                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Duplicate group or wave ID                                | Reject deterministically with its content path.                       |
| Unknown enemy or group reference                          | Reject catalog construction; never retain a dangling ID.              |
| Weighted group has zero total or non-positive weight      | Reject.                                                               |
| Fixed group has zero count                                | Reject.                                                               |
| Group expansion exceeds a wave cap                        | Reject even if a particular weighted draw could fit.                  |
| Invalid enum through a cast/external value                | Reject at runtime.                                                    |
| Fractional or non-finite count, tick, offset, or cap      | Reject; coefficients, weights, and exponents may be finite fractions. |
| Slot order or group-entry order changes during validation | Forbidden; preserve authored order.                                   |
| Wave 10 boss offset applied to Guard growth               | Forbidden; that offset affects final level only in later runtime.     |
| `mode_enemy` absent from groups                           | Valid; only Mode Boss is authored into the shipped encounter grammar. |

## Acceptance Criteria

1. Seven groups, ten demo waves, Endless, and one complete progression profile load through a validated immutable catalog that references accepted actor IDs only.
2. Group composition, placement, slot order, start condition, warning, cap, level offset, boss role, and all effective defaults match the Godot reference.
3. Invalid IDs, enums, composition, references, caps, slot values, and curves fail before content is exposed with deterministic actionable diagnostics.
4. Wave content cannot be mutated after validation, including nested entries, slots, and curve values.
5. No wave definition depends on Godot scenes, paths, UIDs, imports, random draws, placement results, mutable population, warnings, or spawned entities.
6. No wave scheduling, spawning, stat projection, reward, or run behavior is introduced by this child.
