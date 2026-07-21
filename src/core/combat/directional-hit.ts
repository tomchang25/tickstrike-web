import {
  cardinalDirection,
  directionBetween,
  sameCell,
  type Cell,
  type DirectionalHitResult,
  type EntityId,
  type EntityState,
  type HitAngle,
} from "../model/types";

export interface DirectionalHitInput {
  readonly attackerId: EntityId;
  readonly attackerCell: Cell;
  readonly target: EntityState;
  readonly damage: number;
  readonly staggerMultiplier?: number;
  /** True only for an actual Dash hit while the acquired Guard Shredder trigger is active. */
  readonly guardShredderTrigger?: boolean;
  /** True only for an actual Dash hit while the acquired Execution trigger is active. */
  readonly executionTrigger?: boolean;
}

export function classifyHitAngle(
  attackerCell: Cell,
  targetCell: Cell,
  targetFacing: Cell | undefined,
): HitAngle | undefined {
  const facing = cardinalDirection(targetFacing ?? { x: 0, y: 0 });
  const relationship = directionBetween(targetCell, attackerCell);
  if (!facing || !relationship || sameCell(attackerCell, targetCell)) {
    return undefined;
  }

  if (relationship.x === facing.x && relationship.y === facing.y) {
    return "front";
  }
  if (relationship.x === -facing.x && relationship.y === -facing.y) {
    return "back";
  }
  return "side";
}

function directionalGuardDamage(angle: HitAngle): number {
  switch (angle) {
    case "front":
      return 4;
    case "side":
      return 16;
    case "back":
      return 32;
  }
}

function applyDefense(amount: number, defense: number): number {
  if (defense <= 0) {
    return amount;
  }
  return (amount * amount) / (amount + defense);
}

export function calculateDirectionalHit(input: DirectionalHitInput): DirectionalHitResult | undefined {
  if (input.target.phase !== "alive") {
    return undefined;
  }
  const angle = classifyHitAngle(input.attackerCell, input.target.cell, input.target.facing);
  if (!angle || !Number.isFinite(input.damage) || input.damage <= 0) {
    return undefined;
  }

  const guard = input.target.guard;
  const guardBefore = guard?.current ?? 0;
  const alreadyStaggered = input.target.activity === "staggered";

  // Execution takes priority over Guard Shredder: an already-staggered target has no guard left
  // to shred, and its Dash hit becomes an instant kill through the ordinary terminal-event path.
  if (input.executionTrigger && alreadyStaggered) {
    return {
      attackerId: input.attackerId,
      targetId: input.target.id,
      damage: input.target.hp,
      hpBefore: input.target.hp,
      hpAfter: 0,
      killed: true,
      angle,
      baseDamage: input.damage,
      guardDamage: 0,
      guardBefore,
      guardAfter: guardBefore,
      hpDamage: input.target.hp,
      defenseAdjustedDamage: input.target.hp,
      guardBroken: false,
      staggerBurst: true,
      feedback: "staggered",
    };
  }

  const protectionTicks = input.target.protectionTicks ?? 0;
  const rawGuardDamage = guard && guardBefore > 0 ? directionalGuardDamage(angle) : 0;
  // A qualifying back-angle Dash hit zeroes Guard directly, bypassing ordinary Protection scaling,
  // guaranteeing the break before the downstream stagger handling below reacts to it.
  const guardShredderHit =
    Boolean(input.guardShredderTrigger) && Boolean(guard) && !alreadyStaggered && guardBefore > 0 && angle === "back";
  const guardDamage = guardShredderHit
    ? guardBefore
    : protectionTicks > 0 && rawGuardDamage > 0
      ? rawGuardDamage * (guard?.protectionMultiplier ?? 1)
      : rawGuardDamage;
  const guardAfter = Math.max(0, guardBefore - guardDamage);
  const guardBroken = guardBefore > 0 && guardAfter === 0;
  const staggerBurst = alreadyStaggered || (guardBroken && input.target.phase === "alive");
  const guardedHpDamage = guardBefore > 0 && !guardBroken && !alreadyStaggered ? input.damage * 0.2 : input.damage;
  const hpDamage = alreadyStaggered ? guardedHpDamage * (input.staggerMultiplier ?? 1) : guardedHpDamage;
  const defenseAdjustedDamage = applyDefense(hpDamage, input.target.defense ?? 0);
  const hpAfter = Math.max(0, input.target.hp - defenseAdjustedDamage);

  return {
    attackerId: input.attackerId,
    targetId: input.target.id,
    damage: defenseAdjustedDamage,
    hpBefore: input.target.hp,
    hpAfter,
    killed: hpAfter === 0,
    angle,
    baseDamage: input.damage,
    guardDamage,
    guardBefore,
    guardAfter,
    hpDamage,
    defenseAdjustedDamage,
    guardBroken,
    staggerBurst,
    feedback: alreadyStaggered ? "staggered" : guardBroken ? "guard_break" : guardBefore > 0 ? "guarded" : "unblocked",
  };
}

export const resolveDirectionalHit = calculateDirectionalHit;
