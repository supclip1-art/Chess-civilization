// Генералы-герои: у каждого генерала страны есть черта характера (при найме — одна, с третьей звездой — вторая).
// Черты меняют бой (ELO в отдельных случаях) или жизнь армии на карте.

import { int } from './rng.ts';
import { type GameState, type General, say } from './state.ts';

export type TraitId = 'endgame' | 'gambit' | 'wall' | 'pathfinder' | 'frugal' | 'recruiter' | 'plunderer' | 'veteran';

export const TRAITS: Record<TraitId, { name: string; text: string }> = {
  endgame: { name: 'Endgame master', text: '+60 ELO in battles where his army has 6 pieces or fewer' },
  gambit: { name: 'Gambit lover', text: '+50 ELO when he attacks' },
  wall: { name: 'Iron wall', text: '+50 ELO when he defends' },
  pathfinder: { name: 'Pathfinder', text: 'moves one cell further every turn' },
  frugal: { name: 'Frugal', text: 'his army eats half as much food' },
  recruiter: { name: 'Recruiter', text: 'pieces cost him 20% less' },
  plunderer: { name: 'Plunderer', text: 'trophy chests give him twice as much' },
  veteran: { name: 'Battle-hardened', text: 'gains twice the ELO from victories' },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const hasTrait = (g: General | undefined, t: TraitId): boolean => !!g?.traits?.includes(t);

/** Дать генералу новую черту (которой у него ещё нет). */
export const giveTrait = (s: GameState, g: General): TraitId | undefined => {
  const free = TRAIT_IDS.filter((t) => !g.traits?.includes(t));
  if (!free.length) return undefined;
  const t = free[int(s.rng, 0, free.length - 1)];
  (g.traits ??= []).push(t);
  return t;
};

/** С третьей звездой генерал раскрывается — вторая черта. */
export const growHero = (s: GameState, g: General): void => {
  if (g.stars === 3 && (g.traits?.length ?? 0) < 2) {
    const t = giveTrait(s, g);
    if (t) say(s, `${g.name} earned a third star and a new trait: ${TRAITS[t].name}`, g.owner);
  }
};

/** Поправка ELO в бою от черт: attacker — генерал атакует. */
export const traitElo = (g: General, attacker: boolean, pieces: number): number =>
  (hasTrait(g, 'endgame') && pieces <= 6 ? 60 : 0) + (attacker && hasTrait(g, 'gambit') ? 50 : 0) + (!attacker && hasTrait(g, 'wall') ? 50 : 0);
