import type { GameCommand } from "../core/actions/commands";
import type { EntityState, WorldSnapshot } from "../core/model/types";
import type { GameRuntime } from "../runtime/GameRuntime";
import { requireScenario, scenarios } from "./scenario-registry";

export interface TickstrikeDebugApi {
  listScenarios(): readonly { id: string; title: string }[];
  loadScenario(id: string): void;
  reset(): void;
  getState(): WorldSnapshot;
  getEntity(id: string): EntityState | undefined;
  getEntityBounds(id: string): ReturnType<GameRuntime["getEntityBounds"]>;
  execute(command: GameCommand): Promise<void>;
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
    getEntity: (id) => runtime.snapshot().entities.find((entity) => entity.id === id),
    getEntityBounds: (id) => runtime.getEntityBounds(id),
    execute: async (command) => {
      await runtime.execute(command);
    },
  };

  return () => {
    delete window.__TICKSTRIKE__;
  };
}
