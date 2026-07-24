import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import { canvasPointForCell } from "./canvas-geometry";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Turn Order rail shows canonical order, exceptional badges, and cross-highlights", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const rail = page.getByTestId("turn-order-rail");
  await expect(rail).toBeVisible();
  const tokens = rail.locator(".turn-order-token");
  await expect(tokens).toHaveCount(6);
  await expect
    .poll(() => tokens.evaluateAll((items) => items.map((item) => item.getAttribute("data-entity-id"))))
    .toEqual(["player", "enemy-thrust", "enemy-slash", "enemy-ranged", "enemy-charge", "enemy-bomb"]);
  await expect(rail.locator(".turn-order-status")).toHaveCount(0);
  await expect(rail).not.toContainText("W1");

  const canvas = page.getByTestId("game-canvas");
  await page.getByTestId("turn-order-token-enemy-thrust").hover();
  await expect(canvas).toHaveAttribute("data-turn-order-hover", "enemy-thrust");
  await page.mouse.move(0, 0);
  await expect(canvas).not.toHaveAttribute("data-turn-order-hover");

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Game canvas has no layout box.");
  }
  const enemyPoint = canvasPointForCell(canvasBox, 8, 6);
  await page.mouse.move(enemyPoint.x, enemyPoint.y);
  await expect(page.getByTestId("turn-order-token-enemy-slash")).toHaveAttribute("data-hovered", "true");

  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-turn-order-pacing").selectOption("wait-for-vfx");
  await page.keyboard.press("Escape");

  await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    void api.execute({ type: "move", actorId: "player", direction: { x: 1, y: 0 } });
  });

  await expect(page.getByTestId("turn-order-token-player")).toHaveAttribute("data-active", "true");
  await expect(canvas).toHaveAttribute("data-turn-order-active", "player");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(rail.locator(".turn-order-status")).toHaveCount(3);
  await expect(rail.locator(".turn-order-status-attack")).toHaveCount(3);

  const [railBox, settledCanvasBox] = await Promise.all([rail.boundingBox(), canvas.boundingBox()]);
  if (!railBox || !settledCanvasBox) {
    throw new Error("Turn Order rail or canvas has no layout box.");
  }
  expect(Math.abs(railBox.x + railBox.width / 2 - (settledCanvasBox.x + settledCanvasBox.width / 2))).toBeLessThan(3);
  expect(railBox.y).toBeGreaterThan(settledCanvasBox.y + settledCanvasBox.height * 0.75);
});

test("Turn Order pacing preference survives reload", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await page.getByTestId("settings-open").click();
  const pacing = page.getByTestId("settings-turn-order-pacing");
  await expect(pacing).toHaveValue("staggered");
  await pacing.selectOption("wait-for-vfx");

  await page.reload();
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-turn-order-pacing")).toHaveValue("wait-for-vfx");
});
