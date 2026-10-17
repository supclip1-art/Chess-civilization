// Династия — прогресс между партиями. Опыт за кампании и достижения поднимает уровень династии (и титул правителя),
// уровни открывают нации, карту, облики фигур, доски и стартовые бонусы. Хранится на устройстве и, если есть, в облаке Telegram (CloudStorage).

import {
  NATIONS, TECHS, addElo, armyValue, nationStats, playerGenerals, playerHalls, relation, vassalsOf, finalScore,
  type GameState, type NationId, type TechId,
} from '../../core/src/index.ts';

export type Dynasty = {
  xp: number;
  achievements: Record<string, number>; // id → когда получено (Date.now)
  skin: string; board: string; bonus: string;
  campaigns: number; wins: number; bandits: number;
};
const KEY = 'chessciv.dynasty';
const fresh = (): Dynasty => ({ xp: 0, achievements: {}, skin: 'classic', board: 'green', bonus: 'none', campaigns: 0, wins: 0, bandits: 0 });

type Cloud = { getItem(k: string, cb: (e: unknown, v?: string) => void): void; setItem(k: string, v: string, cb?: (e: unknown) => void): void };
const cloud = (): Cloud | undefined => (globalThis as { Telegram?: { WebApp?: { CloudStorage?: Cloud; isVersionAtLeast?: (v: string) => boolean } } }).Telegram?.WebApp?.isVersionAtLeast?.('6.9')
  ? (globalThis as unknown as { Telegram: { WebApp: { CloudStorage: Cloud } } }).Telegram.WebApp.CloudStorage : undefined;

let dyn: Dynasty = fresh();
try { dyn = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* новая династия */ }

const save = () => {
  const raw = JSON.stringify(dyn);
  try { localStorage.setItem(KEY, raw); } catch { /* ничего */ }
  try { cloud()?.setItem('dynasty', raw); } catch { /* облака нет */ }
};

/** Подтянуть династию из облака Telegram (если там больше опыта — например, играли на другом устройстве). */
export const syncDynasty = (onChange: () => void): void => {
  try {
    cloud()?.getItem('dynasty', (_e, v) => {
      if (!v) { save(); return; }
      const other = { ...fresh(), ...JSON.parse(v) } as Dynasty;
      if (other.xp > dyn.xp) { dyn = { ...other, achievements: { ...other.achievements, ...dyn.achievements } }; save(); onChange(); }
    });
  } catch { /* облака нет */ }
};

export const dynasty = (): Dynasty => dyn;

// ---------- уровни и титулы ----------
/** Опыт до уровня n: 200, 600, 1200, 2000, 3000… */
export const xpFor = (level: number): number => 100 * level * (level - 1);
export const levelOf = (xp: number): number => { let l = 1; while (l < 10 && xp >= xpFor(l + 1)) l++; return l; };
export const TITLES = ['Chieftain', 'Lord', 'Baron', 'Count', 'Duke', 'Prince', 'King', 'High King', 'Emperor', 'Legend'];
export const title = (): string => TITLES[levelOf(dyn.xp) - 1];

