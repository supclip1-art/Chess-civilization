// Шестиугольная сетка в осевых координатах (q, r).

export type Hex = { q: number; r: number };
export const key = (h: Hex): string => `${h.q},${h.r}`;
export const fromKey = (k: string): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

const DIRS: readonly Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/** Все клетки в радиусе n от центра (включая центр). */
export const range = (c: Hex, n: number): Hex[] => {
  const out: Hex[] = [];
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
      out.push({ q: c.q + dq, r: c.r + dr });
    }
  }
  return out;
};
