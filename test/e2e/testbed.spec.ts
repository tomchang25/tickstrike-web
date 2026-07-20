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
  await page.goto("/?scenario=smash-water");

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
  await expect(canvas).toHaveAttribute(
    "data-preview-displacements",
    "enemy-right:5,3>7,3;enemy-water:4,4>4,6",
  );
  await expect(canvas).toHaveAttribute(
    "data-preview-terminal",
    "enemy-center:crush;enemy-water:water",
  );
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
    .poll(async () =>
      page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-water"))),
    )
    .toBe(false);
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-center"))),
    )
    .toBe(false);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-enemy-center")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("enemy-count")).toHaveText("4");
  await expect
    .poll(async () =>
      page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-center"))),
    )
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
    await page.goto(`/?scenario=${scenario}`);
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
        page.evaluate(() =>
          (window.__RETAINED_PRESENTATION_LOG__ ?? []).some((entry) => entry.includes(":water:7")),
        ),
      )
      .toBe(true);
    await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
    await expect(page.getByTestId("entity-enemy-water")).toHaveCount(0);
    await expect(canvas).not.toHaveAttribute("data-retained-presentations", /enemy-water:/);
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(window.__TICKSTRIKE__?.getEntityBounds("enemy-water"))),
      )
      .toBe(false);
  });
}

test("switching between water scenarios reconciles the reused entity's presentation", async ({
  page,
}) => {
  await page.goto("/?scenario=water-ranged");
  const canvas = page.getByTestId("game-canvas");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-water:enemy\.ranged:/);

  await page.getByTestId("scenario-select").selectOption("water-bomb");
  await expect(canvas).toHaveAttribute("data-enemy-presentations", /enemy-water:enemy\.bomb:/);
  await expect(canvas).not.toHaveAttribute("data-enemy-presentations", /enemy\.ranged/);
});

test("Charge owns sequential Player motion before reconciling the final cell", async ({ page }) => {
  await page.goto("/?scenario=charge-enemy");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
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
  await executeLeft();
  await executeLeft();
  await executeLeft();

  const canvas = page.getByTestId("game-canvas");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-x", "8");
  await expect(page.getByTestId("entity-enemy-side-blocker")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("event-log")).toContainText("entity_displaced");
  await expect(page.getByTestId("event-log")).toContainText("charge_landed");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(false);

  const inMotion = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    const bounds = api?.getEntityBounds("player");
    if (!api || !canvas || !bounds) {
      throw new Error("Charge motion bounds are unavailable.");
    }
    const rect = canvas.getBoundingClientRect();
    const state = api.getState();
    return {
      logicalCell: state.entities.find((entity) => entity.id === "player")?.cell,
      visualCenterX: bounds.x + bounds.width / 2,
      finalCellCenterX: rect.left + (3.5 / 12) * rect.width,
    };
  });
  expect(inMotion.logicalCell).toEqual({ x: 3, y: 3 });
  expect(inMotion.visualCenterX).toBeGreaterThan(inMotion.finalCellCenterX);

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const settled = await page.evaluate(() => {
    const api = window.__TICKSTRIKE__;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=game-canvas]");
    const bounds = api?.getEntityBounds("player");
    if (!api || !canvas || !bounds) {
      throw new Error("Settled Charge bounds are unavailable.");
    }
    const rect = canvas.getBoundingClientRect();
    return Math.round(bounds.x + bounds.width / 2 - (rect.left + (3.5 / 12) * rect.width));
  });
  expect(settled).toBe(0);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "2");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "3");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute("data-player-animation", "idle");
});

test("Charge retains its facing-direction telegraph when the Player moves aside", async ({
  page,
}) => {
  await page.goto("/?scenario=charge-enemy");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: -1, y: 0 } });
  });
  await expect(page.getByTestId("entity-enemy-charge")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-telegraph-labels",
    /8,3:2.*7,3:2.*6,3:2/,
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "2");
  await expect(page.getByTestId("entity-enemy-charge")).toHaveAttribute(
    "data-attack-warning-ticks",
    "1",
  );
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-telegraph-labels",
    /8,3:1.*7,3:1.*6,3:1/,
  );
});

