import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import { canvasPointForCell } from "./canvas-geometry";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

// This is the one browser test for terminal-ghost cleanup: a multi-victim Smash produces crush and
// water terminal ghosts that must be retained and then cleaned up under real GSAP/rAF timing
// (getEntityBounds returns false once each settles). Which water/crush sprite frames play is a
// presenter selection owned by the presentation unit suites — the per-profile drowning and
// scenario-switch reconciliation checks were browser attribute assertions with no visual guarantee,
// and were removed. The water-* dev scenarios remain in the registry for manual visual inspection.
// See dev/standards/test_economy_standard.md.
test("Smash scenario completes through the browser harness", async ({ page }) => {
  await page.goto("/debug?scenario=smash-water");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-enemy-blocked")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-enemy-water")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");

  const canvas = page.getByTestId("game-canvas");
  const pointForCell = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Game canvas has no layout box.");
    }
    return canvasPointForCell(box, x, y);
  };

  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Smash");
  await page.keyboard.down("Alt");
  const smashTarget = await pointForCell(4, 3);
  await page.mouse.move(smashTarget.x, smashTarget.y);
  await expect(canvas).toHaveAttribute("data-smash-preview-cell", "4,3");
  await expect(canvas).toHaveAttribute("data-smash-preview-valid", "true");
  await expect(canvas).toHaveAttribute("data-preview-kills", "");
  await expect(canvas).toHaveAttribute("data-preview-displacements", "enemy-right:5,3>7,3;enemy-water:4,4>4,6");
  await expect(canvas).toHaveAttribute("data-preview-terminal", "enemy-center:crush;enemy-water:water");
  await expect(canvas).toHaveAttribute("data-preview-blocked", "enemy-blocked");
  await page.mouse.click(smashTarget.x, smashTarget.y);
  await page.keyboard.up("Alt");

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(canvas).toHaveAttribute("data-smash-armed", "true");
  await expect(page.getByTestId("event-log")).toContainText("smash_armed");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(page.getByRole("button", { name: "Reset scenario" })).toBeEnabled();

  await page.mouse.click(smashTarget.x, smashTarget.y);
  await expect(page.getByTestId("tick-value")).toHaveText("2");
  // Both terminal victims leave the semantic snapshot with the command that resolved them.
  await expect(page.getByTestId("entity-enemy-center")).toHaveCount(0);
  await expect(page.getByTestId("entity-enemy-water")).toHaveCount(0);
  await expect(page.getByTestId("enemy-count")).toHaveText("2");
  await expect(page.getByTestId("entity-enemy-blocked")).toHaveAttribute("data-cell-x", "4");
  await expect(page.getByTestId("entity-enemy-blocked")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-hp", "70");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-guard", "0");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-enemy-right")).toHaveAttribute("data-cell-y", "3");
  await expect(page.getByTestId("event-log")).toContainText("enemy_crushed");
  await expect(page.getByTestId("event-log")).toContainText("enemy_entered_water");
  await expect(page.getByTestId("mobility-status")).toHaveText("Cooldown 6");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  // Once the terminal timelines settle, neither ghost is addressable on the canvas any more — the
  // real-browser cleanup this spec exists to prove.
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-water"))))
    .toBe(false);
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-center"))))
    .toBe(false);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-center"))))
    .toBe(true);
});
