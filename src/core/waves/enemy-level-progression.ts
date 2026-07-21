import type { EnemyDefinition, GuardDefinition } from "../content/actor-schema";
import type { GrowthCurve, GuardGrowthInput, WaveProgressionProfile } from "../content/wave-schema";

export interface EnemyLevelProjection {
  readonly level: number;
  readonly maxHp: number;
  readonly damageMultiplier: number;
  readonly defense: number;
  readonly maxGuard: number;
}

function statGrowth(curve: GrowthCurve, level: number, lethalLevelStart: number): number {
  const standardTerm = curve.standardCoefficient * Math.pow(Math.max(level - 1, 0), curve.standardExponent);
  const lethalTerm =
    curve.lethalCoefficient * Math.pow(Math.max(level - (lethalLevelStart - 1), 0), curve.lethalExponent);
  return standardTerm + lethalTerm;
}

/** Guard ignores level and the slot's level offset; it scales only from the base wave number. */
export function projectGuardValue(guard: GuardDefinition, waveNumber: number, guardGrowth: GuardGrowthInput): number {
  if (waveNumber <= guardGrowth.standardWaveLimit) {
    return guard.base;
  }
  const lethalTier = Math.floor((waveNumber - guardGrowth.standardWaveLimit - 1) / guardGrowth.lethalTierCadence) + 1;
  return guard.base + guard.lethalTierGain * lethalTier;
}

/**
 * Projects one enemy's Level-1 authored base to `level`/`waveNumber` through `profile`. HP and
 * damage apply their curve as a multiplier on the base; defense adds the curve's raw growth
 * because combat already reduces defense non-linearly. `guard` is null for guardless enemies.
 */
export function projectEnemyLevel(
  enemy: EnemyDefinition,
  guard: GuardDefinition | null,
  level: number,
  waveNumber: number,
  profile: WaveProgressionProfile,
): EnemyLevelProjection {
  const hpGrowth = statGrowth(profile.hpCurve, level, profile.lethalLevelStart);
  const damageGrowth = statGrowth(profile.damageCurve, level, profile.lethalLevelStart);
  const defenseGrowth = statGrowth(profile.defenseCurve, level, profile.lethalLevelStart);
  return {
    level,
    maxHp: enemy.hp * (1 + hpGrowth),
    damageMultiplier: 1 + damageGrowth,
    defense: enemy.defense + defenseGrowth,
    maxGuard: guard ? projectGuardValue(guard, waveNumber, profile.guardGrowth) : 0,
  };
}
