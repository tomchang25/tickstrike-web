import { expect, test } from "@playwright/test";

test("Dash uses directional Guard results and ignores a committed enemy hit during release", async ({
  page,
}) => {
  await page.goto("/?scenario=mobility-combat");

  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-player-profile",
    "character.ninja",
  );
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");
  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }
  await page.mouse.move(box.x + (2.5 / 12) * box.width, box.y + (3.5 / 12) * box.height);
  await expect(canvas).toHaveAttribute("data-player-facing", "1,0");
  await page.mouse.move(box.x + (1.5 / 12) * box.width, box.y + (1.5 / 12) * box.height);
  await expect(canvas).toHaveAttribute("data-player-facing", "0,-1");
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "1");
  await expect(page.getByTestId("entity-enemy-victim")).toHaveAttribute("data-guard", "32");
  await expect(page.getByTestId("entity-enemy-threat")).toHaveAttribute("data-telegraph", "true");

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 3,
    });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "4");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-enemy-victim")).toHaveAttribute("data-hp", "70");
  await expect(page.getByTestId("entity-enemy-victim")).toHaveAttribute("data-guard", "0");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-mobility-cooldown", "4");
  await expect(page.getByTestId("event-log")).toContainText("directional_hit");
  await expect(page.getByTestId("event-log")).toContainText("enemy_guard_broken");
  await expect(page.getByTestId("event-log")).toContainText("enemy_attack_detonated");
  await expect(page.getByTestId("event-log")).not.toContainText("player_damaged");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-facing", "1,0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-mobility-cooldown", "0");
  await expect(page.getByTestId("entity-player")).toHaveAttribute(
    "data-mobility-invulnerable",
    "false",
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});