test("Enemy navigation testbed exposes blocked and reserved grid cells", async ({ page }) => {
  await page.goto("/?scenario=enemy-navigation");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("enemy-count")).toHaveText("20");
  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");
  await expect(page.getByTestId("mobility-status")).toHaveText("Ready");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-damage-immune", "true");
  await expect(page.locator("[data-testid^=entity-enemy-thrust]")).toHaveCount(10);
  await expect(page.locator("[data-testid^=entity-enemy-slash]")).toHaveCount(10);

  const canvas = page.getByTestId("game-canvas");
  await page.getByTestId("debug-mode").check();
  await expect(page.getByTestId("grid-debug-legend")).toBeVisible();
  await expect(page.getByTestId("grid-debug-reservations")).toHaveText("Navigation blockers: 7");
  await expect(canvas).toHaveAttribute("data-debug-navigation-blocker-count", "7");
  await expect(canvas).toHaveAttribute("data-debug-blocked-count", /[1-9]/);
  await expect(canvas).toHaveAttribute("data-debug-navigation-blocker-cells", /2,4/);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "move", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-hp", "100");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-mobility-cooldown", "0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Empty arena presents the shipped board and deterministic start", async ({ page }) => {
  await page.goto("/?scenario=empty-arena");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-player-profile",
    "character.ninja",
  );
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-facing", "1,0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");

  const arena = await page.evaluate(() => window.__TICKSTRIKE__?.getState().arena);
  expect(arena).toMatchObject({ width: 12, height: 12 });
  expect(arena?.terrain.filter((terrain) => terrain === "land")).toHaveLength(100);
  expect(arena?.terrain.filter((terrain) => terrain === "sea")).toHaveLength(44);
});

test("Held movement queues steps and settles each player presentation in order", async ({
  page,
}) => {
  await page.goto("/?scenario=empty-arena");

  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  const canvas = page.getByTestId("game-canvas");
  await expect(page.locator("html")).toHaveAttribute("data-keyboard-input-ready", "true");
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.getState().tick ?? 0))
    .toBeGreaterThan(1);
  await expect(canvas).toHaveAttribute("data-player-animation", "move");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Game canvas has no layout box.");
  }
  const playerCell = await page.evaluate(() => window.__TICKSTRIKE__?.getState().playerCell);
  if (!playerCell) {
    throw new Error("Player cell is unavailable.");
  }
  await page.mouse.move(
    canvasBox.x + ((playerCell.x + 0.5) / 12) * canvasBox.width,
    canvasBox.y + ((playerCell.y - 2 + 0.5) / 12) * canvasBox.height,
  );
  await expect(canvas).toHaveAttribute("data-player-facing", "1,0");
  const tickBeforeRelease = await page.evaluate(() => window.__TICKSTRIKE__?.getState().tick ?? 0);
  await page.keyboard.up("ArrowRight");

  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  const state = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(state?.tick).toBe(tickBeforeRelease);
  expect(state?.playerCell?.x).toBeGreaterThan(6);
  await expect(canvas).toHaveAttribute("data-player-animation", "idle");
  await expect(canvas).toHaveAttribute("data-player-facing", "1,0");
  if (!state?.playerCell) {
    throw new Error("Player cell is unavailable after movement.");
  }
  await page.mouse.move(
    canvasBox.x + ((state.playerCell.x + 0.5) / 12) * canvasBox.width,
    canvasBox.y + ((state.playerCell.y - 3 + 0.5) / 12) * canvasBox.height,
  );
  await expect(canvas).toHaveAttribute("data-player-facing", "0,-1");
});

