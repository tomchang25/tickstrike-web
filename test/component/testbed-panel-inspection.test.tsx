// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "./harness";
import { TestbedPanel, type TestbedPanelProps } from "@ui/testbed-panel";
import { contentInspection } from "@harness/content-inspection";
import { requireScenario } from "@harness/scenario-registry";

/**
 * The content-inspection scenario's initial world is empty and deterministic, so its snapshot is a
 * cheap, realistic prop for rendering the panel. The catalog values themselves are owned by the
 * scenario unit test; this component test proves the panel maps them into the DOM.
 */
function baseProps(overrides: Partial<TestbedPanelProps> = {}): TestbedPanelProps {
  const scenario = requireScenario("content-catalog-inspection");
  return {
    scenarios: [scenario],
    selectedScenarioId: scenario.id,
    snapshot: scenario.createWorld(scenario.seed).snapshot(),
    busy: false,
    commandsEnabled: false,
    selectedMobility: "dash",
    debugMode: false,
    outcome: "running",
    inspection: contentInspection,
    onScenarioChange: () => {},
    onDebugModeChange: () => {},
    onReset: () => {},
    ...overrides,
  };
}

describe("TestbedPanel content inspection", () => {
  it("renders the resolved catalog values into the inspection panel", () => {
    render(<TestbedPanel {...baseProps()} />);

    expect(screen.getByTestId("content-inspection")).toBeInTheDocument();
    expect(screen.getByTestId("inspection-ninja-name")).toHaveTextContent("Ninja");
    expect(screen.getByTestId("inspection-ninja-mobility")).toHaveTextContent("dash");
    expect(screen.getByTestId("inspection-charge-enemy-guard")).toHaveTextContent("Heavy");
    expect(screen.getByTestId("inspection-guard-shredder-category")).toHaveTextContent("major");
  });

  it("omits the inspection panel when a scenario supplies no inspection data", () => {
    render(<TestbedPanel {...baseProps({ inspection: undefined })} />);

    expect(screen.queryByTestId("content-inspection")).not.toBeInTheDocument();
  });
});
