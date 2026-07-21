import type { GameCommand } from "@core/actions/commands";
import type { MilestoneChoice, Seed } from "@core/model/types";

/**
 * One accepted input in a run: a gameplay command, a reward selection, a milestone decision, or a
 * windup cancel. The cancel carries no payload — a run has at most one armed Smash at a time.
 */
export type RunCommandLogEntry =
  | { readonly kind: "command"; readonly command: GameCommand }
  | { readonly kind: "reward"; readonly artifactId: string }
  | { readonly kind: "milestone"; readonly choice: MilestoneChoice }
  | { readonly kind: "cancel" };

/**
 * An append-only record of a single run's accepted inputs, plus the scenario identity and seed
 * needed to reconstruct its world. A seed and its log replayed through the runtime's public
 * entrances reproduce the run's final state. The seed is the scenario's own `Seed | undefined`, so
 * an undefined seed round-trips (through JSON omission included) back to the fixture's own default.
 */
export interface RunCommandLog {
  readonly scenarioId: string;
  readonly seed: Seed | undefined;
  readonly entries: readonly RunCommandLogEntry[];
}

function cloneEntry(entry: RunCommandLogEntry): RunCommandLogEntry {
  switch (entry.kind) {
    case "command":
      return { kind: "command", command: structuredClone(entry.command) };
    case "reward":
      return { kind: "reward", artifactId: entry.artifactId };
    case "milestone":
      return { kind: "milestone", choice: entry.choice };
    case "cancel":
      return { kind: "cancel" };
  }
}

/** Deep-copies a log so an exported reference cannot mutate runtime state. */
export function cloneCommandLog(log: RunCommandLog): RunCommandLog {
  return {
    scenarioId: log.scenarioId,
    seed: log.seed,
    entries: log.entries.map(cloneEntry),
  };
}
