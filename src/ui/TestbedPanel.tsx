import type { EncounterOutcome, MobilityKind, WorldSnapshot } from "../core/model/types";
import type { ContentInspection } from "../harness/content-inspection";
import type { TestScenario } from "../harness/types";

export interface TestbedPanelProps {
  readonly scenarios: readonly TestScenario[];
  readonly selectedScenarioId: string;
  readonly snapshot: WorldSnapshot;
  readonly busy: boolean;
  readonly commandsEnabled: boolean;
  readonly selectedMobility: MobilityKind;
  readonly debugMode: boolean;
  readonly outcome: EncounterOutcome;
  readonly inspection?: ContentInspection;
  onScenarioChange(id: string): void;
  onDebugModeChange(enabled: boolean): void;
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
        <div><span>Telegraphs</span><strong data-testid="enemy-telegraph-count">{props.snapshot.telegraphs.length}</strong></div>
        <div><span>Player</span><strong>{player ? `${player.cell.x},${player.cell.y}` : "—"}</strong></div>
      </div>

      <div className={`encounter-status encounter-status-${props.outcome}`} data-testid="encounter-status">
        <span>Encounter</span>
        <strong>{outcomeLabel(props.outcome)}</strong>
      </div>

      <section className="combat-status" data-testid="enemy-statuses" aria-labelledby="enemy-status-title">
        <h2 id="enemy-status-title">Enemy Status</h2>
        <div className="enemy-status-list">
          {enemies.map((enemy) => (
            <article className="enemy-status-card" key={enemy.id} data-testid={`enemy-status-${enemy.id}`}>
              <div className="enemy-status-heading">
                <strong>{enemy.archetype}</strong>
                <span data-testid={`enemy-activity-${enemy.id}`}>{enemy.activity ?? enemy.phase}</span>
              </div>
              <div className="enemy-status-meta">
                <span data-testid={`enemy-facing-${enemy.id}`}>
                  Facing {enemy.facing ? `${enemy.facing.x},${enemy.facing.y}` : "-"}
                </span>
                <span data-testid={`enemy-cell-${enemy.id}`}>Cell {enemy.cell.x},{enemy.cell.y}</span>
              </div>
              <StatusBar
                testId={`enemy-hp-${enemy.id}`}
                label="HP"
                current={enemy.hp}
                maximum={enemy.maxHp}
                color="#ff5c7a"
              />
              {enemy.guard ? (
                <StatusBar
                  testId={`enemy-guard-${enemy.id}`}
                  label="Guard"
                  current={enemy.guard.current}
                  maximum={enemy.guard.max}
                  color="#72d4ff"
                />
              ) : null}
              {enemy.committedAttack ? (
                <small data-testid={`enemy-telegraph-${enemy.id}`}>
                  Telegraph {enemy.committedAttack.warningTicks} tick(s)
                </small>
              ) : null}
              {enemy.staggerTicks !== undefined ? (
                <small data-testid={`enemy-stagger-${enemy.id}`}>Stagger {enemy.staggerTicks}</small>
              ) : null}
              {enemy.protectionTicks !== undefined ? (
                <small data-testid={`enemy-protection-${enemy.id}`}>Protection {enemy.protectionTicks}</small>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <label className="debug-toggle">
        <input
          data-testid="debug-mode"
          type="checkbox"
          checked={props.debugMode}
          onChange={(event) => props.onDebugModeChange(event.target.checked)}
        />
        <span>Debug mode</span>
      </label>

      {props.debugMode ? (
        <section className="grid-debug" data-testid="grid-debug-legend" aria-labelledby="grid-debug-title">
          <h2 id="grid-debug-title">Grid Debug</h2>
          <p data-testid="grid-debug-reservations">Reservations: {props.snapshot.reservations.length}</p>
          <div className="grid-debug-key"><span className="grid-debug-swatch grid-debug-blocked" />Blocked / occupied</div>
          <div className="grid-debug-key"><span className="grid-debug-swatch grid-debug-reserved" />Reservation</div>
        </section>
      ) : null}

      <section>
        <h2>Commands</h2>
        {!props.commandsEnabled ? <p data-testid="commands-disabled">Commands disabled for static inspection.</p> : null}
        <p className="primary-command" data-testid="active-mobility">
          Mobility: {props.selectedMobility === "dash" ? "Dash" : "Smash"}
        </p>
        {player?.mobility ? (
          <small data-testid="mobility-status">
            {player.mobility.remainingCooldown > 0
              ? `Cooldown ${player.mobility.remainingCooldown}`
              : player.mobility.invulnerable
                ? "Invulnerable"
                : "Ready"}
          </small>
        ) : null}
        <button type="button" data-testid="reset-scenario" disabled={props.busy} onClick={props.onReset}>
          {props.outcome === "running" ? "Reset scenario" : "Restart encounter"}
        </button>
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

function outcomeLabel(outcome: EncounterOutcome): string {
  if (outcome === "victory") return "Victory";
  if (outcome === "defeat") return "Defeat";
  return "Running";
}

function StatusBar({
  testId,
  label,
  current,
  maximum,
  color,
}: {
  readonly testId: string;
  readonly label: string;
  readonly current: number;
  readonly maximum: number;
  readonly color: string;
}) {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  return (
    <div className="status-bar-row" data-testid={testId}>
      <span>{label}</span>
      <div
        className="status-bar"
        role="progressbar"
        aria-label={`${label} ${current} of ${maximum}`}
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={current}
      >
        <span className="status-bar-fill" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
      </div>
      <strong>{current}/{maximum}</strong>
    </div>
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
