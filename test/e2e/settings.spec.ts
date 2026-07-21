import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("the settings panel toggles the debug overlay and restarts the run", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toHaveAttribute("data-debug-mode", "false");

  // Open settings and toggle the debug overlay; the persisted setting drives the renderer.
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await page.getByTestId("settings-debug-toggle").check();
  await expect(canvas).toHaveAttribute("data-debug-mode", "true");
  await page.getByTestId("settings-debug-toggle").uncheck();
  await expect(canvas).toHaveAttribute("data-debug-mode", "false");

  // Gameplay input is inert while the panel is open.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("0");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);

  // Advance the run, then Restart from the panel returns it to tick 0.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");

  await page.getByTestId("settings-open").click();
  await page.getByTestId("settings-restart").click();
  await page.getByTestId("settings-restart-confirm").click();
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);
  await expect(page.getByTestId("tick-value")).toHaveText("0");
});
