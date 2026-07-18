import type { ScenarioModule, TestScenario } from "./types";

const modules = import.meta.glob<ScenarioModule>("./scenarios/**/*.scenario.ts", {
  eager: true,
});

export const scenarios: readonly TestScenario[] = Object.values(modules)
  .flatMap((module) => module.scenarios)
  .sort((a, b) => a.title.localeCompare(b.title));

export function requireScenario(id: string): TestScenario {
  const scenario = scenarios.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return scenario;
}
