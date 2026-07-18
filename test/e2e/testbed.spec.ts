import { expect, test } from "@playwright/test";

test("Smash scenario completes through the browser harness", async ({ page }) => {
  await page.goto("/?scenario=smash-water");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("enemy-count")).toHaveText("3");

  await page.getByTestId("smash-button").click();

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("enemy-count")).toHaveText("3");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "dead");
  await expect(page.getByTestId("entity-enemy-water")).toHaveAttribute("data-state", "drowning");
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
