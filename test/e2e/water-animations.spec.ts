import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
    /** Every value `data-retained-presentations` took while a recorder was armed. */
    __RETAINED_PRESENTATION_LOG__?: string[];
  }
}

/**
 * Records every value of `data-retained-presentations` via MutationObserver.
 * Sampling the attribute cannot observe a short-lived frame reliably — the final
 * water frame is only present for its own authored duration — so the assertions
 * read this log instead of polling the live attribute.
 */
async function recordRetainedPresentations(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="game-canvas"]');
    if (!canvas) {
      throw new Error("Game canvas is unavailable.");
    }
    const log: string[] = [];
    window.__RETAINED_PRESENTATION_LOG__ = log;
    const record = () => {
      const value = canvas.getAttribute("data-retained-presentations");
      if (value) {
        log.push(value);
      }
    };
    record();
    new MutationObserver(record).observe(canvas, {
      attributes: true,
      attributeFilter: ["data-retained-presentations"],
    });
  });
}

test("Smash scenario completes through the browser harness", async ({ page }) => {
  await page.goto("/debug?scenario=smash-water");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");
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
    return {
      x: box.x + ((x + 0.5) / 12) * box.width,
      y: box.y + ((y + 0.5) / 12) * box.height,
    };
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
  await expect(page.getByTestId("event-log")).toContainText("enemy_damaged");
  await expect(page.getByTestId("event-log")).toContainText("enemy_crushed");
  await expect(page.getByTestId("event-log")).toContainText("enemy_knocked");
  await expect(page.getByTestId("event-log")).toContainText("enemy_entered_water");
  await expect(page.getByTestId("event-log")).toContainText("directional_hit");
  await expect(page.getByTestId("event-log")).toContainText("enemy_guard_broken");
  await expect(page.getByTestId("mobility-status")).toHaveText("Cooldown 6");
  await expect(canvas).toHaveAttribute("data-preview-kills", "");
  await expect(canvas).toHaveAttribute("data-preview-displacements", "");
  await expect(canvas).toHaveAttribute("data-preview-terminal", "");
  await expect(canvas).toHaveAttribute("data-preview-blocked", "");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  // Once the terminal timelines settle, neither ghost is addressable on the canvas any more.
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

for (const [scenario, profile] of [
  ["water-thrust", "enemy.thrust"],
  ["water-slash", "enemy.slash"],
  ["water-charge", "enemy.charge"],
  ["water-ranged", "enemy.ranged"],
  ["water-bomb", "enemy.bomb"],
] as const) {
  test(`${profile} plays its four-direction water sheet while drowning`, async ({ page }) => {
    await page.goto(`/debug?scenario=${scenario}`);
    const canvas = page.getByTestId("game-canvas");
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Game canvas has no layout box.");
    }
    const target = {
      x: box.x + (4.5 / 12) * box.width,
      y: box.y + (3.5 / 12) * box.height,
    };

    await page.keyboard.down("Alt");
    await page.mouse.move(target.x, target.y);
    await expect(canvas).toHaveAttribute("data-smash-preview-cell", "4,3");
    await page.mouse.click(target.x, target.y);
    await page.keyboard.up("Alt");
    await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

    await recordRetainedPresentations(page);
    await page.mouse.click(target.x, target.y);
    // The drowning victim is already gone from the snapshot; only its retained ghost animates.
    await expect(page.getByTestId("entity-enemy-water")).toHaveCount(0);
    await expect(canvas).toHaveAttribute(
      "data-retained-presentations",
      new RegExp(`enemy-water:${profile.replace(".", "\\.")}:[^:]+:idle:water:[0-7]`),
    );
    await expect(canvas).not.toHaveAttribute("data-enemy-presentations", /enemy-water:/);
    await expect
      .poll(async () =>
        page.evaluate(() => (window.__RETAINED_PRESENTATION_LOG__ ?? []).some((entry) => entry.includes(":water:7"))),
      )
      .toBe(true);
    await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
    await expect(page.getByTestId("entity-enemy-water")).toHaveCount(0);
    await expect(canvas).not.toHaveAttribute("data-retained-presentations", /enemy-water:/);
    await expect
      .poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-water"))))
      .toBe(false);
  });
}

test("switching between water scenarios reconciles the reused entity's presentation", async ({ page }) => {
  await page.goto("/debug?scenario=water-ranged");
  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-water:enemy\.ranged:/);

  await page.getByTestId("scenario-select").selectOption("water-bomb");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-water:enemy\.bomb:/);
  await expect(canvas).not.toHaveAttribute("data-enemy-presentations", /enemy\.ranged/);
});
