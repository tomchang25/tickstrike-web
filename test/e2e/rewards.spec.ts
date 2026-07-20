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
    const sameCell = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x === b.x && a.y === b.y;
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
      const enemy = state.entities.find(
        (entity) => entity.kind === "enemy" && entity.phase === "alive",
      );
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
        if (
          cell.x < 0 ||
          cell.y < 0 ||
          cell.x >= state.arena.width ||
          cell.y >= state.arena.height
        ) {
          return false;
        }
        const index = cell.y * state.arena.width + cell.x;
        if (state.arena.tiles[index] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) => entity.phase === "alive" && sameCell(entity.cell, cell),
        );
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

interface EffectCase {
  readonly artifactId: string;
  readonly assert: (before: WorldSnapshot, after: WorldSnapshot) => void;
}

const EFFECT_CASES: readonly EffectCase[] = [
  {
    artifactId: "attack_up",
    assert: (before, after) => {
      expect(requirePlayer(after).normalAttackDamage).toBe(
        (requirePlayer(before).normalAttackDamage ?? 0) + 10,
      );
    },
  },
  {
    artifactId: "dash_attack_up",
    assert: (before, after) => {
      expect(requirePlayer(after).mobility?.damage).toBe(
        (requirePlayer(before).mobility?.damage ?? 0) + 20,
      );
    },
  },
  {
    artifactId: "mobility_cooldown_down",
    assert: (before, after) => {
      expect(requirePlayer(after).mobility?.cooldown).toBe(
        (requirePlayer(before).mobility?.cooldown ?? 0) - 1,
      );
    },
  },
  {
    artifactId: "mobility_range_up",
    assert: (before, after) => {
      expect(requirePlayer(after).mobility?.range).toBe(
        (requirePlayer(before).mobility?.range ?? 0) + 1,
      );
    },
  },
  {
    artifactId: "max_health_up",
    assert: (before, after) => {
      expect(requirePlayer(after).maxHp).toBe(requirePlayer(before).maxHp + 20);
      expect(requirePlayer(after).hp).toBe(requirePlayer(before).hp + 20);
    },
  },
  {
    artifactId: "guard_shredder",
    assert: (_before, after) => {
      expect(after.runBuild.triggers).toContain("guard-shredder");
    },
  },
  {
    artifactId: "execution",
    assert: (_before, after) => {
      expect(after.runBuild.triggers).toContain("execution");
    },
  },
];

test("Every supported reward effect applies once through the same overlay, and reset clears them all", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/?scenario=rewards");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initial = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(initial?.tick).toBe(0);
  expect(initial?.pendingReward).toBeUndefined();
  expect(initial?.runBuild).toEqual({ stacks: {}, triggers: [] });
  expect(initial?.waveRuntime).toMatchObject({ waveNumber: 1 });
  const basePlayer = requirePlayer(initial);
  expect(basePlayer.normalAttackDamage).toBeGreaterThan(0);

  const overlay = page.getByTestId("reward-overlay");

  for (const [index, effectCase] of EFFECT_CASES.entries()) {
    await clearWaveForReward(page);
    const paused = await page.evaluate(() => window.__TICKSTRIKE__?.getState());

    expect(paused?.pendingReward).toEqual({
      waveNumber: index + 1,
      cards: [{ artifactId: effectCase.artifactId, resultingStackCount: 1 }],
    });

    await expect(overlay).toBeVisible();
    const card = page.getByTestId(`reward-card-${effectCase.artifactId}`);
    await expect(card).toBeVisible();

    if (index === 0) {
      // Depth-check the pause guarantees once: a command and keyboard input are both inert.
      const tickBeforeReject = paused?.tick;
      await page.evaluate(async () => {
        await window.__TICKSTRIKE__?.execute({
          type: "move",
          actorId: "player",
          direction: { x: 0, y: 1 },
        });
      });
      const afterRejected = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
      expect(afterRejected?.tick).toBe(tickBeforeReject);
      expect(afterRejected?.pendingReward).toBeDefined();

      await page.keyboard.press("d");
      const afterKeyboard = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
      expect(afterKeyboard?.tick).toBe(tickBeforeReject);
    }

    await card.click();
    await expect(overlay).toHaveCount(0);

    const after = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
    expect(after?.pendingReward).toBeUndefined();
    expect(after?.runBuild.stacks[effectCase.artifactId]).toBe(1);
    if (!paused || !after) {
      throw new Error("Expected snapshots before and after selection.");
    }
    effectCase.assert(paused, after);
  }

  // Reset restores every acquired stack, trigger, and player field with no stale UI.
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset?.pendingReward).toBeUndefined();
  expect(reset?.runBuild).toEqual({ stacks: {}, triggers: [] });
  const resetPlayer = requirePlayer(reset);
  expect(resetPlayer.normalAttackDamage).toBe(basePlayer.normalAttackDamage);
  expect(resetPlayer.mobility).toEqual(basePlayer.mobility);
  expect(resetPlayer.maxHp).toBe(basePlayer.maxHp);
  expect(resetPlayer.hp).toBe(basePlayer.hp);
  expect(reset?.waveRuntime).toMatchObject({ waveNumber: 1 });
  await expect(page.getByTestId("reward-overlay")).toHaveCount(0);
});
