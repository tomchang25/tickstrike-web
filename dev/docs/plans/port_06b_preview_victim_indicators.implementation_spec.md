# Preview Victim Indicators

Parent Plan: `port_06_character_classes_and_mobility.md`
Status: Implemented

## Goal

Show deterministic action-preview consequences before commit: lethal Normal Attack and Dash victims, Smash crush results, and Smash victim destinations for land knockback and water terminalization. The preview must communicate the same result already calculated by core without creating a second combat or movement simulation.

## Summary

Normal Attack, Dash, and Smash keep their action-specific core preview contracts. A presentation projection converts those contracts into one small `PreviewVictimMarker` shape consumed by Pixi. This merges only the display vocabulary, not the action rules.

The marker projection distinguishes HP lethal results from terminal outcomes. `hit.killed` means the shared hit reduces HP to zero; Smash `crush` and `water` can be terminal outcomes even when the hit itself is not lethal. Smash land knockback exposes the predicted destination. Dash exposes its player landing separately and only marks a victim as killed when its shared hit is lethal.

## Relational Context

- `action-preview.ts` remains the read-only authority for hit and displacement predictions.
- The marker projection is derived data for presentation and tests; it never changes command acceptance, occupancy, phase, damage, or reservations.
- Preview markers are cleared and rebuilt with the existing pointer preview generation so stale indicators cannot survive pointer mode changes, reset, or scenario replacement.
- Pixi draws only semantic markers. It does not calculate a destination, infer a kill, or choose a terminal result.
- The existing Smash virtual player landing remains visible alongside victim markers.

## Scope

### Included

- Normal Attack kill marker at the target cell.
- Dash kill markers at victim origin cells and the existing player landing marker.
- Smash crush, knockback destination, water destination, and lethal shared-hit markers.
- One shared presentation marker type and projection helper.
- Deterministic canvas dataset values for browser assertions.
- Unit coverage for projection and Playwright coverage for visible preview state.

### Excluded

- Changing action acceptance or core combat calculations.
- Predicting enemy-phase reactions, future AI movement, or animation timing.
- New preview behavior for non-lethal Normal Attack, Dash, or Smash hits beyond existing target/area/path markers.
- Accessibility text or a second UI panel for preview details.

## Proposed Data

```ts
type PreviewVictimOutcome = "kill" | "crush" | "knockback" | "water" | "blocked";

interface PreviewVictimMarker {
  readonly enemyId: EntityId;
  readonly from: Cell;
  readonly to?: Cell;
  readonly outcome: PreviewVictimOutcome;
}
```

Projection rules:

- Normal Attack `hit.killed` produces `kill` at `preview.target`.
- Dash `victim.hit.killed` produces `kill` at `victim.origin`.
- Smash `displacement: "crush"` produces `crush` at `origin`.
- Smash `displacement: "knockback"` produces `knockback` from `origin` to `destination`.
- Smash `displacement: "water"` produces `water` from `origin` to `destination`.
- Smash `hit.killed` with no displacement produces `kill` at `origin`.
- Smash `displacement: "blocked"` produces `blocked` at `origin` only when the blocked marker is useful to the current preview.

## Presentation Contract

- `kill`: red cross or skull-style cell marker.
- `crush`: compact impact/crush marker at the impact cell.
- `knockback`: directional line or arrow plus a translucent destination ghost.
- `water`: directional line or arrow plus a water destination marker.
- `blocked`: origin marker without a false destination.
- Preview dataset values remain stable and machine-readable, for example:
  - `data-preview-kills="enemy-a,enemy-b"`
  - `data-preview-displacements="enemy-right:5,3>7,3;enemy-water:4,4>4,6"`
  - `data-preview-terminal="enemy-center:crush;enemy-water:water"`

## Files to Change

| File | Change Size | Purpose |
| --- | --- | --- |
| `dev/docs/plans/port_06b_preview_victim_indicators.implementation_spec.md` | Small | Define the preview marker contract. |
| `src/core/actions/action-preview.ts` | Medium | Project action-specific previews into common victim markers. |
| `src/presentation/pixi/PixiGameRenderer.ts` | Medium | Draw and expose victim indicators through the existing pointer layer. |
| `test/unit/core/actions/action-preview.test.ts` | Medium | Assert Normal Attack, Dash, and Smash marker projection. |
| `test/e2e/testbed.spec.ts` | Medium | Assert browser-visible preview marker datasets and cleanup. |
| `README.md` | Small | Document preview consequence indicators. |

## Execution Outline

1. Add the common marker type and pure projection helper without changing action preview result shapes.
2. Have Pixi derive markers from the active Attack, Dash, or Smash preview and render them with the existing pointer layer.
3. Add deterministic canvas dataset serialization and clear it with the existing preview cleanup.
4. Add unit assertions for lethal hits, Smash displacement, water, crush, and non-lethal omissions.
5. Add Playwright assertions for Smash destination/terminal markers, Normal Attack kill, Dash kill, and pointer cleanup.

## Acceptance Criteria

1. A lethal Normal Attack and Dash victim are visibly marked at their predicted cells before commit.
2. Smash preview visibly distinguishes crush from knockback and water destinations.
3. Smash destination indicators exactly match `SmashVictimPreview.destination`.
4. The preview never marks a non-lethal victim as killed.
5. Marker state clears when preview is cleared, pointer mode changes, reset runs, or the scenario changes.
6. Unit and Playwright tests verify the marker projection and browser-visible result.
