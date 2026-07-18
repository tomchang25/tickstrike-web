import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Smash scenario completes through the browser harness", async ({ page }) => {
  await page.goto("/?scenario=smash-water");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-enemy-water")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("enemy-count")).toHaveText("3");

  const canvas = page.getByTestId("game-canvas");
  const pointForCell = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Game canvas has no layout box.");
    return {
      x: box.x + ((x + 0.5) / 12) * box.width,
      y: box.y + ((y + 0.5) / 12) * box.height,
    };
  };

  await page.getByTestId("mobility-toggle").click();
  await expect(page.getByTestId("mobility-toggle")).toHaveText("Mobility: Smash");
  await page.keyboard.down("Alt");
  const smashTarget = await pointForCell(4, 3);
  await page.mouse.move(smashTarget.x, smashTarget.y);
  await expect(canvas).toHaveAttribute("data-smash-preview-cell", "4,3");
  await expect(canvas).toHaveAttribute("data-smash-preview-valid", "true");
  await page.mouse.click(smashTarget.x, smashTarget.y);
  await page.keyboard.up("Alt");

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("enemy-count")).toHaveText("3");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(canvas).toHaveAttribute("data-smash-armed", "true");
  await expect(page.getByTestId("event-log")).toContainText("smash_armed");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(page.getByRole("button", { name: "Reset scenario" })).toBeEnabled();

  await page.mouse.click(smashTarget.x, smashTarget.y);
  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-cell-y", "1");
  await expect(page.getByTestId("entity-enemy-water")).toHaveAttribute("data-state", "drowning");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-hp", "70");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-hp", "70");
  await expect(page.getByTestId("entity-enemy-water")).toHaveAttribute("data-hp", "70");
  await expect(page.getByTestId("event-log")).toContainText("enemy_damaged");
  await expect(page.getByTestId("event-log")).toContainText("enemy_entered_water");
});

test("Empty arena presents the shipped board and deterministic start", async ({ page }) => {
  await page.goto("/?scenario=empty-arena");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");

  const arena = await page.evaluate(() => window.__TICKSTRIKE__?.getState().arena);
  expect(arena).toMatchObject({ width: 12, height: 12 });
  expect(arena?.terrain.filter((terrain) => terrain === "land")).toHaveLength(100);
  expect(arena?.terrain.filter((terrain) => terrain === "sea")).toHaveLength(44);
});

test("Foundation arena resets its generation without stale presentation state", async ({ page }) => {
  await page.goto("/?scenario=tick-arena");

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-enemy-thrust")).toBeAttached();
  await expect(page.getByTestId("entity-enemy-slash")).toBeAttached();
  await expect(page.getByTestId("entity-enemy-ranged")).toBeAttached();
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-width", "12");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-height", "12");

  const initial = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset).toEqual(initial);
  expect(await page.getByTestId("semantic-mirror").getAttribute("data-reservation-count")).toBe("0");
  expect(await page.getByTestId("semantic-mirror").getAttribute("data-telegraph-count")).toBe("0");
});

test("Tick Arena presents Move, Normal Attack, and Dash in one command sequence", async ({ page }) => {
  await page.goto("/?scenario=tick-arena");

  await expect(page.getByRole("heading", { name: "Move" })).toHaveCount(0);
  await expect(page.getByTestId("move-right")).toHaveCount(0);
  await expect(page.getByTestId("dash-right")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");

  await page.getByTestId("attack-right").click();
  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("event-log")).toContainText("player_attacked");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "80");
  await expect(page.getByTestId("event-log")).toContainText("enemy_damaged");

  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Game canvas has no layout box.");
  const dashTarget = {
    x: box.x + ((9 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };
  await page.keyboard.down("Alt");
  await page.mouse.move(dashTarget.x, dashTarget.y);
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "10,6");
  await page.mouse.click(dashTarget.x, dashTarget.y);
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("tick-value")).toHaveText("3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "10");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "50");
  await expect(page.getByTestId("event-log")).toContainText("player_dashed");
  const dashEvent = await page.evaluate(() => window.__TICKSTRIKE__?.getState().lastEvents[1]);
  expect(dashEvent).toMatchObject({
    type: "player_dashed",
    path: [{ x: 8, y: 6 }, { x: 9, y: 6 }, { x: 10, y: 6 }],
  });
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  expect(await page.getByTestId("event-log").locator("li").allTextContents()).toEqual([
    "command_resolved",
    "player_dashed",
    "enemy_damaged",
    "world_advanced",
  ]);
});

test("Pointer aiming previews attack and Mobility without advancing until click", async ({ page }) => {
  await page.goto("/?scenario=tick-arena");

  const canvas = page.getByTestId("game-canvas");
  const pointForCell = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Game canvas has no layout box.");
    return {
      x: box.x + ((x + 0.5) / 12) * box.width,
      y: box.y + ((y + 0.5) / 12) * box.height,
    };
  };

  const emptyAttackCell = await pointForCell(7, 6);
  await page.mouse.move(emptyAttackCell.x, emptyAttackCell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "attack");
  await expect(canvas).toHaveAttribute("data-attack-preview-cell", "7,6");
  await expect(canvas).toHaveAttribute("data-attack-target", "empty");
  await expect(page.getByTestId("tick-value")).toHaveText("0");

  await page.mouse.click(emptyAttackCell.x, emptyAttackCell.y);
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("event-log")).toContainText("player_attacked");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");

  await page.keyboard.down("Alt");
  const validMobilityCell = await pointForCell(9, 6);
  await page.mouse.move(validMobilityCell.x, validMobilityCell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "mobility");
  await expect(canvas).toHaveAttribute("data-selected-mobility", "dash");
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "9,6");
  await expect(canvas).toHaveAttribute("data-mobility-preview-valid", "true");
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await page.keyboard.up("Alt");
});
