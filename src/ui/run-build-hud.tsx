import type { RunBuildState } from "@core/model/types";
import { artifactCatalog } from "@content/artifact-catalog";

export interface RunBuildHudProps {
  readonly build: RunBuildState;
}

function artifactName(artifactId: string): string {
  return artifactCatalog.artifacts.find((candidate) => candidate.id === artifactId)?.name ?? artifactId;
}

/**
 * A read-only, snapshot-owned view of the acquired run build: each held artifact and its stack
 * count, ordered by id for a stable render. It decides no eligibility, randomness, or combat; it
 * only formats what `snapshot.runBuild` already holds, so it clears with a reset or scenario swap.
 */
export function RunBuildHud({ build }: RunBuildHudProps) {
  const held = Object.entries(build.stacks)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return (
    <div className="run-build-hud" data-testid="run-build-hud" aria-label="Acquired build">
      <h3 className="run-build-title">Build</h3>
      {held.length === 0 ? (
        <p className="run-build-empty" data-testid="run-build-empty">
          No artifacts yet
        </p>
      ) : (
        <ul className="run-build-list">
          {held.map(([artifactId, count]) => (
            <li
              key={artifactId}
              className="run-build-item"
              data-testid={`run-build-item-${artifactId}`}
              data-stack={count}
            >
              <span className="run-build-name">{artifactName(artifactId)}</span>
              <span className="run-build-stack">×{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
