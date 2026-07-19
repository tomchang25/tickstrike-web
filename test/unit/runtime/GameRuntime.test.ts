import { describe, expect, it, vi } from "vitest";
import { requireScenario } from "../../../src/harness/scenario-registry";
import { GameRuntime } from "../../../src/runtime/GameRuntime";

describe("GameRuntime command and presentation ordering", () => {
  it("queues the next command until the previous presentation settles", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("empty-arena"));

    let releaseFirstPresentation: (() => void) | undefined;
    const firstPresentation = new Promise<void>((resolve) => {
      releaseFirstPresentation = resolve;
    });
    let presentationCalls = 0;
    const play = vi.spyOn(runtime.presentation, "play").mockImplementation(() => {
      presentationCalls += 1;
      return presentationCalls === 1 ? firstPresentation : Promise.resolve();
    });

    const first = runtime.execute({ type: "move", actorId: "player", direction: { x: 1, y: 0 } });
    await first;

    const second = runtime.execute({ type: "move", actorId: "player", direction: { x: 1, y: 0 } });
    await Promise.resolve();
    expect(play).toHaveBeenCalledOnce();

    releaseFirstPresentation?.();
    await second;
    expect(play).toHaveBeenCalledTimes(2);
    expect(runtime.snapshot().playerCell).toEqual({ x: 8, y: 6 });
  });

  it("reserves motion owners before projecting the resolved snapshot", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("empty-arena"));

    const reserve = vi.spyOn(runtime.presentation, "reserveMotionOwners");
    const update = vi.spyOn(runtime.renderer, "updateSnapshot");
    await runtime.execute({ type: "move", actorId: "player", direction: { x: 1, y: 0 } });

    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
      update.mock.invocationCallOrder.at(-1) ?? Infinity,
    );
    await vi.waitFor(() => expect(runtime.presentation.isIdle).toBe(true));
    expect(runtime.renderer.positionOwnerCount).toBe(0);
  });
});
