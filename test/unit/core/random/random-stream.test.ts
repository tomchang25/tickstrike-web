import { describe, expect, it } from "vitest";
import { RandomStream } from "@core/random/random-stream";
import { RandomStreams } from "@core/random/random-streams";

describe("deterministic random streams", () => {
  it("replays the same sequence for the same seed", () => {
    const first = new RandomStream("arena-seed");
    const second = new RandomStream("arena-seed");

    expect([first.nextUint(), first.nextUint(), first.nextUint()]).toEqual([
      second.nextUint(),
      second.nextUint(),
      second.nextUint(),
    ]);
  });

  it("derives named streams independently of creation order", () => {
    const first = new RandomStreams(42);
    const second = new RandomStreams(42);
    const baseline = new RandomStreams(42);
    const wave = first.get("wave");
    first.get("reward").nextUint();
    const reward = second.get("reward");
    second.get("wave").nextUint();

    expect(wave.nextUint()).toBe(baseline.get("wave").nextUint());
    expect(reward.nextUint()).toBe(baseline.get("reward").nextUint());
  });

  it("returns deterministic failures for invalid selection requests", () => {
    const stream = new RandomStream(7);

    expect(stream.nextInt(2, 2)).toBeUndefined();
    expect(stream.pickWeighted([])).toBeUndefined();
    expect(stream.pickUnique(["a", "b"], 3)).toEqual([]);
    expect(stream.pickUnique(["a", "b", "c"], 2)).toHaveLength(2);
  });
});
