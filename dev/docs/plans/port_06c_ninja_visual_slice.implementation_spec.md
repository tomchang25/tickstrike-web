# Ninja Visual Slice

Parent Plan: `port_06_character_classes_and_mobility.md`
Status: Implemented

## Goal

Replace the fixed player's debug card with a presentation-owned Ninja visual profile and a minimal readable animation contract. The slice makes the existing `character.ninja` content identity visible without introducing class selection, progression, or new gameplay state.

## Summary

The default player remains the authored Ninja already selected by the deterministic fixtures. Pixi will load the reference project's authored Ninja body spritesheet, including a stable idle pose, cardinal facing, and a dash pose layered onto the existing movement timeline. The profile is presentation data and can later add weapon or class-specific layers without changing the core or runtime command path.

The browser-visible contract will expose the active player profile, facing, and animation state through canvas data attributes. Unit coverage will prove profile construction and presentation cleanup; Playwright coverage will prove the default Ninja is visible, dash presentation returns to idle, and reset leaves no stale visual state.

## Relational Context

- `characterDefinitions` remains the content authority for the player's `presentation.id`; the Pixi presentation layer resolves the existing semantic ID to a visual profile and must not import the content catalog or change gameplay selection.
- `World` and `WorldSnapshot` remain the sole owners of player archetype and gameplay state. This slice must not add player animation, sprite, or class-selection fields to core state.
- `GameRuntime` still emits a snapshot before starting `PresentationDirector`; Pixi projects the snapshot and its semantic events, while GSAP presents `player_dashed` and restores the visual to idle after completion.
- `PresentationDirector` may mutate only the player display object and presentation metadata. It must not decide dash legality, facing semantics, movement distance, cooldown, damage, or invulnerability.
- `PixiGameRenderer` owns display-object creation, profile selection, facing projection, canvas observability, and visual cleanup. React and the semantic mirror do not render or own individual combat entities.
- The copied body spritesheet is a feature-owned runtime asset exported from the reference and CC0 asset source. Pixi owns texture loading and frame selection; core only carries the semantic player archetype.
- Reset, scenario replacement, terminal removal, and generation cancellation must leave no dash pose, stale facing metadata, or orphaned sprite child behind the current snapshot.

## Scope

### Included

- A presentation-owned `character.ninja` spritesheet profile.
- Stable idle pose, cursor-driven cardinal-facing projection, and authored movement poses for the fixed player.
- Dash pose animation integrated with the existing `player_dashed` GSAP timeline.
- Attack direction facing forced by the committed `player_attacked` semantic event, including a bypass of movement facing lock.
- One-frame movement cues serialized with the command presentation queue and held-key movement repeat.
- Held movement repeat must not accumulate commands while a prior player presentation is active; releasing the key stops future submissions immediately.
- Machine-readable canvas attributes for player profile, facing, and animation state.
- Unit, deterministic scenario, and Playwright coverage for visible profile and cleanup.

### Excluded

- Player class-selection UI, switching, unlocks, persistence, progression, or per-class runtime paths.
- Viking art or a general class visual registry beyond the existing semantic profile boundary.
- Weapon sprites, attack cues, audio, particles, or complete Port 13 parity.
- Gameplay-facing state for animation frames, facing, movement, damage, cooldown, or invulnerability.

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `dev/docs/plans/port_06_character_classes_and_mobility.md` | Small | Link the 6c implementation child in the Port 06 sequence. |
| `src/content/characters/assets/ninja/body-sprite-sheet.png` | Small | Package the reference-aligned Ninja body spritesheet for the Web runtime. |
| `src/presentation/pixi/character-sprites.ts` | Medium | Define the Ninja profile, spritesheet frame selection, facing, and pose projection. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Medium | Replace the player placeholder with the profile and expose visual metadata. |
| `src/presentation/timelines/PresentationDirector.ts` | Small | Animate the player dash pose and restore idle on completion or cancellation. |
| `src/core/events/combat-events.ts` | Small | Carry the committed attack direction in the player attack event. |
| `src/core/actions/player-actions.ts` | Small | Emit the attack direction with the existing attack result. |
| `src/runtime/GameRuntime.ts` | Medium | Keep queued command processing behind the previous command's presentation settlement. |
| `src/app/App.tsx` | Medium | Repeat held movement input and clean up repeat timers. |
| `src/harness/fixtures/shipped-arena.ts` | Small | Project the default deterministic player as the authored Ninja archetype. |
| `src/harness/scenarios/empty-arena.scenario.ts` | Small | Keep the static visual scenario on the authored Ninja archetype. |
| `src/harness/scenarios/smash-water.scenario.ts` | Small | Keep the deterministic Smash player on the authored Viking archetype fallback. |
| `test/unit/presentation/pixi/character-sprites.test.ts` | Medium | Assert profile construction and facing/pose projection. |
| `test/unit/presentation/timelines/PresentationDirector.test.ts` | Small | Assert dash presentation calls and idle cleanup through the renderer seam. |
| `test/unit/core/actions/action-resolver.test.ts` | Small | Assert the committed attack direction remains observable. |
| `test/unit/runtime/GameRuntime.test.ts` | Medium | Assert command resolution remains immediate while presentation ordering is serialized. |
| `test/e2e/testbed.spec.ts` | Small | Assert Ninja profile, dash animation cleanup, and reset metadata. |
| `test/e2e/mobility-combat.spec.ts` | Small | Assert the deterministic Ninja mobility scenario exposes the profile and settles dash presentation. |

