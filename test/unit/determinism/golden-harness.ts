/// <reference types="node" />
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCommand } from "@core/actions/action-resolver";
import { resolveRewardSelection } from "@core/actions/wave-phase";
import type { GameCommand } from "@core/actions/commands";
import type { Cell } from "@core/model/types";
import type { TestScenario } from "@harness/types";
import { scenarios as chargeScenarios } from "@harness/scenarios/charge-enemy.scenario";
import { scenarios as rewardScenarios } from "@harness/scenarios/rewards.scenario";
import { scenarios as waveScenarios } from "@harness/scenarios/waves.scenario";

/**
 * The deterministic contract under guard: for a fixed seed and command sequence,
 * the core must produce the same accepted flags, the same ordered semantic events,
 * and the same final snapshot. These three scenarios exercise Charge detonation
 * and displacement, and two arenas of wave spawning and telegraphing — the
 * cross-cutting event interleaving a refactor perturbs without a targeted unit
 * test noticing.
 *
 * The reward-selection branch below fires only when the walk produces a pending
 * offer, which needs a wave clear the fixed script does not attempt; reward-offer
 * and selection determinism is covered directly by `wave-phase.test.ts` instead.
 * See the determinism follow-up in `dev/docs/plans/engineering_hardening.md`.
 *
 * The harness drives the core directly through `resolveCommand`, with no runtime
 * and no presentation, so the golden captures the simulation alone.
 */
export const GOLDEN_SCENARIOS: readonly {
  readonly name: string;
  readonly scenario: TestScenario;
}[] = [
  { name: "charge-enemy", scenario: chargeScenarios[0]! },
  { name: "rewards", scenario: rewardScenarios[0]! },
  { name: "waves", scenario: waveScenarios[0]! },
];

const L: Cell = { x: -1, y: 0 };
const R: Cell = { x: 1, y: 0 };
const U: Cell = { x: 0, y: -1 };
const D: Cell = { x: 0, y: 1 };

/**
 * A fixed, meaningless-on-purpose command walk. Its only job is to drive enough
 * varied core activity that a determinism regression has somewhere to show; it is
 * not a play-through and does not aim to clear anything.
 */
export function commandScript(): GameCommand[] {
  const directions = [L, L, L, U, R, D, L, U, U, R, R, D, D, L, U, R, L, D, U, L];
  const commands: GameCommand[] = [];
  directions.forEach((direction, index) => {
    commands.push({ type: "move", actorId: "player", direction });
    if (index % 3 === 1) {
      commands.push({ type: "attack", actorId: "player", direction });
    }
    if (index % 7 === 3) {
      commands.push({ type: "dash", actorId: "player", direction });
    }
  });
  return commands;
}

export function runScenario(scenario: TestScenario): unknown[] {
  const world = scenario.createWorld(scenario.seed);
  const log: unknown[] = [];
  for (const command of commandScript()) {
    const resolution = resolveCommand(world, command, scenario.waveContext);
    log.push({ command, accepted: resolution.accepted, events: resolution.events });
    if (scenario.waveContext) {
      const offer = world.pendingRewardOffer;
      const card = offer?.cards[0];
      if (card) {
        const selection = resolveRewardSelection(world, card.artifactId, scenario.waveContext);
        log.push({
          reward: card.artifactId,
          accepted: selection.accepted,
          events: selection.events,
        });
      }
    }
    if (world.outcome !== "running") {
      break;
    }
  }
  log.push({ snapshot: world.snapshot() });
  return log;
}

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "__golden__");

export function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.json`);
}

export function serialize(result: unknown): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
