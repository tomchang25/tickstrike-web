import type { WorldSnapshot } from "../core/model/types";

export interface SemanticMirrorProps {
  readonly snapshot: WorldSnapshot;
}

export function SemanticMirror({ snapshot }: SemanticMirrorProps) {
  return (
    <div className="semantic-mirror" aria-hidden="true">
      {snapshot.entities.map((entity) => (
        <span
          key={entity.id}
          data-testid={`entity-${entity.id}`}
          data-entity-id={entity.id}
          data-kind={entity.kind}
          data-archetype={entity.archetype}
          data-state={entity.phase}
          data-cell-x={entity.cell.x}
          data-cell-y={entity.cell.y}
        />
      ))}
    </div>
  );
}