export type Unlock = { level: number; kind: 'skin' | 'board' | 'bonus' | 'nation' | 'map'; id: string; name: string; text: string };
/** Нации, которые открываются уровнями династии (остальные доступны сразу). */
const NATION_LEVEL: Partial<Record<NationId, number>> = {
  poland: 2, ukraine: 2, persia: 3, arabia: 3, korea: 4, mexico: 4, brazil: 5, vietnam: 5,
  pakistan: 6, kazakhstan: 6, uzbekistan: 7, bangladesh: 7, indonesia: 8, nigeria: 8,
};
export const UNLOCKS: Unlock[] = ([
  { level: 1, kind: 'skin', id: 'classic', name: 'Classic', text: 'the usual white and black' },
  { level: 1, kind: 'board', id: 'green', name: 'Meadow', text: 'green and cream' },
  { level: 2, kind: 'map', id: 'asia', name: 'Asia', text: 'a new map for up to 8 nations' },
  { level: 2, kind: 'board', id: 'walnut', name: 'Walnut', text: 'warm wooden board' },
  { level: 2, kind: 'bonus', id: 'granary', name: 'Full granary', text: 'start with +60 wood and +60 food' },
  { level: 3, kind: 'skin', id: 'gilded', name: 'Gilded', text: 'gold and bronze pieces' },
  { level: 3, kind: 'bonus', id: 'warchest', name: 'War chest', text: 'start with +40 gold' },
  { level: 4, kind: 'board', id: 'marble', name: 'Marble', text: 'cool marble board' },
  { level: 4, kind: 'bonus', id: 'captain', name: 'Veteran captain', text: 'your first general starts with +50 ELO' },
  { level: 5, kind: 'skin', id: 'jade', name: 'Jade', text: 'jade and ivory pieces' },
  { level: 5, kind: 'bonus', id: 'scouts', name: 'Scouts', text: 'the land around your capital is mapped from the start' },
  { level: 6, kind: 'board', id: 'night', name: 'Night', text: 'deep blue board' },
  { level: 6, kind: 'bonus', id: 'militia', name: 'Militia tradition', text: 'start with the Militia technology' },
  { level: 7, kind: 'skin', id: 'obsidian', name: 'Obsidian', text: 'pearl and obsidian pieces' },
  { level: 7, kind: 'bonus', id: 'pawns', name: 'Levies', text: 'your first army starts with 2 more pawns' },
  { level: 9, kind: 'board', id: 'royal', name: 'Royal', text: 'purple and gold board' },
  { level: 10, kind: 'skin', id: 'crimson', name: 'Crimson', text: 'rose and crimson pieces' },
  ...(Object.entries(NATION_LEVEL) as [NationId, number][]).map(([id, level]): Unlock => ({ level, kind: 'nation', id, name: NATIONS[id].name, text: 'a new nation to play' })),
] as Unlock[]).sort((a, b) => a.level - b.level);
export const unlocked = (u: Unlock): boolean => levelOf(dyn.xp) >= u.level;
/** Уровень, с которого открыта нация / карта (1 — сразу). */
export const nationLevel = (n: NationId): number => NATION_LEVEL[n] ?? 1;
export const mapLevel = (id: string): number => UNLOCKS.find((u) => u.kind === 'map' && u.id === id)?.level ?? 1;
export const level = (): number => levelOf(dyn.xp);

/** Облики фигур: цвета белых и чёрных. */
export const SKINS: Record<string, [string, string]> = {
  classic: ['#ffffff', '#000000'], gilded: ['#f6e3a1', '#6b4a12'], jade: ['#e6f4ea', '#1f5e46'], obsidian: ['#eceaf4', '#231f33'], crimson: ['#fbe3d6', '#7a1f1f'],
};
/** Доски: светлые и тёмные клетки. */
export const BOARDS: Record<string, [string, string]> = {
  green: ['#ebecd0', '#739552'], walnut: ['#f0d9b5', '#b58863'], marble: ['#e8e6e1', '#9aa5ad'], night: ['#cdd7e6', '#4a6488'], royal: ['#efe1f5', '#7b5a99'],
};
export const choose = (kind: 'skin' | 'board' | 'bonus', id: string): void => {
  if (kind === 'skin') dyn.skin = id; else if (kind === 'board') dyn.board = id; else dyn.bonus = id;
  save();
  applyLook();
};
/** Применить доску (CSS-переменные). Облик фигур применяется при рисовании (pieceSkin). */
export const applyLook = (): void => {
  const [l, d] = BOARDS[dyn.board] ?? BOARDS.green;
  document.documentElement.style.setProperty('--sq-l', l);
  document.documentElement.style.setProperty('--sq-d', d);
};
/** Перекрасить SVG фигуры (data-URI cburnett, ключ wK…bP) в облик skin (по умолчанию — выбранный). */
export const pieceSkin = (key: string, uri: string, skin = dyn.skin): string => {
  const sk = SKINS[skin];
  if (!sk || skin === 'classic') return uri;
  const enc = (c: string) => `%23${c.slice(1)}`;
  // белые фигуры залиты #fff; у чёрных заливка #000 явная или по умолчанию (её задаём корню svg); контуры остаются чёрными
  if (key[0] === 'w') return uri.replace(/fill='%23fff'/g, `fill='${enc(sk[0])}'`);
  return uri.replace(/fill='%23000'/g, `fill='${enc(sk[1])}'`).replace('%3Csvg ', `%3Csvg fill='${enc(sk[1])}' `);
};

