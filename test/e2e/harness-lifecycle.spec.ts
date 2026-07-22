import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import { canvasPointForCell } from "./canvas-geometry";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Enemy navigation testbed exposes blocked and reserved grid cells", async ({ page }) => {
  await page.goto("/debug?scenario=enemy-navigation");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("enemy-count")).toHaveText("20");
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");
  await expect(page.getByTestId("mobility-status")).toHaveText("Ready");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-damage-immune", "true");
  await expect(page.locator("[data-testid^=entity-enemy-thrust]")).toHaveCount(10);
  await expect(page.locator("[data-testid^=entity-enemy-slash]")).toHaveCount(10);

  const canvas = page.getByTestId("game-canvas");
  await page.getByTestId("debug-mode").check();
  await expect(page.getByTestId("grid-debug-legend")).toBeVisible();
  await expect(page.getByTestId("grid-debug-reservations")).toHaveText("Navigation blockers: 7");
  await expect(canvas).toHaveAttribute("data-debug-navigation-blocker-count", "7");
  await expect(canvas).toHaveAttribute("data-debug-blocked-count", /[1-9]/);
  await expect(canvas).toHaveAttribute("data-debug-navigation-blocker-cells", /2,4/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-mobility-cooldown", "0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Empty arena presents the shipped board and deterministic start", async ({ page }) => {
  await page.goto("/debug?scenario=empty-arena");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-profile", "character.ninja");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-facing", "1,0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");

  const arena = await page.evaluate(() => window.__TICKSTRIKE__?.getState().arena);
  expect(arena).toMatchObject({ width: 18, height: 12 });
  expect(arena?.terrain.filter((terrain) => terrain === "land")).toHaveLength(112);
  expect(arena?.terrain.filter((terrain) => terrain === "sea")).toHaveLength(104);
});

test("Held movement queues steps and settles each player presentation in order", async ({ page }) => {
  await page.goto("/debug?scenario=empty-arena");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  const canvas = page.getByTestId("game-canvas");
  await expect(page.locator("html")).toHaveAttribute("data-keyboard-input-ready", "true");
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.getState().tick ?? 0)).toBeGreaterThan(1);
  await expect(canvas).toHaveAttribute("data-player-animation", "move");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Game canvas has no layout box.");
  }
  const playerCell = await page.evaluate(() => window.__TICKSTRIKE__?.getState().playerCell);
  if (!playerCell) {
    throw new Error("Player cell is unavailable.");
  }
  const lockedPointer = canvasPointForCell(canvasBox, playerCell.x, playerCell.y - 2);
  await page.mouse.move(lockedPointer.x, lockedPointer.y);
  await expect(canvas).toHaveAttribute("data-player-facing", "1,0");
  const tickBeforeRelease = await page.evaluate(() => window.__TICKSTRIKE__?.getState().tick ?? 0);
  await page.keyboard.up("ArrowRight");

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const state = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(state?.tick).toBe(tickBeforeRelease);
  expect(state?.playerCell?.x).toBeGreaterThan(6);
  await expect(canvas).toHaveAttribute("data-player-animation", "idle");
  await expect(canvas).toHaveAttribute("data-player-facing", "1,0");
  if (!state?.playerCell) {
    throw new Error("Player cell is unavailable after movement.");
  }
  const facingUp = canvasPointForCell(canvasBox, state.playerCell.x, state.playerCell.y - 3);
  await page.mouse.move(facingUp.x, facingUp.y);
  await expect(canvas).toHaveAttribute("data-player-facing", "0,-1");
});

test("Foundation arena resets its generation without stale presentation state", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-enemy-thrust")).toBeAttached();
  await expect(page.getByTestId("entity-enemy-slash")).toBeAttached();
  await expect(page.getByTestId("enemy-statuses")).toBeVisible();
  await expect(page.getByTestId("enemy-hp-enemy-thrust")).toContainText("100/100");
  await expect(page.getByTestId("enemy-guard-enemy-thrust")).toContainText("32/32");
  await expect(page.getByTestId("entity-enemy-ranged")).toBeAttached();
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:idle.*enemy-slash:enemy\.slash:purple:idle/,
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-facing-x", "1");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-facing-y", "0");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-telegraph", "false");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-committed-attack-count", "0");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-width", "18");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-height", "12");
  await expect(page.getByTestId("debug-mode")).not.toBeChecked();
  await expect(page.getByTestId("enemies-state")).toHaveCount(0);
  await page.getByTestId("debug-mode").check();
  await expect(page.getByTestId("enemies-state")).toHaveCount(0);
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-debug-mode", "true");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:idle.*enemy-slash:enemy\.slash:purple:idle/,
  );

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

test("Tick Arena presents defeat and restarts cleanly after a committed hit", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
  });

  await expect(page.getByTestId("encounter-result")).toHaveAttribute("data-outcome", "defeat");
  await expect(page.getByTestId("encounter-result")).toContainText("Defeat");
  await expect(page.getByTestId("event-log")).toContainText("player_died");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "defeat");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Restart encounter" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("encounter-status")).toContainText("Running");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Terminal presentation is cancelled before reset and scenario replacement", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initialGeneration = await page.evaluate(() => window.__TICKSTRIKE__?.getGeneration());

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
    if (api.getState().outcome !== "defeat") {
      throw new Error("Expected the terminal defeat state before reset.");
    }
    api.reset();
  });

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect(page.getByTestId("entity-enemy-thrust")).toBeAttached();
  const resetGeneration = await page.evaluate(() => window.__TICKSTRIKE__?.getGeneration());
  expect(resetGeneration).toBeGreaterThan(initialGeneration ?? -1);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
    if (api.getState().outcome !== "defeat") {
      throw new Error("Expected the terminal defeat state before replacement.");
    }
    api.loadScenario("empty-arena");
  });

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveCount(0);
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});
