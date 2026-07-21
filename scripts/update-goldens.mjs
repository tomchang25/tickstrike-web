// Regenerates the determinism goldens. Runs the golden test with UPDATE_GOLDENS
// set so it writes instead of asserting; the env var is passed through the
// child-process environment so this works on every OS shell. The regenerated
// files land in the working tree — review the diff before committing, and only
// commit it when the pull request intentionally changes a rule or content.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vitest", "run", "test/unit/determinism/determinism.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, UPDATE_GOLDENS: "1" },
});

process.exit(result.status ?? 1);
