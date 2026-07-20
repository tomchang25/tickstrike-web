# Hardening c — PixiGameRenderer Split (Implementation Spec)

> **Parent**: [engineering_hardening.md](engineering_hardening.md)
> **Prerequisite**: spec b (CI + golden gates protect this split). **Blocks**: character featurization child spec B (character presenter touches the same file) and port_11 (HUD/input settings build on the input seam).
> **Suggested tier**: painters (c2, c3) are mechanical moves — Sonnet-class; the input extraction (c1) reshapes event wiring — Opus/Fable-class, or Sonnet plus a human diff review. One step per session, e2e green before each commit, per the model-tier notes.

## Goal

Apply the A4 pattern (coordinator + extracted concerns) to `PixiGameRenderer.ts` (1,349 lines). The renderer keeps entity-view lifecycle and snapshot synchronization; input state, preview painting, and board painting move to collaborators. Behavior-preserving: PresentationDirector's renderer contract, all `data-*` test hooks, and every e2e assertion stay unchanged.

## Current inventory (verified 2026-07-21)

One class owns: Pixi app/layer setup and asset loading; entity view creation/reconciliation (`sync`/`updateSnapshot`); detached terminal views and transients; position ownership; **pointer input state** (`pointerMode`, `pointerCell`, `dashDistance`, `pointerCleanup`, facing lock) and its DOM listeners; attack/dash/smash **preview painting** with victim markers; **board painting** (arena tiles, grid, reservations, telegraphs + labels, debug overlay); player/enemy sprite integration; screen-bounds queries for the UI.

`pointerMode` and `dashDistance` are gameplay input parameters, not view state — they decide what command the click produces.

## Target shape

```text
src/presentation/pixi/
├── PixiGameRenderer.ts     app/layers/assets, entity views, snapshot sync,
│                           terminal views, transients, position owners, bounds
├── input-controller.ts     pointer mode/cell/dash distance/facing lock,
│                           DOM listener lifecycle, click→intent resolution;
│                           emits intents through the existing runtime callbacks
├── preview-painter.ts      attack/dash/smash previews + victim markers,
│                           drawing into renderer-provided layers
└── board-painter.ts        arena tiles, grid, reservation/telegraph layers
                            (+ labels), debug overlay
```

Collaborators are constructed by the renderer and receive narrow handles (layers, `cellToPixels`, snapshot accessors) — mirroring how `World` composes its subsystems. No new public API for consumers; `GameRuntime` and the UI keep talking to the renderer.

## Steps (one commit each; unit + e2e green after each)

### c1 — InputController

Move pointer state, DOM listener setup/teardown, and click/hover→intent resolution out. The renderer forwards construction-time callbacks and exposes the same public methods (`setPointerMode` etc.) as delegations. Verify against the pointer-driven e2e flows (dash distance selection, smash targeting).

### c2 — PreviewPainter

Move the three preview painters and victim markers. Inputs: preview model (already computed by core `action-preview`), target layer, `cellToPixels`. Pure drawing; no decisions.

### c3 — BoardPainter

Move arena/grid/reservation/telegraph/debug drawing. Same discipline. After c3, measure the renderer core; record the size in the parent plan.

### c4 — Audit

Confirm the renderer core no longer references pointer state or painting internals; document (briefly, in this spec's Outcome section) which handles each collaborator receives, mirroring the A6 Step 5 audit.

## Out of scope

- Any visual change, timing change, or new capability.
- Character/player presenter work (character child spec B lands after this).
- HUD or input-settings features (port_11).

## Acceptance criteria

1. `PixiGameRenderer.ts` holds no pointer/aim state and no preview/board painting code; each concern lives in exactly one collaborator.
2. All unit tests pass unmodified; all e2e tests pass unmodified (test hooks preserved).
3. Golden determinism suite untouched and green (this spec must not affect core at all — a golden diff here means scope leaked).
4. PresentationDirector required no changes.
