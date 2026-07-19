import type { Seed } from "../model/types";

export type WeightedEntry<T> =
  | {
      readonly item: T;
      readonly weight: number;
    }
  | {
      readonly value: T;
      readonly weight: number;
    };

const UINT32_RANGE = 0x1_0000_0000;

/** Convert a public seed into the fixed-width state used by the generator. */
export function normalizeSeed(seed: Seed = 0): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.trunc(seed) >>> 0;
  }

  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x6d2b79f5;
}

/** A small environment-independent generator. Its state is never shared between domains. */
export class RandomStream {
  private state: number;

  constructor(seed: Seed = 0) {
    this.state = normalizeSeed(seed);
  }

  get currentState(): number {
    return this.state >>> 0;
  }

  nextUint(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.state = value >>> 0;
    return this.state;
  }

  nextUnit(): number {
    return this.nextUint() / UINT32_RANGE;
  }

  unit(): number {
    return this.nextUnit();
  }

  /** Returns an integer in [minimum, maximum), or undefined for invalid bounds. */
  nextInt(minimum: number, maximum: number): number | undefined {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum <= minimum) {
      return undefined;
    }
    return minimum + Math.floor(this.nextUnit() * (maximum - minimum));
  }

  boundedInt(minimum: number, maximum: number): number | undefined {
    return this.nextInt(minimum, maximum);
  }

  int(minimum: number, maximum: number): number | undefined {
    return this.nextInt(minimum, maximum);
  }

  pick<T>(items: readonly T[]): T | undefined {
    const index = this.nextInt(0, items.length);
    return index === undefined ? undefined : items[index];
  }

  pickWeighted<T>(entries: readonly WeightedEntry<T>[]): T | undefined {
    const valid = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
    const total = valid.reduce((sum, entry) => sum + entry.weight, 0);
    if (valid.length === 0 || !Number.isFinite(total) || total <= 0) {
      return undefined;
    }

    let target = this.nextUnit() * total;
    for (const entry of valid) {
      target -= entry.weight;
      if (target < 0) {
        return "item" in entry ? entry.item : entry.value;
      }
    }
    const last = valid[valid.length - 1];
    return last && ("item" in last ? last.item : last.value);
  }

  /** Select without replacement. Invalid requests return an empty deterministic result. */
  pickUnique<T>(items: readonly T[], count: number): readonly T[] {
    if (!Number.isInteger(count) || count < 0 || count > items.length) {
      return [];
    }
    const remaining = [...items];
    const selected: T[] = [];
    while (selected.length < count) {
      const index = this.nextInt(0, remaining.length);
      if (index === undefined) {
        return [];
      }
      selected.push(remaining[index]!);
      remaining.splice(index, 1);
    }
    return selected;
  }

  weightedPick<T>(entries: readonly WeightedEntry<T>[]): T | undefined {
    return this.pickWeighted(entries);
  }

  selectUnique<T>(items: readonly T[], count: number): readonly T[] {
    return this.pickUnique(items, count);
  }

  clone(): RandomStream {
    const copy = new RandomStream(1);
    copy.state = this.state;
    return copy;
  }
}

export function createRandomStream(seed: Seed = 0): RandomStream {
  return new RandomStream(seed);
}
