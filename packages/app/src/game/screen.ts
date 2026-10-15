// Экран партии: карта, верхняя панель (казна, ход), нижняя панель действий, бои, ход ИИ.

import { iconSvg, iconsReady } from './icons.ts';
import { flagSvg } from './flags.ts';
import { portraitSvg } from './portraits.ts';
import { startTutorial } from './tutorial.ts';
import {
  BARRACKS, BUILD_TURNS, BUILDING_TERRAIN, GENERAL_HIRE_GOLD, HIRE_LEVEL, NATIONS, PIECE_PRICE, RESEARCH, RESOURCE_COST,
  RESOURCE_OUTPUT, TAVERN, TOWN_HALL_FOUND, TOWN_HALL_UPGRADE, BUILDER_HIRE_FOOD, BUILDER_UPKEEP_FOOD, GENERAL_UPKEEP_FOOD, cityUpgradeCost, tavernCost, PIECES, barracksCost, buildOptions, buildingOutput, maxLevelAt, piecePrice, researchCost, researchTurns, resourceCost, aiEconomyTurn, aiMilitaryTurn, attack, endTurn, say,
  foundTownHall, freeBuilders, hireBuilder, hireGeneral, hirePiece, income, key, maxBuilders, move, playerGenerals,
  reachable, recruitElo, resolveBattle, startResearch, upgrade, upgradeBarracks, upgradeTavern, upgradeTownHall,
  remember, upkeep, visible, winner, build, enqueue, cancelQueued, ELO_PER_RESEARCH, ARMY_MAX, startTech, type TechId, playerHalls, hasMet, jobHall, hallBuilders, banditsTurn, recordHistory, hireSettler, settlerCost, findPath, runOrders, armyMove, startMarch, MARCH_RESEARCH, ARMY_MOVE_MARCH, BUILDING_SLOTS, citySlots, generalLimit, nationStats, type QueueOrder, type Job, type GameState, type Hex, type Piece, type Res, type ResourceBuilding,
} from '../../../core/src/index.ts';
import { autobattle, type BattleRecord } from './battle.ts';
import { playManual, showReplay } from './fight.ts';
import { MapView, attackTargets, ownerColor, type Highlight } from './render.ts';
import { clearSave, saveGame } from './save.ts';
import { showSummary } from './summary.ts';
import { techNodes, techTreeHtml } from './techtree.ts';
import { setBack, tap } from '../tg.ts';

