import { describe, expect, it, vi } from "vitest";
import type { CombatEvent } from "../../../../src/core/events/combat-events";
import type { PixiGameRenderer } from "../../../../src/presentation/pixi/PixiGameRenderer";
import { PresentationDirector } from "../../../../src/presentation/timelines/PresentationDirector";

function createRenderer() {
  const view = {
    alpha: 1,
    rotation: 0,
    scale: { x: 1, y: 1 },
    position: { set: vi.fn() },
    x: 0,
    y: 0,
  };
  const effects = new Set<object>();
  const renderer = {
    getEntityView: vi.fn(() => view),
    cellToPixels: (cell: { x: number; y: number }) => ({ x: cell.x * 64 + 32, y: cell.y * 64 + 32 }),
    createImpact: vi.fn(() => {
      const effect = { alpha: 1, scale: { x: 1, y: 1 } };
      effects.add(effect);
      return effect;
    }),
    releaseTransient: vi.fn((effect: object) => effects.delete(effect)),
    clearTransient: vi.fn(() => effects.clear()),
    removeEntityView: vi.fn(),
    get transientCount() {
      return effects.size;
    },
  } as unknown as PixiGameRenderer;

  return { renderer, view };
}

describe("PresentationDirector combat feedback", () => {
  it("tracks combat effects and removes a terminal view after the matching timeline", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "enemy_attack_committed", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 6, y: 6 }],
        damage: 10,
        warningTicks: 1,
        recoveryTicks: 1,
      } },
      { type: "enemy_attack_detonated", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 6, y: 6 }],
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 1,
      }, target: { x: 6, y: 6 }, hit: {
        targetId: "player",
        damage: 10,
        hpBefore: 100,
        hpAfter: 90,
        killed: false,
      } },
      { type: "enemy_guard_damaged", enemyId: "enemy", damage: 4, guard: 28, maxGuard: 32 },
      { type: "enemy_guard_broken", enemyId: "enemy", staggerTicks: 3 },
      { type: "enemy_staggered", enemyId: "enemy", ticks: 3 },
      { type: "enemy_protection_started", enemyId: "enemy", ticks: 5 },
      { type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 5, y: 6 } },
    ];

    await director.play(events);

    expect(renderer.createImpact).toHaveBeenCalledOnce();
    expect(renderer.releaseTransient).toHaveBeenCalledOnce();
    expect(renderer.removeEntityView).toHaveBeenCalledWith("enemy");
    expect(director.isIdle).toBe(true);
  });

  it("cancels stale terminal presentation when the generation changes", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);
    const playing = director.play([
      { type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 5, y: 6 } },
    ], 0);

    director.setGeneration(1);
    await playing;

    expect(renderer.removeEntityView).not.toHaveBeenCalled();
    expect(renderer.clearTransient).toHaveBeenCalledOnce();
    expect(director.isIdle).toBe(true);
  });

  it("starts presentation batches immediately without merging their cleanup", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    const first = director.play([
      { type: "player_attacked", actorId: "player", target: { x: 6, y: 6 } },
    ]);
    const second = director.play([
      { type: "enemy_attack_detonated", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 6, y: 6 }],
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 1,
      }, target: { x: 6, y: 6 }, hit: {
        targetId: "player",
        damage: 10,
        hpBefore: 100,
        hpAfter: 90,
        killed: false,
      } },
    ]);

    expect(director.isIdle).toBe(false);
    await Promise.all([first, second]);

    expect(renderer.createImpact).toHaveBeenCalledTimes(2);
    expect(renderer.releaseTransient).toHaveBeenCalledTimes(2);
    expect(director.isIdle).toBe(true);
  });

  it("does not show an impact when a committed attack misses", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      { type: "enemy_attack_detonated", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 6, y: 6 }],
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 1,
      }, target: { x: 6, y: 6 } },
    ]);

    expect(renderer.createImpact).not.toHaveBeenCalled();
    expect(director.isIdle).toBe(true);
  });
});
