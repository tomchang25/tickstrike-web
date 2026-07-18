import type { Seed } from "../model/types";
import { normalizeSeed, RandomStream } from "./random-stream";

function hashDomain(rootSeed: number, domain: string): number {
  let hash = rootSeed >>> 0;
  for (let index = 0; index < domain.length; index += 1) {
    hash ^= domain.charCodeAt(index);
    hash = Math.imul(hash, 0x45d9f3b);
    hash ^= hash >>> 16;
  }
  return hash >>> 0;
}

/** Named streams are derived independently from the root and creation order. */
export class RandomStreams {
  readonly rootSeed: number;
  private readonly streams = new Map<string, RandomStream>();

  constructor(seed: Seed = 0) {
    this.rootSeed = normalizeSeed(seed);
  }

  get(domain: string): RandomStream {
    if (!domain) throw new Error("Random stream domains must not be empty.");
    let stream = this.streams.get(domain);
    if (!stream) {
      stream = new RandomStream(hashDomain(this.rootSeed, domain));
      this.streams.set(domain, stream);
    }
    return stream;
  }

  stream(domain: string): RandomStream {
    return this.get(domain);
  }

  getStream(domain: string): RandomStream {
    return this.get(domain);
  }

  reset(): void {
    this.streams.clear();
  }
}

export function createRandomStreams(seed: Seed = 0): RandomStreams {
  return new RandomStreams(seed);
}
