import { expect, test } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

test("Waves scenario warns, spawns, clears, and warns the next group in the same arena", async ({ page }) => {
  test.setTimeout(45_000);
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

  // Clear Wave 1 with a bounded, deterministic combat loop driven only by accepted commands.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    const DIRECTIONS = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    for (let step = 0; step < 300; step += 1) {
      const state = api.getState();
      const player = state.entities.find((entity) => entity.id === "player");
      if (!player || player.phase !== "alive") {
        break;
      }
      const enemies = state.entities.filter(
        (entity) => entity.kind === "enemy" && entity.id.startsWith("wave-1-slot-0-") && entity.phase === "alive",
      );
      if (enemies.length === 0) {
        break;
      }

      const candidates = DIRECTIONS.filter((direction) => {
        const cell = { x: player.cell.x + direction.x, y: player.cell.y + direction.y };
        if (cell.x < 0 || cell.y < 0 || cell.x >= state.arena.width || cell.y >= state.arena.height) {
          return false;
        }
        const index = cell.y * state.arena.width + cell.x;
        if (state.arena.tiles[index] !== "floor") {
          return false;
        }
        if (state.entities.some((entity) => entity.phase === "alive" && sameCell(entity.cell, cell))) {
          return false;
        }
        return !state.telegraphs.some((telegraph) =>
          telegraph.cells.some((telegraphCell) => sameCell(telegraphCell, cell)),
        );
      });
      const playerIsThreatened = state.telegraphs.some((telegraph) =>
        telegraph.cells.some((cell) => sameCell(cell, player.cell)),
      );
      const threatenedRetreat = candidates[0];
      if (playerIsThreatened && threatenedRetreat) {
        await api.execute({ type: "move", actorId: "player", direction: threatenedRetreat });
        continue;
      }

      const adjacent = enemies.find((enemy) => distance(enemy.cell, player.cell) === 1);
      if (adjacent) {
        const relation = { x: player.cell.x - adjacent.cell.x, y: player.cell.y - adjacent.cell.y };
        const isFront = adjacent.facing && relation.x === adjacent.facing.x && relation.y === adjacent.facing.y;
        if (isFront) {
          const flank = candidates.find((direction) => {
            const cell = { x: player.cell.x + direction.x, y: player.cell.y + direction.y };
            return (
              distance(cell, adjacent.cell) === 1 &&
              !(cell.x - adjacent.cell.x === adjacent.facing?.x && cell.y - adjacent.cell.y === adjacent.facing?.y)
            );
          });
          if (flank) {
            await api.execute({ type: "move", actorId: "player", direction: flank });
            continue;
          }
        }
        await api.execute({
          type: "attack",
          actorId: "player",
          direction: { x: adjacent.cell.x - player.cell.x, y: adjacent.cell.y - player.cell.y },
        });
        continue;
      }

      const aligned = enemies.find((enemy) => enemy.cell.x === player.cell.x || enemy.cell.y === player.cell.y);
      if (aligned && (!player.mobility || player.mobility.remainingCooldown === 0)) {
        const direction =
          aligned.cell.x === player.cell.x
            ? { x: 0, y: Math.sign(aligned.cell.y - player.cell.y) }
            : { x: Math.sign(aligned.cell.x - player.cell.x), y: 0 };
        await api.execute({ type: "dash", actorId: "player", direction });
        continue;
      }

      const target = [...enemies].sort((a, b) => distance(a.cell, player.cell) - distance(b.cell, player.cell))[0];
      if (!target) {
        break;
      }
      const toward = DIRECTIONS.filter((direction) =>
        direction.x !== 0 ? target.cell.x !== player.cell.x : target.cell.y !== player.cell.y,
      )
        .sort((a, b) => {
          const nextA = { x: player.cell.x + a.x, y: player.cell.y + a.y };
          const nextB = { x: player.cell.x + b.x, y: player.cell.y + b.y };
          return distance(nextA, target.cell) - distance(nextB, target.cell);
        })
        .find((direction) => candidates.some((candidate) => sameCell(candidate, direction)));
      const move = toward ?? candidates[0] ?? DIRECTIONS[0];
      if (!move) {
        break;
      }
      await api.execute({ type: "move", actorId: "player", direction: move });
    }
  });

  await expect
    .poll(async () =>
      page.evaluate(
        () => window.__TICKSTRIKE__?.getState().entities.filter((entity) => entity.kind === "enemy").length,
      ),
    )
    .toBe(0);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  // The tick that kills Wave 1's last enemy clears the wave and installs Wave 2 (still
  // unwarned); the very next accepted command latches Wave 2's slot eligible and admits its
  // group in the same call, warning it in the same arena with no fixture reset or route change.
  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });

  const wave2Warned = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(wave2Warned?.waveRuntime?.waveNumber).toBe(2);
  expect(wave2Warned?.telegraphs).toHaveLength(1);
  expect(wave2Warned?.telegraphs[0]).toMatchObject({ phase: "spawning" });
  expect(wave2Warned?.reservations.filter((reservation) => reservation.purpose === "spawn")).toHaveLength(1);
  expect(wave2Warned?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);

  // Deterministic reset returns to Wave 1 with no leftover spawn state from Wave 2.
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset?.waveRuntime).toMatchObject({ waveNumber: 1 });
  expect(reset?.entities.filter((entity) => entity.kind === "enemy")).toHaveLength(0);
  expect(reset?.telegraphs).toHaveLength(0);
  expect(reset?.reservations).toHaveLength(0);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});
