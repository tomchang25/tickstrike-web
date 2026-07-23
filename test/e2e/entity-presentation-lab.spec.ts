import { expect, test } from "@playwright/test";
import runtimeCatalog from "../../src/presentation/pixi/entity-presentation-profile-catalog.json" with { type: "json" };

test("Entity Presentation Lab edits, resets, imports, and exports profile data", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const generalScale = String(runtimeCatalog.general.bodyScale);
  const rangedScale = String(runtimeCatalog.profiles["enemy.ranged"]?.bodyScale ?? runtimeCatalog.general.bodyScale);
  let persistedCatalog: unknown = runtimeCatalog;
  await page.route("**/__debug/entity-presentation-profile-catalog", async (route) => {
    if (route.request().method() === "PUT") {
      persistedCatalog = route.request().postDataJSON();
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(persistedCatalog),
    });
  });
  await page.goto("/debug/entity");

  await expect(page.getByTestId("entity-presentation-canvas")).toBeVisible();
  await expect(page.getByTestId("entity-presentation-canvas")).toHaveAttribute("data-cell-size", "64");
  await page.getByTestId("entity-lab-cell-fill").selectOption("white");
  await expect(page.getByTestId("entity-presentation-canvas")).toHaveAttribute("data-cell-fill", "white");

  await page.getByTestId("entity-lab-ground-y").fill("19");
  await page.getByTestId("entity-lab-apply-profile").click();
  await expect(page.getByTestId("entity-lab-operation-status")).toHaveText(
    "General profile written to the runtime catalog.",
  );
  await expect(page.getByTestId("entity-lab-catalog-json")).toContainText('"groundY": 19');

  await page.getByTestId("entity-lab-profile").selectOption("enemy.ranged");
  await page.getByTestId("entity-lab-edit-target").selectOption("specific");
  await expect(page.getByTestId("entity-lab-profile-source")).toContainText("enemy.ranged override");
  await expect(page.getByTestId("entity-lab-body-scale")).toHaveValue(rangedScale);

  await page.getByTestId("entity-lab-direction").selectOption("left");
  await page.getByTestId("entity-lab-pose").selectOption("prepareAttack");
  await page.getByTestId("entity-lab-ground-y").fill("20");
  await page.getByTestId("entity-lab-shadow-y").fill("3");
  await page.getByTestId("entity-lab-body-scale").fill("4.2");
  await page.getByTestId("entity-lab-apply-profile").click();
  await expect(page.getByTestId("entity-lab-operation-status")).toHaveText(
    "enemy.ranged override written to the runtime catalog.",
  );
  await expect(page.getByTestId("entity-lab-catalog-json")).toContainText('"bodyScale": 4.2');
  await expect(page.getByTestId("entity-lab-catalog-json")).toContainText('"offsetY": 3');

  await page.getByTestId("entity-lab-ground-y").fill("24");
  await page.getByTestId("entity-lab-reset-profile").click();
  await expect(page.getByTestId("entity-lab-ground-y")).toHaveValue("20");

  await page.getByTestId("entity-lab-use-general").click();
  await expect(page.getByTestId("entity-lab-operation-status")).toHaveText(
    "enemy.ranged override removed from the runtime catalog.",
  );
  await expect(page.getByTestId("entity-lab-profile-source")).toContainText("General fallback");
  await expect(page.getByTestId("entity-lab-body-scale")).toHaveValue(generalScale);

  const importedCatalog = JSON.parse(await page.getByTestId("entity-lab-catalog-json").inputValue());
  importedCatalog.profiles["enemy.charge"] = { bodyScale: 4.4 };
  await page.getByTestId("entity-lab-catalog-json").fill(JSON.stringify(importedCatalog));
  await page.getByTestId("entity-lab-import-catalog").click();
  await expect(page.getByTestId("entity-lab-operation-status")).toHaveText(
    "Imported JSON written to the runtime catalog.",
  );
  await page.getByTestId("entity-lab-profile").selectOption("enemy.charge");
  await expect(page.getByTestId("entity-lab-body-scale")).toHaveValue("4.4");

  await page.getByTestId("entity-lab-copy-catalog").click();
  await expect(page.getByTestId("entity-lab-operation-status")).toHaveText("Working catalog JSON copied.");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"enemy.charge"');
});
