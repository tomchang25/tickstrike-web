import { useEffect, useState } from "react";
import type { WorldSnapshot } from "@core/model/types";
import { artifactCatalog } from "@content/artifact-catalog";
import { RunBuildHud } from "@ui/run-build-hud";

export interface GameHudProps {
  readonly snapshot: WorldSnapshot;
  /** When false (testbed static-inspection scenarios), the control hints are hidden. */
  readonly commandsEnabled?: boolean;
}

const CONTROL_HINTS: readonly { readonly label: string; readonly keys: readonly string[] }[] = [
  { label: "Move / Attack", keys: ["WASD"] },
  { label: "Attack", keys: ["IJKL"] },
  { label: "Mobility", keys: ["Alt", "cursor"] },
  { label: "Cancel", keys: ["right-click"] },
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
export function GameHud({ snapshot, commandsEnabled = true }: GameHudProps) {
  const [buildOpen, setBuildOpen] = useState(false);
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

      {commandsEnabled ? (
        <section className="hud-controls" aria-label="Controls">
          {CONTROL_HINTS.map((hint) => (
            <div key={hint.label} className="hud-control-row">
              <span className="hud-control-label">{hint.label}</span>
              {hint.keys.map((key, index) => (
                <span key={key} className="hud-key" data-plus={index > 0 ? "true" : undefined}>
                  {key}
                </span>
              ))}
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
          onClick={() => setBuildOpen(true)}
        >
          Build
        </button>
      </div>

      {buildOpen ? <BuildOverview snapshot={snapshot} onClose={() => setBuildOpen(false)} /> : null}
    </div>
  );
}

interface BuildOverviewProps {
  readonly snapshot: WorldSnapshot;
  readonly onClose: () => void;
}

function BuildOverview({ snapshot, onClose }: BuildOverviewProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
