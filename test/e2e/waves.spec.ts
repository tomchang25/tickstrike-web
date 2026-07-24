import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Waves scenario renders the spawn warning, spawns the group, and resets", async ({ page }) => {
  await page.goto("/debug?scenario=waves");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initial = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(initial?.tick).toBe(0);
  expect(initial?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);
  expect(initial?.telegraphs).toHaveLength(0);
  expect(initial?.reservations).toHaveLength(0);
  expect(initial?.waveRuntime).toMatchObject({ waveNumber: 1 });

  // The first accepted command admits Wave 1's group and shows its warning; no fixture enemy
  // exists before this, so nothing but the wave phase can be responsible for it.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  const warned = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(warned?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);
  expect(warned?.telegraphs).toHaveLength(1);
  expect(warned?.telegraphs[0]).toMatchObject({ phase: "spawning", remainingTicks: 1 });
  const spawnReservations = warned?.reservations.filter((reservation) => reservation.purpose === "spawn");
  expect(spawnReservations).toHaveLength(1);
  // The reservation blocking movement covers exactly the cells shown in the telegraph.
  expect(spawnReservations?.[0]?.cells).toEqual(warned?.telegraphs[0]?.cells);
  const reservedCell = spawnReservations?.[0]?.cells[0];
  if (!reservedCell) {
    throw new Error("Expected the spawn warning to reserve at least one cell.");
  }
  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toHaveAttribute("data-telegraph-source-count", "1");
  await expect(canvas).toHaveAttribute("data-spawn-telegraph-count", "1");
  await expect(canvas).toHaveAttribute("data-telegraph-labels", /:1(?:@|\||$)/);
  await expect.poll(() => page.evaluate((cell) => window.__TICKSTRIKE__?.isWalkable(cell), reservedCell)).toBe(false);

  // The following accepted command expires the warning through Child C's normal spawn path.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("2");
  const spawned = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(spawned?.telegraphs).toHaveLength(0);
  expect(spawned?.reservations.filter((reservation) => reservation.purpose === "spawn")).toHaveLength(0);
  const wave1Enemies = spawned?.entities.filter(
    (entity) => entity.kind === "enemy" && entity.id.startsWith("wave-1-slot-0-"),
  );
  expect(wave1Enemies).toHaveLength(3);
  await expect(page.getByTestId("enemy-count")).toHaveText("3");

  // Wave clearing, the Wave 2 warning in the same arena, and reset-to-Wave-1 are wave-runtime
  // semantics owned by test/unit/core/actions/wave-phase.test.ts,
  // test/unit/harness/waves.scenario.test.ts, and the waves determinism golden. This spec keeps only
  // the browser-observable spawn-warning render above and the reset below.
  // See dev/standards/test_economy_standard.md.
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset?.waveRuntime).toMatchObject({ waveNumber: 1 });
  expect(reset?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);
  expect(reset?.telegraphs).toHaveLength(0);
  expect(reset?.reservations).toHaveLength(0);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});
