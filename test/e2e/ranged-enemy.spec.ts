import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Ranged enemy moves into its band, locks Cross cells, recovers, and resets cleanly", async ({ page }) => {
  await page.goto("/debug?scenario=ranged-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "resting");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-cell-y", "3");
  const movementState = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged"),
  );
  expect(movementState).toMatchObject({ cell: { x: 6, y: 3 }, lastDecision: "move" });
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:idle/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "ready");

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("3");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "2");
  const committed = await page.evaluate(
    () => window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged")?.committedAttack,
  );
  expect(committed).toMatchObject({
    metadata: { targetCenter: { x: 6, y: 6 } },
    cells: [
      { x: 6, y: 6 },
      { x: 6, y: 5 },
      { x: 6, y: 7 },
      { x: 7, y: 6 },
      { x: 5, y: 6 },
    ],
  });
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:prepareAttack/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "1");
  const lockedDuringWarning = await page.evaluate(
    () =>
      window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged")?.committedAttack?.cells,
  );
  expect(lockedDuringWarning).toEqual(committed?.cells);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "recovering");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-telegraph", "false");
  await expect(page.getByTestId("event-log")).toContainText("enemy_attack_detonated");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-telegraph-count", "0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:idle/);
});
