import { describe, expect, it } from "vitest";
import { CueLibrary, fromDb, type CueDefinition } from "@presentation/audio/cue-library";

function definition(overrides: Partial<CueDefinition> = {}): CueDefinition {
  return {
    id: "damaged",
    urls: ["hit"],
    limiterKey: "damaged",
    maxPerWindow: 8,
    windowSec: 0.5,
    volume: 1,
    pitchMin: 0.95,
    pitchMax: 1.05,
    ...overrides,
  };
}

const fakeBuffer = {} as unknown as AudioBuffer;

describe("fromDb", () => {
  it("converts decibels to a linear gain", () => {
    expect(fromDb(0)).toBe(1);
    expect(fromDb(-20)).toBeCloseTo(0.1, 5);
    expect(fromDb(-6)).toBeCloseTo(0.501, 3);
  });
});

describe("CueLibrary", () => {
  it("fetches and decodes every stream into buffers keyed by cue", async () => {
    const library = new CueLibrary(
      [definition({ id: "action_whoosh", urls: ["a", "b"] })],
      async (url) => new TextEncoder().encode(url).buffer,
    );

    expect(library.isLoaded).toBe(false);
    await library.load(async () => fakeBuffer);

    expect(library.isLoaded).toBe(true);
    expect(library.buffersFor("action_whoosh")).toHaveLength(2);
    expect(library.definition("action_whoosh")?.id).toBe("action_whoosh");
  });

  it("drops streams that fail to decode", async () => {
    const library = new CueLibrary(
      [definition({ urls: ["ok", "bad"] })],
      async (url) => new TextEncoder().encode(url).buffer,
    );

    await library.load(async (bytes) => (new TextDecoder().decode(bytes) === "bad" ? undefined : fakeBuffer));

    expect(library.buffersFor("damaged")).toHaveLength(1);
  });

  it("is idempotent across repeated load calls", async () => {
    let decodeCalls = 0;
    const library = new CueLibrary([definition()], async (url) => new TextEncoder().encode(url).buffer);

    await library.load(async () => {
      decodeCalls += 1;
      return fakeBuffer;
    });
    await library.load(async () => {
      decodeCalls += 1;
      return fakeBuffer;
    });

    expect(decodeCalls).toBe(1);
  });
});
