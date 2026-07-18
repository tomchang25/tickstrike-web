import { expect, test } from "@playwright/test";

test("content catalog inspection is visible and read-only", async ({ page }) => {
  await page.goto("/?scenario=content-catalog-inspection");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("content-inspection")).toBeVisible();
  await expect(page.getByTestId("inspection-ninja-name")).toHaveText("Ninja");
  await expect(page.getByTestId("inspection-ninja-mobility")).toHaveText("dash");
  await expect(page.getByTestId("inspection-ninja-mobility-range")).toHaveText("5");
  await expect(page.getByTestId("inspection-mode-boss-guard")).toHaveText("Boss");
  await expect(page.getByTestId("inspection-mode-boss-attacks")).toContainText("Mode Boss Wide Tile");
  await expect(page.getByTestId("inspection-demo-10-group")).toHaveText("boss");
  await expect(page.getByTestId("inspection-demo-10-warning")).toHaveText("2");
  await expect(page.getByTestId("inspection-demo-10-level-offset")).toHaveText("3");
  await expect(page.getByTestId("inspection-guard-shredder-category")).toHaveText("major");
  await expect(page.getByTestId("inspection-guard-shredder-mobility")).toHaveText("dash");
  await expect(page.getByTestId("inspection-guard-shredder-trigger")).toHaveText("guard-shredder");

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("event-log")).toContainText("No command executed.");
  await expect(page.locator(".semantic-mirror [data-testid^='entity-']")).toHaveCount(0);
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");

  const debugProjection = await page.evaluate(() => window.__TICKSTRIKE__?.getContentInspection());
  expect(debugProjection).toMatchObject({
    ninja: { name: "Ninja", mobility: { kind: "dash", range: 5 } },
    modeBoss: { guard: { name: "Boss" } },
    demoWave10: { slot: { levelOffset: 3, isBoss: true } },
    guardShredder: { category: "major", requiredMobility: "dash", trigger: "guard-shredder" },
  });

  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("inspection-ninja-name")).toHaveText("Ninja");
});

test("training scenario keeps its existing controls and hides inspection", async ({ page }) => {
  await page.goto("/?scenario=smash-water");

  await expect(page.getByTestId("content-inspection")).toHaveCount(0);
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Smash");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
});
