import { expect, test, type Page } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import type { WorldSnapshot } from "../../src/core/model/types";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

async function readState(page: Page): Promise<WorldSnapshot> {
  const state = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  if (!state) {
    throw new Error("Expected a world snapshot from the debug API.");
  }
  return state;
}

/** Drives accepted commands until a reward offer is pending, then selects its first card. */
async function clearWaveAndSelectReward(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    const DIRECTIONS = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    for (let step = 0; step < 200; step += 1) {
      const state = api.getState();
      if (state.pendingReward) {
        await api.selectReward(state.pendingReward.cards[0]!.artifactId);
        return;
      }
      const player = state.entities.find((entity) => entity.id === "player");
      if (!player) {
        return;
      }
      const enemy = state.entities.find((entity) => entity.kind === "enemy" && entity.phase === "alive");
      if (!enemy) {
        await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
        continue;
      }
      if (distance(player.cell, enemy.cell) === 1) {
        await api.execute({
          type: "attack",
          actorId: "player",
          direction: { x: enemy.cell.x - player.cell.x, y: enemy.cell.y - player.cell.y },
        });
        continue;
      }
      const candidates = DIRECTIONS.filter((direction) => {
        const cell = { x: player.cell.x + direction.x, y: player.cell.y + direction.y };
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some((entity) => entity.phase === "alive" && sameCell(entity.cell, cell));
      });
      const toward = [...candidates].sort((a, b) => {
        const nextA = { x: player.cell.x + a.x, y: player.cell.y + a.y };
        const nextB = { x: player.cell.x + b.x, y: player.cell.y + b.y };
        return distance(nextA, enemy.cell) - distance(nextB, enemy.cell);
      })[0];
      if (!toward) {
        return;
      }
      await api.execute({ type: "move", actorId: "player", direction: toward });
    }
  });
}

test("records accepted commands and a reward, clears on reset, and replays to an identical snapshot", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/debug?scenario=rewards");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await clearWaveAndSelectReward(page);
  const recorded = await readState(page);
  expect(recorded.pendingReward).toBeUndefined();

  const log = await page.evaluate(() => window.__TICKSTRIKE__!.exportCommandLog());
  // The log records the scenario identity plus at least one command and the reward selection.
  expect(log.scenarioId).toBe("rewards");
  expect(log.entries.some((entry) => entry.kind === "command")).toBe(true);
  expect(log.entries.some((entry) => entry.kind === "reward")).toBe(true);

  // Reset clears the log for the fresh run identity.
  await page.evaluate(() => window.__TICKSTRIKE__!.reset());
  const afterReset = await page.evaluate(() => window.__TICKSTRIKE__!.exportCommandLog());
  expect(afterReset.entries).toEqual([]);

  // Replaying the exported seed and log reproduces the recorded final snapshot exactly.
  await page.evaluate(async (replayLog) => {
    await window.__TICKSTRIKE__!.replayCommandLog(replayLog);
  }, log);
  const replayed = await readState(page);
  expect(replayed).toEqual(recorded);
});

test("records a windup cancel that leaves the Tick unchanged and replays identically", async ({ page }) => {
  await page.goto("/debug?scenario=smash-water");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  // Arm a Smash windup, then cancel it directly.
  await page.evaluate(() =>
    window.__TICKSTRIKE__!.execute({ type: "smash", actorId: "player", target: { x: 4, y: 3 } }),
  );
  const armed = await readState(page);
  expect(armed.armedSmashTarget).toEqual({ x: 4, y: 3 });
  const tickAfterArm = armed.tick;

  await page.evaluate(() => window.__TICKSTRIKE__!.cancelArmedSmash());
  const cancelled = await readState(page);
  expect(cancelled.armedSmashTarget).toBeUndefined();
  expect(cancelled.tick).toBe(tickAfterArm);

  const log = await page.evaluate(() => window.__TICKSTRIKE__!.exportCommandLog());
  expect(log.scenarioId).toBe("smash-water");
  expect(log.entries.some((entry) => entry.kind === "command")).toBe(true);
  expect(log.entries.some((entry) => entry.kind === "cancel")).toBe(true);

  const recorded = await readState(page);
  await page.evaluate(async (replayLog) => {
    await window.__TICKSTRIKE__!.replayCommandLog(replayLog);
  }, log);
  const replayed = await readState(page);
  expect(replayed).toEqual(recorded);
});
