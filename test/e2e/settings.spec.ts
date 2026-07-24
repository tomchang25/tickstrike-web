import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("the settings panel toggles the debug overlay and restarts the run", async ({ page }) => {
  // This test opens/closes the settings panel and build overview several times in sequence; on a
  // loaded CI runner the cumulative actionability waits can approach the 30s default budget.
  test.setTimeout(60_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toHaveAttribute("data-debug-mode", "false");

  // Escape summons the settings panel when nothing else is open, and dismisses it again.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);

  // Escape over the build overview closes it without summoning settings.
  await page.getByTestId("hud-build-button").click();
  await expect(page.getByTestId("hud-build-overview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("hud-build-overview")).toHaveCount(0);
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);

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
  await expect(page.getByTestId("settings-panel")).toHaveCount(0);
  await expect(page.getByTestId("tick-value")).toHaveText("0");
});

test("the settings panel persists volume levels across reload", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();

  await page.getByTestId("settings-open").click();
  const master = page.getByTestId("settings-volume-master");
  await expect(master).toBeVisible();

  // Slider rendering and the 0..1-fraction ↔ percent mapping are owned by
  // test/component/settings-panel.test.tsx; this spec proves the value survives a real page reload.
  await master.fill("40");
  await expect(master).toHaveValue("40");

  await page.reload();
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-volume-master")).toHaveValue("40");
});

test("the background-audio mute toggle defaults on and persists across reload", async ({ page }) => {
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();

  await page.getByTestId("settings-open").click();
  const toggle = page.getByTestId("settings-mute-background-toggle");
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await page.getByTestId("settings-open").click();
  await expect(page.getByTestId("settings-mute-background-toggle")).not.toBeChecked();
});
