# Engineering Hardening: Mechanized Guardrails, CI, and the Next Splits

> **Status**: Plan approved 2026-07-21; child specs a–d ready to execute in order
> **Context**: Follows Phase A of [gameplay_architecture_refactor.mega_plan.md](gameplay_architecture_refactor.mega_plan.md). Protects the upcoming [character_featurization_and_viking_split.md](character_featurization_and_viking_split.md) work and port_10–13.

## Goal

Convert the guardrails that currently live only in documents into machine-enforced gates, make the determinism contract CI-verifiable, split the next god file before port_11 builds on it, and stop `World`'s facade from being the default growth surface. Every item here protects later work; none changes gameplay behavior.

## Verified baseline (2026-07-21)

- No `.github/workflows/` and no hooks: every gate depends on the operator remembering to run `npm run check`.
- Layer boundaries are **currently clean** (`src/core/` has zero imports from presentation/ui/runtime/harness) — enforcement is prevention, not cleanup.
- The A6 determinism harness was temporary; its baseline lived in a scratchpad and is gone. Determinism is once again guarded only by unit tests, which the model-tier notes explicitly call insufficient.
- `PixiGameRenderer.ts` (1,349 lines) holds gameplay input state (`pointerMode`, `dashDistance`, `pointerCell`) alongside snapshot projection, three preview painters, board/telegraph/debug drawing, and asset loading.
- `world.ts` facade: 42 substantive methods + 40 pure delegations. New enemy behaviors no longer touch it (A2/A3 hooks), but new _systems_ still default to adding facade methods.
- Content schema diagnostics have no UI or harness consumer; validation throws at catalog import. Shape checking duplicates what the TS compiler already guarantees for compiled-in content; only the semantic checks (cross-references, uniqueness, kind/shape compatibility) carry information.
- `tsconfig.app.json` has `strict` + `noUncheckedIndexedAccess` but not `exactOptionalPropertyTypes` / `noImplicitOverride`; `verbatimModuleSyntax` exists only in the node config.
- Two files named `run-build.ts` exist (`core/rewards/` pure offer policy from port_09; `core/world/` A6 state owner) — a naming collision, not a duplication of responsibility.

## Child specs (execute in order)

| Spec                                                                                                                 | Scope                                                                                             | Gates                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [a — Boundary enforcement](engineering_hardening_a_boundary_enforcement.implementation_spec.md)                      | run-build rename, path aliases, dependency-cruiser rules, knip, `npm run check` integration       | none                                                                 |
| [b — CI, command log, golden determinism](engineering_hardening_b_ci_command_log_determinism.implementation_spec.md) | GitHub Actions workflow, GameRuntime command log + export, permanent golden-file determinism test | a (aliases/gates land first so CI runs the final `check`)            |
| [c — Renderer split](engineering_hardening_c_renderer_split.implementation_spec.md)                                  | InputController / PreviewPainter / BoardPainter out of PixiGameRenderer                           | b (CI protects the split); blocks character child spec B and port_11 |
| [d — Capability interfaces](engineering_hardening_d_capability_interfaces.implementation_spec.md)                    | Phases receive narrow subsystem handles instead of `World`; facade growth stops                   | b; independent of c                                                  |

## Deferred (deliberately no spec now)

- **Command log + replay (spec b1)**: deferred to port_10, when the save format actually consumes it. Nothing in the golden test or CI needs it — the golden harness drives the core directly through `resolveCommand`, not the runtime's command log — so building the export/replay substrate now would be ahead of need. Revisit as the port_10 save substrate.
- **Reward-selection coverage in the determinism golden**: the golden's rewards scenario currently exercises wave spawning, not reward selection, because the fixed command walk never clears a wave to produce an offer (`test/unit/determinism/golden-harness.ts`). Reward-offer generation and selection determinism is covered directly by `wave-phase.test.ts`. If cross-cutting reward-selection coverage in the golden is wanted, drive the reward arena to a wave clear deterministically (adapt the `clearWaveOne` helper in `wave-phase.test.ts` onto the command path) rather than scripting the bot to fight — the brittle path that removed the victory e2e.
- **knip burn-down to zero, then gate**: spec a landed knip in report mode (`npm run check:unused`), not in `check`. The baseline is ~74 items, most of which are deliberate extension surface awaiting their consumer, not dead code — `RunBuild`/`WaveRuntime`/`CombatOperations`/`GridBoard` (spec d consumes them), `defineEnemyFeature`/`EnemyFeature`/`GenericEnemyPresenter` (character featurization mirrors them), the schema type aliases (still exported for authoring). Deleting them now fights that work. The burn-down is per-item judgment: for each finding, either delete a genuine orphan or give the export its intended consumer. Separately, confirm whether the Tauri desktop shell needs `@tauri-apps/api` before removing it (port_12 packaging may). Flip `check:unused` into `check` only once the baseline reaches zero.
- **`exactOptionalPropertyTypes` / `noImplicitOverride` / app-level `verbatimModuleSyntax`**: turning on `exactOptionalPropertyTypes` will force rewrites of the `restTicks: undefined`-style assignments in freshly landed A6 code. Do it as one dedicated commit after CI is live, never bundled with other work.
- **Type-aware lint rules** (e.g. `no-floating-promises`): wait for oxlint's type-aware support to mature, or add a minimal typescript-eslint CI job later. Not worth a second lint toolchain today.
- **`test/e2e/testbed.spec.ts` split** (1,285 lines): fold into port_11 when the e2e surface is next touched.
- **Schema validation to test time**: owned by [character_featurization_and_viking_split.md](character_featurization_and_viking_split.md) child spec C, which already rewrites the same schema files for the mobility-gate lift. Keep the semantic checks (cross-references, uniqueness, compatibility, per-mobility pool completeness) as a vitest catalog sweep; delete the runtime shape-validation plumbing. One surgery per file set.

## Non-goals

- No toolchain replacement (TS 7 native, Vite 8, Vitest 4, React 19, oxlint stay; treat TS 7.0.2 compiler quirks as a suspect when behavior is inexplicable).
- No state-management library; the runtime-owns-world, React-subscribes-snapshot model is correct.
- No snapshot copy-on-write; per-turn clone cost is irrelevant at current entity counts.
- No ECS; the partial-ECS plan keeps its own promotion gate untouched.

## Acceptance criteria

1. A layering or subsystem-isolation violation fails `npm run check` and CI — the rules in `dev/standards/` are enforced, not advisory.
2. Every PR runs format, lint, boundaries, unit tests, build, and Chromium e2e without operator memory.
3. A determinism regression on the three golden scenarios fails CI with a reviewable diff, and updating a golden file is a visible, deliberate act documented in `dev/standards/verification_tiers.md`.
4. A seed plus a command log reproduces any reported game state; the export exists in the debug API.
5. `PixiGameRenderer` no longer owns gameplay input state, and no painter concern spans files.
6. Adding a new capability lands on a subsystem, not on the `World` facade; the facade stops growing.
