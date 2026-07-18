# Seeded and Isolated Random Streams

Parent Plan: `port_02_deterministic_grid_world_and_tick_foundation.md`

Status: Draft implementation spec

## Goal

Introduce environment-stable seeded random streams that scenarios can replay and gameplay domains can consume independently. This establishes the random contract before waves and rewards begin using it.

## Summary

The current Web runtime has no gameplay RNG and scenarios carry no seed. The reference uses separate wave and reward-related ownership in places, but also contains global or unseeded randomness that cannot satisfy Batch 2 replay requirements. This draft adds a core-only deterministic generator and named stream derivation, then injects a root seed through scenario/world setup without connecting it to future wave or reward logic.

## Relational Context

- Core owns the deterministic generator and stream state; it must not import browser crypto, `Math.random()`, or presentation code.
- Harness scenarios provide the root seed and recreate a fresh stream set for each deterministic world identity.
- Named stream derivation depends only on root seed and stable domain name, not stream creation order or other stream consumption.
- Future wave, reward, and debug systems request named streams instead of sharing one mutable RNG.
- World reset recreates the original scenario seed and stream sequence; it does not inherit random state from the replaced world.
- Random stream internals need not be placed in `WorldSnapshot`; replay is defined by scenario seed and command sequence, while debugging may inspect stream outputs through unit fixtures.

## Scope

### Included

- Stable root-seed normalization and named stream derivation.
- Bounded integers, unit values, weighted picks, and deterministic unique selection.
- Scenario seed injection and reset replay behavior.
- Unit coverage for sequence replay and cross-domain isolation.

### Excluded

- Wave composition, placement, rewards, debug actions, and content selection.
- Persisted run seeds, save migration, and cross-version random compatibility.
- Reproducing Godot's raw RNG sequence where the reference does not make it player-observable.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `src/core/random/random-stream.ts` | Large | Implement the environment-stable deterministic stream and selection primitives. |
| `src/core/random/random-streams.ts` | Medium | Derive and expose named domain streams from one root seed. |
| `src/core/world/world.ts` | Medium | Carry the world root seed/stream set needed by deterministic gameplay consumers. |
| `src/harness/types.ts` | Small | Add scenario seed setup to the deterministic scenario contract. |
| `src/harness/scenarios/empty-arena.scenario.ts` | Small | Assign an explicit stable seed to the gameplay scenario. |
| `src/harness/scenarios/smash-water.scenario.ts` | Small | Assign an explicit stable seed to the legacy combat scenario. |
| `src/harness/scenarios/content-catalog-inspection.scenario.ts` | Small | Assign an explicit stable seed to the static inspection scenario contract. |
| `test/unit/core/random/random-stream.test.ts` | Large | Assert sequences, bounds, weights, unique selection, invalid inputs, and isolation. |

## Execution Outline

1. Add the pure generator and named stream derivation with no runtime callers.
2. Add scenario seed construction and world injection, preserving deterministic reset from the original seed.
3. Add focused unit coverage for exact sequences and cross-domain independence.
4. Leave future gameplay consumers unconnected until their own implementation specs choose a stream domain.

## Implementation Notes

- Choose an explicit integer algorithm with fixed-width arithmetic and document the normalization rules in code comments or the spec implementation notes.
- Domain derivation must be stable across stream request order and runtime reloads.
- Weighted selection must define cumulative ordering and zero/negative weights without ambient fallback randomness.
- Invalid bounds, empty pools, and requests larger than a source pool must return deterministic documented failures or bounded results, never random fallback.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Same seed and domain | Produces the same sequence across world recreation. |
| One stream consumed heavily | Other named streams produce their unchanged next values. |
| Empty weighted pool | Returns a deterministic no-selection result. |
| Non-positive weights | Treats them deterministically as zero or rejects the pool; never adds hidden weight. |
| Reset after consumption | Recreates the initial seed and initial stream positions. |

## Acceptance Criteria

1. Identical seed and command setup reproduce identical random outputs and world results.
2. Wave-placement, reward, and debug streams are independent named domains.
3. Consumption in one stream cannot perturb another stream.
4. Reset restores the scenario's initial random sequence.
5. Invalid random requests never fall back to ambient randomness.
