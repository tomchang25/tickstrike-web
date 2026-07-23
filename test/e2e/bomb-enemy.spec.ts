import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Bomb commits from the adjacent ring, locks its footprint, and self-destructs on detonation", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  const canvas = page.getByTestId("game-canvas");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const committed = await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 20; step += 1) {
      const state = api.getState();
      const bomb = state.entities.find((entity) => entity.id === "enemy-bomb");
      const player = state.entities.find((entity) => entity.id === "player");
      if (!bomb || bomb.phase !== "alive" || !player || player.phase !== "alive") {
        break;
      }
      if (bomb.activity === "telegraphing") {
        break;
      }
      const isFree = (cell: { x: number; y: number }) => {
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) => entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
        );
      };
      const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      // Pick, among the legal cardinal steps, whichever gets closest to Bomb; break
      // ties toward the more axis-imbalanced landing so the final approach step
      // tends to land orthogonally adjacent rather than diagonally adjacent.
      const direction = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]
        .map((candidate) => ({
          direction: candidate,
          cell: { x: player.cell.x + candidate.x, y: player.cell.y + candidate.y },
        }))
        .filter(({ cell }) => isFree(cell))
        .map(({ direction: candidate, cell }) => ({
          direction: candidate,
          distance: chebyshev(cell, bomb.cell),
          axisBalance: Math.abs(Math.abs(cell.x - bomb.cell.x) - Math.abs(cell.y - bomb.cell.y)),
        }))
        .sort((a, b) => a.distance - b.distance || b.axisBalance - a.axisBalance)[0]?.direction;
      if (!direction) {
        break;
      }
      await api.execute({ type: "move", actorId: "player", direction });
    }
    return api.getState().entities.find((entity) => entity.id === "enemy-bomb");
  });

  expect(committed?.activity).toBe("telegraphing");
  expect(committed?.committedAttack).toMatchObject({
    warningTicks: 3,
    damage: 50,
    metadata: { selfDestruct: true },
  });
  expect(committed?.committedAttack?.cells).toContainEqual(committed?.cell);
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-activity", "telegraphing");
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-attack-warning-ticks", "3");
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

test("Bomb disarms when killed before its fuse resolves", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const result = await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 20; step += 1) {
      const state = api.getState();
      const bomb = state.entities.find((entity) => entity.id === "enemy-bomb");
      const player = state.entities.find((entity) => entity.id === "player");
      if (!bomb || bomb.phase !== "alive" || !player || player.phase !== "alive") {
        break;
      }
      if (bomb.activity === "telegraphing") {
        break;
      }
      const isFree = (cell: { x: number; y: number }) => {
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) => entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
        );
      };
      const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      // Pick, among the legal cardinal steps, whichever gets closest to Bomb; break
      // ties toward the more axis-imbalanced landing so the final approach step
      // tends to land orthogonally adjacent rather than diagonally adjacent.
      const direction = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]
        .map((candidate) => ({
          direction: candidate,
          cell: { x: player.cell.x + candidate.x, y: player.cell.y + candidate.y },
        }))
        .filter(({ cell }) => isFree(cell))
        .map(({ direction: candidate, cell }) => ({
          direction: candidate,
          distance: chebyshev(cell, bomb.cell),
          axisBalance: Math.abs(Math.abs(cell.x - bomb.cell.x) - Math.abs(cell.y - bomb.cell.y)),
        }))
        .sort((a, b) => a.distance - b.distance || b.axisBalance - a.axisBalance)[0]?.direction;
      if (!direction) {
        break;
      }
      await api.execute({ type: "move", actorId: "player", direction });
    }
    const afterApproach = api.getState().entities.find((entity) => entity.id === "enemy-bomb");
    if (!afterApproach || afterApproach.phase !== "alive") {
      return { disarmed: false };
    }
    // Bomb is frozen (activity "telegraphing") from here on, so its cell will not
    // change again; only the Player needs to reach and hold an orthogonal angle.
    const aimAtBomb = () => {
      const current = api.getState().entities.find((entity) => entity.id === "player");
      return {
        x: Math.sign(afterApproach.cell.x - (current?.cell.x ?? 0)),
        y: Math.sign(afterApproach.cell.y - (current?.cell.y ?? 0)),
      };
    };
    let direction = aimAtBomb();
    if (direction.x !== 0 && direction.y !== 0) {
      // Diagonally adjacent: closing one axis by one step lands orthogonally
      // adjacent without ever stepping onto Bomb's occupied cell.
      await api.execute({ type: "move", actorId: "player", direction: { x: direction.x, y: 0 } });
      direction = aimAtBomb();
    }
    await api.execute({ type: "attack", actorId: "player", direction });
    await api.execute({ type: "attack", actorId: "player", direction: aimAtBomb() });
    await api.execute({ type: "attack", actorId: "player", direction: aimAtBomb() });
    const bomb = api.getState().entities.find((entity) => entity.id === "enemy-bomb");
    return { disarmed: bomb === undefined };
  });

  expect(result.disarmed).toBe(true);
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveCount(0);
  await expect(page.getByTestId("event-log")).not.toContainText("enemy_self_destructed");
  const finalState = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(finalState?.telegraphs.some((telegraph) => telegraph.sourceId === "enemy-bomb")).toBe(false);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Resetting mid-fuse clears Bomb's telegraph and returns it to a fresh idle state", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/debug?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  const initialBomb = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-bomb"),
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 20; step += 1) {
      const state = api.getState();
      const bomb = state.entities.find((entity) => entity.id === "enemy-bomb");
      const player = state.entities.find((entity) => entity.id === "player");
      if (!bomb || bomb.phase !== "alive" || !player || player.phase !== "alive" || bomb.activity === "telegraphing") {
        break;
      }
      const isFree = (cell: { x: number; y: number }) => {
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) => entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
        );
      };
      const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      const direction = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]
        .map((candidate) => ({
          direction: candidate,
          cell: { x: player.cell.x + candidate.x, y: player.cell.y + candidate.y },
        }))
        .filter(({ cell }) => isFree(cell))
        .map(({ direction: candidate, cell }) => ({
          direction: candidate,
          distance: chebyshev(cell, bomb.cell),
          axisBalance: Math.abs(Math.abs(cell.x - bomb.cell.x) - Math.abs(cell.y - bomb.cell.y)),
        }))
        .sort((a, b) => a.distance - b.distance || b.axisBalance - a.axisBalance)[0]?.direction;
      if (!direction) {
        break;
      }
      await api.execute({ type: "move", actorId: "player", direction });
    }
  });
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-activity", "telegraphing");

  await page.getByRole("button", { name: "Reset scenario" }).click();

  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute("data-activity", "ready");
  const resetBomb = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-bomb"),
  );
  expect(resetBomb?.cell).toEqual(initialBomb?.cell);
  expect(resetBomb?.committedAttack).toBeUndefined();
  const state = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(state?.telegraphs.some((telegraph) => telegraph.sourceId === "enemy-bomb")).toBe(false);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});
