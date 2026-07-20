import { describe, expect, it, vi } from "vitest";
import { requireScenario } from "@harness/scenario-registry";
import { GameRuntime } from "@runtime/GameRuntime";

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

describe("GameRuntime terminal entity lifecycle", () => {
  it("retains terminal views before listeners observe their removal from the snapshot", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("smash-water"));
    await runtime.execute({ type: "smash", actorId: "player", target: { x: 4, y: 3 } });
    await vi.waitFor(() => expect(runtime.presentation.isIdle).toBe(true));

    const observed: { readonly ids: readonly string[]; readonly ghosts: number }[] = [];
    runtime.subscribe((snapshot) => {
      observed.push({
        ids: snapshot.entities.map((entity) => entity.id),
        ghosts: runtime.presentation.terminalViewCount,
      });
    });
    expect(observed[0]?.ids).toContain("enemy-center");
    expect(observed[0]?.ids).toContain("enemy-water");

    await runtime.execute({ type: "smash", actorId: "player", target: { x: 0, y: 0 } });

    const resolved = observed[1];
    expect(resolved?.ids).not.toContain("enemy-center");
    expect(resolved?.ids).not.toContain("enemy-water");
    expect(resolved?.ids).toContain("enemy-right");
    // Both ghosts already exist by the time the terminal-free snapshot reaches a listener.
    expect(resolved?.ghosts).toBe(2);
    expect(runtime.renderer.getEntityView("enemy-water")).toBeUndefined();

    await vi.waitFor(() => expect(runtime.presentation.isIdle).toBe(true), { timeout: 5000 });
    expect(runtime.presentation.terminalViewCount).toBe(0);
    expect(runtime.renderer.getEntityView("enemy-water")).toBeUndefined();
  });

  it("destroys retained ghosts when a reset replaces the scenario mid-timeline", async () => {
    const runtime = new GameRuntime();
    runtime.loadScenario(requireScenario("smash-water"));
    await runtime.execute({ type: "smash", actorId: "player", target: { x: 4, y: 3 } });
    await runtime.execute({ type: "smash", actorId: "player", target: { x: 0, y: 0 } });
    expect(runtime.presentation.terminalViewCount).toBe(2);

    runtime.reset();

    expect(runtime.presentation.terminalViewCount).toBe(0);
    expect(runtime.renderer.positionOwnerCount).toBe(0);
    expect(runtime.snapshot().entities.map((entity) => entity.id)).toContain("enemy-water");
  });
});
