import type { WorldSnapshot } from "../core/model/types";

export interface SemanticMirrorProps {
  readonly snapshot: WorldSnapshot;
  readonly generation?: number;
  readonly isIdle?: boolean;
}

export function SemanticMirror({ snapshot, generation, isIdle }: SemanticMirrorProps) {
  return (
    <div
      className="semantic-mirror"
      aria-hidden="true"
      data-testid="semantic-mirror"
      data-width={snapshot.arena.width}
      data-height={snapshot.arena.height}
      data-generation={generation}
      data-idle={isIdle}
      data-reservation-count={snapshot.reservations.length}
      data-telegraph-count={snapshot.telegraphs.length}
    >
      {snapshot.entities.map((entity) => (
        <span
          key={entity.id}
          data-testid={`entity-${entity.id}`}
          data-entity-id={entity.id}
          data-kind={entity.kind}
          data-archetype={entity.archetype}
          data-state={entity.phase}
          data-activity={entity.activity}
          data-facing-x={entity.facing?.x}
          data-facing-y={entity.facing?.y}
          data-recovery-ticks={entity.recoveryTicks}
          data-committed-attack={entity.committedAttack?.attackId}
          data-attack-warning-ticks={entity.committedAttack?.warningTicks}
          data-hp={entity.hp}
          data-max-hp={entity.maxHp}
          data-cell-x={entity.cell.x}
          data-cell-y={entity.cell.y}
        />
      ))}
    </div>
  );
}
