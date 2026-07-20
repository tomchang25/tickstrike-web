import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Clearing Wave 1 pauses on an attack_up offer, selection resumes Wave 2, and reset clears it", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto("/?scenario=rewards");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initial = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(initial?.tick).toBe(0);
  expect(initial?.pendingReward).toBeUndefined();
  expect(initial?.runBuild).toEqual({ stacks: {} });
  expect(initial?.waveRuntime).toMatchObject({ waveNumber: 1 });
  const baseDamage = initial?.entities.find((entity) => entity.id === "player")?.normalAttackDamage;
  expect(baseDamage).toBeGreaterThan(0);

  // The first accepted command admits Wave 1's single passive enemy.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });
  const spawned = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(spawned?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(1);

  // Chase the single passive (no enemyAction) enemy down with a bounded, deterministic loop
  // driven only by accepted commands, then kill it with one Normal Attack.
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
    const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x === b.x && a.y === b.y;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    for (let step = 0; step < 60; step += 1) {
      const state = api.getState();
      const player = state.entities.find((entity) => entity.id === "player");
      const enemy = state.entities.find(
        (entity) => entity.kind === "enemy" && entity.phase === "alive",
      );
      if (!player || !enemy) {
        break;
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
        if (
          cell.x < 0 ||
          cell.y < 0 ||
          cell.x >= state.arena.width ||
          cell.y >= state.arena.height
        ) {
          return false;
        }
        const index = cell.y * state.arena.width + cell.x;
        if (state.arena.tiles[index] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) => entity.phase === "alive" && sameCell(entity.cell, cell),
        );
      });
      const toward = [...candidates].sort((a, b) => {
        const nextA = { x: player.cell.x + a.x, y: player.cell.y + a.y };
        const nextB = { x: player.cell.x + b.x, y: player.cell.y + b.y };
        return distance(nextA, enemy.cell) - distance(nextB, enemy.cell);
      })[0];
      if (!toward) {
        break;
      }
      await api.execute({ type: "move", actorId: "player", direction: toward });
    }
  });

  const paused = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(
    paused?.entities.filter((entity) => entity.kind === "enemy" && entity.phase === "alive"),
  ).toHaveLength(0);
  expect(paused?.pendingReward).toEqual({
    waveNumber: 1,
    cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
  });
  expect(paused?.waveRuntime).toMatchObject({ waveNumber: 1 });

  // The overlay is visible with a real, labeled button for the sole card.
  const overlay = page.getByTestId("reward-overlay");
  await expect(overlay).toBeVisible();
  const card = page.getByTestId("reward-card-attack_up");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Sharpened Edge");

  // A command submitted while paused changes nothing: no tick, no wave change.
  const tickBeforeReject = paused?.tick;
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    await api?.execute({ type: "move", actorId: "player", direction: { x: 0, y: 1 } });
  });
  const afterRejectedCommand = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(afterRejectedCommand?.tick).toBe(tickBeforeReject);
  expect(afterRejectedCommand?.pendingReward).toBeDefined();

  // A keyboard move is also inert while the overlay owns focus: supplementary React-level guard.
  await page.keyboard.press("d");
  const afterKeyboard = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(afterKeyboard?.tick).toBe(tickBeforeReject);

  // Selecting the reward via the real button raises damage and resumes into Wave 2, unspawned.
  await card.click();
  await expect(overlay).toHaveCount(0);
  const selected = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(selected?.pendingReward).toBeUndefined();
  expect(selected?.runBuild).toEqual({ stacks: { attack_up: 1 } });
  expect(selected?.entities.find((entity) => entity.id === "player")?.normalAttackDamage).toBe(
    (baseDamage ?? 0) + 10,
  );
  expect(selected?.waveRuntime).toMatchObject({ waveNumber: 2 });
  expect(selected?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);
  expect(selected?.telegraphs).toHaveLength(0);
  expect(selected?.tick).toBe(tickBeforeReject);

  // Wave 2 only warns on the next accepted command, following the existing spawn-warning path.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    await api?.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });
  const wave2Warned = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(wave2Warned?.telegraphs).toHaveLength(1);
  expect(wave2Warned?.telegraphs[0]).toMatchObject({ phase: "spawning" });

  // Reset restores initial player damage with no stale offer, stacks, or UI.
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset?.pendingReward).toBeUndefined();
  expect(reset?.runBuild).toEqual({ stacks: {} });
  expect(reset?.entities.find((entity) => entity.id === "player")?.normalAttackDamage).toBe(
    baseDamage,
  );
  expect(reset?.waveRuntime).toMatchObject({ waveNumber: 1 });
  await expect(page.getByTestId("reward-overlay")).toHaveCount(0);
});
