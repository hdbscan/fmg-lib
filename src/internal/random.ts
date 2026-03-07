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

const MASH_MULTIPLIER = 0.02519603282416938;
const TWO_POW_32 = 4294967296;

const createMash = (): ((data: string) => number) => {
  let state = 0xefc8249d;

  return (data: string): number => {
    const value = String(data);

    for (let index = 0; index < value.length; index += 1) {
      state += value.charCodeAt(index);
      let hashed = MASH_MULTIPLIER * state;
      state = hashed >>> 0;
      hashed -= state;
      hashed *= state;
      state = hashed >>> 0;
      hashed -= state;
      state += hashed * TWO_POW_32;
    }

    return (state >>> 0) * 2.3283064365386963e-10;
  };
};

export const createAlea = (seed: string): (() => number) => {
  const mash = createMash();
  let s0 = mash(" ");
  let s1 = mash(" ");
  let s2 = mash(" ");
  let carry = 1;

  const seedValue = String(seed);
  s0 -= mash(seedValue);
  if (s0 < 0) {
    s0 += 1;
  }
  s1 -= mash(seedValue);
  if (s1 < 0) {
    s1 += 1;
  }
  s2 -= mash(seedValue);
  if (s2 < 0) {
    s2 += 1;
  }

  return () => {
    const next = 2091639 * s0 + carry * 2.3283064365386963e-10;
    s0 = s1;
    s1 = s2;
    carry = next | 0;
    s2 = next - carry;
    return s2;
  };
};
