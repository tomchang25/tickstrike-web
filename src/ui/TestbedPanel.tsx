import type { Cell, WorldSnapshot } from "../core/model/types";
import type { TestScenario } from "../harness/types";

export interface TestbedPanelProps {
  readonly scenarios: readonly TestScenario[];
  readonly selectedScenarioId: string;
  readonly snapshot: WorldSnapshot;
  readonly busy: boolean;
  onScenarioChange(id: string): void;
  onMove(direction: Cell): Promise<void>;
  onSmash(): Promise<void>;
  onReset(): void;
}

export function TestbedPanel(props: TestbedPanelProps) {
  const player = props.snapshot.entities.find((entity) => entity.kind === "player");
  const enemies = props.snapshot.entities.filter((entity) => entity.kind === "enemy");

  return (
    <aside className="testbed-panel" aria-label="Testbed controls">
      <label className="field">
        <span>Scenario</span>
        <select
          data-testid="scenario-select"
          value={props.selectedScenarioId}
          disabled={props.busy}
          onChange={(event) => props.onScenarioChange(event.target.value)}
        >
          {props.scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.title}
            </option>
          ))}
        </select>
      </label>

      <div className="metrics">
        <div><span>Tick</span><strong data-testid="tick-value">{props.snapshot.tick}</strong></div>
        <div><span>Enemies</span><strong data-testid="enemy-count">{enemies.length}</strong></div>
        <div><span>Player</span><strong>{player ? `${player.cell.x},${player.cell.y}` : "—"}</strong></div>
      </div>

      <section>
        <h2>Commands</h2>
        <div className="movement-grid">
          <button type="button" disabled={props.busy} onClick={() => void props.onMove({ x: 0, y: -1 })}>↑</button>
          <button type="button" disabled={props.busy} onClick={() => void props.onMove({ x: -1, y: 0 })}>←</button>
          <button type="button" disabled={props.busy} onClick={() => void props.onMove({ x: 0, y: 1 })}>↓</button>
          <button type="button" disabled={props.busy} onClick={() => void props.onMove({ x: 1, y: 0 })}>→</button>
        </div>
        <button
          type="button"
          className="primary-command"
          data-testid="smash-button"
          disabled={props.busy || !player}
          onClick={() => void props.onSmash()}
        >
          Smash right cell
        </button>
        <button type="button" disabled={props.busy} onClick={props.onReset}>Reset scenario</button>
      </section>

      <section>
        <h2>Last events</h2>
        <ol className="event-log" data-testid="event-log">
          {props.snapshot.lastEvents.length === 0 ? (
            <li>No command executed.</li>
          ) : (
            props.snapshot.lastEvents.map((event, index) => (
              <li key={`${event.type}-${index}`}>{event.type}</li>
            ))
          )}
        </ol>
      </section>
    </aside>
  );
}
