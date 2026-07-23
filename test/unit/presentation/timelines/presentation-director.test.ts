import { describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import type { CombatEvent } from "@core/events/combat-events";
import type { PixiGameRenderer } from "@presentation/pixi/pixi-game-renderer";
import { PresentationDirector } from "@presentation/timelines/presentation-director";
import { normalizeMotionEvents } from "@presentation/timelines/presentation-director";

function createRenderer() {
  const view = {
    alpha: 1,
    destroyed: false,
    rotation: 0,
    scale: { x: 1, y: 1 },
    position: { set: vi.fn() },
    x: 0,
    y: 0,
    destroy: vi.fn(() => {
      view.destroyed = true;
    }),
  };
  const effects = new Set<object>();
  const renderer = {
    getEntityView: vi.fn(() => view),
    cellToPixels: (cell: { x: number; y: number }) => ({
      x: cell.x * 64 + 32,
      y: cell.y * 64 + 32,
    }),
    createImpact: vi.fn(() => {
      const effect = { alpha: 1, scale: { x: 1, y: 1 } };
      effects.add(effect);
      return effect;
    }),
    releaseTransient: vi.fn((effect: object) => effects.delete(effect)),
    clearTransient: vi.fn(() => effects.clear()),
    reservePosition: vi.fn(),
    releasePosition: vi.fn(),
    clearPositionReservations: vi.fn(),
    detachEntityView: vi.fn(() => ({ root: view })),
    setTerminalPresentationLabels: vi.fn(),
    setPlayerAnimation: vi.fn(),
    setPlayerFacing: vi.fn(),
    getEnemyPresentation: vi.fn(() => undefined),
    get transientCount() {
      return effects.size;
    },
  } as unknown as PixiGameRenderer;

  return { renderer, view };
}

describe("PresentationDirector combat feedback", () => {
  it("normalizes every board-motion source in event order and omits no-op landing", () => {
    expect(
      normalizeMotionEvents([
        { type: "actor_moved", entityId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
        {
          type: "entity_displaced",
          entityId: "player",
          from: { x: 2, y: 1 },
          to: { x: 3, y: 1 },
          cause: "charge_target_knockback",
        },
        { type: "charge_landed", enemyId: "enemy", from: { x: 4, y: 1 }, to: { x: 4, y: 1 } },
        {
          type: "enemy_entered_water",
          enemyId: "enemy",
          from: { x: 2, y: 2 },
          waterCell: { x: 2, y: 3 },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        entityId: "player",
        from: { x: 1, y: 1 },
        to: { x: 2, y: 1 },
        kind: "move",
      }),
      expect.objectContaining({
        entityId: "player",
        from: { x: 2, y: 1 },
        to: { x: 3, y: 1 },
        kind: "displacement",
      }),
      expect.objectContaining({
        entityId: "enemy",
        from: { x: 2, y: 2 },
        to: { x: 2, y: 3 },
        kind: "water",
      }),
    ]);
  });

  it("reserves each moving entity once and releases it after its ordered track", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "actor_moved", entityId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      {
        type: "entity_displaced",
        entityId: "player",
        from: { x: 2, y: 1 },
        to: { x: 3, y: 1 },
        cause: "charge_target_knockback",
      },
      { type: "enemy_moved", enemyId: "enemy", from: { x: 4, y: 1 }, to: { x: 3, y: 1 } },
    ];

    director.reserveMotionOwners(events);
    await director.play(events);

    expect(renderer.reservePosition).toHaveBeenCalledTimes(2);
    expect(renderer.reservePosition).toHaveBeenNthCalledWith(1, "player");
    expect(renderer.reservePosition).toHaveBeenNthCalledWith(2, "enemy");
    expect(renderer.releasePosition).toHaveBeenCalledWith("player");
    expect(renderer.releasePosition).toHaveBeenCalledWith("enemy");
    expect(director.isIdle).toBe(true);
  });

  it("tracks combat effects and destroys a director-owned ghost after the matching timeline", async () => {
    const { renderer, view } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      {
        type: "enemy_attack_committed",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 6, y: 6 }],
          damage: 10,
          warningTicks: 1,
          recoveryTicks: 1,
        },
      },
      {
        type: "enemy_attack_detonated",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 6, y: 6 }],
          damage: 10,
          warningTicks: 0,
          recoveryTicks: 1,
        },
        target: { x: 6, y: 6 },
        hit: {
          targetId: "player",
          damage: 10,
          hpBefore: 100,
          hpAfter: 90,
          killed: false,
        },
      },
      { type: "enemy_guard_damaged", enemyId: "enemy", damage: 4, guard: 28, maxGuard: 32 },
      { type: "enemy_guard_broken", enemyId: "enemy", staggerTicks: 3 },
      { type: "enemy_staggered", enemyId: "enemy", ticks: 3 },
      { type: "enemy_protection_started", enemyId: "enemy", ticks: 5 },
      { type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 5, y: 6 } },
    ];

    director.captureTerminalViews(events);
    await director.play(events);

    expect(renderer.createImpact).toHaveBeenCalledOnce();
    expect(renderer.releaseTransient).toHaveBeenCalledOnce();
    expect(renderer.detachEntityView).toHaveBeenCalledWith("enemy");
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(director.isIdle).toBe(true);
  });

  it("plays an authored water sheet in the motion direction before removing the terminal view", async () => {
    const { renderer, view } = createRenderer();
    const presentation = {
      beginEnteredWater: vi.fn(),
      setEnteredWaterFrame: vi.fn(),
      waterFrameDurationsMs: [10, 10, 10, 10, 10, 10, 10, 10],
    };
    vi.mocked(renderer.getEnemyPresentation).mockReturnValue(presentation as never);
    const director = new PresentationDirector(renderer);

    const events: CombatEvent[] = [
      {
        type: "enemy_entered_water",
        enemyId: "enemy",
        from: { x: 4, y: 4 },
        waterCell: { x: 4, y: 6 },
      },
    ];
    director.captureTerminalViews(events);
    await director.play(events);

    expect(presentation.beginEnteredWater).toHaveBeenCalledWith({ x: 0, y: 1 });
    expect(presentation.setEnteredWaterFrame).toHaveBeenLastCalledWith(7);
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it("plays a Dash-killed terminal sheet and retains its ghost until playback completes", async () => {
    const { renderer, view } = createRenderer();
    const presentation = {
      playDashKilled: vi.fn(() => gsap.timeline().to({}, { duration: 0.01 })),
      stopBlink: vi.fn(),
    };
    vi.mocked(renderer.getEnemyPresentation).mockReturnValue(presentation as never);
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      {
        type: "enemy_died",
        enemyId: "enemy",
        attackerId: "player",
        cell: { x: 5, y: 6 },
        cause: "dash",
      },
    ];

    director.captureTerminalViews(events);
    await director.play(events);

    expect(presentation.playDashKilled).toHaveBeenCalledOnce();
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(director.isIdle).toBe(true);
  });

  it("cancels stale terminal presentation when the generation changes", async () => {
    const { renderer, view } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 5, y: 6 } },
    ];
    director.captureTerminalViews(events, 0);
    const playing = director.play(events, 0);

    director.setGeneration(1);
    await playing;

    expect(view.destroy).toHaveBeenCalledOnce();
    expect(renderer.clearTransient).toHaveBeenCalledOnce();
    expect(renderer.clearPositionReservations).toHaveBeenCalledOnce();
    expect(director.isIdle).toBe(true);
  });

  it("captures one ghost per terminal id even when a bomb reports two terminal events", () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    director.captureTerminalViews([
      { type: "enemy_self_destructed", enemyId: "bomb", cell: { x: 2, y: 2 } },
      { type: "enemy_died", enemyId: "bomb", attackerId: "bomb", cell: { x: 2, y: 2 } },
    ]);

    expect(renderer.detachEntityView).toHaveBeenCalledOnce();
    expect(renderer.detachEntityView).toHaveBeenCalledWith("bomb");
    expect(director.terminalViewCount).toBe(1);
  });

  it("destroys one ghost after a self-destruct explosion completes", async () => {
    const { renderer, view } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "enemy_self_destructed", enemyId: "bomb", cell: { x: 2, y: 2 } },
      { type: "enemy_died", enemyId: "bomb", attackerId: "bomb", cell: { x: 2, y: 2 } },
    ];

    director.captureTerminalViews(events);
    await director.play(events);

    expect(renderer.createImpact).toHaveBeenCalledOnce();
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it("keeps an authored Bomb detonation instead of layering the generic death shrink", async () => {
    const { renderer, view } = createRenderer();
    const presentation = {
      profileId: "enemy.bomb",
      hasExecuteAnimation: true,
      playAttackCommit: vi.fn(() => gsap.timeline().to({}, { duration: 0.1 })),
      playFuseBlink: vi.fn(),
      stopBlink: vi.fn(),
    };
    vi.mocked(renderer.getEnemyPresentation).mockReturnValue(presentation as never);
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      {
        type: "enemy_attack_detonated",
        enemyId: "bomb",
        attack: {
          attackId: "bomb_area",
          cells: [{ x: 2, y: 2 }],
          damage: 50,
          warningTicks: 0,
          recoveryTicks: 1,
          metadata: { selfDestruct: true },
        },
        target: { x: 2, y: 2 },
      },
      { type: "enemy_self_destructed", enemyId: "bomb", cell: { x: 2, y: 2 } },
      { type: "enemy_died", enemyId: "bomb", attackerId: "bomb", cell: { x: 2, y: 2 } },
    ];

    director.captureTerminalViews(events);
    await director.play(events);

    expect(presentation.playAttackCommit).toHaveBeenCalledOnce();
    expect(presentation.playFuseBlink).not.toHaveBeenCalled();
    expect(view.scale).toEqual({ x: 1, y: 1 });
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it("ignores capture requests from a stale generation", () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);
    director.setGeneration(1);

    director.captureTerminalViews(
      [{ type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 1, y: 1 } }],
      0,
    );

    expect(renderer.detachEntityView).not.toHaveBeenCalled();
  });

  it("starts presentation batches immediately without merging their cleanup", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    const first = director.play([
      {
        type: "player_attacked",
        actorId: "player",
        direction: { x: 1, y: 0 },
        target: { x: 6, y: 6 },
      },
    ]);
    const second = director.play([
      {
        type: "enemy_attack_detonated",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 6, y: 6 }],
          damage: 10,
          warningTicks: 0,
          recoveryTicks: 1,
        },
        target: { x: 6, y: 6 },
        hit: {
          targetId: "player",
          damage: 10,
          hpBefore: 100,
          hpAfter: 90,
          killed: false,
        },
      },
    ]);

    expect(director.isIdle).toBe(false);
    await Promise.all([first, second]);

    expect(renderer.createImpact).toHaveBeenCalledTimes(2);
    expect(renderer.releaseTransient).toHaveBeenCalledTimes(2);
    expect(director.isIdle).toBe(true);
  });

  it("fast-forwards active timelines to their settled end state on demand", async () => {
    const { renderer, view } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "player_attacked", actorId: "player", direction: { x: 1, y: 0 }, target: { x: 6, y: 6 } },
      { type: "actor_moved", entityId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      { type: "enemy_died", enemyId: "enemy", attackerId: "player", cell: { x: 5, y: 6 } },
    ];

    director.captureTerminalViews(events);
    const playing = director.play(events);
    expect(director.isIdle).toBe(false);

    director.finishActive();
    await playing;

    // Resolution came from completing the timelines, not from waiting out their duration.
    expect(director.isIdle).toBe(true);
    expect(renderer.releaseTransient).toHaveBeenCalledOnce();
    expect(renderer.setPlayerAnimation).toHaveBeenLastCalledWith("idle");
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(director.terminalViewCount).toBe(0);
    expect(renderer.releasePosition).toHaveBeenCalledWith("player");
  });

  it("finishes active timelines with no residue and is a no-op when idle", () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    expect(() => director.finishActive()).not.toThrow();
    expect(director.isIdle).toBe(true);
  });

  it("does not show an impact when a committed attack misses", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      {
        type: "enemy_attack_detonated",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 6, y: 6 }],
          damage: 10,
          warningTicks: 0,
          recoveryTicks: 1,
        },
        target: { x: 6, y: 6 },
      },
    ]);

    expect(renderer.createImpact).not.toHaveBeenCalled();
    expect(director.isIdle).toBe(true);
  });

  it("destroys the player ghost after a terminal defeat timeline", async () => {
    const { renderer, view } = createRenderer();
    const director = new PresentationDirector(renderer);
    const events: CombatEvent[] = [
      { type: "player_died", playerId: "player", cell: { x: 6, y: 6 } },
      { type: "encounter_ended", outcome: "defeat" },
    ];

    director.captureTerminalViews(events);
    await director.play(events);

    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it("presents a dash pose and settles into the held landing pose", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      {
        type: "player_dashed",
        actorId: "player",
        from: { x: 1, y: 1 },
        to: { x: 4, y: 1 },
        path: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 4, y: 1 },
        ],
      },
    ]);

    expect(renderer.setPlayerAnimation).toHaveBeenNthCalledWith(1, "dash");
    expect(renderer.setPlayerAnimation).toHaveBeenLastCalledWith("dashLand");
    expect(director.isIdle).toBe(true);
  });

  it("presents a player move pose and restores idle when movement settles", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([{ type: "actor_moved", entityId: "player", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }]);

    expect(renderer.setPlayerAnimation).toHaveBeenNthCalledWith(1, "move");
    expect(renderer.setPlayerAnimation).toHaveBeenLastCalledWith("idle");
    expect(director.isIdle).toBe(true);
  });

  it("forces attack facing even when movement presentation is locked", async () => {
    const { renderer } = createRenderer();
    const director = new PresentationDirector(renderer);

    await director.play([
      {
        type: "player_attacked",
        actorId: "player",
        direction: { x: -1, y: 0 },
        target: { x: 4, y: 3 },
      },
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
    (renderer as unknown as { getEnemyPresentation: () => typeof presentation }).getEnemyPresentation = vi.fn(
      () => presentation,
    );

    await new PresentationDirector(renderer).play([
      { type: "enemy_moved", enemyId: "enemy", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
      {
        type: "enemy_attack_committed",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 3, y: 1 }],
          damage: 10,
          warningTicks: 1,
          recoveryTicks: 1,
        },
      },
      {
        type: "enemy_attack_detonated",
        enemyId: "enemy",
        attack: {
          attackId: "thrust",
          cells: [{ x: 3, y: 1 }],
          damage: 10,
          warningTicks: 0,
          recoveryTicks: 1,
        },
        target: { x: 3, y: 1 },
      },
      {
        type: "enemy_damaged",
        enemyId: "enemy",
        hit: {
          targetId: "enemy",
          attackerId: "player",
          damage: 10,
          hpBefore: 100,
          hpAfter: 90,
          killed: false,
        },
        hp: 90,
        maxHp: 100,
      },
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
