# Hardening b — CI, Command Log, and Golden Determinism (Implementation Spec)

> **Parent**: [engineering_hardening.md](engineering_hardening.md)
> **Prerequisite**: spec a (CI should run the finished `check`, boundaries included)
> **Suggested tier**: Sonnet-class for the workflow YAML and the log plumbing; have the golden-test design (b2) reviewed by an Opus/Fable-class pass or a human — it defines what "determinism regression" means from now on.

## Goal

Three pieces that form one guarantee: a command log makes any game state reproducible from `seed + commands`; a committed golden-file test turns the determinism contract into a diffable CI artifact; a GitHub Actions workflow runs every gate on every PR. After this, "tests green is not sufficient evidence of preserved determinism" stops being a warning in CLAUDE.md and becomes a checked property.

## Steps

### b1 — Command log and export

`GameRuntime.execute` and `selectReward` are already the only mutation entrances. Record every **accepted** job into an append-only log: `{ scenarioId, seed, entries: [{ kind: "command", command } | { kind: "reward", artifactId }] }`. Reset/scenario-replacement clears it. Expose on the debug API: `exportCommandLog(): string` (JSON) and `replayCommandLog(json)` — replay loads the scenario fresh and re-executes entries through the same public entrances with presentation skipped (`finishImmediately` per step or a headless drive through `resolveCommand`, whichever the harness already supports cleanly).

This is the substrate for bug reports ("attach the log"), for the golden test below, and for the port_10 save design (a save is a checkpoint snapshot plus, optionally, its log).

### b2 — Permanent golden determinism test

Reinstate the A6 harness shape as a permanent vitest spec:

- Scenarios: `charge-enemy`, `rewards`, `waves` (the same three the A6 acceptance named).
- A fixed scripted command sequence per scenario, chosen to exercise charge detonation/displacement, reward selection, and wave spawns (the A6 script is a known-good starting point).
- Serialize per-command accepted flags + full event sequences + the final snapshot; compare against a **committed** golden JSON under `test/unit/determinism/__golden__/`.
- On mismatch the assertion prints a structural diff; there is no auto-regeneration path in the test itself. Regeneration is an explicit script (`npm run golden:update`) whose output lands in the PR diff.

Update `dev/standards/verification_tiers.md` with the discipline: a golden update is only acceptable when the PR intentionally changes rules/content, the diff is reviewed line-by-line, and the commit message names the behavioral change that justifies it. An agent that updates a golden file to silence a red test without that justification is the exact failure this gate exists to catch.

### b3 — GitHub Actions workflow

`.github/workflows/ci.yml`, on PR and push to the default branch:

1. `npm ci` (Node 22, npm cache).
2. `npm run check` (format, lint, boundaries, unit incl. golden, build).
3. Playwright e2e, Chromium only, browsers cached; traces/screenshots uploaded as artifacts on failure.

CI runs Ubuntu; the sim is platform-independent (seeded RNG, no wall clock), so goldens generated on Windows must pass on Linux — if they do not, that is a real determinism bug to fix, not an environment to pin.

## Out of scope

- Save/load UX (port_10 owns it; this only builds the substrate).
- Replay UI; the debug API surface is enough.
- Branch protection settings (repo configuration, done by the owner in GitHub, not in this codebase).

## Acceptance criteria

1. `exportCommandLog` + `replayCommandLog` round-trips to an identical final snapshot for each golden scenario.
2. Deleting one event from a golden file makes `npm run check` fail with a readable diff; `npm run golden:update` regenerates it byte-identically.
3. A PR that changes combat ordering fails CI on the golden test even when every other unit test stays green.
4. CI passes from a clean clone on Ubuntu with no undeclared setup.
