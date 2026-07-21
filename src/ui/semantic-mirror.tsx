import type { WorldSnapshot } from "@core/model/types";

export interface SemanticMirrorProps {
  readonly snapshot: WorldSnapshot;
  readonly generation?: number;
  readonly isIdle?: boolean;
}

export function SemanticMirror({ snapshot, generation, isIdle }: SemanticMirrorProps) {
  const telegraphSources = new Set(snapshot.telegraphs.map((telegraph) => telegraph.sourceId));

  return (
    <div
      className="semantic-mirror"
      aria-hidden="true"
      data-testid="semantic-mirror"
      data-width={snapshot.arena.width}
      data-height={snapshot.arena.height}
      data-generation={generation}
      data-idle={isIdle}
      data-outcome={snapshot.outcome}
      data-reservation-count={snapshot.reservations.length}
      data-telegraph-count={snapshot.telegraphs.length}
      data-committed-attack-count={snapshot.entities.filter((entity) => entity.committedAttack).length}
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
          data-status={
            entity.staggerTicks !== undefined
              ? "staggered"
              : entity.protectionTicks !== undefined
                ? "protected"
                : entity.activity
          }
          data-facing-x={entity.facing?.x}
          data-facing-y={entity.facing?.y}
          data-recovery-ticks={entity.recoveryTicks}
          data-committed-attack={entity.committedAttack?.attackId}
          data-attack-warning-ticks={entity.committedAttack?.warningTicks}
          data-telegraph={telegraphSources.has(entity.id)}
          data-hp={entity.hp}
          data-max-hp={entity.maxHp}
          data-damage-immune={entity.damageImmune}
          data-defense={entity.defense}
          data-guard={entity.guard?.current}
          data-max-guard={entity.guard?.max}
          data-stagger-ticks={entity.staggerTicks}
          data-protection-ticks={entity.protectionTicks}
          data-mobility-kind={entity.mobility?.kind}
          data-mobility-cooldown={entity.mobility?.remainingCooldown}
          data-mobility-invulnerable={entity.mobility?.invulnerable}
          data-cell-x={entity.cell.x}
          data-cell-y={entity.cell.y}
        />
      ))}
    </div>
  );
}
