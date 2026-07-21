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

/** Drives accepted commands until the run pauses, reporting whether it is a reward or a milestone. */
async function driveUntilPause(page: Page): Promise<"reward" | "milestone"> {
  return page.evaluate(async () => {
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

    for (let step = 0; step < 300; step += 1) {
      const state = api.getState();
      if (state.pendingReward) {
        return "reward";
      }
      if (state.pendingMilestone) {
        return "milestone";
      }
      const player = state.entities.find((entity) => entity.id === "player");
      if (!player) {
        throw new Error("Expected a player entity while driving the run.");
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
        throw new Error("No legal move toward the enemy while driving the run.");
      }
      await api.execute({ type: "move", actorId: "player", direction: toward });
    }
    throw new Error("Never reached a pause while driving the run.");
  });
}

async function selectFirstRewardCard(page: Page): Promise<void> {
  const offer = (await readState(page)).pendingReward;
  if (!offer) {
    throw new Error("Expected a pending reward offer.");
  }
  await page.getByTestId(`reward-card-${offer.cards[0]!.artifactId}`).click();
  await expect(page.getByTestId("reward-overlay")).toHaveCount(0);
}

test("clears a wave, takes a reward, and Continue Endless resumes into the next wave", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/debug?scenario=milestone");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  // Wave 1 → an ordinary reward pause, selected through the overlay.
  expect(await driveUntilPause(page)).toBe("reward");
  await selectFirstRewardCard(page);

  // Wave 2 is the milestone: the End Run / Continue Endless overlay opens.
  expect(await driveUntilPause(page)).toBe("milestone");
  await expect(page.getByTestId("milestone-overlay")).toBeVisible();

  // Gameplay input is inert while the milestone decision is open.
  const tickAtMilestone = (await readState(page)).tick;
  await page.evaluate(() =>
    window.__TICKSTRIKE__!.execute({ type: "move", actorId: "player", direction: { x: 0, y: 1 } }),
  );
  expect((await readState(page)).tick).toBe(tickAtMilestone);

  // Continue Endless opens the milestone wave's deferred reward; selecting it resumes into Wave 3.
  await page.getByTestId("milestone-continue-endless").click();
  await expect(page.getByTestId("milestone-overlay")).toHaveCount(0);
  const milestoneReward = await readState(page);
  expect(milestoneReward.pendingReward?.waveNumber).toBe(2);
  await selectFirstRewardCard(page);

  const resumed = await readState(page);
  expect(resumed.outcome).toBe("running");
  expect(resumed.waveRuntime?.waveNumber).toBe(3);

  // The decision was recorded as a milestone entry in the command log.
  const log = await page.evaluate(() => window.__TICKSTRIKE__!.exportCommandLog());
  expect(log.entries.some((entry) => entry.kind === "milestone")).toBe(true);
});

test("End Run finalizes victory and restart rebuilds the initial state", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/debug?scenario=milestone");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initial = await readState(page);
  expect(initial.tick).toBe(0);

  expect(await driveUntilPause(page)).toBe("reward");
  await selectFirstRewardCard(page);
  expect(await driveUntilPause(page)).toBe("milestone");

  // End Run finalizes the run as a victory with the terminal banner.
  await page.getByTestId("milestone-end-run").click();
  await expect(page.getByTestId("encounter-result")).toHaveAttribute("data-outcome", "victory");
  expect((await readState(page)).outcome).toBe("victory");

  // Restart rebuilds the fresh initial state and removes every overlay and banner.
  await page.evaluate(() => window.__TICKSTRIKE__!.reset());
  await expect(page.getByTestId("encounter-result")).toHaveCount(0);
  await expect(page.getByTestId("milestone-overlay")).toHaveCount(0);
  expect(await readState(page)).toEqual(initial);
});

test("the home page plays the full authored run", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const state = await readState(page);
  expect(state.outcome).toBe("running");
  // The run scenario installs the shipped catalog's Wave 1 (demo-01, population 3), distinguishing
  // it from the old tick-arena fixture, which ran no wave runtime.
  expect(state.waveRuntime?.waveNumber).toBe(1);
  expect(state.waveRuntime?.slots[0]?.remainingQueue).toHaveLength(3);

  // The overlay HUD projects the loaded run: full player HP and the wave label.
  const player = state.entities.find((entity) => entity.id === "player");
  await expect(page.getByTestId("hud-player-hp")).toHaveText(`${player?.hp} / ${player?.maxHp}`);
  await expect(page.getByTestId("hud-wave")).toHaveText("Wave 1");

  // The Build button opens the artifacts overview and closes it again.
  await expect(page.getByTestId("hud-build-overview")).toHaveCount(0);
  await page.getByTestId("hud-build-button").click();
  await expect(page.getByTestId("hud-build-overview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hud-build-overview")).toHaveCount(0);
});
