import type { GameCommand } from "@core/actions/commands";
import type { Cell, EntityState, WorldSnapshot } from "@core/model/types";
import type { GameRuntime } from "@runtime/GameRuntime";
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
  execute(command: GameCommand): Promise<void>;
  selectReward(artifactId: string): Promise<void>;
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
    execute: async (command) => {
      await runtime.execute(command);
    },
    selectReward: async (artifactId) => {
      await runtime.selectReward(artifactId);
    },
  };

  return () => {
    delete window.__TICKSTRIKE__;
  };
}
