import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import { canvasPointForCell } from "./canvas-geometry";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Charge owns sequential Player motion before reconciling the final cell", async ({ page }) => {
  await page.goto("/debug?scenario=charge-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");

  const executeLeft = () =>
    page.evaluate(async () => {
      const api = window.__TICKSTRIKE__;
      if (!api) {
        throw new Error("Tickstrike debug API is unavailable.");
      }
      await api.execute({ type: "move", actorId: "player", direction: { x: -1, y: 0 } });
    });
  const canvas = page.getByTestId("game-canvas");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Game canvas has no layout box.");
  }
  const finalCellCenterX = canvasPointForCell(canvasBox, 3, 3).x;

  await executeLeft();
  await executeLeft();
  await executeLeft();

  const inMotion = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const bounds = api?.getEntityBounds("player");
    if (!api || !bounds) {
      throw new Error("Charge motion bounds are unavailable.");
    }
    const state = api.getState();
    return {
      logicalCell: state.entities.find((entity) => entity.id === "player")?.cell,
      visualCenterX: bounds.x + bounds.width / 2,
    };
  });
  expect(inMotion.logicalCell).toEqual({ x: 3, y: 3 });
  expect(inMotion.visualCenterX).toBeGreaterThan(finalCellCenterX);

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-x", "8");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("event-log")).toContainText("entity_displaced");
  await expect(page.getByTestId("event-log")).toContainText("charge_landed");

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const settledCenterX = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    const bounds = api?.getEntityBounds("player");
    if (!api || !canvas || !bounds) {
      throw new Error("Settled Charge bounds are unavailable.");
    }
    return bounds.x + bounds.width / 2;
  });
  expect(Math.abs(Math.round(settledCenterX - finalCellCenterX))).toBe(0);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "2");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-player-animation", "idle");
});

test("Charge retains its facing-direction telegraph when the Player moves aside", async ({ page }) => {
  await page.goto("/debug?scenario=charge-enemy");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: -1, y: 0 } });
  });
  await expect(page.getByTestId("entity-enemy-charge")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-telegraph-labels", /8,3:2.*7,3:2.*6,3:2/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("entity-enemy-charge")).toHaveAttribute("data-attack-warning-ticks", "1");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-telegraph-labels", /8,3:1.*7,3:1.*6,3:1/);
});
