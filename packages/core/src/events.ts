// События раз в 8–12 ходов у каждой страны: карточка с выбором из двух вариантов (или без выбора — беда).
// ИИ выбирает сразу по своему характеру, игроку событие показывается в начале его хода.
//
//   Богатый урожай    — +100 еды или +25 ELO всем генералам (навсегда, но не выше потолка);
//   Мор               — карантин (3 хода без строек в городе) или риск: 50% — здание города теряет уровень;
//   Бунт              — в захваченном городе: подавить (армия рядом стоит 2 хода) или недовольство (3 хода без строек);
//   Странствующий мастер (редко) — бесплатное улучшение здания;
//   Наёмники          — генерал с 4 пешками за 80 золота (только если золота хватает);
//   Караван           — 50 золота или карта неизведанной земли;
//   Землетрясение, пожар — без выбора: здание теряет уровень / сгорает треть дерева.

import { ELO_PER_RESEARCH, MAX_GENERALS } from './config.ts';
import { playerGenerals, playerHalls } from './economy.ts';
import { distance, key, range } from './hex.ts';
import { freeCellNear } from './map.ts';
import { int, next } from './rng.ts';
import { giveTrait } from './heroes.ts';
import { type GameState, addElo, generalName, makeGeneral, say } from './state.ts';

export type EventKind = 'harvest' | 'plague' | 'revolt' | 'master' | 'mercenaries' | 'caravan' | 'earthquake' | 'fire';
export type EventChoice = { id: string; label: string; text: string };
export type PendingEvent = { kind: EventKind; title: string; text: string; hallId?: string; choices: EventChoice[] };

export const MERCENARY_GOLD = 80;
const HALT_TURNS = 3;

const nextIn = (s: GameState) => s.turn + int(s.rng, 8, 12);

const buildingsOf = (s: GameState, hallId: string) => Object.values(s.cells).filter((c) => c.hall === hallId && c.building);

/** Какие события возможны у игрока сейчас и с каким весом. Мастер — реже остальных. */
const candidates = (s: GameState, pid: string): { kind: EventKind; w: number; hallId?: string }[] => {
  const p = s.players[pid];
  const halls = playerHalls(s, pid);
  const out: { kind: EventKind; w: number; hallId?: string }[] = [{ kind: 'harvest', w: 3 }, { kind: 'caravan', w: 3 }];
  const sick = halls.filter((h) => buildingsOf(s, h.id).length);
  if (sick.length) {
    out.push({ kind: 'plague', w: 2, hallId: sick[int(s.rng, 0, sick.length - 1)].id });
    out.push({ kind: 'earthquake', w: 1.5, hallId: sick[int(s.rng, 0, sick.length - 1)].id });
  }
  const upgradable = sick.filter((h) => buildingsOf(s, h.id).some((c) => c.building!.level < 5));
  if (upgradable.length) out.push({ kind: 'master', w: 0.8, hallId: upgradable[int(s.rng, 0, upgradable.length - 1)].id });
  // бунт — только в последнем покорённом городе
  const last = halls.filter((h) => h.takenAt !== undefined).sort((a, b) => b.takenAt! - a.takenAt!)[0];
  if (last) out.push({ kind: 'revolt', w: 3, hallId: last.id });
  if (p.res.gold >= MERCENARY_GOLD && playerGenerals(s, pid).length < MAX_GENERALS && halls.length) out.push({ kind: 'mercenaries', w: 2 });
  if (p.res.wood >= 60) out.push({ kind: 'fire', w: 1.5 });
  return out;
};

