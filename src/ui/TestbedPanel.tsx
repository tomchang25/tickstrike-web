import type { Cell, WorldSnapshot } from "../core/model/types";
import type { ContentInspection } from "../harness/content-inspection";
import type { MobilityKind } from "../presentation/pixi/PixiGameRenderer";
import type { TestScenario } from "../harness/types";

export interface TestbedPanelProps {
  readonly scenarios: readonly TestScenario[];
  readonly selectedScenarioId: string;
  readonly snapshot: WorldSnapshot;
  readonly busy: boolean;
  readonly commandsEnabled: boolean;
  readonly selectedMobility: MobilityKind;
  readonly inspection?: ContentInspection;
  onScenarioChange(id: string): void;
  onAttack(direction: Cell): Promise<void>;
  onMobilityToggle(): void;
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
        {!props.commandsEnabled ? <p data-testid="commands-disabled">Commands disabled for static inspection.</p> : null}
        <h3>Normal Attack</h3>
        <div className="movement-grid">
          <button data-testid="attack-up" type="button" aria-label="Attack up" disabled={props.busy || !props.commandsEnabled || !player} onClick={() => void props.onAttack({ x: 0, y: -1 })}>↑</button>
          <button data-testid="attack-left" type="button" aria-label="Attack left" disabled={props.busy || !props.commandsEnabled || !player} onClick={() => void props.onAttack({ x: -1, y: 0 })}>←</button>
          <button data-testid="attack-down" type="button" aria-label="Attack down" disabled={props.busy || !props.commandsEnabled || !player} onClick={() => void props.onAttack({ x: 0, y: 1 })}>↓</button>
          <button data-testid="attack-right" type="button" aria-label="Attack right" disabled={props.busy || !props.commandsEnabled || !player} onClick={() => void props.onAttack({ x: 1, y: 0 })}>→</button>
        </div>
        <button
          type="button"
          className="primary-command"
          data-testid="mobility-toggle"
          aria-pressed={props.selectedMobility === "smash"}
          disabled={props.busy || !props.commandsEnabled || !player || Boolean(props.snapshot.armedSmashTarget)}
          onClick={props.onMobilityToggle}
        >
          Mobility: {props.selectedMobility === "dash" ? "Dash" : "Smash"}
        </button>
        <button type="button" disabled={props.busy} onClick={props.onReset}>Reset scenario</button>
      </section>

      {props.inspection ? <ContentInspectionSection inspection={props.inspection} /> : null}

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

function ContentInspectionSection({ inspection }: { readonly inspection: ContentInspection }) {
  return (
    <section className="content-inspection" data-testid="content-inspection" aria-labelledby="content-inspection-title">
      <h2 id="content-inspection-title">Resolved parity content</h2>

      <div className="inspection-block">
        <h3>Ninja</h3>
        <dl>
          <dt>Name</dt><dd data-testid="inspection-ninja-name">{inspection.ninja.name}</dd>
          <dt>HP</dt><dd data-testid="inspection-ninja-hp">{inspection.ninja.hp}</dd>
          <dt>Speed fill</dt><dd data-testid="inspection-ninja-speed-fill">{inspection.ninja.speedFill}</dd>
          <dt>Mobility</dt><dd data-testid="inspection-ninja-mobility">{inspection.ninja.mobility.kind}</dd>
          <dt>Mobility damage</dt><dd data-testid="inspection-ninja-mobility-damage">{inspection.ninja.mobility.damage}</dd>
          <dt>Mobility range</dt><dd data-testid="inspection-ninja-mobility-range">{inspection.ninja.mobility.range}</dd>
          <dt>Mobility cooldown</dt><dd data-testid="inspection-ninja-mobility-cooldown">{inspection.ninja.mobility.cooldown}</dd>
        </dl>
      </div>

      <div className="inspection-block">
        <h3>Mode Boss</h3>
        <dl>
          <dt>Guard</dt><dd data-testid="inspection-mode-boss-guard">{inspection.modeBoss.guard.name}</dd>
          <dt>HP</dt><dd data-testid="inspection-mode-boss-hp">{inspection.modeBoss.hp}</dd>
          <dt>Defense</dt><dd data-testid="inspection-mode-boss-defense">{inspection.modeBoss.defense}</dd>
          <dt>Attacks</dt>
          <dd data-testid="inspection-mode-boss-attacks">
            {inspection.modeBoss.attacks.map((attack) => attack.name).join(", ")}
          </dd>
        </dl>
      </div>

      <div className="inspection-block">
        <h3>Demo Wave 10</h3>
        <dl>
          <dt>Population cap</dt><dd data-testid="inspection-demo-10-cap">{inspection.demoWave10.populationCap}</dd>
          <dt>Boss group</dt><dd data-testid="inspection-demo-10-group">{inspection.demoWave10.bossGroup.id}</dd>
          <dt>Group enemy</dt><dd data-testid="inspection-demo-10-enemy">{inspection.demoWave10.bossGroup.entries.map((entry) => entry.enemyId).join(", ")}</dd>
          <dt>Warning ticks</dt><dd data-testid="inspection-demo-10-warning">{inspection.demoWave10.slot.warningTicks}</dd>
          <dt>Level offset</dt><dd data-testid="inspection-demo-10-level-offset">{inspection.demoWave10.slot.levelOffset}</dd>
          <dt>Boss slot</dt><dd data-testid="inspection-demo-10-is-boss">{String(inspection.demoWave10.slot.isBoss)}</dd>
        </dl>
      </div>

      <div className="inspection-block">
        <h3>Guard Shredder</h3>
        <dl>
          <dt>Category</dt><dd data-testid="inspection-guard-shredder-category">{inspection.guardShredder.category}</dd>
          <dt>Required Mobility</dt><dd data-testid="inspection-guard-shredder-mobility">{inspection.guardShredder.requiredMobility}</dd>
          <dt>Trigger</dt><dd data-testid="inspection-guard-shredder-trigger">{inspection.guardShredder.trigger}</dd>
          <dt>Magnitude</dt><dd data-testid="inspection-guard-shredder-magnitude">{inspection.guardShredder.magnitude}</dd>
        </dl>
      </div>
    </section>
  );
}