test("Foundation arena resets its generation without stale presentation state", async ({
  page,
}) => {
  await page.goto("/?scenario=tick-arena");

  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-enemy-thrust")).toBeAttached();
  await expect(page.getByTestId("entity-enemy-slash")).toBeAttached();
  await expect(page.getByTestId("enemy-statuses")).toBeVisible();
  await expect(page.getByTestId("enemy-hp-enemy-thrust")).toContainText("100/100");
  await expect(page.getByTestId("enemy-guard-enemy-thrust")).toContainText("32/32");
  await expect(page.getByTestId("entity-enemy-ranged")).toBeAttached();
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:idle.*enemy-slash:enemy\.slash:purple:idle/,
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-facing-x", "1");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-facing-y", "0");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-telegraph", "false");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute(
    "data-committed-attack-count",
    "0",
  );
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-width", "12");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-height", "12");
  await expect(page.getByTestId("debug-mode")).not.toBeChecked();
  await expect(page.getByTestId("enemies-state")).toHaveCount(0);
  await page.getByTestId("debug-mode").check();
  await expect(page.getByTestId("enemies-state")).toHaveCount(0);
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-debug-mode", "true");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:idle.*enemy-slash:enemy\.slash:purple:idle/,
  );

  const initial = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  const reset = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(reset).toEqual(initial);
  expect(await page.getByTestId("semantic-mirror").getAttribute("data-reservation-count")).toBe(
    "0",
  );
  expect(await page.getByTestId("semantic-mirror").getAttribute("data-telegraph-count")).toBe("0");
});

test("Tick Arena presents mobility controls without a Normal Attack panel", async ({ page }) => {
  await page.goto("/?scenario=tick-arena");

  await expect(page.getByTestId("active-mobility")).toHaveText("Mobility: Dash");

  await expect(page.getByRole("heading", { name: "Move" })).toHaveCount(0);
  await expect(page.getByTestId("move-right")).toHaveCount(0);
  await expect(page.getByTestId("dash-right")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Normal Attack" })).toHaveCount(0);
  await expect(page.getByTestId("attack-right")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-telegraph-count", "3");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-telegraph-labels",
    /7,6:.*@head.*8,6:.*@head/,
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute(
    "data-attack-warning-ticks",
    "2",
  );
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute(
    "data-attack-warning-ticks",
    "2",
  );
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-attack-warning-ticks",
    "2",
  );
  await expect(page.getByTestId("game-canvas")).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-thrust:enemy\.thrust:green:prepareAttack.*enemy-slash:enemy\.slash:purple:prepareAttack.*enemy-ranged:enemy\.ranged:eye:prepareAttack/,
  );
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveAttribute("data-telegraph", "true");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute(
    "data-committed-attack-count",
    "3",
  );
  await expect(page.getByTestId("enemy-telegraph-count")).toHaveText("3");

  await page.keyboard.press("l");
  await expect(page.getByTestId("tick-value")).toHaveText("2");
  await expect(page.getByTestId("event-log")).toContainText("player_attacked");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-state", "alive");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "96");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-guard", "28");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute(
    "data-status",
    "telegraphing",
  );
  await expect(page.getByTestId("enemy-guard-enemy-slash")).toContainText("28/32");
  await expect(page.getByTestId("event-log")).toContainText("enemy_damaged");

  const canvas = page.getByTestId("game-canvas");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }
  const dashTarget = {
    x: box.x + ((9 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };
  await page.keyboard.down("Alt");
  await page.mouse.move(dashTarget.x, dashTarget.y);
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "9,6");
  await page.mouse.click(dashTarget.x, dashTarget.y);
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("tick-value")).toHaveText("3");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "9");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "90");
  await expect(page.getByTestId("event-log")).toContainText("player_dashed");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-facing", "1,0");
  await expect(page.getByTestId("game-canvas")).toHaveAttribute("data-player-animation", "idle");
  const dashEvent = await page.evaluate(() => window.__TICKSTRIKE__?.getState().lastEvents[1]);
  expect(dashEvent).toMatchObject({
    type: "player_dashed",
    path: [
      { x: 8, y: 6 },
      { x: 9, y: 6 },
    ],
  });
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  expect(await page.getByTestId("event-log").locator("li").allTextContents()).toContain(
    "directional_hit",
  );
  expect(await page.getByTestId("event-log").locator("li").allTextContents()).toContain(
    "enemy_attack_detonated",
  );
  const observedEventTypes = await page.evaluate(() =>
    window.__TICKSTRIKE__?.getState().lastEvents.map((event) => event.type),
  );
  expect(observedEventTypes).toEqual(
    await page.getByTestId("event-log").locator("li").allTextContents(),
  );
});

