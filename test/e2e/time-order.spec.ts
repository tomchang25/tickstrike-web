import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import { canvasPointForCell } from "./canvas-geometry";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Turn Order rail cross-highlights with the canvas and anchors its layout", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const rail = page.getByTestId("turn-order-rail");
  await expect(rail).toBeVisible();
  // The rail's token order and status badges are owned by test/component/turn-order-bar.test.tsx
  // (state → DOM mapping) and test/unit/runtime/turn-order-controller.test.ts (order/status
  // derivation from a snapshot). This spec keeps only the canvas<->rail cross-highlighting and
  // layout that need a real browser. See dev/standards/test_economy_standard.md.

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
  await page.getByTestId("settings-turn-order-pacing").selectOption("normal");
  await page.keyboard.press("Escape");

  // The player slot is highlighted only briefly at the head of playback, so record every active
  // highlight the canvas surfaces rather than racing a single poll against that transient window.
  await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    if (!canvas) {
      throw new Error("Game canvas is unavailable.");
    }
    const owner = window as Window & { __turnOrderActiveHistory?: string[] };
    owner.__turnOrderActiveHistory = [canvas.dataset.turnOrderActive ?? ""];
    new MutationObserver(() => {
      owner.__turnOrderActiveHistory?.push(canvas.dataset.turnOrderActive ?? "");
    }).observe(canvas, { attributes: true, attributeFilter: ["data-turn-order-active"] });
    void api.execute({ type: "move", actorId: "player", direction: { x: 1, y: 0 } });
  });

  await expect(page.getByTestId("turn-order-token-player")).toHaveAttribute("data-active", "true");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as Window & { __turnOrderActiveHistory?: string[] }).__turnOrderActiveHistory?.includes("player"),
        ),
      ),
    )
    .toBe(true);
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
  await expect(pacing).toHaveValue("fast");
  await pacing.selectOption("normal");

  await page.reload();
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-turn-order-pacing")).toHaveValue("normal");
});