// ---------- стартовый бонус ----------
export const applyStartBonus = (s: GameState, me: string): void => {
  const b = dyn.bonus;
  const u = UNLOCKS.find((x) => x.kind === 'bonus' && x.id === b);
  if (!u || !unlocked(u)) return;
  const p = s.players[me];
  const g = playerGenerals(s, me)[0];
  if (b === 'granary') { p.res.wood += 60; p.res.food += 60; }
  if (b === 'warchest') p.res.gold += 40;
  if (b === 'captain' && g) addElo(s, g, 50);
  if (b === 'pawns' && g) g.army.p = Math.min(8, g.army.p + 2);
  if (b === 'militia') (p.research.techs ??= {}).militia = true;
  if (b === 'scouts') {
    const cap = playerHalls(s, me)[0];
    const mem = ((s.memory ??= {})[me] ??= {});
    for (const c of Object.values(s.cells)) {
      const d = (Math.abs(c.hex.q - cap.hex.q) + Math.abs(c.hex.r - cap.hex.r) + Math.abs(c.hex.q + c.hex.r - cap.hex.q - cap.hex.r)) / 2;
      if (d <= 7) mem[`${c.hex.q},${c.hex.r}`] = { turn: s.turn, owner: c.owner };
    }
  }
};

// ---------- достижения ----------
export type BattleNote = { won: boolean; myBefore: number; foeBefore: number; myPieces: number; lost: number; vsBandits: boolean; epic: boolean };
export type Ach = { id: string; name: string; text: string; xp: number; check: (s: GameState, me: string, b?: BattleNote) => boolean };
const eliminatedBy = (s: GameState, me: string) => s.log.some((e) => e.player === me && /is out of the game$/.test(e.text));
const rules = (s: GameState, me: string, name: string) => playerHalls(s, me).some((h) => h.name === name);
export const ACHIEVEMENTS: Ach[] = [
  { id: 'first_blood', name: 'First blood', text: 'win a battle', xp: 100, check: (_s, _m, b) => !!b?.won },
  { id: 'flawless', name: 'Flawless victory', text: 'win a battle without losing a single piece', xp: 300, check: (_s, _m, b) => !!b?.won && b.lost === 0 },
  { id: 'giant_slayer', name: 'Giant slayer', text: 'win a battle against a stronger army', xp: 300, check: (_s, _m, b) => !!b?.won && b.foeBefore > b.myBefore },
  { id: 'last_stand', name: 'Last stand', text: 'win a battle with 3 pieces or fewer', xp: 300, check: (_s, _m, b) => !!b?.won && b.myPieces <= 3 },
  { id: 'bandit_bane', name: 'Bandit bane', text: 'defeat bandits 3 times', xp: 200, check: () => dyn.bandits >= 3 },
  { id: 'treasure', name: 'Treasure hunter', text: 'open an epic trophy chest', xp: 200, check: (_s, _m, b) => !!b?.epic },
  { id: 'conqueror', name: 'Conqueror', text: 'take a city by force', xp: 150, check: (s, me) => playerHalls(s, me).some((h) => h.takenAt !== undefined) },
  { id: 'babylon', name: 'Take Babylon', text: 'take the great free city of Babylon by force (Asia map)', xp: 400, check: (s, me) => playerHalls(s, me).some((h) => h.name === 'Babylon' && h.takenAt !== undefined) },
  { id: 'karakorum', name: 'Take Karakorum', text: 'take the great free city of Karakorum, the steppe capital (Asia map)', xp: 400, check: (s, me) => playerHalls(s, me).some((h) => h.name === 'Karakorum' && h.takenAt !== undefined) },
  { id: 'genghis', name: 'Heir of Genghis Khan', text: 'conquer all of Asia: rule every city on the Asia map', xp: 900, check: (s, me) => s.settings.map === 'Asia' && Object.values(s.halls).every((h) => h.owner === me) },
  { id: 'charlemagne', name: 'Heir of Charlemagne', text: 'conquer all of Europe: rule every city on the Europe map', xp: 900, check: (s, me) => s.settings.map === 'Europe' && Object.values(s.halls).every((h) => h.owner === me) },
  { id: 'rome', name: 'All roads lead to Rome', text: 'rule Rome', xp: 200, check: (s, me) => rules(s, me, 'Rome') },
  { id: 'silk_road', name: 'Silk Road', text: 'rule Samarkand, Bukhara and Kashgar', xp: 400, check: (s, me) => ['Samarkand', 'Bukhara', 'Kashgar'].every((n) => rules(s, me, n)) },
  { id: 'kingslayer', name: 'Throne breaker', text: 'knock a nation out of the game', xp: 400, check: (s, me) => eliminatedBy(s, me) },
  { id: 'founder', name: 'Founder', text: 'rule 3 cities', xp: 100, check: (s, me) => playerHalls(s, me).length >= 3 },
  { id: 'empire', name: 'Empire', text: 'rule 10 cities', xp: 400, check: (s, me) => playerHalls(s, me).length >= 10 },
  { id: 'metropolis', name: 'Metropolis', text: 'grow a city to level 3', xp: 150, check: (s, me) => playerHalls(s, me).some((h) => h.level >= 3) },
  { id: 'grandmaster', name: 'Grandmaster', text: 'research every level of Tactics', xp: 300, check: (s, me) => s.players[me].research.done >= 5 },
  { id: 'scholar', name: 'Scholar', text: 'research every technology', xp: 400, check: (s, me) => (Object.keys(TECHS) as TechId[]).every((t) => s.players[me].research.techs?.[t]) },
  { id: 'diplomat', name: 'Diplomat', text: 'make an alliance', xp: 150, check: (s, me) => s.order.some((x) => x !== me && relation(s, me, x).state === 'alliance' && !s.players[x].overlord) },
  { id: 'peacemaker', name: 'Peacemaker', text: 'end a war by treaty', xp: 200, check: (s, me) => s.log.some((e) => e.player === me && /^peace with/.test(e.text)) },
  { id: 'overlord', name: 'Overlord', text: 'have a vassal', xp: 200, check: (s, me) => vassalsOf(s, me).length >= 1 },
  { id: 'king_of_kings', name: 'King of kings', text: 'have 3 vassals at once', xp: 400, check: (s, me) => vassalsOf(s, me).length >= 3 },
  { id: 'legend', name: 'Living legend', text: 'raise a general to five stars', xp: 300, check: (s, me) => playerGenerals(s, me).some((g) => g.stars >= 5) },
  { id: 'hero', name: 'Hero of the realm', text: 'a general with two traits', xp: 200, check: (s, me) => playerGenerals(s, me).some((g) => (g.traits?.length ?? 0) >= 2) },
  { id: 'survivor', name: 'Long reign', text: 'reach turn 50', xp: 200, check: (s, me) => s.turn >= 50 && s.players[me].alive },
  { id: 'army', name: 'Grand army', text: 'field an army worth 390 (a full set)', xp: 200, check: (s, me) => playerGenerals(s, me).some((g) => armyValue(g.army) >= 390) },
  { id: 'victory', name: 'Unifier', text: 'win a campaign', xp: 650, check: () => dyn.wins >= 1 },
];

