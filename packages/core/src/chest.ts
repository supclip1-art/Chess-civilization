// Сундук трофеев: после каждой выигранной битвы победитель (игрок или ИИ) открывает сундук со случайной наградой.
// Чаще всего — золото или припасы, реже — фигура в армию или свиток ELO, совсем редко — большой клад.

import { ARMY_MAX, type Piece, type Res } from './config.ts';
import { int, next } from './rng.ts';
import { type GameState, addElo, eloCap, say } from './state.ts';

export type ChestReward =
  | { kind: 'gold'; amount: number; rarity: 'common' | 'epic' }
  | { kind: 'supplies'; res: Res; rarity: 'common' }
  | { kind: 'piece'; piece: Piece; rarity: 'rare' }
  | { kind: 'scroll'; elo: number; rarity: 'rare' };

/** Шансы: припасы 45%, золото 25%, фигура 15%, свиток ELO 10%, клад 5% (клад — с 15-го хода, до этого его доля уходит свитку: 15%). */
export const openChest = (s: GameState, pid: string, gid: string): ChestReward | undefined => {
  const p = s.players[pid];
  const g = s.generals[gid];
  if (!p || !g) return undefined;
  const roll = next(s.rng);
  let r: ChestReward;
  const piece = (['n', 'b', 'p', 'r'] as Piece[]).find((x) => g.army[x] < ARMY_MAX[x]);
  const hoard = s.turn >= 15;
  if (hoard && roll < 0.05) r = { kind: 'gold', amount: int(s.rng, 100, 150), rarity: 'epic' };
  else if (roll < 0.15 && g.elo + 25 <= eloCap(s)) r = { kind: 'scroll', elo: 25, rarity: 'rare' };
  else if (roll < 0.30 && piece) r = { kind: 'piece', piece, rarity: 'rare' };
  else if (roll < 0.75) r = { kind: 'supplies', res: { wood: int(s.rng, 6, 12) * 10, food: int(s.rng, 5, 10) * 10, gold: 0 }, rarity: 'common' };
  else r = { kind: 'gold', amount: int(s.rng, 2, 4) * 10, rarity: 'common' };
  // грабитель получает вдвое больше
  if (g.traits?.includes('plunderer')) { if (r.kind === 'gold') r.amount *= 2; if (r.kind === 'supplies') { r.res.wood *= 2; r.res.food *= 2; } }
  if (r.kind === 'gold') p.res.gold += r.amount;
  if (r.kind === 'supplies') { p.res.wood += r.res.wood; p.res.food += r.res.food; }
  if (r.kind === 'piece') g.army[r.piece]++;
  if (r.kind === 'scroll') addElo(s, g, r.elo);
  say(s, `trophy chest: ${chestText(r)}`, pid);
  return r;
};

const PIECE_NAME: Record<Piece, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
export const chestText = (r: ChestReward): string =>
  r.kind === 'gold' ? `${r.amount} gold${r.rarity === 'epic' ? ' — a treasure hoard!' : ''}`
    : r.kind === 'supplies' ? `${r.res.wood} wood and ${r.res.food} food`
      : r.kind === 'piece' ? `a ${PIECE_NAME[r.piece]} joins the army`
        : `a scroll of tactics: +${r.elo} ELO`;