const ME = 'p1';
const PIECE_NAME: Record<Piece, string> = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' };
const BUILDING_NAME: Record<ResourceBuilding, string> = { farm: 'Farm', sawmill: 'Sawmill', mine: 'Gold mine', fishery: 'Fishery' };
const TERRAIN_NAME: Record<string, string> = {
  field: 'Field', forest: 'Forest', deposit: 'Gold deposit', tundra: 'Tundra', desert: 'Desert', mountain: 'Mountains', water: 'Sea',
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const amount = (name: 'wood' | 'food' | 'gold', n: number) => `<i class="amt" title="${name}">${iconSvg(name, 13)}${n}</i>`;
const RES_OF = { farm: 'food', sawmill: 'wood', mine: 'gold', fishery: 'food' } as const;
const cost = (c: Res) => [c.wood && amount('wood', c.wood), c.food && amount('food', c.food), c.gold && amount('gold', c.gold)].filter(Boolean).join(' ') || 'free';
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
      <div class="rmenu"><button id="gensbtn" class="tacbtn"></button><button id="citiesbtn" class="tacbtn"></button></div></div>
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

  const toast = (text: string) => {
    const t = app.querySelector<HTMLElement>('#toast')!;
    t.textContent = text; t.hidden = false;
    clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => (t.hidden = true), Math.min(9000, 2600 + text.length * 35));
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
    : j.kind === 'found' ? 'New city' : j.kind === 'townhall' ? `${s.halls[j.hallId]?.name ?? 'City'} → ${j.level}`
      : `${s.halls[j.hallId]?.name ?? 'City'}: ${j.kind} → ${j.level}`;

  // ---------- верхняя панель ----------
  const bar = () => {
    const p = s.players[ME];
    const inc = income(s, ME);
    const food = inc.food - upkeep(s, ME);
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
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 320), e = 1 - (1 - k) ** 3;
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

  /** Карточка поселенца: где он, основание города, приказы. */
  const settlerCard = (g: typeof s.generals[string], cell: typeof s.cells[string]): string => {
    const mine = g.owner === ME;
    if (!mine) return `<div class="card"><div class="row"><b style="color:${ownerColor(s, g.owner)}">Settler · ${esc(ownerName(s, g.owner))}</b>${s.players[g.owner] ? nationBtn(g.owner) : ''}</div><p class="muted">Unarmed: any army next to him can kill him.</p></div>`;
    const p = s.players[ME];
    const founding = p.jobs.find((j) => j.kind === 'found' && j.general === g.id);
    const m = NATIONS[p.nation].mods;
    const turns = m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns;
    const o = g.order;
    const canFound = !cell.owner && cell.terrain !== 'water' && cell.terrain !== 'mountain';
    return `<div class="card"><div class="row"><b style="color:${ownerColor(s, ME)}">Your settler</b><span class="muted">${founding ? '' : `moves left ${g.moveLeft}`}</span></div>
      <p class="muted">Unarmed: an enemy army next to him can kill him. Walk him to free land and found a city.</p>
      ${sel.gid !== g.id ? '<p class="muted"><b>Tap this cell again</b> to command the settler.</p>' : ''}
      ${founding ? `<p class="withico">${iconSvg('clock', 15)}Founding a city · ${left(founding.finish)}</p>` : `
      ${o ? `<p class="muted"><b>${o.kind === 'goto' ? 'marching' : 'holding position'}</b></p>` : ''}
      <div class="acts">${canFound ? btn(`found:${g.id}`, 'Found a city here', `${turns} turn${turns > 1 ? 's' : ''} · the settler becomes the city`) : ''}
        ${o?.kind === 'goto' ? btn(`order:${g.id}:none`, 'Stop the march', 'he waits for orders') : ''}
        ${btn(`order:${g.id}:${o?.kind === 'hold' ? 'none' : 'hold'}`, o?.kind === 'hold' ? 'Stop holding' : 'Hold position', o?.kind === 'hold' ? 'remind me about him again' : 'stays put; no end-of-turn reminder')}</div>
      ${canFound ? '' : '<p class="muted">Cities are founded on unclaimed land. Tap a far cell to send him there.</p>'}`}</div>`;
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
    if (sel.gid && sel.target === 'move') {
      const d = reachable(s, sel.gid).get(k) ?? 0;
      parts.push(`<div class="acts">${btn('move', 'Move general here', `${d} of ${s.generals[sel.gid].moveLeft} moves`)}</div>`);
    } else if (sel.gid && sel.target === 'goto') {
      const path = findPath(s, sel.gid, sel.hex);
      const mv = armyMove(s, ME);
      parts.push(path && path.length > 1
        ? `<div class="acts">${btn('goto', 'March here', `${path.length - 1} cells · about ${Math.ceil((path.length - 1) / mv)} turn${path.length - 1 > mv ? 's' : ''}; the general walks on his own`)}</div>`
        : '<p class="muted">Your general cannot find a way there.</p>');
    } else if (sel.gid && sel.target === 'attack') {
      const hall = Object.values(s.halls).some((h) => key(h.hex) === k);
      const army = Object.values(s.generals).some((g) => key(g.hex) === k && g.owner !== ME && g.army.p + g.army.n + g.army.b + g.army.r + g.army.q > 0);
      const settlerHere = !army && Object.values(s.generals).some((g) => key(g.hex) === k && g.owner !== ME && g.settler);
      if (settlerHere) parts.push(`<div class="acts">${btn('attack', 'Kill the settler', 'he is unarmed — no battle')}</div>`);
      else parts.push(`<div class="acts">${btn('attack', army ? 'Attack this army' : `Besiege ${esc(Object.values(s.halls).find((h) => key(h.hex) === k)?.name ?? 'the city')}`, army ? 'a chess battle, you play White' : 'it falls in one turn unless reinforced')}</div>`);
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
    if (hallOnCell && ownHere.length && !sel.gid) parts.push(`<p class="muted">${ownHere.length > 1 ? 'Your units are' : `Your ${ownHere[0].settler ? 'settler is' : 'general is'}`} here — tap the cell again to select.</p>`);
    for (const g of gens) {
      const mine = g.owner === ME;
      // своих показываем только выбранного; без выбора на клетке города — сначала город
      if (mine && (sel.gid ? g.id !== sel.gid : hallOnCell)) continue;
      if (g.settler) { parts.push(settlerCard(g, cell)); continue; }
      const army = PIECES.filter((x) => g.army[x]).map((x) => `${g.army[x]} ${PIECE_NAME[x].toLowerCase()}${g.army[x] > 1 ? 's' : ''}`).join(', ') || 'no pieces';
      let html = `<div class="card"><div class="row"><b style="color:${ownerColor(s, g.owner)}">${mine ? `General ${esc(g.name)}` : esc(ownerName(s, g.owner))}</b><span>ELO ${g.elo} ${'★'.repeat(g.stars)}${!mine && s.players[g.owner] ? nationBtn(g.owner) : ''}</span></div>
        <p>King + ${army}</p>`;
      if (mine) {
        const o = g.order;
        const where = o?.kind === 'goto' ? (Object.values(s.halls).find((h) => key(h.hex) === key(o.to))?.name ?? `${TERRAIN_NAME[s.cells[key(o.to)].terrain].toLowerCase()} far away`) : '';
        html += `<p class="muted">White: ${esc(g.white)} · vs 1.e4: ${esc(g.vsE4)} · vs 1.d4: ${esc(g.vsD4)}</p>
          <p class="muted">${g.attacked ? 'Has acted this turn' : `Moves left: ${g.moveLeft}`}${o ? ` · <b>${o.kind === 'goto' ? `marching to ${esc(where)}` : o.kind === 'explore' ? 'exploring' : 'holding position'}</b>` : ''}</p>
          <div class="acts">${o?.kind === 'goto' ? btn(`order:${g.id}:none`, 'Stop the march', 'the general waits for orders') : ''}
            ${btn(`order:${g.id}:${o?.kind === 'explore' ? 'none' : 'explore'}`, o?.kind === 'explore' ? 'Stop exploring' : 'Explore', o?.kind === 'explore' ? 'back to your orders' : 'walks into the unknown by himself every turn')}
            ${btn(`order:${g.id}:${o?.kind === 'hold' ? 'none' : 'hold'}`, o?.kind === 'hold' ? 'Stop holding' : 'Hold position', o?.kind === 'hold' ? 'remind me about him again' : 'stays put; no end-of-turn reminder')}</div>
          <p class="muted">${o?.kind === 'goto' ? 'To change the route, stop the march and tap a new cell.' : 'Tip: tap any far cell to send this general marching there.'}</p>`;
        const home = cell.owner === ME && cell.hall ? s.halls[cell.hall] : undefined;
        if (home) {
          // найм — по казарме города, на чьей земле стоит генерал; кнопки не отключаем: нажатие объясняет, чего не хватает
          const bar = home.barracks ?? 0;
          html += `<p class="muted hirehead">Hire pieces · barracks of <b>${esc(home.name)}</b>: ${bar ? `level ${bar}` : 'none yet — build them in this city'}</p>
            <div class="acts">${PIECES.map((x) => btn(`hire:${g.id}:${x}`, PIECE_NAME[x], `${amount('gold', piecePrice(s, ME, x))}${g.army[x] >= ARMY_MAX[x] ? ` · max ${ARMY_MAX[x]}` : bar < HIRE_LEVEL[x] ? ` · barracks ${HIRE_LEVEL[x]}` : ''}`)
              .replace('class="act"', `class="act${bar >= HIRE_LEVEL[x] && p.res.gold >= piecePrice(s, ME, x) && g.army[x] < ARMY_MAX[x] ? '' : ' off'}"`)).join('')}</div>`;
        } else if (cell.owner === ME) {
          html += '<p class="muted hirehead">Pieces are hired on the land of a city with barracks.</p>';
        }
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
      const jobs = p.jobs.filter((j) => jobHall(s, j) === hall.id).map((j) => `${jobName(j)} (${left(j.finish)})`);
      const queue = (p.queue ?? []).map((q, i) => ({ q, i })).filter(({ q }) => jobHall(s, q.job) === hall.id);
      const thUp = hall.level < 3 ? TOWN_HALL_UPGRADE[(hall.level + 1) as 2 | 3] : null;
      const nb = hallBuilders(hall) + 1;
      const hb = hall.barracks ?? 0, ht = hall.tavern ?? 0;
      const barNext = hb < 5 ? BARRACKS[(hb + 1) as 1 | 2 | 3 | 4 | 5] : null;
      const tavNext = ht < 4 ? TAVERN[(ht + 1) as 1 | 2 | 3 | 4] : null;
      const gCount = playerGenerals(s, ME).length;
      const gCost = gCount < 5 ? Math.max(0, GENERAL_HIRE_GOLD[(gCount + 1) as 2 | 3 | 4 | 5] - (NATIONS[p.nation].mods.generalHireDiscount ?? 0)) : 0;
      parts.push(`<div class="card"><div class="row"><b>${esc(hall.name)} · level ${hall.level}</b><span class="muted">builders ${freeBuilders(s, ME, hall.id)}/${hallBuilders(hall)} free</span></div>
        <div class="acts">
          ${thUp ? btn(`th:${hall.id}`, `City → ${hall.level + 1}`, `${cost(cityUpgradeCost(s, ME, (hall.level + 1) as 2 | 3))} · ${thUp.turns} turn · ${BUILDING_SLOTS[hall.level]} building slots, +1 builder, wider land`) : ''}
          ${nb <= maxBuilders(s, ME, hall.id) ? btn(`builder:${hall.id}`, `Hire builder ${nb}`, `${NATIONS[p.nation].mods.freeBuilderHire ? 'free' : `${amount('food', BUILDER_HIRE_FOOD[nb as 2 | 3])}`} · ${NATIONS[p.nation].mods.freeBuilderUpkeep ? 'eats nothing' : `eats ${amount('food', BUILDER_UPKEEP_FOOD)}/turn`}`) : ''}
          ${barNext ? btn(`barracks:${hall.id}`, hb ? `Barracks → ${hb + 1}` : 'Build barracks', `${cost(barracksCost(s, ME, (hb + 1) as 1 | 2 | 3 | 4 | 5))} · ${barNext.turns} turn${barNext.turns > 1 ? 's' : ''} · ${PIECE_NAME[PIECES[hb]].toLowerCase()}s here`) : ''}
          ${tavNext ? btn(`tavern:${hall.id}`, ht ? `Tavern → ${ht + 1}` : 'Build tavern', `${cost(tavernCost(s, ME, (ht + 1) as 1 | 2 | 3 | 4))} · ${tavNext.turns} turn${tavNext.turns > 1 ? 's' : ''} · up to ${Math.min(5, ht + 2)} generals`) : ''}
          ${btn(`settler:${hall.id}`, 'Train a settler', `${cost(settlerCost(s, ME))} · founds a new city · moves ${armyMove(s, ME)} cells`)}
          ${ht && gCount < generalLimit(s, ME) ? btn(`general:${hall.id}`, 'Hire a general here', `${amount('gold', gCost)} · ELO ${recruitElo(s, ME)} · eats ${amount('food', GENERAL_UPKEEP_FOOD)}/turn`) : ''}
        </div>
        <p class="muted">Buildings on its land ${citySlots(s, hall.id).used}/${citySlots(s, hall.id).max}${hall.level < 3 ? ` · level ${hall.level + 1}: ${BUILDING_SLOTS[hall.level]}` : ''} · Barracks ${hb || '—'} · Tavern ${ht || '—'}</p>
        ${jobs.length ? `<p class="muted withico">${iconSvg('clock', 15)}In progress: ${jobs.map(esc).join('; ')}</p>` : ''}
        ${queue.length ? `<p class="muted">Queued — start when a builder is free:</p><div class="queue">${queue.map(({ q, i }) => `<span>${esc(jobName(q.job))}<button class="ghost" data-a="unqueue:${i}">Cancel</button></span>`).join('')}</div>` : ''}</div>`);
    } else if (hall) {
      parts.push(`<div class="card"><div class="row"><b>${esc(hall.name)} · city level ${hall.level}</b>${s.players[hall.owner] ? nationBtn(hall.owner) : ''}</div><p class="muted">${esc(ownerName(s, hall.owner))}${hall.siege ? ' · under siege' : ''}${hall.barracks ? ` · barracks ${hall.barracks}` : ''}${hall.tavern ? ` · tavern ${hall.tavern}` : ''}</p></div>`);
    }

    // ресурсное здание (если выбран свой генерал на этой клетке — сначала только он)
    if (!hall && cell.owner === ME && unitPicked && (cell.building || cell.reserved)) {
      parts.push(`<p class="muted">Tap the cell again to open the ${cell.building ? BUILDING_NAME[cell.building.kind].toLowerCase() : 'construction'}.</p>`);
    } else if (!hall && cell.owner === ME) {
      const kinds = buildOptions(s, ME, cell).map((o) => o.kind);
      const top = cell.building ? maxLevelAt(s, ME, cell, cell.building.kind) || 5 : 5;
      if (cell.building) {
        const b = cell.building;
        const job = p.jobs.find((j): j is Extract<Job, { kind: 'resource' }> => j.kind === 'resource' && key(j.hex) === k);
        const qi = (p.queue ?? []).findIndex((q) => q.job.kind === 'resource' && key(q.job.hex) === k);
        const busy = !!job || qi >= 0;
        const out = RESOURCE_OUTPUT[b.kind];
        parts.push(`<div class="card"><div class="row"><b class="withico">${iconSvg(b.kind, 20)}${BUILDING_NAME[b.kind]} · level ${b.level}</b><span>${(['food', 'wood', 'gold'] as const).filter((r) => buildingOutput(s, ME, cell)[r]).map((r) => `+${amount(r, buildingOutput(s, ME, cell)[r])}`).join(' ')} per turn</span></div>
          ${b.level < top ? `<div class="acts">${(busy ? `<p class="muted withico">${iconSvg('clock', 15)}${job ? `Upgrading to level ${job.level} · ${left(job.finish)}` : 'Upgrade queued — starts when a builder is free'}</p>${qi >= 0 ? btn(`unqueue:${qi}`, 'Cancel the queued upgrade', 'resources are returned') : ''}` : btn(`up:${k}`, `Upgrade → ${b.level + 1}`, `${cost(resourceCost(s, ME, b.kind, b.level + 1))} · ${BUILD_TURNS[b.level]} turn${BUILD_TURNS[b.level] > 1 ? 's' : ''} · +${amount(RES_OF[b.kind], out[b.level] - out[b.level - 1])}/turn`))}</div>` : '<p class="muted">Top level</p>'}</div>`);
      } else if (cell.reserved) {
        const job = p.jobs.find((j): j is Extract<Job, { kind: 'resource' }> => j.kind === 'resource' && key(j.hex) === k);
        const qi = (p.queue ?? []).findIndex((q) => q.job.kind === 'resource' && key(q.job.hex) === k);
        parts.push(`<div class="card"><p class="muted withico">${iconSvg('clock', 15)}${job ? `${esc(jobName(job))} · ${left(job.finish)}` : qi >= 0 ? `${esc(jobName(p.queue![qi].job))} queued — starts when a builder is free` : 'Construction in progress'}</p>
          ${qi >= 0 ? `<div class="acts">${btn(`unqueue:${qi}`, 'Cancel', 'resources are returned')}</div>` : ''}</div>`);
      } else if (kinds.length && cell.hall && citySlots(s, cell.hall).used >= citySlots(s, cell.hall).max) {
        const h = s.halls[cell.hall], sl = citySlots(s, cell.hall);
        parts.push(`<div class="card"><p><b>${esc(h.name)}</b> has no free building slots (${sl.used}/${sl.max}).</p><p class="muted">${h.level < 3 ? `Grow the city to level ${h.level + 1} for ${BUILDING_SLOTS[h.level]} slots, ` : ''}upgrade the buildings you have, or found a new city.</p></div>`);
      } else if (kinds.length) {
        if (cell.hall) { const sl = citySlots(s, cell.hall); parts.push(`<p class="muted">${esc(s.halls[cell.hall].name)}: ${sl.used}/${sl.max} building slots used</p>`); }
        parts.push(`<div class="acts">${kinds.map((b) => btn(`build:${k}:${b}`, `Build ${BUILDING_NAME[b].toLowerCase()}`, `${cost(resourceCost(s, ME, b, 1))} · 1 turn · +${amount(RES_OF[b], RESOURCE_OUTPUT[b][0])}/turn`)).join('')}</div>`);
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
    else if (a === 'move') doMove();
    else if (a === 'goto') {
      const g = s.generals[sel.gid!];
      g.order = { kind: 'goto', to: { ...sel.hex! } };
      followOrders();
      sel = {}; // приказ отдан — генерал больше не выбран, касания карты маршрут не трогают
      if (s.generals[g.id]?.order) toast('The general is marching. Tap him to see the route or stop the march.');
      refresh();
    }
    else if (a === 'order') { const g = s.generals[x]; g.order = y === 'none' ? undefined : y === 'explore' ? { kind: 'explore' } : { kind: 'hold' }; if (y === 'explore') followOrders(); sel = y === 'none' ? { hex: g.hex, gid: g.id } : {}; saveGame(s); refresh(); }
    else if (a === 'attack') doAttack();
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
  const nationInfo = async (pid: string) => {
    const pl = s.players[pid];
    const n = NATIONS[pl.nation];
    const st = nationStats(s, pid);
    const mineN = pid === ME;
    const rank = (r: number) => `<small>${r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`} of ${st.rank.of}</small>`;
    modal(`<div class="nation-head">${flagSvg(pl.nation, 44)}<div><h2>${esc(n.name)}</h2><p class="muted">${esc(n.bonus)}: ${esc(n.effect)}</p></div></div>
      <div class="ruler">${portraitSvg(pl.nation, st.ruler, 76)}<div><b>${esc(st.ruler)}</b><p class="muted">${mineN ? 'Your ruler' : `Ruler${st.character ? ` · ${st.character}` : ''}`}</p></div></div>
      <div class="stats">
        <div><span>Cities</span><b>${st.cities}</b></div>
        <div><span>Area</span><b>${st.area}</b>${rank(st.rank.area)}</div>
        <div><span>Military</span><b>${st.military}</b>${rank(st.rank.military)}</div>
        <div><span>Economy</span><b>${st.economy}</b>${rank(st.rank.economy)}</div>
      </div>
      <p class="muted">Area — cells of land. Military — the value of all pieces, stronger with the generals' ELO (${st.generals} general${st.generals > 1 ? 's' : ''}, ${st.pieces} pieces). Economy — income per turn after feeding the army, gold counted ×4.</p>
      ${mineN ? `<p class="withico">Income: ${amount('wood', st.income.wood)} ${amount('food', st.income.food - st.upkeep)} ${amount('gold', st.income.gold)} per turn</p>` : ''}
      <div class="acts">${btn('close', 'Close', '')}${mineN ? btn('endgame', 'End campaign', 'final standings and charts') : ''}</div>`);
    const c = await ask();
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
    const status = (g: typeof mine[number]) => g.order?.kind === 'goto' ? 'marching' : g.order?.kind === 'explore' ? 'exploring' : g.order?.kind === 'hold' ? 'holding'
      : g.attacked ? 'done this turn' : g.moveLeft > 0 ? `${g.moveLeft} move${g.moveLeft > 1 ? 's' : ''} left` : 'no moves left';
    modal(`<h2>Your generals</h2><div class="glist">${mine.map((g) => `<button class="grow ${g.moveLeft > 0 && !g.attacked && !g.order ? 'ready' : ''}" data-a="pick:${g.id}">
        <span class="gname">${g.settler ? 'Settler' : `General ${esc(g.name)}`}${g.settler ? '' : ` <small>ELO ${g.elo}${g.stars ? ` ${'★'.repeat(g.stars)}` : ''}</small>`}</span>
        <span class="garmy">${g.settler ? 'founds a city' : glyphs(g.army)}</span><span class="gmoves">${status(g)}</span></button>`).join('')}</div>
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
      `<div class="brow"><span class="bname"><b>City</b> · level ${h.level}</span><span class="bout">${sl.used}/${sl.max} slots · builders ${freeBuilders(s, ME, h.id)}/${hallBuilders(h)} free</span>
        ${h.level < 3 ? up(`th:${h.id}`, `→ ${h.level + 1}`, cityUpgradeCost(s, ME, (h.level + 1) as 2 | 3), state((j) => j.kind === 'townhall' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      `<div class="brow"><span class="bname"><b>Barracks</b> · ${hb ? `level ${hb}` : 'none'}</span><span class="bout">${hb ? `hires up to ${PIECE_NAME[PIECES[hb - 1]].toLowerCase()}s` : 'needed to hire pieces here'}</span>
        ${hb < 5 ? up(`barracks:${h.id}`, hb ? `→ ${hb + 1}` : 'Build', barracksCost(s, ME, (hb + 1) as 1 | 2 | 3 | 4 | 5), state((j) => j.kind === 'barracks' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      `<div class="brow"><span class="bname"><b>Tavern</b> · ${ht ? `level ${ht}` : 'none'}</span><span class="bout">${ht ? `up to ${Math.min(5, ht + 1)} generals` : 'hires generals'}</span>
        ${ht < 4 ? up(`tavern:${h.id}`, ht ? `→ ${ht + 1}` : 'Build', tavernCost(s, ME, (ht + 1) as 1 | 2 | 3 | 4), state((j) => j.kind === 'tavern' && j.hallId === h.id)) : '<span class="bstate">top level</span>'}</div>`,
      ...cells.map((c) => {
        const k = key(c.hex);
        if (!c.building) return `<div class="brow"><span class="bname">${iconSvg('clock', 18)}<b>Construction</b></span><span class="bout">${state((j) => j.kind === 'resource' && key(j.hex) === k) || 'in progress'}</span></div>`;
        const b = c.building;
        const out = buildingOutput(s, ME, c);
        const income = (['food', 'wood', 'gold'] as const).filter((r) => out[r]).map((r) => `+${amount(r, out[r])}`).join(' ');
        const top = maxLevelAt(s, ME, c, b.kind) || 5;
        return `<div class="brow"><span class="bname">${iconSvg(b.kind, 18)}<b>${BUILDING_NAME[b.kind]}</b> · level ${b.level}</span><span class="bout">${income} per turn</span>
          ${b.level < top ? up(`up:${k}`, `→ ${b.level + 1}`, resourceCost(s, ME, b.kind, b.level + 1), state((j) => j.kind === 'resource' && key(j.hex) === k)) : '<span class="bstate">top level</span>'}</div>`;
      }),
    ];
    return `<div class="cityhead"><button class="ghost navb" data-a="city:prev" ${n < 2 ? 'disabled' : ''}>‹</button>
        <div><h2>${esc(h.name)}</h2><small class="muted">${i + 1} / ${n} · swipe for other cities</small></div>
        <button class="ghost navb" data-a="city:next" ${n < 2 ? 'disabled' : ''}>›</button></div>
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
    const sides = defending
      ? `<b style="color:${foe.color}">${esc(foe.name)}</b> (ELO ${foe.elo}, White) attacks <b style="color:${me.color}">your general</b> (ELO ${me.elo}, Black)`
      : `<b style="color:${me.color}">Your general</b> (ELO ${me.elo}, White) vs <b style="color:${foe.color}">${esc(foe.name)}</b> (ELO ${foe.elo}, Black)`;
    const show = (body: string) => modal(`<h2>${defending ? '⚔ ' : ''}${esc(title)}</h2><p>${sides}</p>${body}`);
    show(defending
      ? `<div class="acts">${btn('manual', 'Defend it yourself', 'you command Black on the board')}${btn('auto', 'Let your general defend', 'the generals play it out')}</div>`
      : `<div class="acts">${btn('manual', 'Play it yourself', 'you command White on the board')}${btn('auto', 'Auto battle', 'the generals play it out')}${btn('cancel', 'Retreat', 'cancel the attack')}</div>`);
    const choice = await ask();
    if (choice === 'cancel') { modal(null); return; }
    let rec: BattleRecord;
    try {
      if (choice === 'manual') {
        modal(null);
        rec = await playManual(app, s, attackerId, defenderId, me, foe, title, defending ? 'black' : 'white');
      } else {
        show(`<p class="big" id="ply">Move 0</p><p class="muted">Stockfish is playing the battle…</p>`);
        rec = await autobattle(s, attackerId, defenderId, (n) => {
          const el = app.querySelector('#ply'); if (el) el.textContent = `Move ${Math.ceil(n / 2)}`;
        });
      }
    } catch (e) {
      show(`<p class="bad">${esc(String((e as Error).message ?? e))}</p><div class="acts">${btn('close', 'Close', '')}</div>`);
      await ask();
      modal(null);
      return;
    }
    const mineId = mineG.id;
    const before = { ...mineG.army };
    const vsBandits = [attackerId, defenderId].some((id) => s.generals[id]?.owner === 'bandits');
    const out = resolveBattle(s, attackerId, defenderId, rec.report);
    saveGame(s);
    const iWon = out.winner === (defending ? 'defender' : 'attacker');
    const headline = out.winner === null ? (vsBandits ? 'The bandits scattered' : defending ? 'The attack is repelled' : 'Draw') : iWon ? 'Victory' : 'Defeat';
    const mine = s.generals[mineId];
    const left = mine ? PIECES.filter((x) => mine.army[x]).map((x) => `${mine.army[x]} ${PIECE_NAME[x].toLowerCase()}${mine.army[x] > 1 ? 's' : ''}`).join(', ') || 'no pieces' : 'your general fell';
    const lost = mine ? PIECES.reduce((n, x) => n + Math.max(0, before[x] - mine.army[x]), 0) : null;
    for (;;) {
      show(`<p class="big">${headline}</p><p>${esc(out.note)} · ${rec.moves.length} half-moves${rec.bookPlies ? ` · ${rec.bookPlies} from the opening book` : ''}</p>
        <p>Your army now: ${esc(left)}${lost ? ` (lost ${lost})` : ''}</p>
        <div class="acts">${btn('replay', 'Watch replay', 'step through the game')}${btn('close', 'Continue', '')}</div>`);
      if (await ask() !== 'replay') break;
      modal(null);
      const white = defending ? foe : me, black = defending ? me : foe;
      await showReplay(app, rec, white, black, title, defending);
    }
    modal(null);
  };

  const startBattle = async (attackerId: string, defenderId: string) => {
    busy = true;
    await fightBattle(attackerId, defenderId, false);
    busy = false;
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
    await showSummary(app, s, ME, how);
    exit();
  };

  const checkEnd = () => {
    const w = winner(s);
    if (!s.players[ME].alive) void finish('defeat');
    else if (w === ME) void finish('victory');
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
    const was = new Map(Object.values(s.generals).filter((g) => g.owner === ME).map((g) => [g.id, { ...g.hex }]));
    const marched = s.players[ME].alive ? runOrders(s, ME) : [];
    for (const [id, h] of was) { const g = s.generals[id]; if (g && key(g.hex) !== key(h)) view.slide(id, [h, g.hex]); }
    saveGame(s);
    const news = s.log.slice(from).filter((e) => e.player === ME || /captured|out of the game|siege of/.test(e.text));
    const notes = [...news.map((e) => `${e.player && e.player !== ME ? (hasMet(s, ME, e.player) ? ownerName(s, e.player) : 'An unknown nation') + ': ' : ''}${e.text[0].toUpperCase()}${e.text.slice(1)}`), ...marched.map((m) => `General ${m.text}`)];
    if (notes.length) toast(notes.map((n) => `• ${n}`).join('\n'));
    const stopped = marched.find((m) => s.generals[m.gid] && /stopped|blocked/.test(m.text));
    if (stopped) { sel = { hex: s.generals[stopped.gid].hex, gid: stopped.gid }; glideTo(s.generals[stopped.gid].hex); }
    sel = { hex: sel.hex, gid: sel.gid && s.generals[sel.gid] ? sel.gid : undefined };
    refresh();
    checkEnd();
  });

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
    const seq: (string | undefined)[] = [...units.map((g) => g.id), ...(placeHere || !units.length ? [undefined] : [])];
    const same = sel.hex && key(sel.hex) === k;
    const at = same ? seq.indexOf(sel.gid) : -1;
    sel = { hex: h, gid: seq[(at + 1) % seq.length] };
    refresh();
  };

  /** Выполнить приказы сразу (поход и разведка начинаются в тот же ход). */
  const followOrders = () => {
    const before = new Map(Object.values(s.generals).filter((g) => g.owner === ME).map((g) => [g.id, { ...g.hex }]));
    const ev = runOrders(s, ME);
    for (const [id, h] of before) { const g = s.generals[id]; if (g && key(g.hex) !== key(h)) view.slide(id, [h, g.hex]); }
    if (ev.length) toast(ev.map((m) => `General ${m.text}`).join(' · '));
    saveGame(s);
  };

  const doMove = () => {
    const h = sel.hex!, gid = sel.gid!;
    const path = findPath(s, gid, h);
    const r = move(s, gid, h);
    if (r.ok && path) view.slide(gid, path);
    if (r.ok) { if (s.generals[gid].order?.kind !== 'hold') s.generals[gid].order = undefined; sel = { hex: h, gid }; saveGame(s); } else toast((r as { reason: string }).reason);
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
      const roll = (t: number) => {
        const dt = t - last; last = t;
        view.ox += vx * dt; view.oy += vy * dt;
        const k = Math.pow(0.94, dt / 16); vx *= k; vy *= k;
        view.draw(s, ME, seenCache, hlCache);
        if (Math.hypot(vx, vy) > 0.02) fling = requestAnimationFrame(roll);
      };
      fling = requestAnimationFrame(roll);
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.offsetX, e.offsetY); drawView(); }, { passive: false });

  const tut = startTutorial(app, s, ME);
  const refresh = () => { bar(); sheet(); draw(); tut.update(); };
  window.addEventListener('resize', () => draw());

  const capital = Object.values(s.halls).filter((h) => h.owner === ME).sort((a, b) => a.order - b.order)[0];
  const g0 = playerGenerals(s, ME)[0];
  sel = capital ? { hex: capital.hex, gid: g0 && key(g0.hex) === key(capital.hex) ? g0.id : undefined } : {};
  bar(); sheet();
  // центрируем после того, как нижняя панель заполнилась и карта получила свой настоящий размер
  requestAnimationFrame(() => {
    if (capital) view.centerOn(capital.hex);
    draw();
    checkEnd();
  });
  (window as unknown as { __cc?: unknown }).__cc = { view, state: s }; // для автотестов в браузере
};
