import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Tick Arena presents mobility controls without a Normal Attack panel", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");

  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");

  await expect(page.getByRole("heading", { name: "Move" })).toHaveCount(0);
  await expect(page.getByTestId("move-right")).toHaveCount(0);
  await expect(page.getByTestId("dash-right")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Normal Attack" })).toHaveCount(0);
  await expect(page.getByTestId("attack-right")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-telegraph-count", "3");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-telegraph-labels", /7,6:.*@head.*8,6:.*@head/);
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-attack-warning-ticks", "2");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-attack-warning-ticks", "2");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "2");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:prepareAttack.*enemy-slash:enemy\.slash:purple:prepareAttack.*enemy-ranged:enemy\.ranged:eye:prepareAttack/,
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-telegraph", "true");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-committed-attack-count", "3");
  await expect(page.getByTestId("enemy-telegraph-count")).toHaveText("3");

  await page.keyboard.press("l");
  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("event-log")).toContainText("player_attacked");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "96");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-guard", "28");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-status", "telegraphing");
  await expect(page.getByTestId("enemy-guard-enemy-slash")).toContainText("28/32");
  await expect(page.getByTestId("event-log")).toContainText("enemy_damaged");

  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }
  const dashTarget = {
    x: box.x + ((9 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };
  await page.keyboard.down("Alt");
  await page.mouse.move(dashTarget.x, dashTarget.y);
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "9,6");
  await page.mouse.click(dashTarget.x, dashTarget.y);
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("tick-value")).toHaveText("3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "9");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "90");
  await expect(page.getByTestId("event-log")).toContainText("player_dashed");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-facing", "1,0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");
  const dashEvent = await page.evaluate(() => window.__TICKSTRIKE__?.getState().lastEvents[1]);
  expect(dashEvent).toMatchObject({
    type: "player_dashed",
    path: [
      { x: 8, y: 6 },
      { x: 9, y: 6 },
    ],
  });
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  expect(await page.getByTestId("event-log").locator("li").allTextContents()).toContain("directional_hit");
  expect(await page.getByTestId("event-log").locator("li").allTextContents()).toContain("enemy_attack_detonated");
  const observedEventTypes = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().lastEvents.map((event) => event.type),
  );
  expect(observedEventTypes).toEqual(await page.getByTestId("event-log").locator("li").allTextContents());
});

test("Dash aimed at an enemy lands before it without dealing damage", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");

  const canvas = page.getByTestId("game-canvas");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }

  const enemyTarget = {
    x: box.x + ((8 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };
  await page.keyboard.down("Alt");
  await page.mouse.move(enemyTarget.x, enemyTarget.y);
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "7,6");
  await page.mouse.click(enemyTarget.x, enemyTarget.y);
  await page.keyboard.up("Alt");

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "100");

  const lastEvents = await page.evaluate(() => window.__TICKSTRIKE__?.getState().lastEvents);
  expect(lastEvents).not.toContainEqual(
    expect.objectContaining({
      type: "enemy_damaged",
      enemyId: "enemy-slash",
    }),
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Pointer aiming previews attack and Mobility without advancing until click", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");

  const canvas = page.getByTestId("game-canvas");
  const pointForCell = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Game canvas has no layout box.");
    }
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
  await canvas.scrollIntoViewIfNeeded();

  await page.keyboard.down("Alt");
  const validMobilityCell = await pointForCell(7, 6);
  await page.mouse.move(validMobilityCell.x, validMobilityCell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "mobility");
  await expect(canvas).toHaveAttribute("data-selected-mobility", "dash");
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "7,6");
  await expect(canvas).toHaveAttribute("data-mobility-preview-valid", "true");
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await page.mouse.click(validMobilityCell.x, validMobilityCell.y);
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("event-log")).toContainText("player_dashed");
  await page.keyboard.up("Alt");
});

test("right-click cancels an armed Smash windup without advancing the Tick", async ({ page }) => {
  await page.goto("/debug?scenario=smash-water");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }
  const target = {
    x: box.x + ((4 + 0.5) / 12) * box.width,
    y: box.y + ((3 + 0.5) / 12) * box.height,
  };

  // Arm a Smash windup through the pointer Mobility mode.
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Smash");
  await page.keyboard.down("Alt");
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y);
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(canvas).toHaveAttribute("data-smash-armed", "true");

  // Right-click cancels the windup: the browser menu is suppressed, the armed target clears, and the
  // Tick does not advance.
  await page.mouse.click(target.x, target.y, { button: "right" });
  await expect
    .poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.getState().armedSmashTarget))
    .toBeUndefined();
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("event-log")).toContainText("smash_cancelled");
});

test("window blur resets a stuck Mobility mode to Attack", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }
  const cell = {
    x: box.x + ((7 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };

  // Hold Alt to enter Mobility mode.
  await page.keyboard.down("Alt");
  await page.mouse.move(cell.x, cell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "mobility");

  // Losing focus while Alt is held must release Mobility — keyup would otherwise never arrive.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.move(cell.x + 1, cell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "attack");
  await page.keyboard.up("Alt");
});
