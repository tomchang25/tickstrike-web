import { expect, test } from "@playwright/test";

// The inspection values themselves — and the read-only runtime (`getContentInspection`, command
// refusal, reset) — are owned by test/unit/harness/content-catalog-inspection.scenario.test.ts.
// This spec only proves the inspection panel renders those values into the DOM (component test
// layer is not configured yet) and that the read-only UI behaves. It asserts a couple of
// representative fields spanning character and artifact, not every field. See
// dev/standards/test_economy_standard.md.
test("content catalog inspection is visible and read-only", async ({ page }) => {
  await page.goto("/debug?scenario=content-catalog-inspection");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("content-inspection")).toBeVisible();
  await expect(page.getByTestId("inspection-ninja-name")).toHaveText("Ninja");
  await expect(page.getByTestId("inspection-guard-shredder-category")).toHaveText("major");

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");

  // Gameplay input is inert and Reset keeps the read-only board at tick 0 with the panel intact.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("0");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("inspection-ninja-name")).toHaveText("Ninja");
});

test("training scenario keeps its existing controls and hides inspection", async ({ page }) => {
  await page.goto("/debug?scenario=smash-water");

  await expect(page.getByTestId("content-inspection")).toHaveCount(0);
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Smash");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
});
