import { contentInspection } from "../content-inspection";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "content-catalog-inspection",
    title: "Content / Catalog Inspection",
    description: "A static parity-content inspection with no gameplay state.",
    commandsEnabled: false,
    inspection: contentInspection,
    createWorld() {
      return createTrainingArena();
    },
  },
];
