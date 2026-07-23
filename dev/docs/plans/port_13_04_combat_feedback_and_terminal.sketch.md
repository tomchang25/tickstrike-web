# Port 13.4 Combat Feedback and Terminal Presentation

Parent Plan: `port_13_visual_parity_and_polish.md`

## Goal

Explore the Web-native presentation shape for the combat-feedback and terminal-animation slice of Port 13. The slice replaces placeholder geometry with authored sprite animation or polished VFX while preserving semantic gameplay ownership, the existing tint channels, and deterministic terminal cleanup.

## Summary

The likely shape separates state-projected feedback from event-driven feedback. Telegraph markers and attack windup loops follow the current snapshot and may loop without holding the runtime's idle boundary open; impacts, Guard reactions, Smash, Major triggers, deny feedback, and terminal animations are finite event timelines owned by the presentation lifecycle.

The live event stream does not yet distinguish every required outcome. Execution, Guard Shredder, and rejected-input location cannot be inferred safely from the current generic directional-hit or rejected-resolution shapes. The later spec should introduce the smallest semantic distinctions needed by presentation rather than reconstructing gameplay outcomes from damage values, artifact state, or animation timing. The Mobility-kill death cause and the body-split terminals moved to child 13.3e under the entity-versus-world boundary: animation on an entity's own body is owned by 13.3, effects over cells, paths, or the board by this child.

## Sketch

### Feedback families

| Family                   | Semantic source                                           | Candidate presentation shape                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegraph danger markers | Snapshot telegraphs and their phase                       | Authored phase-specific sprite markers for warning, charge/active, and spawning; markers tile or orient across affected cells without replacing the preserved countdown labels.                                                                                                                                                                                                                                                                          |
| Attack windup            | Committed attack plus source facing/type                  | A state-projected directional gold TILE loop for roles without an authored body windup (Thrust, Slash, Ranged). Bomb and Charge windup body animation is owned by 13.3d, and no separate overlay loop is added for them. The ranged windup additionally draws a source-to-landing line linking the enemy to its telegraphed cells (product decision P7). The loop ends when the committed attack clears and does not count as a pending finite timeline. |
| Recovery and stagger     | `activity` recovering/staggered plus `enemy_recovering`/`enemy_recovered` events | State-projected overlay VFX for the recovery and stagger held states, adopted instead of authoring a per-enemy recovery/stagger body sheet. A light held-state indicator on a separate display root, layered over the existing sprite-owned stagger tint without replacing it. Reconciles idempotently by semantic identity, loops without holding the runtime idle boundary open, and clears on recovered/re-engage. The stagger tint channel stays owned by 13.3 in `enemy-sprites.ts`; only the additive overlay is owned here.                                                                        |
| Charge movement          | Charge movement/impact events                             | The Charge execute VFX: a forward slash at launch plus short-lived trailing streak sprites aligned to the actual movement vector, layered over the 13.3d execute body animation.                                                                                                                                                                                                                                                                         |
| Hit result               | Guard-damaged, Guard-broken, and enemy-damaged events     | Separate authored shield spark, break flash/fragments, and full-damage burst layered over the preserved damage/stagger tint rather than replacing it.                                                                                                                                                                                                                                                                                                    |
| Smash                    | Smash armed/impact/cancel events                          | A pulsing authored ring at the armed cell, followed by a radial landing burst; cancel removes the ring without an impact.                                                                                                                                                                                                                                                                                                                                |
| Major trigger            | Explicit Guard Shredder and Execution semantics           | Gold shard burst for Guard Shredder and a collapsing dark burst for Execution. Neither effect is selected by inspecting damage numbers or currently equipped artifacts in presentation.                                                                                                                                                                                                                                                                  |
| Deny, swing, detonation  | Rejected command and accepted attack/detonation semantics | Distinct finite authored feedback: white deny at the attempted/player location, cyan swing, and — per product decision P7 — the Bomb detonation renders one small authored explosion instance per telegraphed cell, staggered outward from the detonation center by grid distance, so the effect adapts to the data-driven area shape instead of one stretched burst. Player cyan remains separate from enemy danger colors.                             |
| Terminal                 | Explicit terminal cause plus retained entity view         | Existing drowning remains unchanged. Mobility-kill body split and its death-cause semantics are owned by 13.3e; ordinary death and crush retain their own terminal paths here.                                                                                                                                                                                                                                                                           |

### Ownership and lifetime

- A candidate combat-feedback renderer should own marker textures, state-projected loops, and general transient display objects. Verify whether this is a focused collaborator of `PixiGameRenderer` or a smaller extension of `BoardPainter`; role-specific branching must not enter `PixiGameRenderer` or `PresentationDirector`.
- The current transient API tracks only `Graphics`. Authored sprites and fragment containers likely require a renderer-owned transient handle that can release any effect root, clear all children on cancellation, and keep `PresentationDirector.isIdle` truthful for finite effects.
- Snapshot-projected telegraphs and windups should reconcile idempotently by semantic identity. Re-sync must update or retain the same loop, remove stale loops, and never restart every animation on every snapshot emission.
- Event-driven effects should continue through the director's tracked finite timelines so `finishActive`, generation replacement, route teardown, and terminal ghost release have one cleanup path. Infinite loops must not be registered as finite timelines.
- Damage and stagger tint remain sprite-owned channels in `enemy-sprites.ts`. Impact effects use separate display roots so a new effect cannot race the tint reset or mutate the entity's canonical pose.
- Enemy-scoped generic reactions likely remain in the generic presenter, with specialized Charge behavior reached through the existing presenter registry. Shared/global effects such as Smash and rejected-input feedback remain central because they are not enemy-role knowledge.

