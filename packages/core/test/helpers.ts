// Маленькая тестовая карта: шестиугольник радиуса 7, две столицы и одна нейтральная ратуша.
// Вокруг каждой столицы: в первом кольце 2 поля, 2 леса, 2 месторождения; во втором — ещё поле и лес.

import { type Hex, key, range } from '../src/hex.ts';
import { type MapDef, type Terrain } from '../src/state.ts';

export const SPAWN_A: Hex = { q: -4, r: 0 };
export const SPAWN_B: Hex = { q: 4, r: 0 };
export const NEUTRAL: Hex = { q: 0, r: 4 };

const ring1: Terrain[] = ['field', 'forest', 'deposit', 'field', 'forest', 'deposit'];

export const testMap = (): MapDef => {
  const t = new Map<string, Terrain>();
  for (const h of range({ q: 0, r: 0 }, 7)) t.set(key(h), 'field');
  for (const c of [SPAWN_A, SPAWN_B]) {
    const around = range(c, 2).filter((h) => !(h.q === c.q && h.r === c.r));
    const firstRing = around.filter((h) => Math.max(Math.abs(h.q - c.q), Math.abs(h.r - c.r), Math.abs(h.q + h.r - c.q - c.r)) === 1);
    firstRing.forEach((h, i) => t.set(key(h), ring1[i]));
    // второе кольцо: ещё 1 поле и 1 лес, остальное — тундра и пустыня (как в дизайне: дома 3 поля, 3 леса, 2 месторождения)
    around.filter((h) => !firstRing.includes(h)).forEach((h, i) =>
      t.set(key(h), i === 0 ? 'field' : i === 6 ? 'forest' : i % 2 ? 'tundra' : 'desert'));
  }
  t.set(key({ q: 0, r: -1 }), 'mountain');
  t.set(key({ q: 0, r: 0 }), 'mountain');
  t.set(key({ q: 0, r: 1 }), 'water');
  return {
    name: 'test',
    cells: [...t].map(([k, terrain]) => { const [q, r] = k.split(',').map(Number); return { q, r, terrain }; }),
    spawns: [SPAWN_A, SPAWN_B],
    neutrals: [NEUTRAL],
  };
};

export const cellsAround = (c: Hex, terrain: Terrain, terr: MapDef): Hex[] =>
  range(c, 1).filter((h) => terr.cells.find((x) => x.q === h.q && x.r === h.r)?.terrain === terrain);

/** Объявить войну между двумя странами (сразу в силе) — для тестов боёв. */
export const war = (s: { diplo?: Record<string, { state: 'peace' | 'war' | 'alliance'; since: number; warFrom?: number }> }, a = 'p1', b = 'p2'): void => {
  (s.diplo ??= {})[a < b ? `${a}|${b}` : `${b}|${a}`] = { state: 'war', since: 0, warFrom: 0 };
};
