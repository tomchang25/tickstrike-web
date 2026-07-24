import { describe, expect, it } from "vitest";
import { requireScenario } from "@harness/scenario-registry";
import { GameRuntime } from "@runtime/game-runtime";
import type { Cell, WorldSnapshot } from "@core/model/types";

const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const DIRECTIONS: readonly Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Drives accepted commands headlessly until the run pauses on its first reward offer, then selects
 * the first card. The milestone fixture's single passive 1-HP grunt spawns in the player-ring band,
 * so this reaches a reward in a handful of moves — enough to record command and reward entries for
 * the replay assertion without a browser or a long pathfinding walk.
 */
async function clearWaveAndTakeReward(runtime: GameRuntime): Promise<void> {
  for (let step = 0; step < 60; step += 1) {
    const state = runtime.snapshot();
    if (state.pendingReward) {
      await runtime.selectReward(state.pendingReward.cards[0]!.artifactId);
      return;
    }
    const player = state.entities.find((entity) => entity.id === "player");
    if (!player) {
      throw new Error("Expected a player entity while driving the run.");
    }
    const enemy = state.entities.find((entity) => entity.kind === "enemy" && entity.phase === "alive");
    if (!enemy) {
      await runtime.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
      continue;
    }
    if (manhattan(player.cell, enemy.cell) === 1) {
      await runtime.execute({
        type: "attack",
        actorId: "player",
        direction: { x: enemy.cell.x - player.cell.x, y: enemy.cell.y - player.cell.y },
      });
      continue;
    }
    const toward = [...DIRECTIONS]
      .filter((direction) => {
        const cell = { x: player.cell.x + direction.x, y: player.cell.y + direction.y };
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some((entity) => entity.phase === "alive" && sameCell(entity.cell, cell));
      })
      .sort(
        (a, b) =>
          manhattan({ x: player.cell.x + a.x, y: player.cell.y + a.y }, enemy.cell) -
          manhattan({ x: player.cell.x + b.x, y: player.cell.y + b.y }, enemy.cell),
      )[0];
    if (!toward) {
      throw new Error("No legal move toward the enemy while driving the run.");
    }
    await runtime.execute({ type: "move", actorId: "player", direction: toward });
  }
  throw new Error("Never reached a reward offer while driving the run.");
}

describe("GameRuntime command-log replay", () => {
  it("records commands and a reward, clears the log on reset, and replays to an identical snapshot", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("milestone"));

    await clearWaveAndTakeReward(runtime);
    const recorded: WorldSnapshot = runtime.snapshot();
    expect(recorded.pendingReward).toBeUndefined();

    const log = runtime.exportCommandLog();
    expect(log.scenarioId).toBe("milestone");
    expect(log.entries.some((entry) => entry.kind === "command")).toBe(true);
    expect(log.entries.some((entry) => entry.kind === "reward")).toBe(true);

    // Reset abandons the recorded run identity, leaving an empty log.
    runtime.reset();
    expect(runtime.exportCommandLog().entries).toEqual([]);

    // Replaying the exported seed and log reproduces the recorded final snapshot exactly.
    const replayed = await runtime.replayCommandLog(requireScenario(log.scenarioId), log);
    expect(replayed).toEqual(recorded);
  });

  it("records and replays an armed-Smash windup cancel that leaves the tick unchanged", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("smash-water"));

    await runtime.execute({ type: "smash", actorId: "player", target: { x: 4, y: 3 } });
    const armed = runtime.snapshot();
    expect(armed.armedSmashTarget).toEqual({ x: 4, y: 3 });

    await runtime.cancelArmedSmash();
    const cancelled = runtime.snapshot();
    expect(cancelled.armedSmashTarget).toBeUndefined();
    expect(cancelled.tick).toBe(armed.tick);

    const log = runtime.exportCommandLog();
    expect(log.scenarioId).toBe("smash-water");
    expect(log.entries.some((entry) => entry.kind === "command")).toBe(true);
    expect(log.entries.some((entry) => entry.kind === "cancel")).toBe(true);

    const replayed = await runtime.replayCommandLog(requireScenario(log.scenarioId), log);
    expect(replayed).toEqual(cancelled);
  });
});
