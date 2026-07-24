import type { WorldSnapshot } from "@core/model/types";
import { artifactCatalog } from "@content/artifact-catalog";
import type { TurnOrderState } from "@runtime/turn-order-controller";
import { RunBuildHud } from "@ui/run-build-hud";
import { TurnOrderBar } from "./turn-order-bar";
import keyW from "./assets/input/KeyW.png";
import keyA from "./assets/input/KeyA.png";
import keyS from "./assets/input/KeyS.png";
import keyD from "./assets/input/KeyD.png";
import keyI from "./assets/input/KeyI.png";
import keyJ from "./assets/input/KeyJ.png";
import keyK from "./assets/input/KeyK.png";
import keyL from "./assets/input/KeyL.png";
import keyAlt from "./assets/input/KeyAlt.png";
import mouseCursor from "./assets/input/Mouse.png";
import mouseRight from "./assets/input/MouseButtonRight.png";

export interface GameHudProps {
  readonly snapshot: WorldSnapshot;
  /** When false (testbed static-inspection scenarios), the control hints are hidden. */
  readonly commandsEnabled?: boolean;
  /** The session owns the build-overview open state so a single Escape handler can coordinate panels. */
  readonly buildOpen: boolean;
  readonly onBuildOpenChange: (open: boolean) => void;
  readonly turnOrder: TurnOrderState;
  readonly onTurnOrderHoveredEntityChange: (entityId?: string) => void;
}

interface KeyHint {
  readonly src: string;
  readonly alt: string;
}

const CONTROL_HINTS: readonly { readonly label: string; readonly keys: readonly KeyHint[] }[] = [
  {
    label: "Move / Attack",
    keys: [
      { src: keyW, alt: "W" },
      { src: keyA, alt: "A" },
      { src: keyS, alt: "S" },
      { src: keyD, alt: "D" },
    ],
  },
  {
    label: "Attack",
    keys: [
      { src: keyI, alt: "I" },
      { src: keyJ, alt: "J" },
      { src: keyK, alt: "K" },
      { src: keyL, alt: "L" },
    ],
  },
  {
    label: "Mobility",
    keys: [
      { src: keyAlt, alt: "Alt" },
      { src: mouseCursor, alt: "cursor" },
    ],
  },
  { label: "Cancel", keys: [{ src: mouseRight, alt: "right-click" }] },
];

function artifactName(artifactId: string): string {
  return artifactCatalog.artifacts.find((candidate) => candidate.id === artifactId)?.name ?? artifactId;
}

/**
 * The player-facing HUD, rendered as an overlay that fills the canvas frame. It is a pure projection
 * of the snapshot plus one presentation-only flag (the build overview open state); it never calls the
 * runtime. The container is `pointer-events: none` so gameplay clicks reach the board; only the Build
 * button and the overview re-enable pointer events.
 */
export function GameHud({
  snapshot,
  commandsEnabled = true,
  buildOpen,
  onBuildOpenChange,
  turnOrder,
  onTurnOrderHoveredEntityChange,
}: GameHudProps) {
  const player = snapshot.entities.find((entity) => entity.id === "player");
  const wave = snapshot.waveRuntime?.waveNumber;
  const hpPercent = player && player.maxHp > 0 ? Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100)) : 0;

  return (
    <div className="game-hud" aria-label="Heads-up display">
      {player ? (
        <section className="hud-player" aria-label="Player status">
          <div className="hud-hp-row">
            <span className="hud-label">HP</span>
            <div className="hud-bar" aria-hidden="true">
              <div className="hud-bar-fill" style={{ width: `${hpPercent}%` }} />
            </div>
            <span className="hud-hp-value" data-testid="hud-player-hp">
              {player.hp} / {player.maxHp}
            </span>
          </div>
          {player.mobility ? (
            <div className="hud-mobility">
              <span className="hud-chip">{player.mobility.kind === "smash" ? "Smash" : "Dash"}</span>
              <span className={player.mobility.remainingCooldown > 0 ? "hud-cooldown" : "hud-ready"}>
                {player.mobility.remainingCooldown > 0 ? `CD ${player.mobility.remainingCooldown}` : "Ready"}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {wave !== undefined ? (
        <div className="hud-wave" data-testid="hud-wave" role="status">
          Wave {wave}
        </div>
      ) : null}

      <TurnOrderBar state={turnOrder} onHoveredEntityChange={onTurnOrderHoveredEntityChange} />

      {commandsEnabled ? (
        <section className="hud-controls" aria-label="Controls">
          {CONTROL_HINTS.map((hint) => (
            <div key={hint.label} className="hud-control-row">
              <span className="hud-control-label">{hint.label}</span>
              <span className="hud-key-group">
                {hint.keys.map((key) => (
                  <img key={key.alt} className="hud-key-sprite" src={key.src} alt={key.alt} />
                ))}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <div className="hud-build">
        <RunBuildHud build={snapshot.runBuild} />
        <button
          type="button"
          className="hud-build-button"
          data-testid="hud-build-button"
          aria-haspopup="dialog"
          onClick={() => onBuildOpenChange(true)}
        >
          Build
        </button>
      </div>

      {buildOpen ? <BuildOverview snapshot={snapshot} onClose={() => onBuildOpenChange(false)} /> : null}
    </div>
  );
}

interface BuildOverviewProps {
  readonly snapshot: WorldSnapshot;
  readonly onClose: () => void;
}

function BuildOverview({ snapshot, onClose }: BuildOverviewProps) {
  const held = Object.entries(snapshot.runBuild.stacks)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return (
    <div className="hud-build-overview-backdrop" onClick={onClose}>
      <div
        className="hud-build-overview"
        data-testid="hud-build-overview"
        role="dialog"
        aria-modal="true"
        aria-label="Acquired build"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hud-build-overview-header">
          <h2>Build</h2>
          <button
            type="button"
            className="hud-build-overview-close"
            aria-label="Close build overview"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {held.length === 0 ? (
          <p className="hud-build-overview-empty">No artifacts yet</p>
        ) : (
          <ul className="hud-build-overview-list">
            {held.map(([artifactId, count]) => (
              <li
                key={artifactId}
                className="hud-build-overview-item"
                data-testid={`hud-build-overview-item-${artifactId}`}
              >
                <span>{artifactName(artifactId)}</span>
                <span className="hud-build-overview-stack">×{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
