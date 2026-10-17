// Экран партии: карта, верхняя панель (казна, ход), нижняя панель действий, бои, ход ИИ.

import { audioPrefs, chestOpen, page, setMusic, setSfx } from '../audio.ts';
import { iconSvg, iconsReady } from './icons.ts';
import { flagSvg } from './flags.ts';
import { portraitSvg } from './portraits.ts';
import { pieceHtml } from './pieces.ts';
import { tr } from '../i18n.ts';
import { startTutorial } from './tutorial.ts';
import {
  canAfford, armyValue, WALLS, MARKET, TOWER, TOWER_TERRAIN, ROAD_WOOD_PER_CELL, ROAD_MAX, marketLevel, tradeQuote, trade, buildWalls, upgradeMarket, buildTower, roadPath, roadCost, buildRoad, cancelJob, WONDERS, WONDER, WONDER_IDS, wonderStatus, wonderBlocked, startWonder, type WonderId, seaRouteTargets, buildSeaRoute, seaRouteGold, coastal, routesOf, activeSeaRoutes, SEA_ROUTE, tradeRate, isCapital, demolish, demolishRefund, canPillage, pillage, pillageLoot, isOutlaw, setAuto, autoDevelop, type AutoFocus,   BARRACKS, BUILD_TURNS, BUILDING_TERRAIN, GENERAL_HIRE_GOLD, HIRE_LEVEL, NATIONS, PIECE_PRICE, RESEARCH, RESOURCE_COST,
  RESOURCE_OUTPUT, TAVERN, TOWN_HALL_FOUND, TOWN_HALL_UPGRADE, BUILDER_HIRE_FOOD, BUILDER_UPKEEP_FOOD, GENERAL_UPKEEP_FOOD, cityUpgradeCost, tavernCost, PIECES, barracksCost, buildOptions, buildingOutput, maxLevelAt, piecePrice, researchCost, researchTurns, resourceCost, aiEconomyTurn, aiMilitaryTurn, attack, endTurn, say,
  foundTownHall, freeBuilders, hireBuilder, hireGeneral, hirePiece, income, key, maxBuilders, move, playerGenerals,
  reachable, recruitElo, resolveBattle, startResearch, upgrade, upgradeBarracks, upgradeTavern, upgradeTownHall,
  remember, upkeep, visible, winner, TRAITS, type TraitId, acceptChance, proposeDeal, emptyTerms, tradableCities, tradableTechs, termsText, type Deal, vassalsOf, makeVassal, setStance, nationMight, vassalMight, VASSAL_SHARE, type VassalStance, relation, warBlocked, declareWar, acceptsAlliance, makeAlliance, acceptsPeace, makePeace, breakAlliance, answerOffer, aggression, TRUCE_TURNS, BREAK_COOLDOWN, answerEvent, canSuppress, MERCENARY_GOLD, type EventKind, TECHS, chestText, type ChestReward, trainGeneral, trainingFor, hasTech, build, enqueue, cancelQueued, ELO_PER_RESEARCH, ARMY_MAX, startTech, type TechId, playerHalls, hasMet, jobHall, hallBuilders, banditsTurn, recordHistory, hireSettler, settlerCost, findPath, runOrders, PATROL_RADIUS, distance, armyMove, startMarch, MARCH_RESEARCH, ARMY_MOVE_MARCH, BUILDING_SLOTS, citySlots, generalLimit, nationStats, type QueueOrder, type Job, type GameState, type Hex, type Piece, type Res, type ResourceBuilding,
} from '../../../core/src/index.ts';
import { autobattle, type BattleRecord } from './battle.ts';
import { playManual, showReplay } from './fight.ts';
import { MapView, attackTargets, ownerColor, type Highlight } from './render.ts';
import { clearSave, saveGame } from './save.ts';
import { showSummary } from './summary.ts';
import { techNodes, techTreeHtml } from './techtree.ts';
import { setBack, tap } from '../tg.ts';
import { checkAchievements, finishCampaign, level, type BattleNote } from '../dynasty.ts';
import { chapterOf, completeChapter, note, progress, verdict } from '../campaign.ts';
import { announce } from '../dynastyScreen.ts';

const ME = 'p1';
const PIECE_NAME: Record<Piece, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' };
/** Рисунки событий (простые медальоны 64×64). */
const EVENT_ART: Record<EventKind, string> = (() => {
  const m = (bg: string, inner: string) => `<svg viewBox="0 0 64 64" width="84" height="84" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${bg}" stroke="rgba(0,0,0,.25)" stroke-width="2"/>${inner}</svg>`;
  return {
    harvest: m('#f3e0a2', '<path d="M32 50V18" stroke="#8a6a1a" stroke-width="3"/>' + [22, 28, 34, 40].map((y, i) => `<ellipse cx="${i % 2 ? 38 : 26}" cy="${y}" rx="6" ry="3.5" fill="#e0a92e" transform="rotate(${i % 2 ? -35 : 35} ${i % 2 ? 38 : 26} ${y})"/>`).join('') + '<ellipse cx="32" cy="16" rx="3.5" ry="6" fill="#e0a92e"/>'),
    plague: m('#cfd8c4', '<path d="M20 44c0-14 24-14 24 0" fill="#3d4a3a"/><circle cx="32" cy="26" r="10" fill="#3d4a3a"/><path d="M30 28l-14 8 14-2z" fill="#e8e2c8"/><circle cx="35" cy="24" r="2" fill="#e8e2c8"/>'),
    revolt: m('#f2c0a8', '<path d="M30 52V30h4v22z" fill="#6b4320"/><path d="M32 30c-8-6-2-14 0-20 2 6 8 14 0 20z" fill="#e8622a"/><path d="M32 28c-3-3-1-7 0-10 1 3 3 7 0 10z" fill="#f7d04a"/>'),
    master: m('#d9cfc0', '<path d="M20 44l16-16" stroke="#7a4a22" stroke-width="5" stroke-linecap="round"/><path d="M30 22l12-6 6 6-6 12z" fill="#9ba5af" stroke="#454d55" stroke-width="1.5"/>'),
    mercenaries: m('#c9d4e3', '<path d="M18 46L44 20M46 46L20 20" stroke="#e8edf2" stroke-width="4" stroke-linecap="round"/><path d="M16 42l6 6M48 42l-6 6" stroke="#d1a24a" stroke-width="4" stroke-linecap="round"/>'),
    caravan: m('#ead7b0', '<path d="M14 40h30l4-10H18z" fill="#b9824f" stroke="#5a3719" stroke-width="1.5"/><circle cx="22" cy="44" r="4" fill="#5a3719"/><circle cx="40" cy="44" r="4" fill="#5a3719"/><path d="M48 30c4 0 6 4 4 10h-6" fill="#c98b4a" stroke="#5a3719" stroke-width="1.5"/>'),
    earthquake: m('#d6c9b4', '<path d="M10 36h44" stroke="#7a6a52" stroke-width="3"/><path d="M30 14l-4 10 6 4-6 8 5 6-3 8" fill="none" stroke="#3a2e22" stroke-width="3" stroke-linejoin="round"/>'),
    fire: m('#f5c9a0', '<path d="M32 52c-12 0-16-10-10-20 2 4 4 6 6 6-2-8 2-16 8-20 0 8 10 12 10 24 0 6-6 10-14 10z" fill="#e8622a"/><path d="M32 52c-5 0-8-4-5-10 2 2 4 2 5 1 0-4 2-6 4-8 1 5 4 7 4 11 0 4-4 6-8 6z" fill="#f7d04a"/>'),
  };
})();

/** Сундук: деревянный, окован золотом; крышка — отдельная группа, её поворачивает анимация. */
const CHEST_SVG = `<svg viewBox="0 0 120 100" width="150" height="125" aria-hidden="true">
  <ellipse cx="60" cy="92" rx="44" ry="6" fill="rgba(0,0,0,.25)"/>
  <rect x="18" y="46" width="84" height="44" rx="6" fill="#8b5a2b" stroke="#4a2c12" stroke-width="3"/>
  <path d="M18 60h84M18 76h84" stroke="#6b4320" stroke-width="2"/>
  <rect x="30" y="46" width="8" height="44" fill="#e3b341" stroke="#9a7412" stroke-width="1.5"/><rect x="82" y="46" width="8" height="44" fill="#e3b341" stroke="#9a7412" stroke-width="1.5"/>
  <rect x="52" y="50" width="16" height="18" rx="3" fill="#f2cf5b" stroke="#9a7412" stroke-width="2"/><circle cx="60" cy="58" r="3" fill="#4a2c12"/>
  <g class="lid"><path d="M18 46c0-22 84-22 84 0z" fill="#9b6233" stroke="#4a2c12" stroke-width="3"/>
    <path d="M30 46c0-16 8-20 8-20M82 26s8 4 8 20" stroke="#e3b341" stroke-width="7"/><path d="M30 46c0-16 8-20 8-20M82 26s8 4 8 20" stroke="#9a7412" stroke-width="1.5" fill="none"/></g>
</svg>`;
/** Черты героя — бейджи с пояснением. */
const traitChips = (g: { traits?: TraitId[] }) => g.traits?.length
  ? `<div class="traits">${g.traits.map((t) => `<span class="trait" title="${TRAITS[t].text}"><b>${TRAITS[t].name}</b> — ${TRAITS[t].text}</span>`).join('')}</div>` : '';
