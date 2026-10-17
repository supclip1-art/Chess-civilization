// Заставка главного экрана — настоящая карта игры, нарисованная тем же движком, что и партия:
// столица игрока с фермой, лесопилкой, рудником, стенами и сторожевой башней, дорога к второму городу,
// армии игрока и соседа, вольный город. Сверху — закатное небо (CSS-слой), карта под ним живая (блики на воде).

import {
  NATIONS, newGame, recomputeTerritory, type GameState, type MapDef, type NationId, type Terrain,
} from '../../core/src/index.ts';
import { MapView } from './game/render.ts';

/** Остров радиусом 7: поля, леса, месторождения, горы на севере; вокруг — море. */
const islandMap = (): MapDef => {
  const cells: MapDef['cells'] = [];
  const T: Record<string, Terrain> = {
    '-1,-1': 'forest', '0,-1': 'field', '1,-1': 'deposit', '-1,0': 'field', '1,0': 'field', '-1,1': 'forest', '0,1': 'field',
    '2,-2': 'forest', '-2,0': 'deposit', '2,0': 'field', '0,2': 'forest', '-2,2': 'field', '2,-1': 'field', '-2,1': 'field', '1,1': 'field',
    '0,-3': 'mountain', '1,-3': 'mountain', '-1,-2': 'mountain', '3,-3': 'mountain', '2,-3': 'forest', '0,-2': 'field', '1,-2': 'field',
    '3,-1': 'field', '4,-2': 'forest', '4,-1': 'field', '5,-2': 'field', '5,-1': 'deposit', '6,-2': 'field', '6,-1': 'forest', '4,0': 'forest', '5,0': 'field',
    '3,0': 'field', '3,1': 'forest', '2,1': 'field', '4,1': 'field', '-3,1': 'forest', '-3,2': 'field', '-2,3': 'field', '-1,3': 'forest', '1,2': 'deposit',
    '-3,0': 'field', '-4,1': 'forest', '-4,2': 'field', '0,3': 'field', '2,2': 'forest', '-1,2': 'field', '3,-2': 'field', '-2,-1': 'mountain',
  };
  for (let q = -9; q <= 10; q++) for (let r = -7; r <= 6; r++) cells.push({ q, r, terrain: T[`${q},${r}`] ?? 'water' });
  return { name: 'Hero', cells, spawns: [{ q: 0, r: 0 }, { q: 5, r: -1 }], neutrals: [{ q: -3, r: 2 }] };
};

const build = (nation: NationId): GameState => {
  const rival: NationId = nation === 'france' ? 'britain' : 'france';
  const s = newGame(islandMap(), [{ nation }, { nation: rival, ai: { aggression: 'moderate', ruler: NATIONS[rival].rulers.moderate } }], { elo: 1200, seed: 11 });
  const cap = Object.values(s.halls).find((h) => h.owner === 'p1')!;
  cap.level = 2; cap.walls = 1; cap.barracks = 1;
  recomputeTerritory(s);
  const put = (k: string, kind: 'farm' | 'sawmill' | 'mine', level: number) => { const c = s.cells[k]; if (c?.owner === 'p1') c.building = { kind, level }; };
  put('0,-1', 'farm', 2); put('-1,-1', 'sawmill', 2); put('1,-1', 'mine', 1); put('-1,0', 'farm', 1); put('0,1', 'farm', 1);
  if (s.cells['-1,1']?.owner === 'p1') s.cells['-1,1'].building = { kind: 'sawmill', level: 1 };
  if (s.cells['1,1']?.owner === 'p1') s.cells['1,1'].tower = true;
  for (const k of ['0,0', '1,0', '2,-1', '3,-1', '4,-1', '5,-1']) s.cells[k].road = true;
  // армии: своя у столицы и в поле, соседская — у его границы
  const mine = Object.values(s.generals).filter((g) => g.owner === 'p1');
  mine[0].hex = { q: 2, r: 0 }; mine[0].army = { p: 6, n: 2, b: 1, r: 1, q: 0 };
  const theirs = Object.values(s.generals).find((g) => g.owner === 'p2');
  if (theirs) { theirs.hex = { q: 4, r: 0 }; theirs.army = { p: 5, n: 1, b: 1, r: 0, q: 0 }; }
  return s;
};

export const drawHero = async (canvas: HTMLCanvasElement, nation: NationId): Promise<void> => {
  let s: GameState;
  try { s = build(nation === 'outlaws' ? 'italy' : nation); } catch { return; }
  const view = new MapView(canvas);
  const seen = new Set(Object.keys(s.cells));
  view.zoom = Math.max(0.9, Math.min(1.3, canvas.clientWidth / 360));
  view.centerOn({ q: 1, r: 0 });
  // карта чуть ниже середины: сверху — небо и название
  const shift = () => { const w = canvas.clientWidth; view.centerOn({ q: 1, r: 0 }); view.zoomAt(1, w / 2, 0); };
  shift();
  // смещаем вниз, чтобы название не закрывало город
  (view as unknown as { oy: number }).oy += canvas.clientHeight * 0.16;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  const frame = (t: number) => {
    if (!canvas.isConnected) return;
    if (t - last > 66) { view.draw(s, 'p1', seen, {}); last = t; }
    if (!still) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
