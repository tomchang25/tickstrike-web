import { describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
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
    setPlayerAnimation: vi.fn(),
    setPlayerFacing: vi.fn(),
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
      { type: "player_attacked", actorId: "player", direction: { x: 1, y: 0 }, target: { x: 6, y: 6 } },
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

  it("removes the player view after a terminal defeat timeline", async () => {
    const { renderer } = createRenderer();

    await new PresentationDirector(renderer).play([
      { type: "player_died", playerId: "player", cell: { x: 6, y: 6 } },
      { type: "encounter_ended", outcome: "defeat" },
    ]);

    expect(renderer.removeEntityView).toHaveBeenCalledWith("player");
  });

  it("presents a dash pose and restores idle when the dash settles", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      {
        type: "player_dashed",
        actorId: "player",
        from: { x: 1, y: 1 },
        to: { x: 4, y: 1 },
        path: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
      },
    ]);

    expect(renderer.setPlayerAnimation).toHaveBeenNthCalledWith(1, "dash");
    expect(renderer.setPlayerAnimation).toHaveBeenLastCalledWith("idle");
    expect(director.isIdle).toBe(true);
  });

  it("presents a player move pose and restores idle when movement settles", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      { type: "actor_moved", entityId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
    ]);

    expect(renderer.setPlayerAnimation).toHaveBeenNthCalledWith(1, "move");
    expect(renderer.setPlayerAnimation).toHaveBeenLastCalledWith("idle");
    expect(director.isIdle).toBe(true);
  });

  it("forces attack facing even when movement presentation is locked", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      { type: "player_attacked", actorId: "player", direction: { x: -1, y: 0 }, target: { x: 4, y: 3 } },
    ]);

    expect(renderer.setPlayerFacing).toHaveBeenCalledWith({ x: -1, y: 0 }, true);
  });

  it("routes small enemy events to the sprite presentation seam", async () => {
    const { renderer } = createRenderer();
    const presentation = {
      playMove: vi.fn(() => gsap.timeline()),
      playPrepareAttack: vi.fn(() => gsap.timeline()),
      playAttackCommit: vi.fn(() => gsap.timeline()),
      playDamage: vi.fn(() => gsap.timeline()),
      playStaggered: vi.fn(() => gsap.timeline()),
      playStaggerEnded: vi.fn(() => gsap.timeline()),
      clearAction: vi.fn(),
    };
    (renderer as unknown as { getEnemyPresentation: () => typeof presentation }).getEnemyPresentation = vi.fn(() => presentation);

    await new PresentationDirector(renderer).play([
      { type: "enemy_moved", enemyId: "enemy", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      { type: "enemy_attack_committed", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 3, y: 1 }],
        damage: 10,
        warningTicks: 1,
        recoveryTicks: 1,
      } },
      { type: "enemy_attack_detonated", enemyId: "enemy", attack: {
        attackId: "thrust",
        cells: [{ x: 3, y: 1 }],
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 1,
      }, target: { x: 3, y: 1 } },
      { type: "enemy_damaged", enemyId: "enemy", hit: {
        targetId: "enemy",
        attackerId: "player",
        damage: 10,
        hpBefore: 100,
        hpAfter: 90,
        killed: false,
      }, hp: 90, maxHp: 100 },
      { type: "enemy_staggered", enemyId: "enemy", ticks: 3 },
      { type: "enemy_stagger_ended", enemyId: "enemy", guard: 32, maxGuard: 32 },
      { type: "enemy_attack_interrupted", enemyId: "enemy" },
    ]);

    expect(presentation.playMove).toHaveBeenCalledOnce();
    expect(presentation.playPrepareAttack).toHaveBeenCalledOnce();
    expect(presentation.playAttackCommit).toHaveBeenCalledOnce();
    expect(presentation.playDamage).toHaveBeenCalledOnce();
    expect(presentation.playStaggered).toHaveBeenCalledOnce();
    expect(presentation.playStaggerEnded).toHaveBeenCalledOnce();
    expect(presentation.clearAction).toHaveBeenCalledOnce();
  });
});