const describe = (s: GameState, kind: EventKind, hallId?: string): PendingEvent => {
  const city = hallId ? s.halls[hallId].name : '';
  switch (kind) {
    case 'harvest': return { kind, title: 'A rich harvest', text: 'The fields gave more than ever. Store the grain, or throw a feast for the army?', choices: [
      { id: 'food', label: '+100 food', text: 'fill the granaries' },
      { id: 'feast', label: `Feast: +${ELO_PER_RESEARCH} ELO`, text: 'to every general, for the rest of the game' }] };
    case 'plague': return { kind, hallId, title: `Plague in ${city}`, text: `A sickness spreads through ${city}. Close the gates, or carry on and hope?`, choices: [
      { id: 'quarantine', label: 'Quarantine', text: `${city} builds nothing for ${HALT_TURNS} turns` },
      { id: 'risk', label: 'Take the risk', text: 'half a chance that a building there loses a level' }] };
    case 'revolt': return { kind, hallId, title: `Unrest in ${city}`, text: `The people of ${city} have not accepted your rule.`, choices: [
      { id: 'suppress', label: 'Suppress', text: 'an army in or next to the city stays there for 2 turns' },
      { id: 'discontent', label: 'Let it simmer', text: `${city} builds nothing for ${HALT_TURNS} turns` }] };
    case 'master': return { kind, hallId, title: 'A wandering master', text: `A master builder passes through ${city} and offers his skill for free.`, choices: [
      { id: 'accept', label: 'Welcome him', text: 'a building of the city goes up a level' }] };
    case 'mercenaries': return { kind, title: 'Mercenaries at the gates', text: 'A captain with four pawns offers his sword. He serves as a new general.', choices: [
      { id: 'hire', label: `Hire for ${MERCENARY_GOLD} gold`, text: 'a general with 4 pawns appears at your capital' },
      { id: 'decline', label: 'Send them away', text: 'they will look for another master' }] };
    case 'caravan': return { kind, title: 'A merchant caravan', text: 'Traders offer gold for safe passage, or their maps of lands you have not seen.', choices: [
      { id: 'gold', label: '+50 gold', text: 'payment for the road' },
      { id: 'map', label: 'Their maps', text: 'reveal an unexplored region' }] };
    case 'earthquake': return { kind, hallId, title: `Earthquake near ${city}`, text: 'The ground shook. One of the buildings is damaged.', choices: [{ id: 'ok', label: 'Rebuild later', text: '' }] };
    case 'fire': return { kind, title: 'Fire in the lumber yard', text: 'A third of your wood has burnt.', choices: [{ id: 'ok', label: 'So be it', text: '' }] };
  }
};

/** Начало хода страны: пора ли событию. ИИ решает сразу, игроку — карточка (player.event). */
export const rollEvent = (s: GameState, pid: string): void => {
  const p = s.players[pid];
  if (!p?.alive) return;
  p.nextEvent ??= nextIn(s);
  if (s.turn < p.nextEvent || p.event) return;
  p.nextEvent = nextIn(s);
  const list = candidates(s, pid);
  const total = list.reduce((a, x) => a + x.w, 0);
  let r = next(s.rng) * total;
  const pick = list.find((x) => (r -= x.w) < 0) ?? list[0];
  const ev = describe(s, pick.kind, pick.hallId);
  // беды без выбора случаются сразу и у игрока (карточка — только сообщение)
  if (pick.kind === 'earthquake' || pick.kind === 'fire') { resolveEvent(s, pid, ev, 'ok'); if (!p.ai) p.event = ev; return; }
  if (p.ai) resolveEvent(s, pid, ev, aiChoice(s, pid, ev));
  else p.event = ev;
};

const aiChoice = (s: GameState, pid: string, ev: PendingEvent): string => {
  const aggr = s.players[pid].ai?.aggression;
  switch (ev.kind) {
    case 'harvest': return aggr === 'peaceful' ? 'food' : 'feast';
    case 'plague': return aggr === 'warlike' ? 'risk' : 'quarantine';
    case 'revolt': return canSuppress(s, pid, ev.hallId!) ? 'suppress' : 'discontent';
    case 'mercenaries': return aggr === 'peaceful' ? 'decline' : 'hire';
    case 'caravan': return 'gold';
    default: return ev.choices[0].id;
  }
};

const suppressor = (s: GameState, pid: string, hallId: string) =>
  playerGenerals(s, pid).filter((g) => distance(g.hex, s.halls[hallId].hex) <= 1).sort((a, b) => distance(a.hex, s.halls[hallId].hex) - distance(b.hex, s.halls[hallId].hex))[0];
export const canSuppress = (s: GameState, pid: string, hallId: string): boolean => !!suppressor(s, pid, hallId);