/** Сумма опыта всех достижений равна опыту последней награды (Легенда, 10-й уровень): собрав все достижения,
 *  династия открывает всё, даже без опыта за кампании. */
export const ACHIEVEMENTS_TOTAL = ACHIEVEMENTS.reduce((a, x) => a + x.xp, 0);
if (ACHIEVEMENTS_TOTAL !== xpFor(Math.max(...UNLOCKS.map((u) => u.level)))) console.warn('achievements xp', ACHIEVEMENTS_TOTAL);

/** Проверить достижения; вернуть только что полученные (опыт уже начислен). */
export const checkAchievements = (s: GameState, me: string, b?: BattleNote): Ach[] => {
  let changed = false;
  if (b?.won && b.vsBandits) { dyn.bandits++; changed = true; }
  const got: Ach[] = [];
  for (const a of ACHIEVEMENTS) {
    if (dyn.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.check(s, me, b); } catch { ok = false; }
    if (ok) { dyn.achievements[a.id] = Date.now(); dyn.xp += a.xp; got.push(a); changed = true; }
  }
  if (changed) save();
  return got;
};

/** Итоги кампании для династии: опыт по пунктам и новые уровни. */
export type CampaignXp = { lines: [string, number][]; before: number; after: number; got: Ach[] };
export const finishCampaign = (s: GameState, me: string, how: 'victory' | 'defeat' | 'end'): CampaignXp => {
  const before = dyn.xp;
  const lines: [string, number][] = [];
  const p = s.players[me];
  const st = p.alive ? nationStats(s, me) : undefined;
  const scores = s.order.map((id) => ({ id, v: s.players[id].alive ? finalScore(nationStats(s, id)) : 0 })).sort((a, b) => b.v - a.v);
  const place = scores.findIndex((x) => x.id === me) + 1;
  lines.push(['Turns played', Math.min(300, s.turn * 3)]);
  if (st) lines.push(['Final strength', Math.round(finalScore(st) / 5)]);
  if (place === 1) lines.push(['First place', 200]); else if (place === 2) lines.push(['Second place', 100]); else if (place === 3) lines.push(['Third place', 50]);
  if (how === 'victory') { lines.push(['Victory', 500]); dyn.wins++; }
  dyn.campaigns++;
  for (const [, v] of lines) dyn.xp += v;
  const got = checkAchievements(s, me);
  save();
  return { lines, before, after: dyn.xp, got };
};