test("Dash aimed at an enemy lands before it without dealing damage", async ({ page }) => {
  await page.goto("/?scenario=tick-arena");

  const canvas = page.getByTestId("game-canvas");
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Game canvas has no layout box.");
  }

  const enemyTarget = {
    x: box.x + ((8 + 0.5) / 12) * box.width,
    y: box.y + ((6 + 0.5) / 12) * box.height,
  };
  await page.keyboard.down("Alt");
  await page.mouse.move(enemyTarget.x, enemyTarget.y);
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "7,6");
  await page.mouse.click(enemyTarget.x, enemyTarget.y);
  await page.keyboard.up("Alt");

  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-slash")).toHaveAttribute("data-hp", "100");

  const lastEvents = await page.evaluate(() => window.__TICKSTRIKE__?.getState().lastEvents);
  expect(lastEvents).not.toContainEqual(
    expect.objectContaining({
      type: "enemy_damaged",
      enemyId: "enemy-slash",
    }),
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Ranged enemy moves into its band, locks Cross cells, recovers, and resets cleanly", async ({
  page,
}) => {
  await page.goto("/?scenario=ranged-enemy");
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
  await expect(canvas).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-ranged:enemy\.ranged:eye:idle/,
  );

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
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-attack-warning-ticks",
    "2",
  );
  const committed = await page.evaluate(
    () =>
      window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged")
        ?.committedAttack,
  );
  expect(committed).toMatchObject({
    metadata: { targetCenter: { x: 6, y: 6 } },
    cells: [
      { x: 6, y: 6 },
      { x: 6, y: 5 },
      { x: 6, y: 7 },
      { x: 7, y: 6 },
      { x: 5, y: 6 },
    ],
  });
  await expect(canvas).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-ranged:enemy\.ranged:eye:prepareAttack/,
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-attack-warning-ticks",
    "1",
  );
  const lockedDuringWarning = await page.evaluate(
    () =>
      window.__TICKSTRIKE__?.getState().entities.find((entity) => entity.id === "enemy-ranged")
        ?.committedAttack?.cells,
  );
  expect(lockedDuringWarning).toEqual(committed?.cells);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: 1 } });
  });
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute(
    "data-activity",
    "recovering",
  );
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-telegraph", "false");
  await expect(page.getByTestId("event-log")).toContainText("enemy_attack_detonated");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("entity-enemy-ranged")).toHaveAttribute("data-activity", "ready");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-telegraph-count", "0");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
  await expect(canvas).toHaveAttribute(
    "data-enemy-presentations",
    /enemy-ranged:enemy\.ranged:eye:idle/,
  );
});

test("Pointer aiming previews attack and Mobility without advancing until click", async ({
  page,
}) => {
  await page.goto("/?scenario=tick-arena");

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

  const emptyAttackCell = await pointForCell(7, 6);
  await page.mouse.move(emptyAttackCell.x, emptyAttackCell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "attack");
  await expect(canvas).toHaveAttribute("data-attack-preview-cell", "7,6");
  await expect(canvas).toHaveAttribute("data-attack-target", "empty");
  await expect(page.getByTestId("tick-value")).toHaveText("0");

  await page.mouse.click(emptyAttackCell.x, emptyAttackCell.y);
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("event-log")).toContainText("player_attacked");

  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await canvas.scrollIntoViewIfNeeded();

  await page.keyboard.down("Alt");
  const validMobilityCell = await pointForCell(7, 6);
  await page.mouse.move(validMobilityCell.x, validMobilityCell.y);
  await expect(canvas).toHaveAttribute("data-pointer-mode", "mobility");
  await expect(canvas).toHaveAttribute("data-selected-mobility", "dash");
  await expect(canvas).toHaveAttribute("data-mobility-preview-cell", "7,6");
  await expect(canvas).toHaveAttribute("data-mobility-preview-valid", "true");
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await page.mouse.click(validMobilityCell.x, validMobilityCell.y);
  await expect(page.getByTestId("tick-value")).toHaveText("1");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "7");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("event-log")).toContainText("player_dashed");
  await page.keyboard.up("Alt");
});

