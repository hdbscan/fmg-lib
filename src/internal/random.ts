const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export const hashSeed = (seed: string): number => {
  let hash = FNV_OFFSET;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};

export const createPrng = (seed: string): (() => number) => {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};
