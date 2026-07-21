# Test Operations

This file is the authoritative project-local test and Web React validation contract for Tickstrike Web. Every agent-run static check, unit test, component test, application test, build smoke, browser check, or accessibility validation must follow this file.

## When To Run

Use the narrowest available layer that proves the changed behavior. Follow the selected Web React platform standards, then map their required coverage to the concrete project commands declared here.

## Environment And Preparation

Use Node.js 22.12 or newer with the npm lockfile. Run `npm install` when dependencies are absent or the lockfile changed. The offline sprite-animation tool requires Python plus Pillow from `dev/tools/sprite-animation/requirements.txt`; install it with `python -m pip install --user -r dev/tools/sprite-animation/requirements.txt` before running its test. Playwright browser tests require Chromium installed through `npx playwright install chromium`; do not install it unless browser coverage is required.

## Available Layers

- Format check: Prettier verifies the configured formatting contract without modifying files.
- Lint: Oxlint verifies TypeScript, TSX, and control-flow style rules.
- Unit: Vitest tests under `test/unit/`.
- Build smoke: TypeScript project compilation followed by the Vite production export to `build/`.
- Browser acceptance: Playwright tests under `test/e2e/` against the Vite development server.
- Sprite animation tooling: Python tests under `test/unit/tools/` for the offline compiler, validator, preview output, and catalog preflight behavior.
- Component and accessibility layers are not configured yet.

## Commands And Pass Criteria

- `npm run format`: applies Prettier formatting to eligible project files; this is a mutation command, not a pass/fail verification layer.
- `npm run format:check`: passes when every eligible project file conforms to the Prettier configuration.
- `npm run lint`: passes when Oxlint finds no violations in eligible TypeScript and TSX files.
- `npm run lint:fix`: applies Oxlint's safe automatic fixes; this is a mutation command, not a pass/fail verification layer.
- `npm test`: passes when Vitest exits successfully with every unit assertion passing.
- `npm run build`: passes when TypeScript and Vite exit successfully and produce the Web export in `build/`.
- `npm run test:e2e`: passes when Playwright starts or reuses the development server and every Chromium scenario passes. On browser launch failure, distinguish a missing browser installation from an application test failure.
- `python test/unit/tools/sprite_animation_test.py`: passes when the deterministic sprite compiler produces 64x128 sheets with direction columns, validates manifests, creates optional previews, generates every current water target, and rejects a batch with an unknown effect before writing output.
- `npm run verify`: canonical non-browser verification; runs the format check, lint, unit tests, and production build.

Use the default command timeout for unit and build checks. Browser checks may use Playwright's configured test and server timeouts; do not replace readiness with arbitrary sleeps.

## Browser Acceptance Run Policy

CI runs the full Chromium suite on every push and pull request; a full local `npm run test:e2e` run duplicates that gate and is reserved for at most one closeout run per spec or plan — or skipped entirely in favor of CI. It is never a per-commit or per-step gate.

Per-commit browser verification uses a targeted selection covering the changed behavior — `npx playwright test -g "<test name>"` or `npx playwright test <file>.spec.ts:<line>` — kept to a handful of tests. When a plan or spec says "e2e green after each commit", satisfy it with the targeted selection locally and let CI cover the full suite after push.

A PreToolUse hook in `.claude/settings.json` (`.claude/hooks/block-full-e2e.mjs`) mechanically rejects unfiltered `test:e2e` and `playwright test` commands; keep this policy and that hook in step.

## Determining A Result

A layer passes or fails according to the exit status of its command, never according to a filtered view of its output. Piping a verification command into `grep`, `tail`, or `head` replaces its exit status with the filter's, so the failure signal is discarded and a summary line such as `25 passed` can be read while the `3 failed` line above it is not. When a summary is wanted, let the command complete and establish its exit status first, then read the output separately.

For a suite, report the executed, passed, failed, and skipped counts, and reconcile them against the total the suite declares — `npx playwright test --list` for browser acceptance, the file and test counts Vitest prints for unit. A passed count on its own is not evidence that a suite passed.

Counts that differ between runs of unchanged source are a defect to investigate, not noise to average over. They mean either a flaky assertion or interference between concurrent runs.

## Result Reporting

Report every layer actually run, the source state tested, the pass/fail result, any expected noise that affected interpretation, and every verification gap or manual-only boundary.

`npm run verify` excludes browser acceptance. Its passing says nothing about `npm run test:e2e`; report the two separately and never let one stand in for the other.

Never run two browser acceptance suites at once. Both drive the same development server on the port `vite.config.ts` pins with `strictPort`, so concurrent runs fight over it and produce counts that describe neither run.
