import { expect, test } from "@playwright/test";

test("Smash scenario completes through the browser harness", async ({ page }) => {
  await page.goto("/?scenario=smash-water");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("enemy-count")).toHaveText("3");

  await page.getByTestId("smash-button").click();

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("enemy-count")).toHaveText("1");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-enemy-center")).toHaveCount(0);
  await expect(page.getByTestId("entity-enemy-water")).toHaveCount(0);
  await expect(page.getByTestId("event-log")).toContainText("enemy_entered_water");
});
