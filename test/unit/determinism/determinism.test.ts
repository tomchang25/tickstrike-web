/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN_SCENARIOS, goldenPath, runScenario, serialize } from "./golden-harness";

/**
 * Golden determinism gate. A normal run — `npm test`, `npm run check`, CI — only
 * compares against the committed goldens and never writes them, so a mismatch
 * stays red until a human resolves it. Regeneration happens only through
 * `npm run golden:update`, which sets `UPDATE_GOLDENS` and lands the new goldens
 * in the diff for review. Updating a golden is only legitimate when the pull
 * request intentionally changes a rule or content; see
 * `dev/standards/verification_tiers.md`.
 */
const UPDATING = Boolean(process.env.UPDATE_GOLDENS);

describe("deterministic scenario goldens", () => {
  for (const { name, scenario } of GOLDEN_SCENARIOS) {
    it(name, () => {
      const produced = serialize(runScenario(scenario));
      const path = goldenPath(name);

      if (UPDATING) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, produced);
        return;
      }

      if (!existsSync(path)) {
        throw new Error(
          `Missing golden for "${name}" at ${path}. Run \`npm run golden:update\` to create it, and commit the result only if this behavior is intended.`,
        );
      }

      // String comparison so a mismatch prints the exact diverging lines.
      expect(produced).toBe(readFileSync(path, "utf8"));
    });
  }
});
