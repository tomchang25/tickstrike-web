import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

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
  await executeLeft();
  await executeLeft();
  await executeLeft();

  const canvas = page.getByTestId("game-canvas");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-x", "8");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("event-log")).toContainText("entity_displaced");
  await expect(page.getByTestId("event-log")).toContainText("charge_landed");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(false);

  const inMotion = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    const bounds = api?.getEntityBounds("player");
    if (!api || !canvas || !bounds) {
      throw new Error("Charge motion bounds are unavailable.");
    }
    const rect = canvas.getBoundingClientRect();
    const state = api.getState();
    return {
      logicalCell: state.entities.find((entity) => entity.id === "player")?.cell,
      visualCenterX: bounds.x + bounds.width / 2,
      finalCellCenterX: rect.left + (3.5 / 12) * rect.width,
    };
  });
  expect(inMotion.logicalCell).toEqual({ x: 3, y: 3 });
  expect(inMotion.visualCenterX).toBeGreaterThan(inMotion.finalCellCenterX);

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const settled = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    const bounds = api?.getEntityBounds("player");
    if (!api || !canvas || !bounds) {
      throw new Error("Settled Charge bounds are unavailable.");
    }
    const rect = canvas.getBoundingClientRect();
    // Absolute pixel offset from the final cell's center; Math.abs also folds Math.round's -0 into 0
    // so a sub-pixel-negative-but-centered result still satisfies the strict toBe(0) below.
    return Math.abs(Math.round(bounds.x + bounds.width / 2 - (rect.left + (3.5 / 12) * rect.width)));
  });
  expect(settled).toBe(0);

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
