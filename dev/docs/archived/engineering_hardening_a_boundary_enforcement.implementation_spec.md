# Hardening a — Boundary Enforcement (Implementation Spec)

> **Parent**: [engineering_hardening.md](engineering_hardening.md)
> **Suggested tier**: Sonnet-class throughout (tool configuration and mechanical renames; the unit suite and the new gates themselves catch mistakes). One step is a mass-rewrite of import paths — run it as its own commit so the diff is trivially auditable.

## Goal

Make the layering rules in `dev/standards/` machine-enforced: rename the colliding module, introduce path aliases, add dependency-cruiser and knip, and wire both into `npm run check` so a violation is a red build, not a review comment.

## Steps (one commit each, tests green after each)

### a1 — Rename `core/rewards/run-build.ts` → `core/rewards/reward-offers.ts`

The module's content is offer generation and eligibility policy; "run-build" was the port_09 child name, and it now collides with the A6 state owner `core/world/run-build.ts`. Rename the file and its test (`test/unit/core/rewards/run-build.test.ts` → `reward-offers.test.ts`), update the single import in `wave-phase.ts`. No API or behavior change.

### a2 — Path aliases

Add `tsconfig` `paths` + Vite `resolve.alias` for the top-level `src/` layers: `@core/*`, `@content/*`, `@presentation/*`, `@runtime/*`, `@harness/*`, `@ui/*`, `@app/*`, `@platform/*`, `@shared/*`. Vitest inherits the Vite config; verify Playwright (which tests the built app) needs nothing.

Migration policy: convert **cross-layer** imports to aliases in one mechanical commit (`../../core/...` → `@core/...`); same-layer relative imports stay relative. From then on, a `../..` that crosses a layer boundary is itself a smell the next step can forbid.

### a3 — dependency-cruiser

Add `dependency-cruiser` with rules expressing the standards that today are prose:

1. **Layering** — `core` imports only `core`; `content` imports only `content`/`core`; `presentation` imports only `presentation`/`content`/`core`; `harness` imports only `harness`/`content`/`core`; `runtime`, `ui`, `app` per their current (clean) dependency sets, captured from the actual graph at adoption time and then frozen.
2. **World subsystem isolation** (A6 acceptance #4) — `grid-board` / `wave-runtime` / `run-build` / `combat-operations` must not import each other, with the single recorded exception `combat-operations → grid-board` (type + constructor-injected handle).
3. **Registry-only feature access** (gameplay_feature_architecture) — outside `core/enemies/behaviors/`, only `behaviors/index.ts` may be imported; same shape for `presentation/timelines/enemy-presenters/` and `content/enemies/features/`.
4. **No circular dependencies** anywhere in `src/`.

Wire as `npm run check:boundaries`, included in `npm run check` before tests.

### a4 — knip

Add knip for dead exports/files/dependencies. First land in **report mode** and burn down real findings (a long-lived port accumulates orphans); flip to a blocking `check` step only once the baseline is zero, in the same spec if the burn-down is small, otherwise record the follow-up in the parent plan.

### a5 — Documentation sync

Update `dev/standards/gameplay_feature_architecture.md` and `dev/standards/project_structure.md` to state that the boundary rules are enforced by `check:boundaries` (pointing at the rule file), so the prose and the machine can be cross-checked instead of drifting apart.

## Out of scope

- Any behavioral change, any runtime code beyond import-path text.
- CI (spec b consumes the gates this spec creates).
- Forbidding same-layer relative imports.

## Acceptance criteria

1. An added import from `core` to `presentation` (or between World subsystems, or deep into a feature directory) fails `npm run check`.
2. `git grep "\.\./\.\./"` inside `src/` returns no cross-layer hits.
3. knip reports zero dead exports, or the remaining burn-down is recorded in the parent plan.
4. Full suite, build, and e2e pass; no snapshot/e2e diffs (the change is import-text only).
