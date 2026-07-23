import { expect, test } from "@playwright/test";

test("Dash-killed terminal uses the retained body-split presentation and cleans up", async ({ page }) => {
  await page.goto("/debug?scenario=dash-kill-terminal");
  const canvas = page.getByTestId("game-canvas");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "dash", actorId: "player", direction: { x: 1, y: 0 }, distance: 2 });
  });

  await expect(page.getByTestId("entity-enemy-victim")).toHaveCount(0);
  await expect(page.getByTestId("event-log")).toContainText("enemy_died");
  await expect(canvas).toHaveAttribute(
    "data-retained-presentations",
    /enemy-victim:enemy\.ranged:eye:idle:action:dashKilled:[0-7]/,
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).not.toHaveAttribute("data-retained-presentations", /enemy-victim:/);
});