/** Применить выбор. Возвращает строку-итог для уведомления. */
export const resolveEvent = (s: GameState, pid: string, ev: PendingEvent, choice: string): string => {
  const p = s.players[pid];
  const h = ev.hallId ? s.halls[ev.hallId] : undefined;
  if (h && h.owner !== pid) return 'the city is no longer yours';
  const damage = (hallId: string): string => {
    const b = buildingsOf(s, hallId);
    if (!b.length) return 'nothing was damaged';
    const c = b[int(s.rng, 0, b.length - 1)];
    const kind = c.building!.kind;
    if (c.building!.level > 1) c.building!.level--; else c.building = undefined;
    return `a ${kind} was damaged`;
  };
  let res = '';
  switch (ev.kind) {
    case 'harvest':
      if (choice === 'food') { p.res.food += 100; res = '+100 food'; }
      else { for (const g of playerGenerals(s, pid)) addElo(s, g, ELO_PER_RESEARCH); res = `the feast: +${ELO_PER_RESEARCH} ELO to every general`; }
      break;
    case 'plague':
      if (choice === 'quarantine') { h!.haltUntil = s.turn + HALT_TURNS; h!.haltWhy = 'quarantine'; res = `${h!.name} is in quarantine`; }
      else res = next(s.rng) < 0.5 ? `the plague passed: ${damage(h!.id)}` : 'the plague passed without harm';
      break;
    case 'revolt':
      if (choice === 'suppress' && canSuppress(s, pid, h!.id)) {
        const g = suppressor(s, pid, h!.id)!;
        g.pinnedUntil = s.turn + 2; g.moveLeft = 0;
        h!.takenAt = undefined; // бунт подавлен — больше не вспыхнет
        res = `${g.name} keeps order in ${h!.name} for 2 turns`;
      } else { h!.haltUntil = s.turn + HALT_TURNS; h!.haltWhy = 'unrest'; res = `${h!.name} is restless: no construction for ${HALT_TURNS} turns`; }
      break;
    case 'master': {
      const b = buildingsOf(s, h!.id).filter((c) => c.building!.level < 5);
      if (b.length) { const c = b[int(s.rng, 0, b.length - 1)]; c.building!.level++; res = `a ${c.building!.kind} rose to level ${c.building!.level}`; }
      break;
    }
    case 'mercenaries': {
      const cap = playerHalls(s, pid).sort((a, b) => a.order - b.order)[0];
      const spot = cap && freeCellNear(s, cap.hex, pid);
      if (choice === 'hire' && p.res.gold >= MERCENARY_GOLD && spot && playerGenerals(s, pid).length < MAX_GENERALS) {
        p.res.gold -= MERCENARY_GOLD;
        const g = makeGeneral(s, pid, spot, s.settings.elo, { p: 4, n: 0, b: 0, r: 0, q: 0 }, generalName(s, pid));
        g.trained = 0; g.moveLeft = 0;
        giveTrait(s, g);
        res = `${g.name} and his mercenaries joined you`;
      } else res = 'the mercenaries left';
      break;
    }
    case 'caravan':
      if (choice === 'gold') { p.res.gold += 50; res = '+50 gold'; }
      else res = revealRegion(s, pid) ? 'the caravan maps show a new region' : 'the maps showed nothing new';
      break;
    case 'earthquake': res = damage(h!.id); break;
    case 'fire': { const lost = Math.floor(p.res.wood / 3); p.res.wood -= lost; res = `${lost} wood burnt`; break; }
  }
  say(s, `${ev.title}: ${res}`, pid);
  return res;
};

/** Карта каравана: неизведанная суша радиусом 4 вокруг случайной неизвестной клетки — в память игрока. */
const revealRegion = (s: GameState, pid: string): boolean => {
  const mem = ((s.memory ??= {})[pid] ??= {});
  // центр участка — неизведанная суша, вокруг которой суши не меньше половины
  const landShare = (h: { q: number; r: number }) => { const area = range(h, 4).map((x) => s.cells[key(x)]); return area.filter((c) => c && c.terrain !== 'water').length / area.length; };
  const unknown = Object.values(s.cells).filter((c) => c.terrain !== 'water' && !mem[key(c.hex)] && landShare(c.hex) >= 0.5);
  if (!unknown.length) return false;
  const center = unknown[int(s.rng, 0, unknown.length - 1)].hex;
  for (const h of range(center, 4)) {
    const c = s.cells[key(h)];
    if (!c) continue;
    const hall = Object.values(s.halls).find((x) => key(x.hex) === key(h));
    mem[key(h)] = { turn: s.turn, owner: c.owner, building: c.building ? { ...c.building } : undefined, hall: hall ? { name: hall.name, owner: hall.owner, level: hall.level } : undefined };
  }
  return true;
};

/** Игрок выбрал вариант в карточке события. */
export const answerEvent = (s: GameState, pid: string, choice: string): string => {
  const p = s.players[pid];
  const ev = p.event;
  if (!ev) return '';
  p.event = undefined;
  if (ev.kind === 'earthquake' || ev.kind === 'fire') return ''; // уже случилось
  return resolveEvent(s, pid, ev, choice);
};
