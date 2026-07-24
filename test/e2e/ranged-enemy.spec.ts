import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Ranged enemy moves into its band, locks Cross cells, recovers, and resets cleanly", async ({ page }) => {
  await page.goto("/debug?scenario=ranged-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const canvas = page.getByTestId("game-canvas");
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "resting");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-cell-y", "3");
  const movementState = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged"),
  );
  expect(movementState).toMatchObject({ cell: { x: 6, y: 3 }, lastDecision: "move" });
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:idle/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "ready");

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("3");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "4");
  // The committed Cross footprint and target-facing geometry are core, owned by
  // test/unit/core/enemies/ranged-enemy-actions.test.ts ("commits a player-centered Cross ...",
  // "locks the center and cells through warning ..."). This spec asserts only the browser-observable
  // presentation-state transitions. See dev/standards/test_economy_standard.md.
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:prepareAttack/);

  const holdRanged = () =>
    page.evaluate(async () => {
      const api = window.__TICKSTRIKE__;
      if (!api) {
        throw new Error("Tickstrike debug API is unavailable.");
      }
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
    });

  // The 4-tick windup counts down one tick per in-place command, surfaced on the presenter.
  await holdRanged();
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "3");

  await holdRanged();
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "2");
  await holdRanged();
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-attack-warning-ticks", "1");

  await holdRanged();
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "recovering");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-telegraph", "false");
  await expect(page.getByTestId("event-log")).toContainText("enemy_attack_detonated");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-telegraph-count", "0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-ranged:enemy\.ranged:eye:idle/);
});
