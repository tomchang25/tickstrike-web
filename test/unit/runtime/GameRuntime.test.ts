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
});
