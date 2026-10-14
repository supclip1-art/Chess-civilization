// Автобой: Stockfish разыгрывает настоящую партию генерала против генерала.
// Сила каждого — бюджет узлов по его ELO; слабые иногда берут не лучший ход (из 3 лучших).

import {
  MAX_PLIES, armiesFromFen, battleFen, insufficientMaterial, next, type BattleEnd, type BattleReport, type GameState,
} from '../../../core/src/index.ts';
import { Engine, profile } from '../engine.ts';

let engine: Engine | null = null;
export const getEngine = async (): Promise<Engine> => (engine ??= await Engine.load());

export type BattleRecord = { report: BattleReport; startFen: string; moves: string[]; seconds: number };

export const autobattle = async (
  s: GameState, attackerId: string, defenderId: string, onPly?: (ply: number) => void,
): Promise<BattleRecord> => {
  const e = await getEngine();
  const att = s.generals[attackerId], def = s.generals[defenderId];
  const startFen = battleFen(att.army, def.army);
  const moves: string[] = [];
  const pos = () => `fen ${startFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
  const t0 = performance.now();
  let end: BattleEnd = 'limit';
  let mateWinner: 'white' | 'black' | undefined;
  e.send('ucinewgame');
  await e.ready();
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const g = ply % 2 === 0 ? att : def;
    const prof = profile(g.elo);
    let move: string;
    if (prof.blunder > 0 && next(s.rng) < prof.blunder) {
      const alts = await e.searchMulti(pos(), prof.nodes, 3);
      move = alts.length > 1 ? alts[1 + Math.floor(next(s.rng) * (alts.length - 1))] : alts[0] ?? '(none)';
    } else {
      move = (await e.search(pos(), prof.nodes)).best;
    }
    if (!move || move === '(none)') {
      const { inCheck } = await e.inspect(pos());
      if (inCheck) { end = 'mate'; mateWinner = ply % 2 === 0 ? 'black' : 'white'; } else end = 'stalemate';
      break;
    }
    moves.push(move);
    onPly?.(moves.length);
    const { fen } = await e.inspect(pos());
    const { white, black } = armiesFromFen(fen);
    if (insufficientMaterial(white, black)) { end = 'insufficient'; break; }
  }
  const { fen } = await e.inspect(pos());
  const { white, black } = armiesFromFen(fen);
  return { report: { end, mateWinner, white, black }, startFen, moves, seconds: (performance.now() - t0) / 1000 };
};
