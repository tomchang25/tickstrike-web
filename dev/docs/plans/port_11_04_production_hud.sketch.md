# Port 11 Child 04: Production HUD Sketch

Parent Plan: `port_11_production_ui_input_settings_and_debug_tools.md`

## Goal

Replace the home shell's temporary projections — the bare `RunBuildHud` row and the hardcoded key-hint paragraph — with a coherent snapshot-driven HUD showing player, wave, Tick, and status information, establishing a visual-consistency baseline while full reference parity stays with port_13.

## Summary

Direction favored: a `src/ui/hud/` feature with two or three small components composed around the existing canvas frame, all rendering purely from `WorldSnapshot` and dispatching nothing but the session callbacks that already exist. The Pixi/React unification question is explicitly deferred: port_13's reference audit decides the final shell look; this child only makes the current React chrome read as one surface instead of disjoint fragments.

## Sketch

- Data is already sufficient (verify field availability at spec time): `snapshot.entities` carries the player's `hp`/`maxHp` and mobility state, `snapshot.waveRuntime` carries the wave number and slot state, `snapshot.tick`, `snapshot.runBuild`, and `snapshot.telegraphs` cover the rest. No new snapshot field is expected; if one proves missing, that is a stop-and-return-to-decision moment, not a silent core edit.
- Candidate components: a player status strip (HP, mobility cooldown), a wave/Tick indicator, and a controls legend replacing the `game-app.tsx:61` hint paragraph. `RunBuildHud` likely survives restyled into the same visual band rather than rewritten — it already has the correct snapshot-only contract.
- Layout candidate: one status band above or below the canvas frame inside `game-shell`, sharing panel tokens with the existing overlay styles in `src/app/styles.css` so the HUD, overlays, and canvas frame read as one design system. The arena-fit work from the earlier fix (`dfea1f2`) constrains vertical budget; the HUD must not reintroduce viewport overflow at 1080p.
- Frequency discipline: HUD components receive the snapshot from the existing `use-game-session` subscription (low-frequency, once per accepted input), never per-frame data; per-entity combat presentation stays in Pixi (plan non-goal 2). Enemy detail beyond an aggregate (e.g. living-enemy count) likely stays out of the production HUD — the dense per-enemy cards remain `TestbedPanel`-only.
- Accessibility (read `web_accessibility_standard.md` at spec time): semantic landmarks for the HUD region, text-paired state (HP as numbers not color alone), and `aria-live` only where a change genuinely warrants announcement — the terminal banner already models this.
- Both shells: `TestbedApp` probably adopts the same HUD components beside its panel so e2e coverage exercises them; verify whether any split spec asserts on the current hint text or `RunBuildHud` markup before changing testids.
- The e2e surface may need one new capability assertion (HUD reflects snapshot after a wave transition) per `verification_tiers.md`'s browser-visible-integration row; the spec decides whether an existing wave test absorbs it.

## Non-Goals

1. Pixel or layout parity with the reference build, terminal-banner copy, and visual polish (port_13, after its audit).
2. Rendering any HUD element inside the Pixi canvas or rerendering combat entities through React.
3. Settings UI (child 05) and input changes (child 03).
4. New snapshot fields or any `src/core` change.

## Acceptance Criteria

1. The HUD shows player, wave, Tick, reward, and status information derived only from runtime snapshots, without recalculating combat.
2. The home shell presents the HUD, overlays, and canvas as one coherent surface with no viewport overflow at the supported desktop size.
3. Reset and scenario replacement leave no stale HUD state.
