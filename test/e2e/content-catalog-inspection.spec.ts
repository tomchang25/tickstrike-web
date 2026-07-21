import { expect, test } from "@playwright/test";

test("content catalog inspection is visible and read-only", async ({ page }) => {
  await page.goto("/debug?scenario=content-catalog-inspection");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("content-inspection")).toBeVisible();
  await expect(page.getByTestId("inspection-ninja-name")).toHaveText("Ninja");
  await expect(page.getByTestId("inspection-ninja-mobility")).toHaveText("dash");
  await expect(page.getByTestId("inspection-ninja-mobility-range")).toHaveText("5");
  await expect(page.getByTestId("inspection-charge-enemy-guard")).toHaveText("Heavy");
  await expect(page.getByTestId("inspection-charge-enemy-attacks")).toContainText("Charge");
  await expect(page.getByTestId("inspection-demo-09-group")).toHaveText("charge");
  await expect(page.getByTestId("inspection-demo-09-warning")).toHaveText("1");
  await expect(page.getByTestId("inspection-demo-09-level-offset")).toHaveText("0");
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
    chargeEnemy: { guard: { name: "Heavy" } },
    demoWave09: { slot: { levelOffset: 0, isBoss: false } },
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
  await page.goto("/debug?scenario=smash-water");

  await expect(page.getByTestId("content-inspection")).toHaveCount(0);
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Smash");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
});