const BUILDING_NAME: Record<ResourceBuilding, string> = { farm: 'Farm', sawmill: 'Sawmill', mine: 'Gold mine', fishery: 'Fishery' };
const TERRAIN_NAME: Record<string, string> = {
  field: 'Field', forest: 'Forest', deposit: 'Gold deposit', tundra: 'Tundra', desert: 'Desert', mountain: 'Mountains', water: 'Sea',
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const amount = (name: 'wood' | 'food' | 'gold', n: number) => `<i class="amt" title="${name}">${iconSvg(name, 13)}${n}</i>`;
const RES_OF = { farm: 'food', sawmill: 'wood', mine: 'gold', fishery: 'food' } as const;
const cost = (c: Res) => [c.wood && amount('wood', c.wood), c.food && amount('food', c.food), c.gold && amount('gold', c.gold)].filter(Boolean).join(' ') || 'free';
/** Герб города: золотой щит с уровнем. */
const crest = (level: number) => `<span class="ccrest"><b>${level}</b></span>`;
/** Полоска мест под здания: занятые — золотые. */
const pips = (used: number, max: number) => `<span class="pips" title="${used}/${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('')}</span>`;
const CASTLE = '<svg class="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V9h3v3h2.5V9h5V12H17V9h3v12h-6v-4.5a2 2 0 0 0-4 0V21Z" fill="#8a6d3b" stroke="#4a3a1f" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/** Число для панели ресурсов: 1.4k, 3m — чтобы большие запасы влезали в строку. */
const fmt = (n: number): string => {
  const a = Math.abs(n);
  const short = (v: number, unit: string) => `${n < 0 ? '-' : ''}${(Math.floor(v * 10) / 10).toString()}${unit}`;
  if (a >= 1e6) return short(a / 1e6, 'm');
  if (a >= 1000) return short(a / 1000, 'k');
  return (Math.round(n * 10) / 10).toString();
};

export const ownerName = (s: GameState, owner?: string): string => {
  if (!owner) return 'Unclaimed';
  if (owner === 'bandits') return 'Bandits';
  if (s.neutrals[owner] || /^n\d+$/.test(owner)) return 'Neutral state'; // в т.ч. уже захваченный нейтрал из памяти
  const p = s.players[owner];
  return p ? (owner === ME ? `You (${NATIONS[p.nation].name})` : NATIONS[p.nation].name) : owner;
};

export const openGame = (app: HTMLElement, s: GameState, onExit: () => void): void => {
  document.body.classList.add('game');
  app.className = 'game-root';
  app.innerHTML = `
    <header class="bar">
      <button id="me" class="mebtn" aria-label="Your nation">${flagSvg(s.players[ME].nation, 30)}</button>
      <div class="res" id="res"></div>
      <button id="end" class="end">End turn</button>
    </header>
    <div class="mapwrap"><canvas id="map"></canvas><button id="tactics" class="tacbtn"></button>
      <div class="soon" id="soon" hidden></div><button class="goalpill" id="goalpill" hidden></button><button id="vassalsbtn" class="tacbtn vasbtn" hidden></button><div class="rmenu"><button id="gensbtn" class="tacbtn"></button><button id="citiesbtn" class="tacbtn"></button></div></div>
    <section class="sheet" id="sheet"></section>
    <div class="toast" id="toast" hidden></div><div class="aibanner" id="aibanner" hidden></div>
    <div class="veil" id="veil" hidden><div class="veilcard"><p class="veilturn" id="veilturn"></p><div class="veilflags" id="veilflags"></div><p id="veilmsg"></p><div class="veilbar"><i></i></div></div></div>
    <div class="modal" id="modal" hidden><div class="dialog" id="dialog"></div></div>`;
  const canvas = app.querySelector<HTMLCanvasElement>('#map')!;
  const view = new MapView(canvas);
  // выбранная клетка; gid — выбранный свой генерал; target — эта клетка цель для него (идти или нападать)
  let sel: { hex?: Hex; gid?: string; target?: 'move' | 'attack' | 'goto' } = {};
  let warnedTurn = 0; // на этом ходу уже напомнили про армию, которая не ходила
  let busy = false;

  const exit = () => { document.body.classList.remove('game'); app.className = 'stack'; setBack(null); onExit(); };
  setBack(exit);

  /** Сообщение сверху. Пока оно на экране, кнопки карты (технологии, генералы, города) уезжают под него. */
  const toast = (text: string) => {
    const t = app.querySelector<HTMLElement>('#toast')!;
    const wrap = app.querySelector<HTMLElement>('.mapwrap')!;
    t.textContent = text; t.hidden = false;
    t.onclick = () => { t.hidden = true; wrap.style.setProperty('--toast', '0px'); };
    const below = Math.max(0, t.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 4);
    wrap.style.setProperty('--toast', `${below}px`);
    clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => { t.hidden = true; wrap.style.setProperty('--toast', '0px'); }, Math.min(9000, 2600 + text.length * 35));
  };
  /** Строка состояния на заставке хода соперников (null — ничего). */
  const banner = (text: string | null) => {
    const m = app.querySelector<HTMLElement>('#veilmsg');
    if (m) m.textContent = text ?? '';
  };
  /** Заставка «соперники ходят»: флаги всех держав по очереди, текущая подсвечена. */
  const veil = (on: boolean, active?: string) => {
    const v = app.querySelector<HTMLElement>('#veil')!;
    v.hidden = !on;
    if (!on) return;
    app.querySelector('#veilturn')!.textContent = 'Other rulers are making their moves';
    const who = [...s.order.filter((id) => s.players[id].alive), 'bandits'];
    // о незнакомых державах игрок ничего не знает: вместо флага — знак вопроса
    app.querySelector('#veilflags')!.innerHTML = who.map((id) => `<span class="${id === active ? 'on' : ''} ${who.indexOf(id) < who.indexOf(active ?? '') ? 'done' : ''}">${id === 'bandits'
      ? '<b class="bandflag">☠</b>' : hasMet(s, ME, id) ? flagSvg(s.players[id].nation, 34) : '<b class="bandflag unknown">?</b>'}</span>`).join('');
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const act = (r: { ok: boolean; reason?: string }) => {
    if (!r.ok) toast((r as { reason: string }).reason);
    else { tap(); saveGame(s); }
    refresh();
  };

  /** «через 2 хода» вместо номера хода — номер хода игроку не показываем. */
  const left = (finish: number) => { const n = Math.max(1, finish - s.turn); return `${n} turn${n > 1 ? 's' : ''} left`; };
  const ago = (turn: number) => { const n = s.turn - turn; return n <= 0 ? 'this turn' : `${n} turn${n > 1 ? 's' : ''} ago`; };
  const jobName = (j: Job) => j.kind === 'resource' ? `${BUILDING_NAME[j.building]}${j.level > 1 ? ` → ${j.level}` : ''}`
    : j.kind === 'found' ? 'New city' : j.kind === 'tower' ? 'Watchtower' : j.kind === 'townhall' ? `${s.halls[j.hallId]?.name ?? 'City'} → ${j.level}`
      : j.kind === 'road' ? `Road to ${s.halls[j.to]?.name ?? 'a city'}` : j.kind === 'walls' ? 'Walls'
        : j.kind === 'wonder' ? WONDERS[j.wonder as WonderId].name : j.kind === 'searoute' ? `Sea route to ${s.halls[j.to]?.name ?? 'a city'}`
        : `${s.halls[j.hallId]?.name ?? 'City'}: ${j.kind} → ${j.level}`;

  // ---------- верхняя панель ----------
  const bar = () => {
    const p = s.players[ME];
    const inc = income(s, ME);
    const homeless = p.outlaw && !playerHalls(s, ME).length; // шайка без города кормится грабежом
    const food = inc.food - (homeless ? 0 : upkeep(s, ME));
    app.querySelector('#res')!.innerHTML = `
      <span title="Wood">${iconSvg('wood')}${fmt(p.res.wood)}<small>+${inc.wood}</small></span>
      <span title="Food">${iconSvg('food')}${fmt(p.res.food)}<small class="${food < 0 ? 'neg' : ''}">${food >= 0 ? '+' : ''}${fmt(food)}</small></span>
      <span title="Gold">${iconSvg('gold')}${fmt(p.res.gold)}<small>+${fmt(inc.gold)}</small></span>`;
    const myGens = Object.values(s.generals).filter((g) => g.owner === ME);
    const ready = myGens.filter((g) => g.moveLeft > 0 && !g.attacked && !g.order).length;
    app.querySelector('#gensbtn')!.innerHTML = `<span class="kingico">♚</span><b>Generals ${playerGenerals(s, ME).length}</b>${ready ? `<small class="badge">${ready}</small>` : ''}`;
    app.querySelector('#citiesbtn')!.innerHTML = `${CASTLE}<b>Cities ${playerHalls(s, ME).length}</b>`;
    const r = p.research;
    app.querySelector('#tactics')!.innerHTML = `${iconSvg(r.active || r.tech ? 'clock' : 'tactics', 18)}<b>Technology tree</b>${r.active ? `<small>${left(r.active.finish)}</small>` : r.tech ? `<small>${left(r.tech.finish)}</small>` : ''}`;
    soon();
    const vs = vassalsOf(s, ME);
    const vb = app.querySelector<HTMLElement>('#vassalsbtn')!;
    vb.hidden = !vs.length;
    if (vs.length) vb.innerHTML = `${CASTLE}<b>Vassals ${vs.length}</b>`;
  };

  // ---------- Вассалы ----------
  const STANCES: [VassalStance, string, string][] = [['expand', 'Expand', 'conquer and settle'], ['defend', 'Defend', 'guard its land'], ['economy', 'Economy', 'no armies, all into the economy']];
  const vassalsMenu = async () => {
    for (;;) {
      const vs = vassalsOf(s, ME);
      if (!vs.length) { modal(null); return; }
      const mine = nationMight(s, ME), theirs = vassalMight(s, ME);
      modal(`<h2>Vassals</h2><p class="muted">Each vassal runs its own economy and gives you ${Math.round(VASSAL_SHARE * 100)}% of its income. Choose its course. If your vassals together grow stronger than you (now ${Math.round(theirs)} against your ${Math.round(mine)}), the strongest rises against you.</p>
        ${vs.map((id) => { const v = s.players[id]; const st = nationStats(s, id); const inc = income(s, id);
          return `<div class="card vassal"><div class="row">${flagSvg(v.nation, 26)}<b>${esc(NATIONS[v.nation].name)}</b><span class="muted">${st.cities} cit${st.cities === 1 ? 'y' : 'ies'} · army ${st.military}</span></div>
            <p class="muted withico">Pays you ${amount('wood', Math.floor(Math.max(0, inc.wood) * VASSAL_SHARE))} ${amount('food', Math.floor(Math.max(0, inc.food) * VASSAL_SHARE))} ${amount('gold', Math.floor(Math.max(0, inc.gold) * VASSAL_SHARE))} per turn</p>
            <div class="seg wide">${STANCES.map(([k, l, d]) => `<button data-a="stance:${id}:${k}" class="${v.stance === k ? 'on' : ''}" title="${d}">${l}</button>`).join('')}</div></div>`; }).join('')}
        <div class="acts">${btn('close', 'Close', '')}</div>`);
      const c = await ask();
      if (!c.startsWith('stance:')) { modal(null); return; }
      const [, vid, st] = c.split(':');
      setStance(s, ME, vid, st as VassalStance);
      saveGame(s);
    }
  };
  app.querySelector('#vassalsbtn')!.addEventListener('click', () => { if (!busy) void vassalsMenu(); });

  /** Только что взятый город: присоединить или сделать вассалом. */
  const annexPrompt = async () => {
    for (const h of Object.values(s.halls)) {
      if (h.owner !== ME || h.takenAt !== s.turn || h.decided) continue;
      h.decided = true;
      if (playerHalls(s, ME).length <= 1) continue; // единственный город вассалом не отдают
      glideTo(h.hex);
      modal(`<h2>${esc(h.name)} is yours</h2><p>Annex the city, or leave it its own ruler as a vassal state? A vassal builds and grows by itself, gives you ${Math.round(VASSAL_SHARE * 100)}% of its income and fights your enemies — but strong vassals may rebel.</p>
        <div class="acts">${btn('annex', 'Annex', 'the city and its land are yours')}${STANCES.map(([k, l, d]) => btn(`vassal:${k}`, `Vassal · ${l}`, d)).join('')}</div>`);
      const c = await ask();
      modal(null);
      if (c.startsWith('vassal:')) { const vid = makeVassal(s, ME, h.id, c.slice(7) as VassalStance); if (vid) toast(`${h.name} is now ${NATIONS[s.players[vid].nation].name}, your vassal.`); }
      else toast(`${h.name} is annexed: the city and its land are yours.`);
      saveGame(s);
      refresh();
    }
  };

  /** «Ещё один ход»: лента над картой — что закончится в ближайшие 1–2 хода. Незавершённое тянет сделать ещё ход. */
  const soon = () => {
    const el = app.querySelector<HTMLElement>('#soon');
    if (!el) return;
    const p = s.players[ME];
    const items: { n: number; text: string }[] = [];
    for (const j of p.jobs) items.push({ n: j.finish - s.turn, text: jobName(j) });
    if (p.research.active) items.push({ n: p.research.active.finish - s.turn, text: `Tactics ${['I', 'II', 'III', 'IV', 'V'][p.research.active.step]}` });
    if (p.research.tech) items.push({ n: p.research.tech.finish - s.turn, text: TECHS[p.research.tech.id as TechId].name });
    for (const h of Object.values(s.halls)) if (h.siege && s.generals[h.siege.by]?.owner === ME) items.push({ n: 1, text: `${h.name} falls` });
    for (const g of playerGenerals(s, ME)) {
      if (g.order?.kind !== 'goto') continue;
      const path = findPath(s, g.id, g.order.to);
      if (path) items.push({ n: Math.max(1, Math.ceil((path.length - 1) / armyMove(s, ME))), text: `${g.name} arrives` });
    }
    const by = (n: number) => items.filter((x) => Math.max(1, x.n) === n).map((x) => esc(x.text));
    const one = by(1), two = by(2);
    el.hidden = !one.length && !two.length;
    el.innerHTML = `${iconSvg('clock', 14)}${one.length ? `<b>Next turn:</b> ${one.join(', ')}` : ''}${one.length && two.length ? ' · ' : ''}${two.length ? `<b>In 2 turns:</b> ${two.join(', ')}` : ''}`;
  };

  // ---------- карта ----------
  const highlight = () => {
    const reach = new Set<string>(), atk = sel.gid ? attackTargets(s, sel.gid) : new Set<string>();
    if (sel.gid) for (const [k, d] of reachable(s, sel.gid)) if (d > 0) reach.add(k);
    // путь похода: к выбранной цели или по уже отданному приказу
    const g = sel.gid ? s.generals[sel.gid] : undefined;
    const to = sel.target === 'goto' ? sel.hex : g?.order?.kind === 'goto' ? g.order.to : undefined;
    const path = g && to ? findPath(s, g.id, to) ?? undefined : undefined;
    return { selected: sel.hex, unit: sel.gid && s.generals[sel.gid]?.owner === ME ? sel.gid : undefined, reach, attack: atk, path };
  };
  let seenCache = new Set<string>();
  let hlCache: Highlight = {};
  const draw = () => {
    const seen = visible(s, ME);
    seenCache = seen;
    remember(s, ME, seen); // память карты под туманом войны
    hlCache = highlight();
    view.draw(s, ME, seen, hlCache);
  };
  // живая карта: волны, дым, пила, покачивание армий — ~30 кадров в секунду, пока игра на экране
  let lastAnim = 0;
  const animate = (t: number) => {
    if (!app.isConnected || !document.body.classList.contains('game')) return;
    requestAnimationFrame(animate);
    if (document.hidden || t - lastAnim < (view.busy ? 16 : 33)) return;
    if (!app.querySelector<HTMLElement>('#modal')!.hidden && !view.busy) return;
    lastAnim = t;
    view.draw(s, ME, seenCache, hlCache);
  };
  requestAnimationFrame(animate);
  /** Перерисовка при движении камеры: не чаще кадра и без пересчёта тумана. */
  let frame = 0;
  const drawView = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; view.draw(s, ME, seenCache, hlCache); });
  };
  /** Плавно перевести камеру к клетке. */
  let glide = 0;
  const glideTo = (h: Hex) => {
    cancelAnimationFrame(glide);
    const x0 = view.ox, y0 = view.oy;
    view.centerOn(h);
    const x1 = view.ox, y1 = view.oy;
    view.ox = x0; view.oy = y0;
    const t0 = performance.now();
    const step = () => {
      // одни часы на всё (performance.now): метка кадра rAF после сна телефона может «уехать»
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / 320)), e = 1 - (1 - k) ** 3;
      view.ox = x0 + (x1 - x0) * e; view.oy = y0 + (y1 - y0) * e;
      view.draw(s, ME, seenCache, hlCache);
      if (k < 1) glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  };
  iconsReady.then(() => draw());

  // ---------- нижняя панель ----------
  const btn = (id: string, label: string, sub: string, enabled = true) =>
    `<button class="act" data-a="${id}" ${enabled ? '' : 'disabled'}><b>${label}</b><span>${sub}</span></button>`;
  /** «Конфетная» плитка действия: значок в золотом кружке, название, цена; бледная, если не хватает ресурсов. */
  const ctile = (id: string, ico: string, label: string, c: Res | null, sub: string, cls = '') => {
    const poor = c && !canAfford(s.players[ME].res, c);
    return `<button class="ctile ${poor ? 'poor' : ''} ${cls}" data-a="${id}"><span class="cico">${ico}</span><span class="ctext"><b>${label}</b><small>${c ? `<span class="ccost">${cost(c)}</span>` : ''}${sub}</small></span></button>`;
  };
  /** Армия жетонами: король и фигуры с числом. */
  const armyTokens = (a: GameState['generals'][string]['army'], white = true) => `<div class="armyrow"><span class="atok king">${pieceHtml(white, 'k')}</span>${PIECES.filter((x) => a[x])
    .map((x) => `<span class="atok">${pieceHtml(white, x)}${a[x] > 1 ? `<i>×${a[x]}</i>` : ''}</span>`).join('')}${PIECES.some((x) => a[x]) ? '' : '<span class="muted">no pieces</span>'}</div>`;
  /** Шапка карточки юнита: портрет или значок, имя, ELO и звёзды, справа — ходы. */
  const unitHead = (pic: string, name: string, color: string, meta: string, right = '') =>
    `<div class="genhead"><span class="genport" style="--c:${color}">${pic}</span><div class="genname"><b>${name}</b><span class="genmeta">${meta}</span></div>${right}</div>`;
  const movePips = (g: GameState['generals'][string]) => {
    const max = Math.max(g.moveLeft, armyMove(s, g.owner));
    return `<div class="genmoves"><span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < g.moveLeft ? 'on' : ''}"></i>`).join('')}</span><small>${g.attacked ? 'acted' : `${g.moveLeft} move${g.moveLeft === 1 ? '' : 's'}`}</small></div>`;
  };

  /** Компактная команда генерала: значок и короткая подпись, пояснение — во всплывающей подсказке. */
  const cmd = (id: string, ico: string, label: string, hint: string, cls = '') =>
    `<button class="gcmd ${cls}" data-a="${id}" title="${esc(hint)}"><span class="gci">${ico}</span><b>${label}</b></button>`;
  const traitMini = (g: { traits?: TraitId[] }) => (g.traits ?? []).map((t) => `<span class="tmini" title="${esc(TRAITS[t].text)}">${esc(TRAITS[t].name)}</span>`).join('');

  /** Карточка поселенца: где он, основание города, приказы. */
  const settlerCard = (g: typeof s.generals[string], cell: typeof s.cells[string]): string => {
    const mine = g.owner === ME;
    const color = ownerColor(s, g.owner) ?? '#888';
    if (!mine) return `<div class="gencard foe">${unitHead('<span class="genglyph">⛺</span>', 'Settler', color, `${esc(ownerName(s, g.owner))}`, s.players[g.owner] ? nationBtn(g.owner) : '')}<p class="muted">Unarmed: any army next to him can kill him.</p></div>`;
    const p = s.players[ME];
    const founding = p.jobs.find((j) => j.kind === 'found' && j.general === g.id);
    const m = NATIONS[p.nation].mods;
    const turns = m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns;
    const o = g.order;
    const canFound = !cell.owner && cell.terrain !== 'water' && cell.terrain !== 'mountain';
    const status = founding ? `<span class="chip gold">🏰 founding · ${left(founding.finish)}</span>` : o ? `<span class="chip gold">${o.kind === 'goto' ? '➜ marching' : '⛨ holding'}</span>` : '';
    return `<div class="gencard compact">${unitHead('<span class="genglyph">⛺</span>', 'Your settler', color, `${status || '<span>founds a new city</span>'}`, founding ? '' : movePips(g))}
      ${founding ? '' : `<div class="gcmds">${canFound ? cmd(`found:${g.id}`, '🏰', 'Found city', `${turns} turn${turns > 1 ? 's' : ''} · the settler becomes the city`, 'top') : ''}
        ${o?.kind === 'goto' ? cmd(`order:${g.id}:none`, '✋', 'Stop', 'he waits for orders') : ''}
        ${cmd(`order:${g.id}:${o?.kind === 'hold' ? 'none' : 'hold'}`, '⛨', o?.kind === 'hold' ? 'Release' : 'Hold', o?.kind === 'hold' ? 'remind me about him again' : 'stays put; no end-of-turn reminder')}</div>`}
      ${sel.gid !== g.id ? '<p class="muted gtip">Tap the cell again to command him.</p>' : !founding && !canFound ? '<p class="muted gtip">Tap free land far away to send him there.</p>' : ''}</div>`;
  };

  const sheet = () => {
    const el = app.querySelector<HTMLElement>('#sheet')!;
    if (!sel.hex) {
      el.innerHTML = `<p class="muted">Tap a cell. Your general (white ring) moves 2 cells per turn and attacks a neighbouring enemy.</p>`;
      return;
    }
    const k = key(sel.hex);
    const cell = s.cells[k];
    const seen = visible(s, ME).has(k);
    const p = s.players[ME];
    const parts: string[] = [];
    const memo = seen ? undefined : s.memory?.[ME]?.[k];
    const head = seen ? esc(ownerName(s, cell.owner)) : memo ? `${esc(ownerName(s, memo.owner))} · seen ${ago(memo.turn)}` : 'Unexplored';
    parts.push(`<div class="cellhead"><b>${TERRAIN_NAME[cell.terrain]}</b><span class="muted">${head}</span></div>`);
    /** Большая кнопка действия над клеткой: «Идти сюда», «Поход», «Атаковать». */
    const bigAct = (id: string, ico: string, label: string, sub: string, cls = '') =>
      `<button class="bigact ${cls}" data-a="${id}"><span class="bico">${ico}</span><span class="btext"><b>${label}</b><small>${sub}</small></span><span class="bgo">›</span></button>`;
    if (sel.gid && sel.target === 'move') {
      const d = reachable(s, sel.gid).get(k) ?? 0;
      parts.push(bigAct('move', '➜', 'Move general here', `${d} of ${s.generals[sel.gid].moveLeft} moves`));
    } else if (sel.gid && sel.target === 'goto') {
      const path = findPath(s, sel.gid, sel.hex);
      const mv = armyMove(s, ME);
      parts.push(path && path.length > 1
        ? bigAct('goto', '⚑', 'March here', `${path.length - 1} cells · ~${Math.ceil((path.length - 1) / mv)} turn${Math.ceil((path.length - 1) / mv) > 1 ? 's' : ''} · the general walks on his own`)
        : '<p class="muted">Your general cannot find a way there.</p>');
    } else if (sel.gid && sel.target === 'attack') {
      const army = Object.values(s.generals).some((g) => key(g.hex) === k && g.owner !== ME && g.army.p + g.army.n + g.army.b + g.army.r + g.army.q > 0);
      const settlerHere = !army && Object.values(s.generals).some((g) => key(g.hex) === k && g.owner !== ME && g.settler);
      if (settlerHere) parts.push(bigAct('attack', '⚔', 'Kill the settler', 'he is unarmed — no battle', 'war'));
      else parts.push(bigAct('attack', army ? '⚔' : '🏰', army ? 'Attack this army' : `Siege of ${esc(Object.values(s.halls).find((h) => key(h.hex) === k)?.name ?? 'the city')}`, army ? 'a chess battle, you play White' : 'it falls in one turn unless reinforced', 'war'));
    }
    if (!seen) {
      // под туманом — то, что игрок запомнил, когда видел клетку
      if (memo?.hall) parts.push(`<div class="card"><b>${esc(memo.hall.name)} · city level ${memo.hall.level}</b><p class="muted">${esc(ownerName(s, memo.hall.owner))} · as seen ${ago(memo.turn)}</p></div>`);
      if (memo?.building) parts.push(`<div class="card"><b class="withico">${iconSvg(memo.building.kind, 20)}${BUILDING_NAME[memo.building.kind]} · level ${memo.building.level}</b><p class="muted">as seen ${ago(memo.turn)}</p></div>`);
      if (memo) parts.push('<p class="muted">Covered by the fog of war: armies here are hidden.</p>');
      el.innerHTML = parts.join('');
      return;
    }

    // генералы на клетке
    const gens = Object.values(s.generals).filter((g) => key(g.hex) === k);
    // «место» на клетке: город или своё здание — без выбранного юнита показываем его, а не генерала
    const hallOnCell = Object.values(s.halls).some((x) => key(x.hex) === k) || (cell.owner === ME && (!!cell.building || !!cell.reserved));
    const ownHere = gens.filter((g) => g.owner === ME);
    if (ownHere.length && !sel.gid) parts.push(`<p class="muted">${ownHere.length > 1 ? 'Your units are' : `Your ${ownHere[0].settler ? 'settler is' : 'general is'}`} here — tap the cell again to select.</p>`);
    for (const g of gens) {
      const mine = g.owner === ME;
      // своих показываем только выбранного; без выбора на клетке города — сначала город
      if (mine && (!sel.gid || g.id !== sel.gid)) continue; // свой юнит — только выбранный; без выбора показываем саму клетку
      if (g.settler) { parts.push(settlerCard(g, cell)); continue; }
      const color = ownerColor(s, g.owner) ?? '#888';
      const nat = s.players[g.owner]?.nation;
      const pic = nat ? portraitSvg(nat, g.name, 54) : '<span class="genglyph">⚔</span>';
      const o = mine ? g.order : undefined;
      const where = o?.kind === 'goto' ? (Object.values(s.halls).find((h) => key(h.hex) === key(o.to))?.name ?? 'far away') : '';
      const status = !o ? '' : `<span class="chip gold">${o.kind === 'goto' ? `➜ ${esc(where)}` : o.kind === 'explore' ? '🧭 exploring' : o.kind === 'patrol' ? `🛡 ${o.cities.map((id) => esc(s.halls[id]?.name ?? '')).join(', ')}` : '⛨ holding'}</span>`;
      const meta = `<span class="elo">ELO ${g.elo}</span>${g.stars ? `<span class="gstars">${'★'.repeat(g.stars)}</span>` : ''}${mine ? '' : `<span>${esc(ownerName(s, g.owner))}</span>`}${status}`;
      let html = `<div class="gencard compact ${mine ? '' : 'foe'}">${unitHead(pic, mine ? esc(g.name) : esc(g.name), color, meta, mine ? movePips(g) : s.players[g.owner] ? nationBtn(g.owner) : '')}
        <div class="garow">${armyTokens(g.army, mine)}${traitMini(g)}</div>`;
      if (mine) {
        const tr = trainingFor(s, g.id);
        html += `<div class="gcmds">${o?.kind === 'goto' || o?.kind === 'patrol' ? cmd(`order:${g.id}:none`, '✋', 'Stop', 'cancel the order') : ''}
            ${cmd(`order:${g.id}:${o?.kind === 'explore' ? 'none' : 'explore'}`, '🧭', o?.kind === 'explore' ? 'Stop' : 'Explore', 'walks into the unknown by himself every turn', o?.kind === 'explore' ? 'on' : '')}
            ${cmd(`order:${g.id}:${o?.kind === 'hold' ? 'none' : 'hold'}`, '⛨', o?.kind === 'hold' ? 'Release' : 'Hold', 'stays put; no end-of-turn reminder', o?.kind === 'hold' ? 'on' : '')}
            ${cmd(`patrol:${g.id}`, '🛡', 'Patrol', `guards your cities: attacks any enemy within ${PATROL_RADIUS} cells of them`, o?.kind === 'patrol' ? 'on' : '')}
            ${canPillage(s, g.id).ok ? cmd(`pillage:${g.id}`, '🔥', 'Pillage', `destroys the building · you get ${pillageLoot(s, g.hex).wood} wood, ${pillageLoot(s, g.hex).food} food, ${pillageLoot(s, g.hex).gold} gold · ends his turn`, 'danger') : ''}
            ${tr.steps && hasTech(s, ME, 'academy') ? cmd(`train:${g.id}`, '🎓', `+${tr.steps * ELO_PER_RESEARCH} ELO`, `retrain for ${tr.gold} gold`) : ''}</div>`;
        const home = cell.owner === ME && cell.hall ? s.halls[cell.hall] : undefined;
        if (home) {
          // найм — по казарме города, на чьей земле стоит генерал; кнопки не отключаем: нажатие объясняет, чего не хватает
          const bar = home.barracks ?? 0;
          html += `<div class="hiregrid mini">${PIECES.map((x) => {
              const price = Math.round(piecePrice(s, ME, x) * (g.traits?.includes('recruiter') ? 0.8 : 1));
              const full = g.army[x] >= ARMY_MAX[x], locked = bar < HIRE_LEVEL[x];
              const ok = !locked && !full && p.res.gold >= price;
              return `<button class="hpiece ${ok ? '' : 'off'}" data-a="hire:${g.id}:${x}" title="${PIECE_NAME[x]} · ${g.army[x]}/${ARMY_MAX[x]}">${pieceHtml(true, x)}<b>${PIECE_NAME[x]}</b><small>${locked ? `🔒 ${HIRE_LEVEL[x]}` : amount('gold', price)}</small><span class="hcount">${g.army[x]}/${ARMY_MAX[x]}</span></button>`;
            }).join('')}</div>`;
        }
        html += `<p class="muted gtip">${o?.kind === 'goto' ? 'Marching on at the end of your turn.' : o ? 'Orders run when you end your turn.' : 'Tap a far cell to send him marching.'}</p>`;
      }
      parts.push(html + '</div>');
    }

    // ратуша
    const hall = Object.values(s.halls).find((h) => key(h.hex) === k);
    const unitPicked = !!sel.gid && s.generals[sel.gid]?.owner === ME;
    if (hall && unitPicked) {
      parts.push(`<p class="muted">Tap the cell again to open ${esc(hall.name)}.</p>`);
    } else if (hall && hall.owner === ME) {
      // стройки и очередь — только этого города (у каждого города свои строители)
      const jobs = p.jobs.map((j, i) => ({ j, i })).filter(({ j }) => jobHall(s, j) === hall.id);
      const queue = (p.queue ?? []).map((q, i) => ({ q, i })).filter(({ q }) => jobHall(s, q.job) === hall.id);
      const thUp = hall.level < 3 ? TOWN_HALL_UPGRADE[(hall.level + 1) as 2 | 3] : null;
      const nb = hallBuilders(hall) + 1;
      const hb = hall.barracks ?? 0, ht = hall.tavern ?? 0;
      const barNext = hb < 5 ? BARRACKS[(hb + 1) as 1 | 2 | 3 | 4 | 5] : null;
      const tavNext = ht < 4 ? TAVERN[(ht + 1) as 1 | 2 | 3 | 4] : null;
      const gCount = playerGenerals(s, ME).length;
      const gCost = gCount < 5 ? Math.max(0, GENERAL_HIRE_GOLD[(gCount + 1) as 2 | 3 | 4 | 5] - (NATIONS[p.nation].mods.generalHireDiscount ?? 0)) : 0;
      const free = freeBuilders(s, ME, hall.id), total = hallBuilders(hall);
      const sl = citySlots(s, hall.id);
      // плитка действия: значок, название, цена; если не хватает ресурсов — бледная
      const tile = (id: string, ico: string, label: string, c: Res | null, sub: string) => {
        const poor = c && !canAfford(p.res, c);
        return `<button class="ctile ${poor ? 'poor' : ''}" data-a="${id}"><span class="cico">${ico}</span><span class="ctext"><b>${label}</b><small>${c ? `<span class="ccost">${cost(c)}</span>` : ''}${sub}</small></span></button>`;
      };
      parts.push(`<div class="citycard">
        <div class="cityrow">${crest(hall.level)}<div class="cityname"><b>${esc(hall.name)}</b>
          <span class="citystats">${pips(sl.used, sl.max)}<span>${sl.used}/${sl.max} slots</span><span class="hammers">${'⚒'.repeat(free)}<i>${'⚒'.repeat(Math.max(0, total - free))}</i></span><span>${free}/${total} builders</span></span></div></div>
        <div class="chips">${hb ? `<span class="chip ok">⚔ Barracks ${hb}</span>` : '<span class="chip">⚔ no barracks</span>'}${ht ? `<span class="chip ok">♚ Tavern ${ht}</span>` : '<span class="chip">♚ no tavern</span>'}${hall.walls ? '<span class="chip ok">▥ Walls</span>' : ''}${hall.market ? `<span class="chip ok">⚖ Market ${hall.market}</span>` : ''}${Object.entries(s.wonders ?? {}).filter(([, w]) => w.hallId === hall.id).map(([id]) => `<span class="chip gold">${WONDERS[id as WonderId].icon} ${WONDERS[id as WonderId].name}</span>`).join('')}${routesOf(s, hall.id).length ? `<span class="chip ok">⛵ Sea routes ${routesOf(s, hall.id).length}</span>` : ''}${hall.auto ? `<span class="chip gold">⟳ Auto: ${hall.auto === 'army' ? 'army' : 'economy'}</span>` : ''}</div>
        <div class="ctiles">
          ${thUp ? tile(`th:${hall.id}`, '🏰', `City → ${hall.level + 1}`, cityUpgradeCost(s, ME, (hall.level + 1) as 2 | 3), ` · ${thUp.turns} turn · ${BUILDING_SLOTS[hall.level]} slots, +1 builder, wider land`) : ''}
          ${nb <= maxBuilders(s, ME, hall.id) ? tile(`builder:${hall.id}`, '⚒', `Hire builder ${nb}`, NATIONS[p.nation].mods.freeBuilderHire ? null : { wood: 0, food: BUILDER_HIRE_FOOD[nb as 2 | 3], gold: 0 }, `${NATIONS[p.nation].mods.freeBuilderHire ? 'free' : ''} · ${NATIONS[p.nation].mods.freeBuilderUpkeep ? 'eats nothing' : `eats ${amount('food', BUILDER_UPKEEP_FOOD)}/turn`}`) : ''}
          ${barNext ? tile(`barracks:${hall.id}`, '⚔', hb ? `Barracks → ${hb + 1}` : 'Build barracks', barracksCost(s, ME, (hb + 1) as 1 | 2 | 3 | 4 | 5), ` · ${barNext.turns} turn${barNext.turns > 1 ? 's' : ''} · ${PIECE_NAME[PIECES[hb]].toLowerCase()}s here`) : ''}
          ${tavNext ? tile(`tavern:${hall.id}`, '♚', ht ? `Tavern → ${ht + 1}` : 'Build tavern', tavernCost(s, ME, (ht + 1) as 1 | 2 | 3 | 4), ` · ${tavNext.turns} turn${tavNext.turns > 1 ? 's' : ''} · up to ${Math.min(5, ht + 2)} generals`) : ''}
          ${!hall.walls && !p.jobs.some((j) => j.kind === 'walls' && j.hallId === hall.id) ? tile(`walls:${hall.id}`, '▥', 'Build walls', WALLS.cost, ` · ${WALLS.turns} turns · sieges last a turn longer`) : ''}
          ${(hall.market ?? 0) < 3 && !p.jobs.some((j) => j.kind === 'market' && j.hallId === hall.id) ? tile(`market:${hall.id}`, '⚖', hall.market ? `Market → ${hall.market + 1}` : 'Build a market', MARKET[((hall.market ?? 0) + 1) as 1 | 2 | 3].cost, ` · trade at ${MARKET[((hall.market ?? 0) + 1) as 1 | 2 | 3].rate}:1`) : ''}
          ${tradeRate(s, ME) ? tile('trade', '⇄', 'Trade at the market', null, `rate ${tradeRate(s, ME)}:1 · gold is worth 3`) : ''}
          ${isCapital(s, hall) ? tile('wonders', '✦', p.wonder && !s.wonders?.[p.wonder] ? `Building: ${WONDERS[p.wonder as WonderId].name}` : 'Wonders of the world', null, p.wonder && s.wonders?.[p.wonder]?.builder === ME ? ' · your wonder is built' : p.wonder ? ` · see the race` : ` · one per game · capital level ${WONDER.cityLevel}`) : ''}
          ${coastal(s, hall.id) && playerHalls(s, ME).some((h) => h.id !== hall.id && coastal(s, h.id)) ? tile(`searoute:${hall.id}`, '⛵', 'Sea trade route', null, ` · to another coastal city · gold every turn`) : ''}
          ${playerHalls(s, ME).length > 1 ? tile(`road:${hall.id}`, '⛙', 'Build a road', null, `to another city · ${ROAD_WOOD_PER_CELL} wood per cell · +1 move along it`) : ''}
          ${tile(`settler:${hall.id}`, '⛺', 'Train a settler', settlerCost(s, ME), ` · founds a new city · moves ${armyMove(s, ME)} cells`)}
          ${ht && gCount < generalLimit(s, ME) ? tile(`general:${hall.id}`, '♛', 'Hire a general here', { wood: 0, food: 0, gold: gCost }, ` · ELO ${recruitElo(s, ME)} · eats ${amount('food', GENERAL_UPKEEP_FOOD)}/turn`) : ''}
        </div>
        ${jobs.length ? `<div class="cjobs">${jobs.map(({ j, i }) => `<span class="cjob">${iconSvg('clock', 14)}${esc(`${jobName(j)} (${left(j.finish)})`)}${j.kind !== 'found' ? `<button class="cx" data-a="canceljob:${i}" aria-label="Cancel construction">×</button>` : ''}</span>`).join('')}</div>` : ''}
        ${queue.length ? `<p class="muted cqhead">Queued — start when a builder is free:</p><div class="cjobs">${queue.map(({ q, i }) => `<span class="cjob queued">${esc(jobName(q.job))}<button class="cx" data-a="unqueue:${i}" aria-label="Cancel">×</button></span>`).join('')}</div>` : ''}
      </div>`);
    } else if (hall) {
      parts.push(`<div class="card"><div class="row"><b>${esc(hall.name)} · city level ${hall.level}</b>${s.players[hall.owner] ? nationBtn(hall.owner) : ''}</div><p class="muted">${esc(ownerName(s, hall.owner))}${hall.siege ? ' · under siege' : ''}${hall.barracks ? ` · barracks ${hall.barracks}` : ''}${hall.tavern ? ` · tavern ${hall.tavern}` : ''}</p></div>`);
    }

    // ресурсное здание (если выбран свой генерал на этой клетке — сначала только он)
    if (!hall && cell.owner === ME && unitPicked) { // выбран свой юнит — клетку (здание или стройку) открывает следующее касание
      if (cell.building || cell.reserved || cell.tower) parts.push(`<p class="muted">Tap the cell again to open the ${cell.building ? BUILDING_NAME[cell.building.kind].toLowerCase() : cell.tower ? 'watchtower' : 'construction'}.</p>`);
    } else if (!hall && cell.owner === ME) {
      const kinds = buildOptions(s, ME, cell).map((o) => o.kind);
      const top = cell.building ? maxLevelAt(s, ME, cell, cell.building.kind) || 5 : 5;
      const home = cell.hall ? s.halls[cell.hall] : undefined;
      const slots = home ? (() => { const sl = citySlots(s, home.id); return `<span class="citystats">${pips(sl.used, sl.max)}<span>${esc(home.name)}: ${sl.used}/${sl.max} slots</span></span>`; })() : '';
      const big = (ico: string) => `<span class="bldico">${ico}</span>`;
      const demolishTile = ctile(`demolish:${k}`, '⛏', 'Demolish', null, `frees the slot · returns ${cost(demolishRefund(s, cell.hex))}`, 'danger');
      if (cell.building) {
        const b = cell.building;
        const job = p.jobs.find((j): j is Extract<Job, { kind: 'resource' }> => j.kind === 'resource' && key(j.hex) === k);
        const qi = (p.queue ?? []).findIndex((q) => q.job.kind === 'resource' && key(q.job.hex) === k);
        const busy = !!job || qi >= 0;
        const out = RESOURCE_OUTPUT[b.kind];
        const yields = (['food', 'wood', 'gold'] as const).filter((r) => buildingOutput(s, ME, cell)[r]).map((r) => `<span class="chip ok">+${amount(r, buildingOutput(s, ME, cell)[r])} per turn</span>`).join('');
        parts.push(`<div class="citycard bldcard">
          <div class="cityrow">${big(iconSvg(b.kind, 34))}<div class="cityname"><b>${BUILDING_NAME[b.kind]}</b>
            <span class="citystats"><span class="lvl">level ${b.level}</span>${pips(b.level, top)}<span>of ${top}</span></span></div></div>
          <div class="chips">${yields}</div>
          ${busy ? `<div class="cjobs"><span class="cjob">${iconSvg('clock', 14)}${job ? `Upgrading to level ${job.level} · ${left(job.finish)}` : 'Upgrade queued — starts when a builder is free'}${job ? `<button class="cx" data-a="canceljob:${p.jobs.indexOf(job)}" aria-label="Cancel the upgrade">×</button>` : `<button class="cx" data-a="unqueue:${qi}" aria-label="Cancel the queued upgrade">×</button>`}</span></div>` : ''}
          <div class="ctiles">${!busy && b.level < top ? ctile(`up:${k}`, '⬆', `Upgrade → ${b.level + 1}`, resourceCost(s, ME, b.kind, b.level + 1), ` · ${BUILD_TURNS[b.level]} turn${BUILD_TURNS[b.level] > 1 ? 's' : ''} · +${amount(RES_OF[b.kind], out[b.level] - out[b.level - 1])}/turn`, 'ctop') : ''}
            ${busy ? '' : demolishTile}</div>
          ${b.level >= top ? '<p class="muted">Top level</p>' : ''}${slots}</div>`);
      } else if (cell.tower) {
        parts.push(`<div class="citycard bldcard">
          <div class="cityrow">${big(iconSvg('tower', 40))}<div class="cityname"><b>Watchtower</b><span class="citystats"><span>sees ${TOWER.sight} cells around</span></span></div></div>
          <div class="ctiles">${demolishTile}</div>${slots}</div>`);
      } else if (cell.reserved) {
        const job = p.jobs.find((j) => (j.kind === 'resource' || j.kind === 'tower') && key(j.hex) === k);
        const qi = (p.queue ?? []).findIndex((q) => q.job.kind === 'resource' && key(q.job.hex) === k);
        const ico = job?.kind === 'tower' ? iconSvg('tower', 34) : job?.kind === 'resource' ? iconSvg(job.building, 34) : iconSvg('clock', 30);
        parts.push(`<div class="citycard bldcard">
          <div class="cityrow">${big(ico)}<div class="cityname"><b>${job ? esc(jobName(job)) : qi >= 0 ? esc(jobName(p.queue![qi].job)) : 'Construction'}</b>
            <span class="citystats"><span>${job ? left(job.finish) : qi >= 0 ? 'queued — starts when a builder is free' : 'Construction in progress'}</span></span></div></div>
          <div class="ctiles">${qi >= 0 ? ctile(`unqueue:${qi}`, '✕', 'Cancel', null, 'resources are returned') : job ? ctile(`canceljob:${p.jobs.indexOf(job)}`, '✕', 'Cancel construction', null, 'resources are returned') : ''}</div></div>`);
      } else if ((kinds.length || TOWER_TERRAIN.includes(cell.terrain)) && cell.hall && citySlots(s, cell.hall).used >= citySlots(s, cell.hall).max) {
        const h = s.halls[cell.hall], sl = citySlots(s, cell.hall);
        parts.push(`<div class="citycard bldcard"><div class="cityrow">${big('🏗')}<div class="cityname"><b>No free slots</b>${slots}</div></div>
          <p><b>${esc(h.name)}</b> has no free building slots (${sl.used}/${sl.max}).</p><p class="muted">${h.level < 3 ? `Grow the city to level ${h.level + 1} for ${BUILDING_SLOTS[h.level]} slots, ` : ''}upgrade the buildings you have, or found a new city.</p></div>`);
      } else if (kinds.length || (TOWER_TERRAIN.includes(cell.terrain) && cell.hall)) {
        parts.push(`<div class="citycard bldcard"><div class="cityrow">${big('🏗')}<div class="cityname"><b>Build here</b>${slots}</div></div>
          <div class="ctiles">${kinds.map((b) => ctile(`build:${k}:${b}`, iconSvg(b, 24), `Build ${BUILDING_NAME[b].toLowerCase()}`, resourceCost(s, ME, b, 1), ` · 1 turn · +${amount(RES_OF[b], RESOURCE_OUTPUT[b][0])}/turn`)).join('')}
            ${TOWER_TERRAIN.includes(cell.terrain) ? ctile(`tower:${k}`, iconSvg('tower', 28), 'Build a watchtower', TOWER.cost, ` · 1 turn · sees ${TOWER.sight} cells around`) : ''}</div></div>`);
      } else {
        parts.push(`<p class="muted">Nothing can be built on ${TERRAIN_NAME[cell.terrain].toLowerCase()}.</p>`);
      }
    }
    el.innerHTML = parts.join('');
  };

  // ---------- действия ----------
  app.querySelector('#sheet')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
    if (!b || busy) return;
    void handleAction(b.dataset.a!, b.querySelector('b')?.textContent ?? 'this');
  });

  /** Действие кнопки (из панели клетки или из меню городов). */
  const handleAction = async (dataA: string, label = 'this'): Promise<void> => {
    const [a, x, y] = dataA.split(':');
    const hex = (k: string) => { const [q, r] = k.split(',').map(Number); return { q, r }; };
    // стройки: если все строители заняты — предлагаем поставить в очередь
    if (a === 'nation') { tap(); void nationInfo(x); return; }
    const order: QueueOrder | null = a === 'th' ? { kind: 'townhall', hallId: x } : a === 'barracks' ? { kind: 'barracks', hallId: x }
      : a === 'tavern' ? { kind: 'tavern', hallId: x } : a === 'up' ? { kind: 'upgrade', hex: hex(x) }
        : a === 'build' ? { kind: 'build', hex: hex(x), building: y as ResourceBuilding } : null;
    if (order) { await construct(order, label); return; }
    if (a === 'hire') act(hirePiece(s, ME, x, y as Piece));
    else if (a === 'found') { const r = foundTownHall(s, ME, x); act(r); if (r.ok) { sel = {}; refresh(); } }
    else if (a === 'builder') act(hireBuilder(s, ME, x));
    else if (a === 'general') act(hireGeneral(s, ME, x));
    else if (a === 'settler') { const r = hireSettler(s, ME, x); act(r); if (r.ok) toast('A settler is ready in the city. He can move next turn.'); }
    else if (a === 'unqueue') act(cancelQueued(s, ME, Number(x)));
    else if (a === 'canceljob') act(cancelJob(s, ME, Number(x)));
    else if (a === 'demolish') {
      const c = s.cells[x]; const b = c?.building;
      const ico = b ? iconSvg(b.kind, 46) : iconSvg('tower', 52);
      const name = b ? BUILDING_NAME[b.kind] : 'Watchtower';
      const r = demolishRefund(s, hex(x));
      modal(`<div class="dembox"><span class="demico">${ico}<i>⛏</i></span><h2>Demolish?</h2>
        <p><b>${name}</b>${b ? ` · level ${b.level}` : ''}</p><p class="muted">the slot becomes free for another building</p>
        <div class="demref"><span>Half of the cost returns</span><div class="chips">${(['wood', 'food', 'gold'] as const).filter((k) => r[k]).map((k) => `<span class="chip ok">+${amount(k, r[k])}</span>`).join('') || '<span class="chip">nothing</span>'}</div></div>
        <div class="ctiles">${ctile('yes', '⛏', 'Demolish', null, 'cannot be undone', 'danger')}${ctile('no', '✋', 'Keep it', null, 'leave it standing', 'ctop')}</div></div>`);
      const yes = (await ask()) === 'yes'; modal(null); if (yes) act(demolish(s, ME, hex(x)));
    }
    else if (a === 'pillage') { const r = pillage(s, x); act(r); if (r.ok) chestOpen('common'); }
    else if (a === 'walls') act(buildWalls(s, ME, x));
    else if (a === 'market') act(upgradeMarket(s, ME, x));
    else if (a === 'tower') act(buildTower(s, ME, hex(x)));
    else if (a === 'trade') await tradeMenu();
    else if (a === 'road') await roadMenu(x);
    else if (a === 'wonders') await wondersMenu();
    else if (a === 'searoute') await seaMenu(x);
    else if (a === 'move') doMove();
    else if (a === 'goto') {
      const g = s.generals[sel.gid!];
      g.order = { kind: 'goto', to: { ...sel.hex! } };
      saveGame(s);
      sel = {}; // приказ отдан — генерал больше не выбран, касания карты маршрут не трогают
      toast('The general sets off when you end your turn. Until then you can move him yourself.');
      refresh();
    }
    else if (a === 'patrol') await patrolMenu(x);
    else if (a === 'order') { const g = s.generals[x]; g.order = y === 'none' ? undefined : y === 'explore' ? { kind: 'explore' } : { kind: 'hold' }; sel = y === 'none' ? { hex: g.hex, gid: g.id } : {}; saveGame(s); refresh(); }
    else if (a === 'attack') doAttack();
    else if (a === 'train') { const r = trainGeneral(s, ME, x); act(r); if (r.ok) toast(`${s.generals[x].name} is retrained: ELO ${s.generals[x].elo}.`); }
  };

  /** Рынок: отдать один ресурс за другой по курсу лучшего рынка страны. */
  const tradeMenu = async () => {
    const R = ['wood', 'food', 'gold'] as const;
    let from: typeof R[number] = 'wood', to: typeof R[number] = 'gold';
    for (;;) {
      const p = s.players[ME];
      const opts = [10, 50, 100, p.res[from]].filter((n, i, a) => n > 0 && n <= p.res[from] && a.indexOf(n) === i);
      modal(`<h2>⚖ Market</h2><p class="muted">${tradeRate(s, ME)}:1 · gold is worth 3 wood or food. A better market gives a better rate.</p>
        <div class="tradepick"><span>Give</span><div class="seg">${R.map((r) => `<button data-a="from:${r}" class="${r === from ? 'on' : ''}">${iconSvg(r, 16)} ${p.res[r]}</button>`).join('')}</div></div>
        <div class="tradepick"><span>Get</span><div class="seg">${R.map((r) => `<button data-a="to:${r}" class="${r === to ? 'on' : ''}" ${r === from ? 'disabled' : ''}>${iconSvg(r, 16)}</button>`).join('')}</div></div>
        <div class="acts">${opts.map((n) => btn(`deal:${n}`, `${n} → ${tradeQuote(s, ME, from, to, n)}`, `${iconSvg(from, 13)} → ${iconSvg(to, 13)}`)).join('') || '<p class="muted">Nothing to trade.</p>'}${btn('close', 'Close', '')}</div>`);
      const c = await ask();
      if (c.startsWith('from:')) { from = c.slice(5) as typeof from; if (to === from) to = R.find((r) => r !== from)!; continue; }
      if (c.startsWith('to:')) { to = c.slice(3) as typeof to; continue; }
      if (c.startsWith('deal:')) { const r = trade(s, ME, from, to, Number(c.slice(5))); if (!r.ok) toast(r.reason); else { tap(); saveGame(s); bar(); } continue; }
      modal(null); refresh(); return;
    }
  };
  /** Дорога из города hallId: выбрать, к какому своему городу. */
  const roadMenu = async (hallId: string) => {
    const others = playerHalls(s, ME).filter((h) => h.id !== hallId);
    modal(`<h2>⛙ Road from ${esc(s.halls[hallId].name)}</h2><p class="muted">Armies on a road go one cell further each turn. The road runs over your land or free land.</p>
      <div class="acts">${others.map((h) => { const path = roadPath(s, ME, hallId, h.id); const n = path ? path.length - 1 : 0;
        return btn(`to:${h.id}`, `To ${esc(h.name)}`, !path ? 'no way through' : n > ROAD_MAX ? `${n} cells — too far` : path.every((x) => s.cells[key(x)].road) ? 'already connected' : `${n} cells · ${cost(roadCost(s, path))}`); }).join('')}${btn('close', 'Close', '')}</div>`);
    const c = await ask();
    modal(null);
    if (c.startsWith('to:')) act(buildRoad(s, ME, hallId, c.slice(3)));
  };

  /** Чудеса света: что построено, что строится, что можно начать. */
  const wondersMenu = async () => {
    for (;;) {
      const p = s.players[ME];
      const rows = WONDER_IDS.map((id) => {
        const w = WONDERS[id], st = wonderStatus(s, id);
        const who = (pid: string) => pid === ME ? 'you' : esc(ownerName(s, pid));
        const status = st.built ? `<span class="wst built">${st.built.owner === ME ? 'yours' : `${who(st.built.owner)} · ${esc(s.halls[st.built.hallId]?.name ?? '')}`}</span>`
          : st.building.length ? `<span class="wst race">building: ${st.building.map(who).join(', ')}</span>` : '<span class="wst free">nobody yet</span>';
        const why = wonderBlocked(s, ME, id);
        const can = !st.built && !(p.wonder);
        return `<div class="wrow ${st.built ? 'done' : ''}"><span class="wico">${w.icon}</span><span class="wtext"><b>${w.name}</b><small>${w.text}</small>${status}</span>
          ${can ? `<button class="ghost upb ${why ? 'off' : ''}" data-a="wonder:${id}">Build<small>${cost(WONDER.cost)}</small></button>` : ''}</div>`;
      }).join('');
      modal(`<h2>✦ Wonders of the world</h2><p class="muted">Each wonder exists once on the map. You can build one per game, in a level ${WONDER.cityLevel} capital, in ${WONDER.turns} turns. Everyone sees who builds what: if a rival finishes first, half of your investment returns. Whoever holds the city holds the wonder.</p>
        <div class="wlist">${rows}</div><div class="acts">${btn('close', 'Close', '')}</div>`);
      const c = await ask();
      if (c.startsWith('wonder:')) { const r = startWonder(s, ME, c.slice(7) as WonderId); if (!r.ok) { toast(r.reason); continue; } tap(); saveGame(s); }
      modal(null); refresh(); return;
    }
  };
  /** Морской торговый путь из города hallId. */
  const seaMenu = async (hallId: string) => {
    const list = seaRouteTargets(s, ME, hallId);
    modal(`<h2>⛵ Sea route from ${esc(s.halls[hallId].name)}</h2><p class="muted">Two of your coastal cities linked by sea bring gold every turn while both are yours. The farther the voyage, the richer the trade. Up to ${SEA_ROUTE.perCity} routes per city.</p>
      <div class="acts">${list.map((x) => btn(`to:${x.hallId}`, `To ${esc(s.halls[x.hallId].name)}`, x.blocked ? x.blocked : `${x.cells} sea cells · ${amount('wood', x.cells * SEA_ROUTE.woodPerCell)} · +${amount('gold', seaRouteGold(x.cells))}/turn`).replace('class="act"', `class="act${x.blocked ? ' off' : ''}"`)).join('') || '<p class="muted">None of your other cities can be reached by sea.</p>'}${btn('close', 'Close', '')}</div>`);
    const c = await ask();
    modal(null);
    if (c.startsWith('to:')) act(buildSeaRoute(s, ME, hallId, c.slice(3)));
  };

  /** Патруль: выбрать города, которые генерал охраняет (по умолчанию — столицу). */
  const patrolMenu = async (gid: string) => {
    const g = s.generals[gid];
    if (!g) return;
    const mine = playerHalls(s, ME).sort((a, b) => a.order - b.order);
    const picked = new Set(g.order?.kind === 'patrol' ? g.order.cities.filter((id) => s.halls[id]?.owner === ME) : mine.slice(0, 1).map((h) => h.id));
    for (;;) {
      modal(`<h2>🛡 Patrol</h2><p class="muted">General ${esc(g.name)} guards the cities you pick. At the start of each of your turns he marches on any enemy army within ${PATROL_RADIUS} cells of them and attacks it; when all is quiet he returns to his post.</p>
        <div class="pcities">${mine.map((h, i) => `<button class="pcity ${picked.has(h.id) ? 'on' : ''}" data-a="pc:${h.id}"><span class="pchk">${picked.has(h.id) ? '✓' : ''}</span><b>${esc(h.name)}</b><small>${i === 0 ? 'capital · ' : ''}level ${h.level}${h.walls ? ' · walls' : ''}</small></button>`).join('')}</div>
        <div class="ctiles">${ctile('pgo', '🛡', 'Start patrolling', null, picked.size ? `${picked.size} cit${picked.size === 1 ? 'y' : 'ies'} guarded` : 'pick at least one city', picked.size ? 'ctop' : 'poor')}${ctile('close', '✕', 'Cancel', null, 'keep the old orders')}</div>`);
      const c = await ask();
      if (c.startsWith('pc:')) { const id = c.slice(3); if (picked.has(id)) picked.delete(id); else picked.add(id); continue; }
      if (c === 'pgo' && !picked.size) { toast('Pick at least one city.'); continue; }
      modal(null);
      if (c !== 'pgo') return;
      g.order = { kind: 'patrol', cities: [...picked] };
      saveGame(s);
      toast('The patrol starts when you end your turn.');
      sel = { hex: g.hex, gid: g.id };
      refresh();
      return;
    }
  };

  const construct = async (order: QueueOrder, label: string) => { // label — надпись кнопки
    const hid = order.kind === 'build' || order.kind === 'upgrade' ? s.cells[key(order.hex)]?.hall : order.hallId;
    if (!hid || freeBuilders(s, ME, hid) > 0) { act(enqueue(s, ME, order)); return; }
    if (order.kind === 'upgrade') { const b = s.cells[key(order.hex)]?.building; if (b) label = `${BUILDING_NAME[b.kind]} → ${b.level + 1}`; }
    if (order.kind === 'build') label = BUILDING_NAME[order.building];
    if (order.kind === 'townhall') label = `${s.halls[hid].name} → level ${s.halls[hid].level + 1}`;
    if (order.kind === 'barracks' || order.kind === 'tavern') label = `${order.kind === 'barracks' ? 'Barracks' : 'Tavern'} in ${s.halls[hid].name}`;
    // все строители заняты — сразу ставим в очередь, без вопросов
    const r = enqueue(s, ME, order);
    act(r);
    if (r.ok) toast(`${label}: queued — starts when a builder of ${s.halls[hid].name} is free`);
  };

  // ---------- Держава: правитель и сила государства ----------
  const nationBtn = (pid: string) => `<button class="natbtn" data-a="nation:${pid}" aria-label="About this nation">${flagSvg(s.players[pid].nation, 22)}</button>`;
  // ---------- Дипломатия ----------
  const STANCE: Record<string, [string, string]> = { peace: ['Peace', 'peace'], war: ['War', 'war'], alliance: ['Alliance', 'ally'] };
  const stanceChip = (pid: string) => {
    const r = relation(s, ME, pid);
    const truce = (r.noWarUntil ?? 0) > s.turn ? ` · truce ${r.noWarUntil! - s.turn}` : '';
    const soon = r.state === 'war' && (r.warFrom ?? 0) > s.turn ? ' · from next turn' : '';
    return `<span class="stance ${STANCE[r.state][1]}">${STANCE[r.state][0]}${soon}${truce}</span>`;
  };
  /** Свои отношения со всеми известными странами (в меню своей державы). */
  const diploList = () => {
    const known = s.order.filter((id) => id !== ME && s.players[id].alive && hasMet(s, ME, id));
    if (!known.length) return '<p class="muted">Diplomacy: you have not met any nation yet.</p>';
    return `<h3>Diplomacy</h3><div class="diplo">${known.map((id) => `<button class="diprow" data-a="nation:${id}">${flagSvg(s.players[id].nation, 22)}<b>${esc(NATIONS[s.players[id].nation].name)}</b>${stanceChip(id)}</button>`).join('')}</div>`;
  };
  /** Отношения с чужой страной и что можно предложить. */
  const diploBlock = (pid: string) => {
    if (!hasMet(s, ME, pid)) return '';
    if (isOutlaw(s, ME) || isOutlaw(s, pid)) return `<h3>Relations</h3><p><b class="bad">Eternal war</b></p><p class="muted">${isOutlaw(s, ME) ? 'No crown recognises you as a ruler: there is no peace, trade or alliance with outlaws.' : 'They are outlaws: no one makes peace, trade or alliances with them.'}</p>`;
    const r = relation(s, ME, pid);
    const blocked = warBlocked(s, ME, pid);
    const acts = r.state === 'peace'
      ? btn('dip:war', 'Declare war', blocked ?? 'attacks begin next turn').replace('class="act"', `class="act${blocked ? ' off' : ''}"`) + btn('dip:ally', 'Propose an alliance', 'they decide at once')
        + btn('dip:trade', 'Trade…', 'resources, cities, technologies')
      : r.state === 'war' ? btn('dip:peace', 'Negotiate peace…', `what you give and ask · ${TRUCE_TURNS} turns of truce`)
        : btn('dip:break', 'Break the alliance', `no war with them for ${BREAK_COOLDOWN} turns after`) + btn('dip:trade', 'Trade…', 'resources, cities, technologies');
    return `<div class="row"><h3>Relations</h3>${stanceChip(pid)}</div><div class="acts">${acts}</div>`;
  };
  const diploAction = async (pid: string, a: string) => {
    const name = NATIONS[s.players[pid].nation].name;
    if (a === 'war') {
      modal(`<h2>War with ${esc(name)}?</h2><p>Your armies may cross their border and attack from the next turn. Their allies will join them, and your neighbours will remember it.</p>
        <div class="acts">${btn('yes', 'Declare war', '')}${btn('no', 'Not now', '')}</div>`);
      if (await ask() !== 'yes') return;
      const why = declareWar(s, ME, pid);
      toast(why ? `Cannot declare war: ${why}.` : `War is declared on ${name}. Attacks begin next turn.`);
    } else if (a === 'ally') {
      if (acceptsAlliance(s, pid, ME)) { makeAlliance(s, ME, pid); toast(`${name} accepts the alliance.`); }
      else toast(`${name} declines: they see no common enemy${aggression(s, ME) >= 6 ? ' — and they fear your conquests' : ''}.`);
    } else if (a === 'peace' || a === 'trade') {
      await dealWindow(pid, a === 'peace');
    } else if (a === 'break') {
      breakAlliance(s, ME, pid); toast(`The alliance with ${name} is over.`);
    }
    saveGame(s);
    refresh();
  };
  /** Окно сделки: что отдаём и что просим (ресурсы, города, технологии) и шанс, что ИИ согласится. */
  const dealWindow = async (pid: string, peace: boolean) => {
    const name = NATIONS[s.players[pid].nation].name;
    const d: Deal = { give: emptyTerms(), take: emptyTerms(), peace };
    const RES = ['gold', 'wood', 'food'] as const;
    for (;;) {
      const side = (who: 'give' | 'take') => {
        const owner = who === 'give' ? ME : pid, other = who === 'give' ? pid : ME;
        const t = d[who];
        const rows = RES.map((r) => `<div class="dres">${iconSvg(r, 16)}<b>${t.res[r]}</b><small class="muted">of ${s.players[owner].res[r]}</small>
          <span>${[-50, -10, 10, 50].map((n) => `<button data-a="d:${who}:${r}:${n}" class="mini">${n > 0 ? '+' : ''}${n}</button>`).join('')}</span></div>`).join('');
        const cities = tradableCities(s, owner).map((id) => `<button data-a="d:${who}:city:${id}" class="chip ${t.cities.includes(id) ? 'on' : ''}">${esc(s.halls[id].name)}</button>`).join('');
        const techs = tradableTechs(s, owner, other).map((id) => `<button data-a="d:${who}:tech:${id}" class="chip ${t.techs.includes(id) ? 'on' : ''}">${esc(TECHS[id].name)}</button>`).join('');
        return `${rows}${cities ? `<div class="chips">${cities}</div>` : ''}${techs ? `<div class="chips">${techs}</div>` : ''}`;
      };
      const chance = Math.round(acceptChance(s, ME, pid, d) * 100);
      modal(`<h2>${peace ? `Peace with ${esc(name)}` : `Deal with ${esc(name)}`}</h2>
        <h3>You give</h3>${side('give')}
        <h3>You ask</h3>${side('take')}
        <p class="dchance">Chance they agree: <b class="${chance >= 60 ? 'good' : chance >= 30 ? 'mid' : 'bad'}">${chance}%</b></p>
        <div class="acts">${btn('d:propose', peace ? 'Offer peace' : 'Propose', '')}${btn('d:cancel', 'Cancel', '')}</div>`);
      const c = await ask();
      if (c === 'd:cancel') return;
      if (c === 'd:propose') {
        modal(null);
        if (proposeDeal(s, ME, pid, d)) toast(`${name} agrees${peace ? ': the war is over' : ''}.`);
        else toast(`${name} rejects the offer.`);
        saveGame(s); refresh();
        return;
      }
      const [, who, kind, val] = c.split(':') as [string, 'give' | 'take', string, string];
      const owner = who === 'give' ? ME : pid;
      if (kind === 'city') { const l = d[who].cities; d[who].cities = l.includes(val) ? l.filter((x) => x !== val) : [...l, val]; }
      else if (kind === 'tech') { const l = d[who].techs; const id = val as TechId; d[who].techs = l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; }
      else { const r = kind as 'gold' | 'wood' | 'food'; d[who].res[r] = Math.max(0, Math.min(s.players[owner].res[r], d[who].res[r] + Number(val))); }
    }
  };

  /** Предложение ИИ в начале хода: мир с данью игроку или требование дани. */
  const offerCard = async () => {
    const o = s.players[ME]?.offer;
    if (!o || !s.players[o.from]) return;
    if (!hasMet(s, ME, o.from)) { s.players[ME].offer = undefined; return; } // незнакомая страна не пишет
    const name = NATIONS[s.players[o.from].nation].name;
    const flag = flagSvg(s.players[o.from].nation, 44);
    const what = termsText(s, o.terms);
    const canPay = (['wood', 'food', 'gold'] as const).every((r) => s.players[ME].res[r] >= o.terms.res[r]);
    if (o.kind === 'peace') modal(`<div class="evcard"><div class="evart">${flag}</div><h2>${esc(name)} asks for peace</h2><p>To end the war they offer: <b>${esc(what)}</b>.</p></div>
      <div class="acts">${btn('yes', 'Accept peace', `${TRUCE_TURNS} turns of truce`)}${btn('no', 'Fight on', '')}</div>`);
    else modal(`<div class="evcard"><div class="evart">${flag}</div><h2>${esc(name)} demands tribute</h2><p>Give them <b>${esc(what)}</b>, or they march on you.</p></div>
      <div class="acts">${btn('yes', 'Pay the tribute', 'no attack from them for 8 turns').replace('class="act"', `class="act${canPay ? '' : ' off'}"`)}${btn('no', 'Refuse', 'this means war')}</div>`);
    const yes = (await ask()) === 'yes';
    modal(null);
    if (yes && o.kind === 'tribute' && !canPay) { toast('You cannot pay — they take it as a refusal.'); }
    const res = answerOffer(s, ME, yes);
    if (res) toast(`${res[0].toUpperCase()}${res.slice(1)}.`);
    saveGame(s);
    refresh();
  };

  const nationInfo = async (pid: string) => {
    const pl = s.players[pid];
    const n = NATIONS[pl.nation];
    const st = nationStats(s, pid);
    const mineN = pid === ME;
    const color = ownerColor(s, pid) ?? '#888';
    const medal = (r: number) => `<span class="rmedal ${r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : ''}">${r}</span><small>${r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`} of ${st.rank.of}</small>`;
    const stat = (ico: string, label: string, v: number, r?: number) => `<div class="nstat"><span class="nsico">${ico}</span><span class="nslab">${label}</span><b>${v}</b>${r ? `<span class="nsrank">${medal(r)}</span>` : ''}</div>`;
    modal(`<div class="natcard" style="--c:${color}">
      <div class="nathero"><span class="natflag">${flagSvg(pl.nation, 64)}</span><div><h2>${esc(n.name)}</h2><span class="chip gold">${esc(n.bonus)}</span><p>${esc(n.effect)}</p></div></div>
      <div class="rulerbox"><span class="rulerring">${portraitSvg(pl.nation, st.ruler, 72)}</span><div><b>${esc(st.ruler)}</b><p class="muted">${mineN ? 'Your ruler' : `Ruler${st.character ? ` · ${st.character}` : ''}`}</p>${pl.startBonus ? `<span class="chip ok">✦ Start bonus: ${esc(pl.startBonus)}</span>` : ''}</div></div>
      <div class="nstats">
        ${stat('🏰', 'Cities', st.cities)}
        ${stat('⬢', 'Area', st.area, st.rank.area)}
        ${stat('⚔', 'Military', st.military, st.rank.military)}
        ${stat(iconSvg('gold', 20), 'Economy', st.economy, st.rank.economy)}
      </div>
      ${mineN ? `<div class="nincome"><span>Income per turn</span><span class="chip ok">${amount('wood', st.income.wood)}</span><span class="chip ok">${amount('food', st.income.food - st.upkeep)}</span><span class="chip ok">${amount('gold', st.income.gold)}</span></div>` : ''}
      <p class="muted nnote">Area — cells of land. Military — the value of all pieces, stronger with the generals' ELO (${st.generals} general${st.generals > 1 ? 's' : ''}, ${st.pieces} pieces). Economy — income per turn after feeding the army, gold counted ×4.</p>
      ${mineN ? diploList() : diploBlock(pid)}
      ${mineN ? `<div class="ntoggles"><button class="ntog ${audioPrefs().music ? 'on' : ''}" data-a="music">♫ Music: ${audioPrefs().music ? 'on' : 'off'}</button><button class="ntog ${audioPrefs().sfx ? 'on' : ''}" data-a="sfx">🔔 Sounds: ${audioPrefs().sfx ? 'on' : 'off'}</button></div>` : ''}
      </div>
      <div class="acts">${btn('close', 'Close', '')}${mineN ? btn('endgame', 'End campaign', 'final standings and charts') : ''}</div>`);
    const c = await ask();
    if (c.startsWith('nation:')) return nationInfo(c.slice(7));
    if (c.startsWith('dip:')) { await diploAction(pid, c.slice(4)); return nationInfo(pid); }
    if (c === 'music' || c === 'sfx') { if (c === 'music') setMusic(!audioPrefs().music); else setSfx(!audioPrefs().sfx); return nationInfo(pid); }
    modal(null);
    if (c !== 'endgame') return;
    modal(`<h2>End this campaign?</h2><p>The game stops here: you will see how every nation grew and who was strongest. The save is deleted.</p>
      <div class="acts">${btn('yes', 'End campaign', 'see the results')}${btn('no', 'Keep playing', '')}</div>`);
    if (await ask() === 'yes') await finish('end'); else modal(null);
  };
  app.querySelector('#me')!.addEventListener('click', () => { if (!busy) { tap(); void nationInfo(ME); } });

  // ---------- Меню генералов: список армий, касание выбирает генерала ----------
  const glyphs = (a: typeof s.generals[string]['army']) => (['p', 'n', 'b', 'r', 'q'] as const).filter((x) => a[x])
    .map((x) => `${{ p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }[x]}\uFE0E${a[x] > 1 ? a[x] : ''}`).join(' ') || 'no pieces';
  const generalsMenu = async () => {
    const mine = Object.values(s.generals).filter((g) => g.owner === ME).sort((a, b) => Number(!!a.settler) - Number(!!b.settler) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
    const status = (g: typeof mine[number]) => g.order?.kind === 'goto' ? 'marching' : g.order?.kind === 'explore' ? 'exploring' : g.order?.kind === 'hold' ? 'holding' : g.order?.kind === 'patrol' ? 'patrolling'
      : g.attacked ? 'done this turn' : g.moveLeft > 0 ? `${g.moveLeft} move${g.moveLeft > 1 ? 's' : ''} left` : 'no moves left';
    const nat = s.players[ME].nation;
    modal(`<h2>Your generals</h2><div class="glist">${mine.map((g) => {
      const ready = g.moveLeft > 0 && !g.attacked && !g.order;
      return `<button class="grow ${ready ? 'ready' : ''}" data-a="pick:${g.id}">
        <span class="gport">${g.settler ? '<span class="genglyph">⛺</span>' : portraitSvg(nat, g.name, 44)}</span>
        <span class="gname"><b>${g.settler ? 'Settler' : `General ${esc(g.name)}`}</b>${g.settler ? '' : `<small><span class="elo">ELO ${g.elo}</span>${g.stars ? ` <span class="gstars">${'★'.repeat(g.stars)}</span>` : ''}${g.traits?.length ? ` · ${g.traits.map((t) => esc(TRAITS[t].name)).join(', ')}` : ''}</small>`}</span>
        <span class="garmy">${g.settler ? '<small>founds a city</small>' : PIECES.filter((x) => g.army[x]).map((x) => `<span class="mtok">${pieceHtml(true, x)}${g.army[x] > 1 ? `<i>${g.army[x]}</i>` : ''}</span>`).join('') || '<small>no pieces</small>'}</span>
        <span class="gmoves">${status(g)}</span></button>`;
    }).join('')}</div>
      <div class="acts">${btn('close', 'Close', '')}</div>`);
    const c = await ask();
    modal(null);
    if (!c.startsWith('pick:')) return;
    const g = s.generals[c.slice(5)];
    if (!g) return;
    sel = { hex: { ...g.hex }, gid: g.id };
    refresh();
    glideTo(g.hex);
  };
  app.querySelector('#gensbtn')!.addEventListener('click', () => { if (!busy) { tap(); void generalsMenu(); } });

  // ---------- Меню городов: свайпом листаем города, у каждого — список зданий с улучшением ----------
  let cityIdx = 0;
  const cityPanel = (hallId: string, i: number, n: number): string => {
    const h = s.halls[hallId];
    const p = s.players[ME];
    const sl = citySlots(s, h.id);
    const job = (pred: (j: Job) => boolean) => p.jobs.find(pred);
    const queued = (pred: (j: Job) => boolean) => (p.queue ?? []).some((q) => pred(q.job));
    const state = (pred: (j: Job) => boolean) => { const j = job(pred); return j ? `<span class="bstate">${iconSvg('clock', 13)}${left(j.finish)}</span>` : queued(pred) ? '<span class="bstate">queued</span>' : ''; };
    const up = (id: string, label: string, c: Res, busyNow: string) => busyNow || `<button class="ghost upb" data-a="${id}">${label}<small>${cost(c)}</small></button>`;
    const cells = Object.values(s.cells).filter((c) => c.hall === h.id && (c.building || c.reserved));
    const hb = h.barracks ?? 0, ht = h.tavern ?? 0;
    const rows = [
      `<div class="brow"><span class="bico">🏰</span><span class="bname"><b>City</b> · level ${h.level}</span><span class="bout">${pips(sl.used, sl.max)} ${sl.used}/${sl.max} slots · builders ${freeBuilders(s, ME, h.id)}/${hallBuilders(h)} free</span>
        ${h.level < 3 ? up(`th:${h.id}`, `→ ${h.level + 1}`, cityUpgradeCost(s, ME, (h.level + 1) as 2 | 3), state((j) => j.kind === 'townhall' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      `<div class="brow"><span class="bico">⚔</span><span class="bname"><b>Barracks</b> · ${hb ? `level ${hb}` : 'none'}</span><span class="bout">${hb ? `hires up to ${PIECE_NAME[PIECES[hb - 1]].toLowerCase()}s` : 'needed to hire pieces here'}</span>
        ${hb < 5 ? up(`barracks:${h.id}`, hb ? `→ ${hb + 1}` : 'Build', barracksCost(s, ME, (hb + 1) as 1 | 2 | 3 | 4 | 5), state((j) => j.kind === 'barracks' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      `<div class="brow"><span class="bico">♚</span><span class="bname"><b>Tavern</b> · ${ht ? `level ${ht}` : 'none'}</span><span class="bout">${ht ? `up to ${Math.min(5, ht + 1)} generals` : 'hires generals'}</span>
        ${ht < 4 ? up(`tavern:${h.id}`, ht ? `→ ${ht + 1}` : 'Build', tavernCost(s, ME, (ht + 1) as 1 | 2 | 3 | 4), state((j) => j.kind === 'tavern' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      `<div class="brow"><span class="bico">▥</span><span class="bname"><b>Walls</b> · ${h.walls ? 'built' : 'none'}</span><span class="bout">sieges last a turn longer</span>
        ${h.walls ? '<span class="bstate">✓</span>' : up(`walls:${h.id}`, 'Build', WALLS.cost, state((j) => j.kind === 'walls' && j.hallId === h.id))}</div>`,
      `<div class="brow"><span class="bico">⚖</span><span class="bname"><b>Market</b> · ${h.market ? `level ${h.market}` : 'none'}</span><span class="bout">${tradeRate(s, ME) ? `<button class="ghost tradeb" data-a="trade">⇄ Trade · ${tradeRate(s, ME)}:1</button>` : 'trade resources'}</span>
        ${(h.market ?? 0) < 3 ? up(`market:${h.id}`, h.market ? `→ ${h.market + 1}` : 'Build', MARKET[((h.market ?? 0) + 1) as 1 | 2 | 3].cost, state((j) => j.kind === 'market' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      ...(isCapital(s, h) ? [`<div class="brow"><span class="bico">✦</span><span class="bname"><b>Wonder of the world</b> · ${Object.entries(s.wonders ?? {}).filter(([, w]) => w.hallId === h.id).map(([id]) => WONDERS[id as WonderId].name).join(', ') || (p.wonder ? `building the ${WONDERS[p.wonder as WonderId].name}` : 'none')}</span><span class="bout">one per game, in the capital</span>
        <button class="ghost upb" data-a="wonders">All wonders</button></div>`] : []),
      ...(coastal(s, h.id) ? [`<div class="brow"><span class="bico">⛵</span><span class="bname"><b>Sea routes</b> · ${routesOf(s, h.id).length}/${SEA_ROUTE.perCity}</span><span class="bout">${routesOf(s, h.id).map((r) => `${esc(s.halls[r.a === h.id ? r.b : r.a]?.name ?? '')} +${seaRouteGold(r.cells.length)}`).join(' · ') || 'gold from trade by sea'}</span>
        ${routesOf(s, h.id).length < SEA_ROUTE.perCity ? `<button class="ghost upb" data-a="searoute:${h.id}">New</button>` : '<span class="bstate">✓</span>'}</div>`] : []),
      ...cells.map((c) => {
        const k = key(c.hex);
        if (!c.building) return `<div class="brow"><span class="bico">${iconSvg('clock', 22)}</span><span class="bname"><b>Construction</b></span><span class="bout">${state((j) => j.kind === 'resource' && key(j.hex) === k) || 'in progress'}</span></div>`;
        const b = c.building;
        const out = buildingOutput(s, ME, c);
        const income = (['food', 'wood', 'gold'] as const).filter((r) => out[r]).map((r) => `+${amount(r, out[r])}`).join(' ');
        const top = maxLevelAt(s, ME, c, b.kind) || 5;
        return `<div class="brow"><span class="bico">${iconSvg(b.kind, 24)}</span><span class="bname"><b>${BUILDING_NAME[b.kind]}</b> · level ${b.level}</span><span class="bout">${income} per turn</span>
          ${b.level < top ? up(`up:${k}`, `→ ${b.level + 1}`, resourceCost(s, ME, b.kind, b.level + 1), state((j) => j.kind === 'resource' && key(j.hex) === k)) : '<span class="bstate">top level</span>'}</div>`;
      }),
    ];
    return `<div class="cityhead"><button class="ghost navb" data-a="city:prev" ${n < 2 ? 'disabled' : ''}>‹</button>
        <div class="cityheadmid">${crest(h.level)}<div><h2>${esc(h.name)}</h2><small class="muted">${i + 1} / ${n} · swipe for other cities</small></div></div>
        <button class="ghost navb" data-a="city:next" ${n < 2 ? 'disabled' : ''}>›</button></div>
      <div class="autorow"><span>Auto-development</span><div class="seg">${([['off', 'Off'], ['economy', 'Economy'], ['army', 'Army']] as const)
        .map(([k, l]) => `<button data-a="auto:${h.id}:${k}" class="${(h.auto ?? 'off') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${h.auto ? `<p class="muted autonote">${h.auto === 'army' ? 'Each turn the city builds barracks, mines and farms for the army' : 'Each turn the city builds farms, sawmills and mines and grows'}.</p>` : ''}
      <div class="blist">${rows.join('')}</div>
      ${cells.length ? '' : '<p class="muted">No farms, sawmills or mines yet: tap a cell on this city\u2019s land to build.</p>'}
      <div class="acts">${btn(`goto-city:${h.id}`, 'Show on map', '')}${btn('close', 'Close', '')}</div>`;
  };
  const citiesMenu = async () => {
    for (;;) {
      const halls = playerHalls(s, ME).sort((a, b) => a.order - b.order);
      if (!halls.length) return;
      cityIdx = (cityIdx + halls.length) % halls.length;
      modal(cityPanel(halls[cityIdx].id, cityIdx, halls.length));
      const c = await ask();
      if (c === 'close') { modal(null); return; }
      if (c === 'city:prev') { cityIdx--; continue; }
      if (c === 'city:next') { cityIdx++; continue; }
      if (c.startsWith('goto-city:')) { const h = s.halls[c.slice(10)]; modal(null); sel = { hex: { ...h.hex } }; refresh(); glideTo(h.hex); return; }
      if (c.startsWith('auto:')) {
        const [, hid, mode] = c.split(':');
        setAuto(s, ME, hid, mode === 'off' ? undefined : mode as AutoFocus);
        if (mode !== 'off') { const n = autoDevelop(s, ME).length; if (n) toast(`${s.halls[hid].name}: ${n} order${n > 1 ? 's' : ''} given`); }
        saveGame(s); refresh();
        continue;
      }
      await handleAction(c);
    }
  };
  app.querySelector('#citiesbtn')!.addEventListener('click', () => { if (!busy) { tap(); void citiesMenu(); } });
  // свайп по окну меню городов листает города
  let swipeX: number | null = null;
  app.querySelector('#dialog')!.addEventListener('touchstart', (e) => { swipeX = (e as TouchEvent).touches[0].clientX; }, { passive: true });
  app.querySelector('#dialog')!.addEventListener('touchend', (e) => {
    if (swipeX === null) return;
    const dx = (e as TouchEvent).changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) < 50) return;
    app.querySelector<HTMLButtonElement>(`#dialog button[data-a="city:${dx < 0 ? 'next' : 'prev'}"]`)?.click();
  });

  // ---------- Тактика: исследования для новых генералов ----------
  /** Дерево технологий: касание узла показывает его описание и кнопку исследования. */
  const tactics = async () => {
    let picked: string | undefined;
    for (;;) {
      const nodes = techNodes(s, ME);
      picked ??= (nodes.find((n) => n.state === 'active') ?? nodes.find((n) => n.state === 'open') ?? nodes[0]).id;
      const n = nodes.find((x) => x.id === picked)!;
      const info = n.state === 'done' ? '<p class="muted">Researched.</p>'
        : n.state === 'active' ? `<p class="withico">${iconSvg('clock', 16)}Researching · ${left(n.finish!)}</p>`
          : n.state === 'locked' ? `<p class="muted">First research ${nodes.filter((x) => n.needs.includes(x.id)).map((x) => x.name).join(', ')}.</p>`
            : `<div class="acts">${btn(`learn:${n.id}`, `Research ${n.name}`, `${cost(n.cost)} · ${n.turns} turn${n.turns > 1 ? 's' : ''}`)}</div>`;
      modal(`<h2 class="withico">${iconSvg('tactics', 24)}Technology tree</h2>
        ${techTreeHtml(nodes, picked)}
        <div class="techinfo"><b>${esc(n.name)}</b><p>${esc(n.text)}</p>${/^t\d$/.test(n.id) ? `<p class="muted">Next general: ELO ${recruitElo(s, ME)}. Research needs no builder.</p>` : ''}${info}</div>
        <div class="acts">${btn('close', 'Close', '')}</div>`);
      const c = await ask();
      if (c.startsWith('tech:')) { picked = c.slice(5); continue; }
      if (c.startsWith('learn:')) {
        const id = c.slice(6);
        act(/^t\d$/.test(id) ? startResearch(s, ME) : startTech(s, ME, id as TechId));
        continue;
      }
      modal(null);
      return;
    }
  };
  app.querySelector('#tactics')!.addEventListener('click', () => { if (!busy) { tap(); void tactics(); } });

  const modal = (html: string | null) => {
    const m = app.querySelector<HTMLElement>('#modal')!;
    if (html !== null && m.hidden) page(); // меню открывается — шелест страницы
    m.hidden = html === null;
    if (html !== null) app.querySelector('#dialog')!.innerHTML = html;
  };

  const ask = () => new Promise<string>((resolve) => {
    app.querySelector('#dialog')!.addEventListener('click', function on(ev) {
      const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
      if (!b) return;
      app.querySelector('#dialog')!.removeEventListener('click', on);
      resolve(b.dataset.a!);
    });
  });

  /** Бой с участием игрока: атака (игрок белыми) или защита от ИИ (игрок чёрными). */
  const fightBattle = async (attackerId: string, defenderId: string, defending: boolean): Promise<void> => {
    const att = s.generals[attackerId], def = s.generals[defenderId];
    const city = Object.values(s.halls).find((h) => key(h.hex) === key(def.hex));
    const title = city ? `Battle for ${city.name}` : 'Battle';
    const mineG = defending ? def : att, foeG = defending ? att : def;
    const me = { name: 'Your general', color: ownerColor(s, ME)!, elo: mineG.elo, stars: mineG.stars };
    const foe = { name: ownerName(s, foeG.owner), color: ownerColor(s, foeG.owner)!, elo: foeG.elo, stars: foeG.stars };
    /** Сторона боя: портрет, имя, ELO, цвет фигур и армия жетонами. */
    const side = (g: GameState['generals'][string], name: string, color: string, white: boolean, mineSide: boolean) => {
      const nat = s.players[g.owner]?.nation;
      const pic = nat ? portraitSvg(nat, g.name, 58) : `<span class="genglyph">${g.owner === 'bandits' ? '☠' : '🏰'}</span>`;
      return `<div class="btside ${mineSide ? 'me' : 'foe'}" style="--c:${color}"><span class="genport" style="--c:${color}">${pic}</span>
        <b>${esc(name)}</b><span class="genmeta"><span class="elo">ELO ${g.elo}</span>${g.stars ? `<span class="gstars">${'★'.repeat(g.stars)}</span>` : ''}</span>
        <small>${white ? '♔ White' : '♚ Black'}</small>${armyTokens(g.army, white)}</div>`;
    };
    const vs = () => `<div class="btvs">${side(mineG, defending ? 'Your general' : 'Your general', me.color, !defending, true)}<span class="btx">VS</span>${side(foeG, foe.name, foe.color, defending, false)}</div>`;
    const show = (body: string) => modal(`<div class="battle"><div class="bthead"><span class="btico">⚔</span><h2>${esc(title)}</h2></div>${body}</div>`);
    show(`${vs()}${defending ? '<p class="muted btnote">The enemy attacks: you play Black.</p>' : ''}<div class="ctiles">${defending
      ? `${ctile('manual', '♟', 'Defend it yourself', null, 'you command Black on the board', 'ctop')}${ctile('auto', '⚙', 'Let your general defend', null, 'the generals play it out')}`
      : `${ctile('manual', '♟', 'Play it yourself', null, 'you command White on the board', 'ctop')}${ctile('auto', '⚙', 'Auto battle', null, 'the generals play it out')}${ctile('cancel', '↩', 'Retreat', null, 'cancel the attack')}`}</div>`);
    const choice = await ask();
    if (choice === 'cancel') { modal(null); return; }
    let rec: BattleRecord;
    try {
      if (choice === 'manual') {
        modal(null);
        rec = await playManual(app, s, attackerId, defenderId, me, foe, title, defending ? 'black' : 'white');
      } else {
        show(`${vs()}<div class="btprog"><span class="btspin">♞</span><p class="big" id="ply">Move 0</p><p class="muted">The generals are playing the battle…</p></div>`);
        rec = await autobattle(s, attackerId, defenderId, (n) => {
          const el = app.querySelector('#ply'); if (el) el.textContent = tr(`Move ${Math.ceil(n / 2)}`);
        });
      }
    } catch (e) {
      show(`<p class="bad">${esc(String((e as Error).message ?? e))}</p><div class="acts">${btn('close', 'Close', '')}</div>`);
      await ask();
      modal(null);
      return;
    }
    const mineId = mineG.id, foeId = foeG.id;
    const before = { ...mineG.army }, foeArmyBefore = { ...foeG.army };
    const myBefore = armyValue(mineG.army), foeBefore = armyValue(foeG.army);
    const vsBandits = [attackerId, defenderId].some((id) => s.generals[id]?.owner === 'bandits');
    const out = resolveBattle(s, attackerId, defenderId, rec.report);
    saveGame(s);
    const iWon = out.winner === (defending ? 'defender' : 'attacker');
    const headline = out.winner === null ? (vsBandits ? 'The bandits scattered' : defending ? 'The attack is repelled' : 'Draw') : iWon ? 'Victory' : 'Defeat';
    const mood = out.winner === null ? (defending || vsBandits ? 'win' : 'draw') : iWon ? 'win' : 'lose';
    const mine = s.generals[mineId];
    const lost = mine ? PIECES.reduce((n, x) => n + Math.max(0, before[x] - mine.army[x]), 0) : null;
    /** Потери стороны: каждая фигура жетоном — уцелевшие яркие, павшие серые и перечёркнутые. */
    const losses = (name: string, color: string, b: GameState['generals'][string]['army'], after: GameState['generals'][string]['army'] | null, white: boolean) => {
      const toks: string[] = [];
      let dead = 0, alive = 0;
      const kingAlive = !!after;
      toks.push(`<span class="ltok ${kingAlive ? '' : 'dead'}">${pieceHtml(white, 'k')}</span>`);
      if (kingAlive) alive++; else dead++;
      for (const x of PIECES) for (let i = 0; i < b[x]; i++) {
        const ok = !!after && i < after[x];
        if (ok) alive++; else dead++;
        toks.push(`<span class="ltok ${ok ? '' : 'dead'}">${pieceHtml(white, x)}</span>`);
      }
      return `<div class="lside" style="--c:${color}"><div class="lhead"><b>${esc(name)}</b><span class="lcount"><span class="lalive">♥ ${alive} survived</span><span class="ldead">✝ ${dead} fallen</span></span></div>
        <div class="lbar"><i style="width:${Math.round((alive / Math.max(1, alive + dead)) * 100)}%"></i></div><div class="ltoks">${toks.join('')}</div></div>`;
    };
    const foeNow = s.generals[foeId];
    for (;;) {
      show(`<div class="btres ${mood}"><span class="btcrown">${mood === 'win' ? '♛' : mood === 'lose' ? '⚑' : '⚖'}</span><p class="bthl">${headline}</p><p>${esc(out.note)}</p></div>
        ${losses(defending ? 'Your army' : 'Your army', me.color, before, mine ? mine.army : null, !defending)}
        ${losses(foe.name, foe.color, foeArmyBefore, foeNow ? foeNow.army : null, defending)}
        <div class="ctiles">${ctile('replay', '▶', 'Watch replay', null, 'step through the game')}${ctile('close', '✓', 'Continue', null, '', 'ctop')}</div>`);
      if (await ask() !== 'replay') break;
      modal(null);
      const white = defending ? foe : me, black = defending ? me : foe;
      await showReplay(app, rec, white, black, title, defending);
    }
    modal(null);
    if (iWon && out.chest) await chestScreen(out.chest);
    const left2 = mine ? PIECES.reduce((n, x) => n + mine.army[x], 0) + 1 : 0; // +1 — король
    note(s, ME, { battle: { won: iWon, lost: out.winner !== null && !iWon, generalLost: !s.generals[mineId] } });
    achieve({ won: iWon, myBefore, foeBefore, myPieces: left2, lost: lost ?? 99, vsBandits, epic: out.chest?.rarity === 'epic' });
  };

  /** Достижения династии: проверить и показать золотую плашку. */
  const achieve = (b?: BattleNote) => {
    if (!s.players[ME]?.alive) return;
    const lv = level();
    const got = checkAchievements(s, ME, b);
    if (got.length || level() > lv) announce(app, got, lv);
  };

  /** Сундук трофеев: сундук трясётся, крышка открывается, из света появляется награда. */
  const chestScreen = async (r: ChestReward) => {
    const icon = r.kind === 'gold' ? iconSvg('gold', 46) : r.kind === 'supplies' ? `${iconSvg('wood', 40)}${iconSvg('food', 40)}`
      : r.kind === 'piece' ? `<span class="chestpiece">${{ p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }[r.piece]}\uFE0E</span>` : iconSvg('tactics', 46);
    modal(`<div class="chest ${r.rarity}">
        <div class="chestbox">${CHEST_SVG}</div>
        <div class="chestprize"><span class="prizeico">${icon}</span><b>${esc(chestText(r)[0].toUpperCase() + chestText(r).slice(1))}</b>
          <small>${r.rarity === 'epic' ? 'Epic find' : r.rarity === 'rare' ? 'Rare find' : 'Spoils of war'}</small></div>
      </div><div class="acts">${btn('close', 'Take it', '')}</div>`);
    chestOpen(r.rarity);
    await ask();
    modal(null);
    refresh();
  };

  const startBattle = async (attackerId: string, defenderId: string) => {
    busy = true;
    await fightBattle(attackerId, defenderId, false);
    busy = false;
    await annexPrompt();
    sel = { hex: s.generals[attackerId]?.hex, gid: s.generals[attackerId] ? attackerId : undefined };
    refresh();
    checkEnd();
  };

  /** Ход разбойников: набеги считаются сразу, бои с ними — как бои ИИ (на тебя — ты защищаешься). */
  const banditsPhase = async () => {
    for (const a of banditsTurn(s)) {
      if (!s.generals[a.gid]) continue;
      const r = attack(s, a.gid, a.target);
      if (r.kind !== 'battle') continue;
      const def = s.generals[r.defender];
      if (def.owner === ME) {
        veil(false);
        refresh(); view.centerOn(def.hex); draw();
        await fightBattle(r.attacker, r.defender, true);
        veil(true, 'bandits');
        continue;
      }
      const victim = hasMet(s, ME, def.owner) ? ownerName(s, def.owner) : 'an unknown nation';
      banner(`Bandits attack ${victim}…`);
      const rec = await autobattle(s, r.attacker, r.defender, (n) => banner(`Bandits attack ${victim} · move ${Math.ceil(n / 2)}`), true);
      resolveBattle(s, r.attacker, r.defender, rec.report);
    }
  };

  /** Ход компьютерной страны: экономика, затем походы и бои. Бои ИИ против ИИ и нейтралов идут без показа. */
  const aiTurn = async (pid: string) => {
    const name = hasMet(s, ME, pid) ? ownerName(s, pid) : 'An unknown ruler';
    aiEconomyTurn(s, pid);
    for (const a of aiMilitaryTurn(s, pid)) {
      const r = attack(s, a.gid, a.target);
      if (r.kind !== 'battle') continue;
      const def = s.generals[r.defender];
      const target = Object.values(s.halls).find((h) => key(h.hex) === key(def.hex))?.name;
      if (def.owner === ME) {
        veil(false);
        refresh();
        view.centerOn(def.hex);
        draw();
        await fightBattle(r.attacker, r.defender, true);
        veil(true, pid);
        continue;
      }
      // название чужого города — только если игрок его видел
      const title = `${name}: battle${target && hasMet(s, ME, def.owner) ? ` for ${target}` : ''}`;
      banner(`${title}…`);
      const defName = ownerName(s, def.owner);
      const rec = await autobattle(s, r.attacker, r.defender, (n) => banner(`${title} · move ${Math.ceil(n / 2)}`), true);
      const out = resolveBattle(s, r.attacker, r.defender, rec.report);
      say(s, `${out.winner === 'attacker' ? 'defeated' : out.winner === 'defender' ? 'was beaten by' : 'was repelled by'} ${defName}${target ? ` at ${target}` : ''}`, pid);
    }
  };

  /** Конец кампании: итоги с графиками, потом — в меню (сохранение удаляется). */
  const finish = async (how: 'victory' | 'defeat' | 'end') => {
    busy = true;
    modal(null);
    clearSave();
    if (s.history?.at(-1)?.turn !== s.turn) recordHistory(s); // последняя точка графиков — сейчас
    const xp = finishCampaign(s, ME, how);
    await showSummary(app, s, ME, how, xp);
    exit();
  };

  const checkEnd = () => {
    if (s.campaign) { // глава кампании: своя цель и срок
      const v = verdict(s, ME);
      if (v) void finishChapter(v);
      else goalPill();
      return;
    }
    const w = winner(s);
    if (!s.players[ME].alive) void finish('defeat');
    else if (w === ME) void finish('victory');
  };

  // ---------- кампания «Хроники империй» ----------
  const goalPill = () => {
    const el = app.querySelector<HTMLButtonElement>('#goalpill')!;
    const ch = chapterOf(s);
    el.hidden = !ch;
    if (!ch) return;
    const limit = ch.goal.kind === 'hold' || ch.goal.kind === 'strongest' ? '' : ` · turn ${s.turn}/${ch.limit}`;
    el.innerHTML = `🎯 ${esc(ch.goalText)} · <b>${esc(progress(s, ME))}</b>${limit}`;
  };
  const briefing = async (again = false) => {
    const ch = chapterOf(s);
    if (!ch) return;
    modal(`<div class="brief"><p class="muted">Chapter ${ch.id} · ${esc(ch.era)}</p><h2>${esc(ch.name)}</h2><span class="chflag">${flagSvg(ch.nation, 64)}</span>
      <p class="chstory">${esc(ch.story)}</p>
      <div class="goalbox"><span>🎯 <b>${esc(ch.goalText)}</b>${ch.goal.kind === 'hold' || ch.goal.kind === 'strongest' ? '' : ` — by turn ${ch.limit}`}</span>
        <span>Progress: <b>${esc(progress(s, ME))}</b></span>
        <span>★ the goal · ★★ ${esc(ch.star2.text)} · ★★★ never lose a city${s.campaign?.lostCity ? ' (already lost)' : ''}</span></div></div>
      <div class="acts">${btn('close', again ? 'Back to the map' : 'To battle!', '')}${again ? btn('quit', 'Abandon the chapter', 'the game ends without stars') : ''}</div>`);
    const c = await ask();
    modal(null);
    if (!again && s.campaign) { s.campaign.briefed = true; saveGame(s); }
    if (c === 'quit') void finishChapter('lost');
  };
  const finishChapter = async (v: 'won' | 'lost') => {
    busy = true;
    modal(null);
    clearSave();
    if (s.history?.at(-1)?.turn !== s.turn) recordHistory(s);
    const ch = chapterOf(s)!;
    const res = v === 'won' ? completeChapter(s, ME) : null;
    const xp = finishCampaign(s, ME, 'end', res?.lines ?? []);
    await showSummary(app, s, ME, 'end', xp, v === 'won'
      ? { head: `${ch.name}: ${'★'.repeat(res!.stars)}${'☆'.repeat(3 - res!.stars)}`, sub: `Chapter ${ch.id} complete on turn ${s.turn}.${res!.special ? ' A special feat is yours!' : ''}${ch.id < 8 ? ` Chapter ${ch.id + 1} is open.` : ' The Chronicles are complete.'}` }
      : { head: `${ch.name}: defeat`, sub: s.players[ME].alive ? `The goal was not reached in time (turn ${s.turn}). Try the chapter again.` : `Your realm fell on turn ${s.turn}. Try the chapter again.` });
    exit();
  };

  // ---------- ход ----------
  app.querySelector('#end')!.addEventListener('click', async () => {
    if (busy) return;
    tap();
    // армия с непотраченными ходами и без приказа: показываем её и напоминаем; повторное нажатие завершает ход
    const idle = Object.values(s.generals).find((g) => g.owner === ME && g.moveLeft > 0 && !g.attacked && !g.order);
    if (idle && warnedTurn !== s.turn) {
      warnedTurn = s.turn;
      sel = { hex: idle.hex, gid: idle.id };
      glideTo(idle.hex);
      refresh();
      toast(idle.settler ? 'This settler has not moved yet. Move him, found a city, hold — or press End turn again.' : 'This army has not moved yet. Move it, give it an order (march, explore, hold) — or press End turn again.');
      return;
    }
    busy = true;
    const from = s.log.length;
    sel = {};
    refresh();
    // приказы генералов (поход, разведка, патруль) выполняются сейчас — после того как игрок сходил сам
    const was = new Map(Object.values(s.generals).filter((g) => g.owner === ME).map((g) => [g.id, { ...g.hex }]));
    const marched = runOrders(s, ME);
    for (const [id, h] of was) { const g = s.generals[id]; if (g && key(g.hex) !== key(h)) view.slide(id, [h, g.hex]); }
    saveGame(s);
    if (marched.length) { draw(); await sleep(450); }
    await interceptions(marched);
    if (!s.players[ME].alive || winner(s)) { busy = false; refresh(); checkEnd(); return; }
    endTurn(s);
    try {
      while (s.order[s.current] !== ME && s.players[ME].alive && !winner(s)) {
        const pid = s.order[s.current];
        veil(true, pid);
        banner(`${hasMet(s, ME, pid) ? ownerName(s, pid) : 'An unknown ruler'} is thinking…`);
        const t0 = performance.now();
        await aiTurn(pid);
        await sleep(Math.max(0, 450 - (performance.now() - t0))); // чтобы глаз успевал заметить каждую страну
        endTurn(s);
      }
      if (s.players[ME].alive && !winner(s)) {
        veil(true, 'bandits');
        banner('Bandits roam the land…');
        const t0 = performance.now();
        await banditsPhase();
        await sleep(Math.max(0, 400 - (performance.now() - t0)));
        veil(true, ME);
        banner('Your turn');
        await sleep(350);
      }
    } catch (e) {
      toast(`AI turn error: ${(e as Error).message ?? e}`);
    }
    veil(false);
    busy = false;
    saveGame(s);
    const news = s.log.slice(from).filter((e) => e.player === ME || /captured|out of the game|siege of/.test(e.text));
    const notes = [...news.map((e) => `${e.player && e.player !== ME ? (hasMet(s, ME, e.player) ? ownerName(s, e.player) : 'An unknown nation') + ': ' : ''}${e.text[0].toUpperCase()}${e.text.slice(1)}`), ...marched.map((m) => `General ${m.text}`)];
    if (notes.length) toast(notes.map((n) => `• ${n}`).join('\n'));
    const stopped = marched.find((m) => s.generals[m.gid] && !m.attack && /stopped|blocked/.test(m.text));
    if (stopped) { sel = { hex: s.generals[stopped.gid].hex, gid: stopped.gid }; glideTo(s.generals[stopped.gid].hex); }
    sel = { hex: sel.hex, gid: sel.gid && s.generals[sel.gid] ? sel.gid : undefined };
    refresh();
    checkEnd();
    void eventCard().then(offerCard).then(annexPrompt);
  });

  /** Событие хода: карточка с рисунком и вариантами. Беды без выбора — просто сообщение. */
  const eventCard = async () => {
    const ev = s.players[ME]?.event;
    if (!ev || !s.players[ME].alive) return;
    if (ev.hallId) glideTo(s.halls[ev.hallId].hex);
    for (;;) {
      modal(`<div class="evcard ev-${ev.kind}"><div class="evart">${EVENT_ART[ev.kind]}</div><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p></div>
        <div class="acts">${ev.choices.map((c) => {
          const off = (c.id === 'suppress' && !canSuppress(s, ME, ev.hallId!)) || (c.id === 'hire' && s.players[ME].res.gold < MERCENARY_GOLD);
          return btn(`ev:${c.id}`, c.label, c.text).replace('class="act"', `class="act${off ? ' off' : ''}"`);
        }).join('')}</div>`);
      const c = (await ask()).slice(3);
      if (c === 'suppress' && !canSuppress(s, ME, ev.hallId!)) { toast('No army of yours stands in or next to the city.'); continue; }
      modal(null);
      const res = answerEvent(s, ME, c);
      if (res) toast(`${ev.title}: ${res}.`);
      saveGame(s);
      refresh();
      return;
    }
  };

  // ---------- касания и камера ----------
  const onTap = (px: number, py: number) => {
    const h = view.toHex(px, py);
    const k = key(h);
    if (!s.cells[k] || busy) return;
    tap();
    // клетка, куда выбранный генерал может пойти или напасть: открываем её, а действие — кнопкой в панели
    if (sel.gid && sel.hex && key(sel.hex) !== k) {
      const d = reachable(s, sel.gid).get(k);
      if (d && d > 0) { sel = { hex: h, gid: sel.gid, target: 'move' }; refresh(); return; }
      if (attackTargets(s, sel.gid).has(k)) { sel = { hex: h, gid: sel.gid, target: 'attack' }; refresh(); return; }
      // дальняя клетка: открываем её и предлагаем отправить туда генерала походом
      const own = Object.values(s.generals).some((g) => g.owner === ME && key(g.hex) === k);
      // если генерал уже идёт походом, касание другой клетки просто открывает её (маршрут не меняется)
      if (!own && s.generals[sel.gid].owner === ME && s.generals[sel.gid].order?.kind !== 'goto') { sel = { hex: h, gid: sel.gid, target: 'goto' }; refresh(); return; }
    }
    // повторные касания перебирают своих на клетке (генерал, поселенец), а затем сам город
    const units = Object.values(s.generals).filter((g) => g.owner === ME && key(g.hex) === k).sort((a, b) => Number(!!a.settler) - Number(!!b.settler));
    // город или своё здание (в том числе стройка) на клетке — после юнитов выбирается оно
    const hallHere = Object.values(s.halls).some((x) => key(x.hex) === k);
    const placeHere = hallHere || (s.cells[k].owner === ME && (!!s.cells[k].building || !!s.cells[k].reserved));
    // после своих юнитов — сама клетка (город, здание или просто земля, на которой стоит генерал)
    const seq: (string | undefined)[] = [...units.map((g) => g.id), undefined];
    void placeHere;
    const same = sel.hex && key(sel.hex) === k;
    const at = same ? seq.indexOf(sel.gid) : -1;
    sel = { hex: h, gid: seq[(at + 1) % seq.length] };
    refresh();
  };

  /** Патрульные, что подошли к врагу у своих городов, — по очереди в бой. */
  const interceptions = async (ev: { gid: string; text: string; attack?: Hex }[]) => {
    for (const m of ev) {
      const g = s.generals[m.gid];
      if (!m.attack || !g || g.attacked) continue;
      glideTo(g.hex);
      sel = { hex: g.hex, gid: g.id };
      refresh();
      const foe = Object.values(s.generals).find((x) => key(x.hex) === key(m.attack!) && x.owner !== ME);
      const near = playerHalls(s, ME).sort((a, b) => distance(a.hex, m.attack!) - distance(b.hex, m.attack!))[0];
      toast(`🛡 General ${g.name} intercepts the enemy${near ? ` near ${near.name}` : ''}!`);
      void foe;
      await sleep(600);
      const r = attack(s, g.id, m.attack);
      if (r.kind === 'battle') { await fightBattle(r.attacker, r.defender, false); await annexPrompt(); refresh(); }
      else if (r.kind === 'killed') { saveGame(s); toast('The enemy settler is killed.'); refresh(); }
      if (!s.players[ME].alive || winner(s)) return;
    }
  };

  const doMove = () => {
    const h = sel.hex!, gid = sel.gid!;
    const path = findPath(s, gid, h);
    const r = move(s, gid, h);
    if (r.ok && path) view.slide(gid, path);
    if (r.ok) { const ok = s.generals[gid].order?.kind; if (ok !== 'hold' && ok !== 'patrol') s.generals[gid].order = undefined; sel = { hex: h, gid }; saveGame(s); } else toast((r as { reason: string }).reason);
    refresh();
  };

  const doAttack = () => {
    const h = sel.hex!, gid = sel.gid!;
    s.generals[gid].order = undefined;
    const r = attack(s, gid, h);
    if (r.kind === 'battle') { startBattle(r.attacker, r.defender); return; }
    if (r.kind === 'killed') { saveGame(s); toast('The enemy settler is killed.'); sel = { hex: s.generals[gid].hex, gid }; refresh(); return; }
    if (r.kind === 'siege') {
      saveGame(s);
      toast('Siege begins: the city falls at the start of your next turn unless reinforcements arrive.');
      sel = {};
      refresh();
      return;
    }
    toast(r.reason);
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false, startX = 0, startY = 0, pinch = 0;
  let vx = 0, vy = 0, lastT = 0, fling = 0; // скорость пальца — для инерции после свайпа
  canvas.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(fling); cancelAnimationFrame(glide); vx = vy = 0; lastT = performance.now();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) { dragged = false; startX = e.offsetX; startY = e.offsetY; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d; dragged = true; vx = vy = 0; drawView(); return;
    }
    if (Math.hypot(e.offsetX - startX, e.offsetY - startY) > 6) dragged = true;
    if (dragged) {
      const dx = e.offsetX - prev.x, dy = e.offsetY - prev.y, now = performance.now(), dt = Math.max(1, now - lastT);
      vx = 0.7 * (dx / dt) + 0.3 * vx; vy = 0.7 * (dy / dt) + 0.3 * vy; lastT = now;
      view.ox += dx; view.oy += dy; drawView();
    }
  });
  const up = (e: PointerEvent) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (wasSingle && !dragged) onTap(e.offsetX, e.offsetY);
    // инерция: карта ещё немного катится после быстрого свайпа
    if (wasSingle && dragged && performance.now() - lastT < 80 && Math.hypot(vx, vy) > 0.25) {
      let last = performance.now();
      const roll = () => {
        const now = performance.now();
        const dt = Math.min(48, Math.max(0, now - last)); last = now; // после паузы не «выстреливает»
        view.ox += vx * dt; view.oy += vy * dt;
        const k = Math.pow(0.94, dt / 16); vx *= k; vy *= k;
        view.draw(s, ME, seenCache, hlCache);
        if (Math.hypot(vx, vy) > 0.02) fling = requestAnimationFrame(roll);
      };
      fling = requestAnimationFrame(roll);
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; });
  canvas.addEventListener('lostpointercapture', (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; });
  // приложение ушло в фон или вернулось: забываем «зависшие» пальцы и останавливаем все движения камеры и армий —
  // иначе после долгого простоя карта могла начать сама крутиться и прыгать
  const calm = () => {
    pointers.clear(); pinch = 0; dragged = false; vx = vy = 0;
    cancelAnimationFrame(fling); cancelAnimationFrame(glide);
    view.stopAnimations();
    if (app.isConnected) view.draw(s, ME, seenCache, hlCache);
  };
  document.addEventListener('visibilitychange', calm);
  window.addEventListener('pageshow', calm);
  (window as unknown as { Telegram?: { WebApp?: { onEvent?: (e: string, f: () => void) => void } } }).Telegram?.WebApp?.onEvent?.('activated', calm);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.offsetX, e.offsetY); drawView(); }, { passive: false });

  const tut = startTutorial(app, s, ME);
  const refresh = () => { bar(); sheet(); draw(); tut.update(); achieve(); };
  window.addEventListener('resize', () => draw());

  const capital = Object.values(s.halls).filter((h) => h.owner === ME).sort((a, b) => a.order - b.order)[0];
  const g0 = playerGenerals(s, ME)[0];
  sel = capital ? { hex: capital.hex, gid: g0 && key(g0.hex) === key(capital.hex) ? g0.id : undefined } : g0 ? { hex: g0.hex, gid: g0.id } : {};
  if (s.turn === 1 && s.players[ME].startBonus && !s.players[ME].outlaw) requestAnimationFrame(() => toast(`Start bonus: ${s.players[ME].startBonus}`));
  if (s.players[ME].outlaw && !capital && s.turn === 1) requestAnimationFrame(() => toast('You are outlaws: no crown recognises you and every nation is your enemy. Take a city by force — it becomes the seat of your kingdom.'));
  bar(); sheet();
  // центрируем после того, как нижняя панель заполнилась и карта получила свой настоящий размер
  requestAnimationFrame(() => {
    if (capital) view.centerOn(capital.hex); else if (g0) view.centerOn(g0.hex);
    draw();
    checkEnd();
    const brief = s.campaign && !s.campaign.briefed ? briefing() : Promise.resolve();
    void brief.then(eventCard).then(offerCard).then(annexPrompt);
  });
  app.querySelector<HTMLButtonElement>('#goalpill')!.onclick = () => { if (!busy) { tap(); void briefing(true); } };
  (window as unknown as { __cc?: unknown }).__cc = { view, state: s, chest: chestScreen, api: { seaRouteTargets, buildSeaRoute, refresh: () => refresh() } }; // для автотестов в браузере
};
