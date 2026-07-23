import { expect, test } from "@playwright/test";

test("Action Lab previews approved enemy sprite actions outside the runtime catalog", async ({ page }) => {
  await page.goto("/debug/action");

  const actionSelect = page.getByTestId("action-lab-action");
  const canvas = page.getByTestId("action-lab-canvas");
  await expect(canvas).toBeVisible();
  await expect(actionSelect.locator('option[value^="enemy."]')).toHaveCount(14);

  await actionSelect.selectOption("enemy.bomb.self_destruct_prepare");
  await expect(canvas).toHaveAttribute("data-action-profile", "enemy.bomb");
  await expect(canvas).toHaveAttribute("data-action-preview-only", "true");
  await expect(canvas).toHaveAttribute("data-action-loop", "true");
  await expect(canvas).toHaveAttribute("data-action-actor-position", "160,160");
  await expect(page.getByRole("button", { name: "Apply to JSON" })).toBeDisabled();

  await actionSelect.selectOption("enemy.bomb.self_destruct_execute");
  await expect(canvas).toHaveAttribute("data-action-loop", "false");

  await actionSelect.selectOption("enemy.charge.prepare");
  await expect(canvas).toHaveAttribute("data-action-profile", "enemy.charge");
  await expect(canvas).toHaveAttribute("data-action-loop", "true");

  await actionSelect.selectOption("enemy.charge.execute");
  await expect(canvas).toHaveAttribute("data-action-profile", "enemy.charge");
  await expect(canvas).toHaveAttribute("data-action-loop", "false");

  await actionSelect.selectOption("enemy.ranged.dash_killed");
  await expect(canvas).toHaveAttribute("data-action-profile", "enemy.ranged");
  await expect(canvas).toHaveAttribute("data-action-loop", "false");

  await actionSelect.selectOption("enemy.ranged.drowning");
  await expect(canvas).toHaveAttribute("data-action-profile", "enemy.ranged");
  await expect(canvas).toHaveAttribute("data-action-loop", "false");
});
