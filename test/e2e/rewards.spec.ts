import { expect, test, type Page } from "@playwright/test";
import type { TickstrikeDebugApi } from "../../src/harness/debug-api";
import type { EntityState, WorldSnapshot } from "../../src/core/model/types";

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

function requirePlayer(state: WorldSnapshot | undefined): EntityState {
  const player = state?.entities.find((entity) => entity.id === "player");
  if (!player) {
    throw new Error("Expected a player entity in the snapshot.");
  }
  return player;
}

async function readState(page: Page): Promise<WorldSnapshot> {
  const state = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  if (!state) {
    throw new Error("Expected a world snapshot from the debug API.");
  }
  return state;
}

/**
 * Drives accepted commands until the current wave's single passive (no `enemyAction`) enemy is
 * dead and its reward offer is pending — nudging with a harmless whiff while the wave is still
 * warning or between clear and the next admission, then chasing and killing once it spawns.
 */
async function clearWaveForReward(page: Page): Promise<void> {
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

    for (let step = 0; step < 200; step += 1) {
      const state = api.getState();
      if (state.pendingReward) {
        return;
      }
      const player = state.entities.find((entity) => entity.id === "player");
      if (!player) {
        return;
      }
      const enemy = state.entities.find((entity) => entity.kind === "enemy" && entity.phase === "alive");
      if (!enemy) {
        // The next wave hasn't warned or spawned yet: a harmless whiff advances the wave phase.
        await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
        continue;
      }
      if (distance(player.cell, enemy.cell) === 1) {
        await api.execute({
          type: "attack",
          actorId: "player",
          direction: { x: enemy.cell.x - player.cell.x, y: enemy.cell.y - player.cell.y },
        });
        continue;
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
        return !state.entities.some((entity) => entity.phase === "alive" && sameCell(entity.cell, cell));
      });
      const toward = [...candidates].sort((a, b) => {
        const nextA = { x: player.cell.x + a.x, y: player.cell.y + a.y };
        const nextB = { x: player.cell.x + b.x, y: player.cell.y + b.y };
        return distance(nextA, enemy.cell) - distance(nextB, enemy.cell);
      })[0];
      if (!toward) {
        return;
      }
      await api.execute({ type: "move", actorId: "player", direction: toward });
    }
  });
}

test("Reward offer presents its cards and a live build HUD, all cleared on reset", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/debug?scenario=rewards");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initial = await readState(page);
  expect(initial.tick).toBe(0);
  expect(initial.pendingReward).toBeUndefined();
  expect(initial.runBuild).toEqual({ stacks: {}, triggers: [] });
  const basePlayer = requirePlayer(initial);
  expect(basePlayer.normalAttackDamage).toBeGreaterThan(0);

  const overlay = page.getByTestId("reward-overlay");
  await expect(page.getByTestId("run-build-empty")).toBeVisible();

  // Clear one wave to open its reward offer. The card composition across ordinary and milestone
  // waves (three distinct Minors, stack counts, the Major cadence) and the effect each selection
  // applies are owned by test/unit/core/rewards/reward-offers.test.ts and
  // test/unit/core/actions/wave-phase.test.ts (including the Guard Shredder / Execution triggers).
  // This spec keeps only the browser overlay, the live build HUD, the pause, and reset.
  // See dev/standards/test_economy_standard.md.
  await clearWaveForReward(page);
  const wave1 = await readState(page);
  const offer1 = wave1.pendingReward;
  expect(offer1?.waveNumber).toBe(1);
  await expect(overlay).toBeVisible();
  for (const card of offer1?.cards ?? []) {
    await expect(page.getByTestId(`reward-card-${card.artifactId}`)).toBeVisible();
  }

  // The pause is real: a command and keyboard input are both inert while an offer is open.
  const tickBeforeReject = wave1.tick;
  await page.evaluate(async () => {
    await window.__TICKSTRIKE__?.execute({ type: "move", actorId: "player", direction: { x: 0, y: 1 } });
  });
  expect((await readState(page)).tick).toBe(tickBeforeReject);
  await page.keyboard.press("d");
  expect((await readState(page)).tick).toBe(tickBeforeReject);

  // Selecting a card closes the overlay and surfaces the pick on the live build HUD.
  const firstPick = offer1!.cards[0]!.artifactId;
  await page.getByTestId(`reward-card-${firstPick}`).click();
  await expect(overlay).toHaveCount(0);
  const afterWave1 = await readState(page);
  expect(afterWave1.pendingReward).toBeUndefined();
  expect(afterWave1.runBuild.stacks[firstPick]).toBe(1);
  await expect(page.getByTestId(`run-build-item-${firstPick}`)).toBeVisible();
  await expect(page.getByTestId(`run-build-item-${firstPick}`)).toHaveAttribute("data-stack", "1");

  // Reset clears the build, HUD, and any open offer, and restores the player.
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  const reset = await readState(page);
  expect(reset.pendingReward).toBeUndefined();
  expect(reset.runBuild).toEqual({ stacks: {}, triggers: [] });
  const resetPlayer = requirePlayer(reset);
  expect(resetPlayer.normalAttackDamage).toBe(basePlayer.normalAttackDamage);
  expect(resetPlayer.mobility).toEqual(basePlayer.mobility);
  expect(resetPlayer.maxHp).toBe(basePlayer.maxHp);
  expect(resetPlayer.hp).toBe(basePlayer.hp);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("run-build-empty")).toBeVisible();
});
