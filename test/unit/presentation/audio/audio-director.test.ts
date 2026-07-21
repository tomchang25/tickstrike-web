import { describe, expect, it } from "vitest";
import type { CombatEvent } from "@core/events/combat-events";
import { AudioDirector } from "@presentation/audio/audio-director";
import type { AudioCue, AudioMixer } from "@presentation/audio/audio-mixer";
import { CueLibrary, type CueDefinition, type CueId } from "@presentation/audio/cue-library";

const CELL = { x: 0, y: 0 };

function fakeMixer(unlocked = true): { mixer: AudioMixer; plays: AudioCue[] } {
  const plays: AudioCue[] = [];
  const mixer = {
    isUnlocked: unlocked,
    play: (cue: AudioCue) => plays.push(cue),
    decode: async () => ({}) as unknown as AudioBuffer,
  } as unknown as AudioMixer;
  return { mixer, plays };
}

function definition(id: CueId, urls: string[], overrides: Partial<CueDefinition> = {}): CueDefinition {
  return {
    id,
    urls,
    limiterKey: id,
    maxPerWindow: 4,
    windowSec: 0.5,
    volume: 0.1,
    pitchMin: 1,
    pitchMax: 1,
    ...overrides,
  };
}

async function loadedDirector(
  definitions: CueDefinition[],
  options: { random?: () => number; unlocked?: boolean } = {},
) {
  const { mixer, plays } = fakeMixer(options.unlocked ?? true);
  const library = new CueLibrary(definitions, async (url) => new TextEncoder().encode(url).buffer);
  const director = new AudioDirector(mixer, library, { random: options.random ?? (() => 0) });
  await director.load();
  return { director, plays };
}

describe("AudioDirector", () => {
  it("maps each combat event to its reference cue", async () => {
    const defs = [
      definition("action_whoosh", ["w1"]),
      definition("smash_windup", ["w1"]),
      definition("smash_impact", ["hit"]),
      definition("damaged", ["hit"]),
      definition("blocked", ["block"]),
      definition("guard_break", ["break"]),
      definition("died", ["punch"]),
      definition("pickup", ["pling"]),
    ];
    const cases: [CombatEvent, string][] = [
      [{ type: "player_attacked", actorId: "player", direction: CELL, target: CELL }, "action_whoosh"],
      [{ type: "player_dashed", actorId: "player", from: CELL, to: CELL, path: [] }, "action_whoosh"],
      [{ type: "smash_armed", actorId: "player", target: CELL }, "smash_windup"],
      [{ type: "smash_impact", cell: CELL }, "smash_impact"],
      [{ type: "enemy_damaged", enemyId: "e1", hit: {} as never, hp: 1, maxHp: 2 }, "damaged"],
      [{ type: "player_damaged", playerId: "player", damage: {} as never, hp: 1, maxHp: 2 }, "damaged"],
      [{ type: "enemy_guard_damaged", enemyId: "e1", damage: 1, guard: 1, maxGuard: 2 }, "blocked"],
      [{ type: "enemy_guard_broken", enemyId: "e1" }, "guard_break"],
      [{ type: "enemy_died", enemyId: "e1", attackerId: "player", cell: CELL }, "died"],
      [{ type: "enemy_self_destructed", enemyId: "e1", cell: CELL }, "died"],
      [{ type: "enemy_crushed", enemyId: "e1", cell: CELL }, "died"],
      [{ type: "reward_selected", artifactId: "a", stackCount: 1 }, "pickup"],
    ];

    for (const [event, cueKey] of cases) {
      const { director, plays } = await loadedDirector(defs);
      director.play([event]);
      expect(plays).toHaveLength(1);
      expect(plays[0]?.limiterKey).toBe(cueKey);
      expect(plays[0]?.bus).toBe("effect");
    }
  });

  it("passes the cue's limiter, volume, and pitch range through to the mixer", async () => {
    const def = definition("damaged", ["hit"], {
      volume: 0.25,
      maxPerWindow: 8,
      windowSec: 0.5,
      pitchMin: 2,
      pitchMax: 2,
    });
    const { director, plays } = await loadedDirector([def]);

    director.play([{ type: "enemy_damaged", enemyId: "e1", hit: {} as never, hp: 1, maxHp: 2 }]);

    expect(plays[0]).toMatchObject({
      limiterKey: "damaged",
      maxPerWindow: 8,
      windowSec: 0.5,
      volume: 0.25,
      playbackRate: 2,
    });
  });

  it("stays silent for unmapped events", async () => {
    const { director, plays } = await loadedDirector([definition("action_whoosh", ["w1"])]);

    director.play([
      { type: "actor_moved", entityId: "player", from: CELL, to: { x: 1, y: 0 } },
      { type: "telegraph_changed", sourceId: "e1", cleared: true },
      { type: "enemy_staggered", enemyId: "e1", ticks: 2 },
      { type: "world_advanced", tick: 1, phases: [] },
    ]);

    expect(plays).toHaveLength(0);
  });

  it("avoids replaying the immediately previous stream for a multi-stream cue", async () => {
    // random() = 0 always picks index 0; the avoid-repeat rule advances to index 1 on the repeat.
    const { director, plays } = await loadedDirector([definition("action_whoosh", ["a", "b", "c"])], {
      random: () => 0,
    });
    const attack: CombatEvent = { type: "player_attacked", actorId: "player", direction: CELL, target: CELL };

    director.play([attack]);
    director.play([attack]);

    expect(plays[0]?.buffer).not.toBe(plays[1]?.buffer);
  });

  it("does not load or play before the mixer is unlocked", async () => {
    const { mixer, plays } = fakeMixer(false);
    const library = new CueLibrary(
      [definition("damaged", ["hit"])],
      async (url) => new TextEncoder().encode(url).buffer,
    );
    const director = new AudioDirector(mixer, library);

    director.play([{ type: "enemy_damaged", enemyId: "e1", hit: {} as never, hp: 1, maxHp: 2 }]);

    expect(plays).toHaveLength(0);
    expect(library.isLoaded).toBe(false);
    expect(library.isLoading).toBe(false);
  });
});
