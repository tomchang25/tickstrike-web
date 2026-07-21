import type { GameCommand } from "@core/actions/commands";
import type { Cell, EntityState, MilestoneChoice, WorldSnapshot } from "@core/model/types";
import type { GameRuntime } from "@runtime/game-runtime";
import type { RunCommandLog } from "@runtime/command-log";
import type { ContentInspection } from "./content-inspection";
import { requireScenario, scenarios } from "./scenario-registry";

export interface TickstrikeDebugApi {
  listScenarios(): readonly { id: string; title: string }[];
  loadScenario(id: string): void;
  reset(): void;
  getState(): WorldSnapshot;
  getGeneration(): number;
  isIdle(): boolean;
  getEntity(id: string): EntityState | undefined;
  getEntityBounds(id: string): ReturnType<GameRuntime["getEntityBounds"]>;
  isWalkable(cell: Cell): boolean;
  getContentInspection(): ContentInspection | undefined;
  getAudioPlayCount(): number;
  execute(command: GameCommand): Promise<void>;
  selectReward(artifactId: string): Promise<void>;
  selectMilestoneDecision(choice: MilestoneChoice): Promise<void>;
  cancelArmedSmash(): Promise<void>;
  exportCommandLog(): RunCommandLog;
  replayCommandLog(log: RunCommandLog): Promise<void>;
}

declare global {
  interface Window {
    __TICKSTRIKE__?: TickstrikeDebugApi;
  }
}

export function installDebugApi(runtime: GameRuntime): () => void {
  window.__TICKSTRIKE__ = {
    listScenarios: () => scenarios.map(({ id, title }) => ({ id, title })),
    loadScenario: (id) => runtime.loadScenario(requireScenario(id)),
    reset: () => runtime.reset(),
    getState: () => runtime.snapshot(),
    getGeneration: () => runtime.generation,
    isIdle: () => runtime.isIdle,
    getEntity: (id) => runtime.snapshot().entities.find((entity) => entity.id === id),
    getEntityBounds: (id) => runtime.getEntityBounds(id),
    isWalkable: (cell) => runtime.isWalkable(cell),
    getContentInspection: () => runtime.getContentInspection(),
    getAudioPlayCount: () => runtime.audio.totalPlayed,
    execute: async (command) => {
      await runtime.execute(command);
    },
    selectReward: async (artifactId) => {
      await runtime.selectReward(artifactId);
    },
    selectMilestoneDecision: async (choice) => {
      await runtime.selectMilestoneDecision(choice);
    },
    cancelArmedSmash: async () => {
      await runtime.cancelArmedSmash();
    },
    exportCommandLog: () => runtime.exportCommandLog(),
    replayCommandLog: async (log) => {
      await runtime.replayCommandLog(requireScenario(log.scenarioId), log);
    },
  };

  return () => {
    delete window.__TICKSTRIKE__;
  };
}
