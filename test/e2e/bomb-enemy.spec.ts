import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Bomb commits from the adjacent ring, locks its footprint, and self-destructs on detonation", async ({ page }) => {
  await page.goto("/debug?scenario=bomb-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  const canvas = page.getByTestId("game-canvas");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  // Bomb spawns orthogonally adjacent (the bomb-enemy fixture owns that positioning), so the first
  // in-place command commits its self-destruct from the adjacent ring with no approach walk.
  const committed = await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    return api.getState().entities.find((entity) => entity.id === "enemy-bomb");
  });

  expect(committed?.activity).toBe("telegraphing");
  expect(committed?.committedAttack).toMatchObject({
    warningTicks: 5,
    damage: 50,
    metadata: { selfDestruct: true },
  });
  expect(committed?.committedAttack?.cells).toContainEqual(committed?.cell);
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-attack-warning-ticks", "5");
  await expect(canvas).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-bomb:enemy\.bomb:lantern:idle:action:prepare:/,
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });
  // The 5-tick fuse counts down one tick per in-place command.
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-attack-warning-ticks", "3");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-bomb:.*:action:prepare:/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-attack-warning-ticks", "1");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-bomb:.*:action:prepare:/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(canvas).toHaveAttribute("data-retained-presentations", /enemy-bomb:.*:action:execute:/);
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveCount(0);
  await expect(page.getByTestId("event-log")).toContainText("enemy_self_destructed");
  await expect(page.getByTestId("event-log")).toContainText("enemy_died");
  const finalState = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(finalState?.telegraphs.some((telegraph) => telegraph.sourceId === "enemy-bomb")).toBe(false);
  expect(finalState?.reservations.some((reservation) => reservation.ownerId === "enemy-bomb")).toBe(false);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).not.toHaveAttribute("data-retained-presentations", /enemy-bomb:/);
});

// Bomb's disarm-when-killed and reset-mid-fuse behavior is core, not presentation: it is owned by
// test/unit/core/enemies/bomb-enemy-actions.test.ts ("disarms immediately when killed before the
// fuse resolves", "clears the committed attack and telegraph on a mid-fuse combat reset"). This
// spec keeps only the one browser-observable commit → fuse presentation → self-destruct ghost
// lifecycle above. See dev/standards/test_economy_standard.md.
