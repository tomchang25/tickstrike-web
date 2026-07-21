import { describe, expect, it } from "vitest";
import { cloneCommandLog, type RunCommandLog } from "@runtime/command-log";

const SAMPLE: RunCommandLog = {
  scenarioId: "waves",
  seed: "waves-foundation",
  entries: [
    { kind: "command", command: { type: "move", actorId: "player", direction: { x: 1, y: 0 } } },
    { kind: "reward", artifactId: "attack_up" },
    { kind: "milestone", choice: "continue-endless" },
    { kind: "cancel" },
  ],
};

describe("cloneCommandLog", () => {
  it("produces a structurally equal but independent copy", () => {
    const copy = cloneCommandLog(SAMPLE);
    expect(copy).toEqual(SAMPLE);
    expect(copy).not.toBe(SAMPLE);
    expect(copy.entries).not.toBe(SAMPLE.entries);
  });

  it("deep-copies a command entry so mutating the copy cannot reach the original", () => {
    const source: RunCommandLog = {
      scenarioId: "waves",
      seed: 1,
      entries: [{ kind: "command", command: { type: "move", actorId: "player", direction: { x: 1, y: 0 } } }],
    };
    const copy = cloneCommandLog(source);
    const copiedEntry = copy.entries[0];
    if (copiedEntry?.kind !== "command" || copiedEntry.command.type !== "move") {
      throw new Error("Expected a cloned move command entry.");
    }
    (copiedEntry.command.direction as { x: number }).x = 99;

    const originalEntry = source.entries[0];
    if (originalEntry?.kind !== "command" || originalEntry.command.type !== "move") {
      throw new Error("Expected the original move command entry.");
    }
    expect(originalEntry.command.direction).toEqual({ x: 1, y: 0 });
  });

  it("preserves an undefined seed", () => {
    const copy = cloneCommandLog({ scenarioId: "x", seed: undefined, entries: [] });
    expect(copy.seed).toBeUndefined();
  });
});
