// Временная карта-песочница до настоящей карты «Европа и Средиземноморье»:
// шестиугольник радиуса 9, 6 стартовых точек по кругу и 6 нейтралов между ними.
// Дома у каждой точки — 3 поля, 3 леса и 2 месторождения, как в дизайне; серые зоны беднее.

import { type Hex, distance, key, range } from '../hex.ts';
import { next } from '../rng.ts';
import { type MapDef, type Terrain } from '../state.ts';

const SPAWNS: Hex[] = [
  { q: 6, r: 0 }, { q: 0, r: 6 }, { q: -6, r: 6 }, { q: -6, r: 0 }, { q: 0, r: -6 }, { q: 6, r: -6 },
];
const NEUTRALS: Hex[] = [
  { q: 3, r: 3 }, { q: -3, r: 6 }, { q: -6, r: 3 }, { q: -3, r: -3 }, { q: 3, r: -6 }, { q: 6, r: -3 },
];
const HOME_RING1: Terrain[] = ['field', 'forest', 'deposit', 'field', 'forest', 'deposit'];

export const sandboxMap = (seed = 2026): MapDef => {
  const rng = { seed };
  const t = new Map<string, Terrain>();
  for (const h of range({ q: 0, r: 0 }, 9)) {
    const x = next(rng);
    const terrain: Terrain = x < 0.08 ? 'mountain' : x < 0.13 ? 'water' : x < 0.45 ? 'field' : x < 0.7 ? 'forest'
      : x < 0.76 ? 'deposit' : x < 0.88 ? 'tundra' : 'desert';
    t.set(key(h), terrain);
  }
  for (const h of range({ q: 0, r: 0 }, 1)) t.set(key(h), 'mountain'); // хребет в центре
  for (const c of SPAWNS) {
    const ring1 = range(c, 1).filter((h) => distance(h, c) === 1);
    const ring2 = range(c, 2).filter((h) => distance(h, c) === 2);
    t.set(key(c), 'field');
    ring1.forEach((h, i) => t.has(key(h)) && t.set(key(h), HOME_RING1[i]));
    ring2.forEach((h, i) => t.has(key(h)) && t.set(key(h), i === 0 ? 'field' : i === 6 ? 'forest' : i % 2 ? 'tundra' : 'desert'));
  }
  for (const n of NEUTRALS) {
    t.set(key(n), 'field');
    range(n, 1).filter((h) => distance(h, n) === 1).forEach((h, i) => t.set(key(h), ['field', 'forest', 'deposit', 'tundra', 'desert', 'tundra'][i]));
  }
  return {
    name: 'Sandbox',
    cells: [...t].map(([k, terrain]) => { const [q, r] = k.split(',').map(Number); return { q, r, terrain }; }),
    spawns: SPAWNS,
    neutrals: NEUTRALS,
  };
};
