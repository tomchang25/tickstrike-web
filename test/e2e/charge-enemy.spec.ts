import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Charge owns sequential Player motion before reconciling the final cell", async ({ page }) => {
  await page.goto("/debug?scenario=charge-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");

  const executeLeft = () =>
    page.evaluate(async () => {
      const api = window.__TICKSTRIKE__;
      if (!api) {
        throw new Error("Tickstrike debug API is unavailable.");
      }
      await api.execute({ type: "move", actorId: "player", direction: { x: -1, y: 0 } });
    });
  // Charge's 3-tick windup needs one more tick than three left moves provide; a fourth in-place
  // command holds the Player at (4,3) so the detonating push lands sideways at (4,2), matching
  // src/harness/scenarios/charge-enemy.scenario.ts.
  const holdInPlace = () =>
    page.evaluate(async () => {
      const api = window.__TICKSTRIKE__;
      if (!api) {
        throw new Error("Tickstrike debug API is unavailable.");
      }
      await api.execute({ type: "attack", actorId: "player", direction: { x: -1, y: 0 } });
    });
  const canvas = page.getByTestId("game-canvas");

  await executeLeft();
  await expect(canvas).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-charge:enemy\.charge:skull:idle:action:prepare:/,
  );
  await executeLeft();
  await executeLeft();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "4");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");

  // game-runtime.ts resolves a command's promise (`job.resolve`) strictly before its presentation
  // tween can complete — the tween is driven by requestAnimationFrame, which cannot advance within
  // the same microtask turn. Reading state in the same evaluate call, immediately after the
  // `await`, is therefore a logical-ordering guarantee rather than a wall-clock race: it always
  // observes the mid-tween (or just-started) state regardless of system load.
  const atResolve = await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: -1, y: 0 } });
    const bounds = api.getEntityBounds("player");
    return {
      cell: api.getState().entities.find((entity) => entity.id === "player")?.cell,
      visualCenterY: bounds ? bounds.y + bounds.height / 2 : undefined,
      idle: api.isIdle(),
    };
  });

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const settled = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const bounds = api?.getEntityBounds("player");
    return { visualCenterY: bounds ? bounds.y + bounds.height / 2 : undefined };
  });

  // The final-cell occupant is pushed sideways (y: 3 -> 2): logical state settles immediately —
  // captured synchronously right after the command resolves — while the visual is still mid-tween
  // (not yet idle) at that same instant.
  expect(atResolve.cell).toEqual({ x: 4, y: 2 });
  expect(atResolve.idle).toBe(false);
  expect(atResolve.visualCenterY).toBeDefined();
  expect(settled.visualCenterY).toBeDefined();
  expect(atResolve.visualCenterY).toBeGreaterThan(settled.visualCenterY as number);

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "4");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-x", "8");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("event-log")).toContainText("entity_displaced");
  await expect(page.getByTestId("event-log")).toContainText("charge_landed");

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-charge:enemy\.charge:skull:idle(\||$)/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "4");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "1");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-player-animation", "idle");
});

// Charge retaining its locked telegraph when the Player steps off the range line is core, not
// presentation: test/unit/core/enemies/charge-enemy-actions.test.ts owns it ("retains the last
// valid target once the Player leaves the range rule" and "declines a warning-time retarget onto a
// cell already claimed"). The telegraph-label rendering path (data-telegraph-labels) is exercised
// by pointer-input.spec.ts. See dev/standards/test_economy_standard.md.
