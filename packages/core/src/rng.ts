// Детерминированный генератор (mulberry32). Вся случайность партии идёт только через него,
// поэтому одна и та же партия с тем же сидом воспроизводится один в один.

export type Rng = { seed: number };

export const next = (rng: Rng): number => {
  let a = (rng.seed = (rng.seed + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Целое от min до max включительно. */
export const int = (rng: Rng, min: number, max: number): number => min + Math.floor(next(rng) * (max - min + 1));

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(next(rng) * items.length)];
