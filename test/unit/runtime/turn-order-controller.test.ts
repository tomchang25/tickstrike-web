import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnPlayback } from "@core/actions/action-resolver";
import type { CombatEvent } from "@core/events/combat-events";
import { createFoundationArena } from "@harness/fixtures/shipped-arena";
import { TurnOrderController } from "@runtime/turn-order-controller";

class FakePresentation {
  readonly calls: readonly CombatEvent[][] = [];
  private readonly pending: (() => void)[] = [];

  playSlot(events: readonly CombatEvent[]) {
    (this.calls as CombatEvent[][]).push([...events]);
    if (events.length === 0) {
      return { done: Promise.resolve(), hasVisualWork: false };
    }
    let release: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.pending.push(release);
    return { done, hasVisualWork: true };
  }

  finishActive(): void {
    for (const release of this.pending.splice(0)) {
      release();
    }
  }
}

function playback(enemyIds: readonly string[], playerEvents?: readonly CombatEvent[]): TurnPlayback {
  return {
    player: {
      actorId: "player",
      events: playerEvents ?? [{ type: "command_resolved", commandType: "move", accepted: true, consumedTime: true }],
    },
    enemies: enemyIds.map((actorId) => ({
      actorId,
      events: [{ type: "enemy_waited", enemyId: actorId }],
    })),
    trailingEvents: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TurnOrderController", () => {
  it("hands fast logical slots off after 100 ms without waiting for prior VFX", async () => {
    vi.useFakeTimers();
    const presentation = new FakePresentation();
    const highlights = { setTurnOrderHighlights: vi.fn() };
    const controller = new TurnOrderController(presentation, highlights);
    const snapshot = createFoundationArena().snapshot();
    const enemyIds = snapshot.entities
      .filter((entity) => entity.kind === "enemy" && entity.enemyAction)
      .map((entity) => entity.id);

    const done = controller.play(playback(enemyIds.slice(0, 2)), snapshot, snapshot, 0);
    expect(presentation.calls).toHaveLength(1);
    expect(controller.get().activeEntityId).toBe("player");

    await vi.advanceTimersByTimeAsync(99);
    expect(presentation.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(presentation.calls).toHaveLength(2);
    expect(controller.get().activeEntityId).toBe(enemyIds[0]);
    expect(controller.get().tokens.map((token) => token.entityId)).toEqual([
      "player",
      ...snapshot.entities.filter((entity) => entity.kind === "enemy" && entity.enemyAction).map((entity) => entity.id),
    ]);

    controller.finishActive();
    await done;
    expect(presentation.calls).toHaveLength(4);
    expect(controller.get().playing).toBe(false);
    expect(controller.get().activeEntityId).toBeUndefined();
    expect(controller.get().tokens.map((token) => token.entityId)).toEqual([
      "player",
      ...snapshot.entities.filter((entity) => entity.kind === "enemy" && entity.enemyAction).map((entity) => entity.id),
    ]);
  });

  it("normal pacing hands the next slot off after 250 ms without waiting for prior VFX", async () => {
    vi.useFakeTimers();
    const presentation = new FakePresentation();
    const controller = new TurnOrderController(presentation, { setTurnOrderHighlights: vi.fn() });
    controller.setPacing("normal");
    const snapshot = createFoundationArena().snapshot();
    const enemyId = snapshot.entities.find((entity) => entity.kind === "enemy" && entity.enemyAction)?.id;
    expect(enemyId).toBeDefined();

    const done = controller.play(playback([enemyId!]), snapshot, snapshot, 0);
    await vi.advanceTimersByTimeAsync(249);
    expect(presentation.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(presentation.calls).toHaveLength(2);

    controller.finishActive();
    await done;
    expect(presentation.calls).toHaveLength(3);
  });

  it("publishes exceptional status and removes terminal victims during the owning event batch", async () => {
    const snapshot = createFoundationArena().snapshot();
    const enemies = snapshot.entities.filter((entity) => entity.kind === "enemy" && entity.enemyAction);
    const staggered = enemies[0];
    const defeated = enemies[1];
    expect(staggered).toBeDefined();
    expect(defeated).toBeDefined();
    const events: CombatEvent[] = [
      { type: "enemy_staggered", enemyId: staggered!.id, ticks: 2 },
      {
        type: "enemy_died",
        enemyId: defeated!.id,
        attackerId: "player",
        cell: defeated!.cell,
      },
    ];
    const presentation = new FakePresentation();
    const controller = new TurnOrderController(presentation, { setTurnOrderHighlights: vi.fn() });

    const done = controller.play(playback([], events), snapshot, snapshot, 0);

    expect(controller.get().tokens.find((token) => token.entityId === staggered!.id)?.status).toBe("STG");
    expect(controller.get().tokens.some((token) => token.entityId === defeated!.id)).toBe(false);
    controller.finishActive();
    await done;
  });

  it("keeps an attack warning's remaining turn count with its sprite pose", async () => {
    const snapshot = createFoundationArena().snapshot();
    const enemy = snapshot.entities.find((entity) => entity.kind === "enemy" && entity.enemyAction);
    expect(enemy).toBeDefined();
    const presentation = new FakePresentation();
    const controller = new TurnOrderController(presentation, { setTurnOrderHighlights: vi.fn() });

    const done = controller.play(
      playback(
        [],
        [
          {
            type: "enemy_attack_committed",
            enemyId: enemy!.id,
            attack: {
              attackId: "test.attack",
              cells: [enemy!.cell],
              damage: 1,
              warningTicks: 2,
              recoveryTicks: 1,
            },
          },
        ],
      ),
      snapshot,
      snapshot,
      0,
    );

    expect(controller.get().tokens.find((token) => token.entityId === enemy!.id)).toMatchObject({
      status: "ATTACK",
      warningTicks: 2,
      spritePose: "prepare",
    });
    controller.finishActive();
    await done;
  });

  it("adds no handoff timer for slots without visible work", async () => {
    const snapshot = createFoundationArena().snapshot();
    const enemyId = snapshot.entities.find((entity) => entity.kind === "enemy" && entity.enemyAction)?.id;
    expect(enemyId).toBeDefined();
    const presentation = new FakePresentation();
    const controller = new TurnOrderController(presentation, { setTurnOrderHighlights: vi.fn() });
    const timeout = vi.spyOn(globalThis, "setTimeout");

    await controller.play(
      {
        player: { actorId: "player", events: [] },
        enemies: [{ actorId: enemyId!, events: [] }],
        trailingEvents: [],
      },
      snapshot,
      snapshot,
      0,
    );

    expect(timeout).not.toHaveBeenCalled();
    expect(controller.get().playing).toBe(false);
  });
});