test("Tick Arena presents defeat and restarts cleanly after a committed hit", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
  });

  await expect(page.getByTestId("encounter-result")).toHaveAttribute("data-outcome", "defeat");
  await expect(page.getByTestId("encounter-result")).toContainText("Defeat");
  await expect(page.getByTestId("event-log")).toContainText("player_died");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "defeat");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.getByRole("button", { name: "Restart encounter" }).click();
  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("encounter-status")).toContainText("Running");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Terminal presentation is cancelled before reset and scenario replacement", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto("/?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__TICKSTRIKE__))).toBe(true);

  const initialGeneration = await page.evaluate(() => window.__TICKSTRIKE__?.getGeneration());

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
    if (api.getState().outcome !== "defeat") {
      throw new Error("Expected the terminal defeat state before reset.");
    }
    api.reset();
  });

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect(page.getByTestId("entity-enemy-thrust")).toBeAttached();
  const resetGeneration = await page.evaluate(() => window.__TICKSTRIKE__?.getGeneration());
  expect(resetGeneration).toBeGreaterThan(initialGeneration ?? -1);
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    for (let step = 0; step < 30 && api.getState().outcome === "running"; step += 1) {
      await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }
    if (api.getState().outcome !== "defeat") {
      throw new Error("Expected the terminal defeat state before replacement.");
    }
    api.loadScenario("empty-arena");
  });

  await expect(page.getByTestId("tick-value")).toHaveText("0");
  await expect(page.getByTestId("enemy-count")).toHaveText("0");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-x", "6");
  await expect(page.getByTestId("entity-player")).toHaveAttribute("data-cell-y", "6");
  await expect(page.getByTestId("entity-enemy-thrust")).toHaveCount(0);
  await expect(page.getByTestId("semantic-mirror")).toHaveAttribute("data-outcome", "running");
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Bomb commits from the adjacent ring, locks its footprint, and self-destructs on detonation", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto("/?scenario=tick-arena");
  await expect(page.getByTestId("game-canvas-host")).toBeVisible();
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
        if (
          cell.x < 0 ||
          cell.y < 0 ||
          cell.x >= state.arena.width ||
          cell.y >= state.arena.height
        ) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) =>
            entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
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
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute(
    "data-attack-warning-ticks",
    "3",
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute(
    "data-attack-warning-ticks",
    "1",
  );

  await page.evaluate(async () => {
    const api = window.__TICKSTRIKE__;
    if (!api) {
      throw new Error("Tickstrike debug API is unavailable.");
    }
    await api.execute({ type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
  });

  await expect(page.getByTestId("entity-enemy-bomb")).toHaveCount(0);
  await expect(page.getByTestId("event-log")).toContainText("enemy_self_destructed");
  await expect(page.getByTestId("event-log")).toContainText("enemy_died");
  const finalState = await page.evaluate(() => window.__TICKSTRIKE__?.getState());
  expect(finalState?.telegraphs.some((telegraph) => telegraph.sourceId === "enemy-bomb")).toBe(
    false,
  );
  expect(finalState?.reservations.some((reservation) => reservation.ownerId === "enemy-bomb")).toBe(
    false,
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Bomb disarms when killed before its fuse resolves", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/?scenario=tick-arena");
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
        if (
          cell.x < 0 ||
          cell.y < 0 ||
          cell.x >= state.arena.width ||
          cell.y >= state.arena.height
        ) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) =>
            entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
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
  expect(finalState?.telegraphs.some((telegraph) => telegraph.sourceId === "enemy-bomb")).toBe(
    false,
  );
  await expect.poll(async () => page.evaluate(() => window.__TICKSTRIKE__?.isIdle())).toBe(true);
});

test("Resetting mid-fuse clears Bomb's telegraph and returns it to a fresh idle state", async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.goto("/?scenario=tick-arena");
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
      if (
        !bomb ||
        bomb.phase !== "alive" ||
        !player ||
        player.phase !== "alive" ||
        bomb.activity === "telegraphing"
      ) {
        break;
      }
      const isFree = (cell: { x: number; y: number }) => {
        if (
          cell.x < 0 ||
          cell.y < 0 ||
          cell.x >= state.arena.width ||
          cell.y >= state.arena.height
        ) {
          return false;
        }
        if (state.arena.tiles[cell.y * state.arena.width + cell.x] !== "floor") {
          return false;
        }
        return !state.entities.some(
          (entity) =>
            entity.phase === "alive" && entity.cell.x === cell.x && entity.cell.y === cell.y,
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
  await expect(page.getByTestId("entity-enemy-bomb")).toHaveAttribute(
    "data-activity",
    "telegraphing",
  );

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
