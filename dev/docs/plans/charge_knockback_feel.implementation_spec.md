# Charge Knockback Feel: Hit-Reaction Displacement and Pass-Through Timing

Parent Plan: none (standalone spec)

## Goal

Make being pushed by a Charge read as an impact instead of a voluntary walk: the displaced player keeps facing and jolts sideways, pushes fire at the moment the dashing charger passes each cell, and the dash itself scales with distance.

## Summary

Two presentation defects make charge knockback feel "sticky" today:

- **The player walks their own knockback.** `createMotionTrack` treats every player motion step except dash as locomotion: it turns the player to face the motion direction and plays the `move` pose. A charge push therefore looks like the player turning and strolling one cell sideways.
- **Pushes are decoupled from the dash.** All motion tracks start at batch time zero while the charge dash is a fixed 0.22 s regardless of length, so a far-down-path victim starts sliding before the charger visually reaches them, and every victim slides in unison.

The fix stays entirely inside the presentation director's motion normalization and track construction:

- Displacement and knockback steps become hit reactions for every entity: shorter duration, decisive ease, and the rotation jolt the enemy knockback branch already uses. For the player specifically, facing is preserved, no locomotion pose plays, and the pose settles back to idle.
- Motion steps gain an optional start delay. Each charge side push is paired with the charge dash in the same event batch (the displaced cell lies on the dash segment) and delayed to the moment the charger sweeps that cell, producing sequential impacts down the path.
- The charge dash duration scales per cell within a clamp, so a max-range charge (longer under the core rework's farthest-origin rule) reads as a rush, not a teleport.

No new sprite art, no catalog changes, no core event changes. Landed result: the charger visibly plows down its lane, each victim snaps aside with a jolt exactly as the charger reaches them, and the player never appears to walk out of the way on their own.

## Requirements

1. A displaced player keeps their current facing and never plays the walk pose; the displacement plays as a short jolted shove that settles back to idle.
2. Displacement motion is snappy for all entities: shorter than a normal move, decisive ease, with a brief rotation jolt.
3. A displacement caused by a charge starts when the dashing charger reaches that cell, so pushes ripple down the path in pass-through order.
4. The charge dash duration grows with charge distance inside a clamped range, keeping short charges punchy and long charges legible.
5. Timing changes are presentation-only: gameplay resolution, event content, and event order are untouched.

## Relational Context

- Land this after `charge_enemy_rework.implementation_spec.md`: that spec collapses every charge push to the `charge_side_push` cause and removes forward target knockback, which is the vocabulary the pairing rule matches on.
- `normalizeMotionEvents` (`src/presentation/timelines/presentation-director.ts`) is the single event→motion mapping and today maps each event independently; the pairing rule makes it batch-aware (a displacement looks up the `charge_landed` step in the same batch). It already consumes `charge_landed` and `entity_displaced` — this stays event-vocabulary-driven coordination, which is the director's job; per-profile visuals stay in the enemy presenters, and no per-profile branching is added.
- Cross-entity timing can only live in the director: presenters are scoped to one enemy's events and cannot see the victims' motion steps.
- `createMotionTrack` owns per-entity sequencing with a running cursor; a step's new optional delay offsets its position within that track. Displaced entities normally have a single step, but the delay must compose with the cursor, not replace it.
- The player-pose branch in `createMotionTrack` (force facing + `move`/`dash` pose, settle to `idle`/`dashLand`) must apply only to locomotion kinds (`move`, `dash`); displacement/knockback steps skip facing and locomotion poses but still settle to `idle`. `PlayerSpritePose` has no hurt pose — the jolt is transform-level (rotation), not a new sheet; do not trigger the sprite-authoring pipeline.
- The rotation jolt pattern already exists in the `knockback` branch of `createMotionTrack` (used by `enemy_knocked` from Smash); extend the same treatment to `displacement` steps rather than inventing a second idiom.
- `PresentationDirector.finishActive()` fast-forwards all in-flight timelines on new input; added delays live inside the same tracked timelines, so they collapse correctly and cannot block input.
- The charge dash step comes from `charge_landed` whose `from`/`to` span the actual travel; per-cell duration derives from that span's cell distance. When the charger stops short (blocked landing fallback), the span is shorter and the duration scales down with it — no special case.

## Scope

### Included

- Hit-reaction treatment (duration, ease, jolt, player pose/facing rules) for displacement steps.
- Pass-through delay pairing between charge side pushes and the charge dash in one batch.
- Distance-scaled, clamped charge dash duration.
- Unit coverage in the presentation director test.

### Excluded

- Any core/gameplay change (owned by `charge_enemy_rework.implementation_spec.md`).
- New player or enemy sprite art, poses, or catalog entries.
- Impact VFX/SFX additions and screen shake.
- Smash knockback (`enemy_knocked`) timing, which already reads acceptably.

## Files to Change

| File                                                        | Change Size | Purpose                                                                          |
| ----------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `src/presentation/timelines/presentation-director.ts`       | Medium      | Batch-aware normalization with delays; hit-reaction track rules; dash scaling     |
| `test/unit/presentation/timelines/presentation-director.test.ts` | Medium | Assert delays, durations, and player displacement pose/facing behavior            |

## Execution Outline

1. Extend `BoardMotionStep` with an optional start delay and make `normalizeMotionEvents` batch-aware: collect `charge_landed` spans first, then assign each `charge_side_push` displacement whose `from` lies on a span its pass-through delay (dash duration × cells-from-origin ÷ span length). First matching span wins for determinism.
2. Scale the `charge_landed` step duration per cell with clamped bounds (tunable constants beside `MOVE_DURATION`), and tighten displacement duration/ease to the hit-reaction values.
3. In `createMotionTrack`, restrict the player facing/pose branch to locomotion kinds, apply the existing rotation-jolt idiom to `displacement` steps for all entities, and honor each step's delay against the cursor.
4. Extend the director unit test: displacement steps carry the expected delays and durations; a player displacement step produces no facing/`move`-pose calls and settles to idle; steps without a matching dash get no delay.
5. Run the targeted unit file, then `npm run verify`. Optionally capture a before/after screenshot pair with a one-off Playwright script against a self-started dev server on an alternate port (never port 1420).

## Implementation Notes

- Keep the pairing geometry cardinal-only and integer-based (the dash span is a straight cardinal segment); a displaced `from` matches when it lies strictly between the span's endpoints inclusive of the target cell. No floating-point projection is needed.
- Displacements with no matching dash in the batch (future non-charge causes) get zero delay — the pairing is additive, not required.
- Suggested starting values, tuned in review: displacement 0.12 s `power3.out`; dash 0.06 s/cell clamped to [0.14, 0.30]; jolt ±0.18 rad as in the existing knockback branch. Keep them as named constants.
- Do not reorder events or mutate them during normalization; delays are derived data on the motion step.

## Edge Cases

| Case                                                       | Expected Handling                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Charger stops short (blocked landing fallback)             | Dash span is shorter; scaling and pairing follow the actual `from`→`to` span   |
| Two charges detonate in one presentation batch             | Each displacement pairs with the span containing its cell; first match wins    |
| New input arrives mid-animation                            | `finishActive()` collapses delayed steps with everything else; no input stall  |
| Displacement event with a cause other than a charge push   | Plays immediately with the hit-reaction treatment, no delay                    |
| Player displaced while holding a dash finishing pose       | No facing/pose override during the shove; settles to idle afterward            |

## Acceptance Criteria

1. A player pushed by a charge visibly keeps their facing, jolts sideways without playing the walk animation, and returns to idle.
2. Victims along a charge path are shoved one after another in the order the charger passes them, not all at once.
3. Longer charges take visibly longer to dash than short ones, within snappy bounds.
4. Queueing a new input during the sequence skips it instantly with no lingering motion or stuck poses.
5. Gameplay outcomes and the semantic event stream are byte-identical to before this change; presentation unit tests and canonical non-browser verification pass.