### Semantic seams to verify

- `DirectionalHitResult.feedback` distinguishes guarded, guard-break, staggered, and unblocked outcomes, but it does not identify whether Guard Shredder or Execution caused the result. Add explicit semantic cause/trigger data at resolution time rather than deriving it in presentation.
- The `enemy_died` death-cause distinction is introduced by 13.3e for the body-split terminals; the later 13.4 spec should build the Execution/Guard Shredder trigger semantics on top of whatever cause shape 13.3e lands rather than adding a parallel one.
- Rejected commands currently bypass `PresentationDirector.play`. Deny feedback needs a narrow runtime presentation path carrying the attempted command context without treating rejection as accepted gameplay or advancing time.
- Attack windup orientation and TILE-versus-CHARGE selection should come from the committed attack and enemy presentation metadata already present in the snapshot. Verify whether the current committed-attack model carries enough information before adding presentation-only fields.
- Recovery and stagger already surface their held state to presentation: `activity` distinguishes `recovering`/`staggered`, and `enemy_recovering`/`enemy_recovered` events already fire. Unlike the mobility-kill cause 13.3e had to add, the recovery/stagger overlay needs no new core semantics — verify the snapshot carries `activity` and per-enemy recovery timing before adding presentation-only fields.

### Asset and authoring slices

- Telegraph markers and shared combat bursts — including the per-cell detonation explosion and the ranged source-to-landing line — should be authored as a small coherent effect atlas or sprite-animation set under a presentation-owned asset path. Nearest-neighbor scaling, frame dimensions, timing metadata, and reduced-motion fallback should be explicit.
- The later implementation should land semantic coverage and deterministic harness scenarios before final visual tuning, then add the shared VFX set and approval evidence. This keeps missing events from being hidden behind attractive but heuristic effects. Mobility-kill terminal sheets are no longer part of this slice; they land in 13.3e.

### Candidate files to inspect

- `src/core/events/combat-events.ts`, `src/core/combat/directional-hit.ts`, and the player/enemy action resolvers for explicit trigger and terminal-cause semantics.
- `src/runtime/game-runtime.ts` for the rejected-command feedback seam and existing accepted-event presentation ordering.
- `src/presentation/timelines/presentation-director.ts` and `src/presentation/timelines/enemy-presenters/` for finite timelines, terminal ghosts, and registry-routed enemy feedback.
- `src/presentation/pixi/pixi-game-renderer.ts`, `src/presentation/pixi/board-painter.ts`, and a possible focused combat-feedback module for state-projected loops, sprite transients, asset loading, and cleanup.
- `src/presentation/pixi/enemy-sprites.ts` and enemy feature presentation profiles for preserved tint channels and role-owned Mobility terminal assets.
- Existing presentation unit tests and deterministic browser scenarios for idle, cancellation, telegraph, Mobility, and terminal lifecycle coverage.

All coordinates and module shapes above are provisional and must be verified against the live codebase when the implementation spec is written.

## Non-Goals

1. Do not change damage, Guard, Stagger, Telegraph timing, command acceptance, occupancy, Tick advancement, or reward behavior.
2. Do not port the reference polygon/line tweens or retain color-only danger fills as the final art.
3. Do not restyle the cyan player preview family, countdown-label placement, damage/stagger tint, or shipped drowning sheets.
4. Do not add Chain Dash lightning or free-Dash aura feedback; those remain deferred with their gameplay route.
5. Do not use presentation-side heuristics to identify Major triggers or Mobility kills.
6. Do not make animation completion the authority for terminal gameplay removal.
7. Do not author animation on an entity's own body — prepare loops, execute body states, and terminal body-split sheets are owned by the 13.3 sub-plan under the entity-versus-world boundary.

## Acceptance Criteria

1. Enemy danger and spawn cells use authored, phase-readable sprite markers against the tiled terrain while player previews remain exclusively cyan and countdown placement/multiplicity remains unchanged.
2. TILE windups (with the ranged source-to-landing line), Charge movement, guarded hits, Guard breaks, full-damage hits, Smash windup/impact, Guard Shredder, Execution, deny, swing, and the per-cell staggered detonation each have distinct authored feedback driven by semantic state or events.
3. Damage flash and stagger tint remain readable and do not race each other or the added impact effects.
4. Drowning remains the shipped per-direction eight-frame animation; ordinary death and crush terminals stay clean under the shared cleanup path.
5. Finishing active feedback, reset, route replacement, and renderer teardown leave no pending finite timeline, callback, transient display object, state loop, or retained terminal view.
6. Reduced motion preserves every danger, hit-result, trigger, and terminal distinction without requiring continuous or high-amplitude motion.