## Execution Outline

1. Add the feature-owned Ninja spritesheet and presentation-only profile contract before changing the renderer, so texture loading and display implementation have one stable ownership boundary.
2. Replace only the player `P` body in `PixiGameRenderer` with the Ninja profile; keep enemy debug cards and all core snapshot shapes unchanged. Project cursor facing and pose metadata to the canvas for browser assertions.
3. Extend the existing player movement and Dash timelines to set authored move/dash poses, animate the existing player view, then restore idle. Make cancellation restore idle without retaining timeline-owned state.
4. Add focused unit assertions for the profile and timeline seam, then add Playwright assertions against the default and mobility scenarios. Verify reset and settled presentation before broader checks.

## Implementation Notes

- Load the feature-owned reference-aligned spritesheet before the first scenario is projected. Do not resolve source-material paths from the root `assets/` directory at runtime.
- Use the reference body sheet's 16-pixel cells, four cardinal columns, and authored idle/movement rows. Keep the profile centered on the entity root and preserve nearest-neighbor pixel readability.
- Keep the web cell footprint visually smaller than the raw reference node scale; the current Web cell is 64px while the source frame is 16px.
- Use a small fixed set of poses such as `idle` and `dash`; pose changes are transient presentation metadata and must not be persisted in `WorldSnapshot`.
- Project facing from the direction-bearing `actor_moved` and `player_dashed` events. Use a stable default for the initial snapshot. Do not alter event payloads solely to support this visual slice.
- Facing updates from cursor hover or snapshot projection must replace only the spritesheet column; they must preserve the active move or Dash row until that timeline restores idle.
- The existing `isAnimatedByLastEvents` guard must continue to prevent snapshot projection from snapping a view during the dash timeline.
- Canvas metadata is an acceptance hook, not a second UI state owner. It must be cleared or overwritten by snapshot/reset projection and never be used to resolve commands.
- Terminal player removal remains owned by the existing presentation director. A terminal timeline may hide and remove the view, while core terminal state remains synchronous.
- `GameRuntime` resolves an accepted command promise after core mutation but does not start the next queued command until that command's presentation promise settles. Scenario replacement still cancels both through the generation boundary.
- Held movement repeat is presentation/input orchestration only. Each repeated key interval submits an ordinary Move command only while the runtime is idle; it does not bypass command validation, accumulate a backlog, or create a second movement path.
- Cursor facing is ignored while the player pose is Move or Dash, so a movement cue remains locked to its committed direction until the timeline returns to idle.
- `player_attacked.direction` is the committed command direction. Presentation applies it with an explicit force path so an attack can face correctly even if a movement lock is still active; this does not change gameplay state or add attack animation frames.

## Edge Cases

| Case | Expected Handling |
| --- | --- |
| Initial snapshot has no player movement event | Show the Ninja idle pose with the stable default facing. |
| Player moves or dashes in a cardinal direction | Update the visual facing to that direction without changing logical player state. |
| Dash presentation is cancelled by reset or scenario replacement | Kill the timeline through the existing generation boundary, restore idle metadata, and let the new snapshot rebuild the view. |
| A scenario has a player with no matching visual profile | Use the existing generic entity presentation rather than failing world creation or command execution. |
| Player reaches a terminal outcome during a visual timeline | Complete or cancel through the existing terminal/generation path and leave no active player sprite view after the terminal timeline. |

## Acceptance Criteria

1. The fixed player is rendered as the `character.ninja` visual profile rather than a `P` placeholder, while enemies retain their current presentation behavior.
2. The player has a readable idle pose and its visual facing follows the current cursor aim, movement, or Dash direction without changing gameplay outcomes.
3. A committed Attack forces the player to face its attack direction even when a movement facing lock is active.
4. An accepted Move or Dash presents its authored transient body pose on the existing GSAP timeline and returns to idle when presentation becomes idle.
5. Reset, scenario replacement, terminal cleanup, and animation cancellation leave no stale player pose, metadata, or orphan display child.
6. Unit and Playwright coverage observes the Ninja profile, facing/pose contract, attack direction override, dash cleanup, and reset behavior through the existing renderer/runtime boundaries.
