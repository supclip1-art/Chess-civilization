// Экран партии: карта, верхняя панель (казна, ход), нижняя панель действий, бои, ход ИИ.

import { iconSvg, iconsReady } from './icons.ts';
import {
  BARRACKS, BUILD_TURNS, BUILDING_TERRAIN, GENERAL_HIRE_GOLD, HIRE_LEVEL, NATIONS, PIECE_PRICE, RESEARCH, RESOURCE_COST,
  RESOURCE_OUTPUT, TAVERN, TOWN_HALL_FOUND, TOWN_HALL_UPGRADE, BUILDER_HIRE_FOOD, BUILDER_UPKEEP_FOOD, GENERAL_UPKEEP_FOOD, cityUpgradeCost, tavernCost, PIECES, aiEconomyTurn, attack, endTurn,
  foundTownHall, freeBuilders, hireBuilder, hireGeneral, hirePiece, income, key, maxBuilders, move, playerGenerals,
  reachable, recruitElo, resolveBattle, startResearch, upgrade, upgradeBarracks, upgradeTavern, upgradeTownHall,
  upkeep, visible, winner, build, type GameState, type Hex, type Piece, type Res, type ResourceBuilding,
} from '../../../core/src/index.ts';
import { autobattle } from './battle.ts';
import { MapView, attackTargets, ownerColor } from './render.ts';
import { saveGame } from './save.ts';
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
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

export const ownerName = (s: GameState, owner?: string): string => {
  if (!owner) return 'Unclaimed';
  if (s.neutrals[owner]) return 'Neutral state';
  const p = s.players[owner];
  return p ? (owner === ME ? `You (${NATIONS[p.nation].name})` : NATIONS[p.nation].name) : owner;
};

export const openGame = (app: HTMLElement, s: GameState, onExit: () => void): void => {
  document.body.classList.add('game');
  app.className = 'game-root';
  app.innerHTML = `
    <header class="bar">
      <div class="res" id="res"></div>
      <button id="end" class="end">End turn</button>
    </header>
    <div class="mapwrap"><canvas id="map"></canvas></div>
    <section class="sheet" id="sheet"></section>
    <div class="toast" id="toast" hidden></div>
    <div class="modal" id="modal" hidden><div class="dialog" id="dialog"></div></div>`;
  const canvas = app.querySelector<HTMLCanvasElement>('#map')!;
  const view = new MapView(canvas);
  // выбранная клетка; gid — выбранный свой генерал; target — эта клетка цель для него (идти или нападать)
  let sel: { hex?: Hex; gid?: string; target?: 'move' | 'attack' } = {};
  let busy = false;

  const exit = () => { document.body.classList.remove('game'); app.className = 'stack'; setBack(null); onExit(); };
  setBack(exit);

  const toast = (text: string) => {
    const t = app.querySelector<HTMLElement>('#toast')!;
    t.textContent = text; t.hidden = false;
    clearTimeout((t as unknown as { _h?: number })._h);
    (t as unknown as { _h?: number })._h = window.setTimeout(() => (t.hidden = true), 2600);
  };
  const act = (r: { ok: boolean; reason?: string }) => {
    if (!r.ok) toast((r as { reason: string }).reason);
    else { tap(); saveGame(s); }
    refresh();
  };

  // ---------- верхняя панель ----------
  const bar = () => {
    const p = s.players[ME];
    const inc = income(s, ME);
    const food = inc.food - upkeep(s, ME);
    app.querySelector('#res')!.innerHTML = `
      <span title="Wood">${iconSvg('wood')}${fmt(p.res.wood)}<small>+${inc.wood}</small></span>
      <span title="Food">${iconSvg('food')}${fmt(p.res.food)}<small class="${food < 0 ? 'neg' : ''}">${food >= 0 ? '+' : ''}${fmt(food)}</small></span>
      <span title="Gold">${iconSvg('gold')}${fmt(p.res.gold)}<small>+${fmt(inc.gold)}</small></span>
      <span class="turn">Turn ${s.turn}</span>`;
  };

  // ---------- карта ----------
  const highlight = () => {
    const reach = new Set<string>(), atk = sel.gid ? attackTargets(s, sel.gid) : new Set<string>();
    if (sel.gid) for (const [k, d] of reachable(s, sel.gid)) if (d > 0) reach.add(k);
    return { selected: sel.hex, reach, attack: atk };
  };
  const draw = () => view.draw(s, ME, visible(s, ME), highlight());
  iconsReady.then(() => draw());

  // ---------- нижняя панель ----------
  const btn = (id: string, label: string, sub: string, enabled = true) =>
    `<button class="act" data-a="${id}" ${enabled ? '' : 'disabled'}><b>${label}</b><span>${sub}</span></button>`;

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
    parts.push(`<div class="cellhead"><b>${TERRAIN_NAME[cell.terrain]}</b><span class="muted">${seen ? esc(ownerName(s, cell.owner)) : 'Unexplored'}</span></div>`);
    if (sel.gid && sel.target === 'move') {
      const d = reachable(s, sel.gid).get(k) ?? 0;
      parts.push(`<div class="acts">${btn('move', 'Move general here', `${d} of ${s.generals[sel.gid].moveLeft} moves`)}</div>`);
    } else if (sel.gid && sel.target === 'attack') {
      const hall = Object.values(s.halls).some((h) => key(h.hex) === k);
      const army = Object.values(s.generals).some((g) => key(g.hex) === k && g.owner !== ME && g.army.p + g.army.n + g.army.b + g.army.r + g.army.q > 0);
      parts.push(`<div class="acts">${btn('attack', army ? 'Attack this army' : `Besiege ${esc(Object.values(s.halls).find((h) => key(h.hex) === k)?.name ?? 'the city')}`, army ? 'a chess battle, you play White' : 'it falls in one turn unless reinforced')}</div>`);
    }
    if (!seen) { el.innerHTML = parts.join(''); return; }

    // генералы на клетке
    const gens = Object.values(s.generals).filter((g) => key(g.hex) === k);
    for (const g of gens) {
      const mine = g.owner === ME;
      const army = PIECES.filter((x) => g.army[x]).map((x) => `${g.army[x]} ${PIECE_NAME[x].toLowerCase()}${g.army[x] > 1 ? 's' : ''}`).join(', ') || 'no pieces';
      let html = `<div class="card"><div class="row"><b style="color:${ownerColor(s, g.owner)}">${mine ? 'Your general' : esc(ownerName(s, g.owner))}</b><span>ELO ${g.elo} ${'★'.repeat(g.stars)}</span></div>
        <p>King + ${army}</p>`;
      if (mine) {
        html += `<p class="muted">White: ${esc(g.white)} · vs 1.e4: ${esc(g.vsE4)} · vs 1.d4: ${esc(g.vsD4)}</p>
          <p class="muted">${g.attacked ? 'Has acted this turn' : `Moves left: ${g.moveLeft}`}</p>`;
        if (cell.owner === ME) {
          html += `<div class="acts">${PIECES.map((x) => btn(`hire:${g.id}:${x}`, PIECE_NAME[x], `${amount('gold', PIECE_PRICE[x])}${p.barracks < HIRE_LEVEL[x] ? ` · barracks ${HIRE_LEVEL[x]}` : ''}`, p.barracks >= HIRE_LEVEL[x] && p.res.gold >= PIECE_PRICE[x])).join('')}</div>`;
        }
        if (!cell.owner && cell.terrain !== 'water' && cell.terrain !== 'mountain') {
          const m = NATIONS[p.nation].mods;
          const c = { wood: Math.ceil(TOWN_HALL_FOUND.cost.wood * (m.townHallFoundCostMult ?? 1)), food: Math.ceil(TOWN_HALL_FOUND.cost.food * (m.townHallFoundCostMult ?? 1)), gold: 0 };
          html += `<div class="acts">${btn(`found:${g.id}`, 'Found a city', `${cost(c)} · ${m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns} turn${(m.townHallFoundTurns ?? TOWN_HALL_FOUND.turns) > 1 ? 's' : ''}`, !g.attacked)}</div>`;
        }
      }
      parts.push(html + '</div>');
    }

    // ратуша
    const hall = Object.values(s.halls).find((h) => key(h.hex) === k);
    if (hall && hall.owner === ME) {
      const jobs = p.jobs.map((j) => `${j.kind === 'resource' ? BUILDING_NAME[j.building] : j.kind === 'found' ? 'New city' : j.kind === 'townhall' ? (s.halls[j.hallId]?.name ?? 'City') : j.kind[0].toUpperCase() + j.kind.slice(1)} → ${j.kind === 'found' ? '' : `level ${j.level}`} (ready turn ${j.finish})`);
      const thUp = hall.level < 3 ? TOWN_HALL_UPGRADE[(hall.level + 1) as 2 | 3] : null;
      const nb = p.builders + 1;
      const barNext = p.barracks < 5 ? BARRACKS[(p.barracks + 1) as 1 | 2 | 3 | 4 | 5] : null;
      const tavNext = p.tavern < 4 ? TAVERN[(p.tavern + 1) as 1 | 2 | 3 | 4] : null;
      const res = p.research.done < RESEARCH.length ? RESEARCH[p.research.done] : null;
      const gCount = playerGenerals(s, ME).length;
      const gCost = gCount < 5 ? Math.max(0, GENERAL_HIRE_GOLD[(gCount + 1) as 2 | 3 | 4 | 5] - (NATIONS[p.nation].mods.generalHireDiscount ?? 0)) : 0;
      parts.push(`<div class="card"><div class="row"><b>${esc(hall.name)} · level ${hall.level}</b><span class="muted">builders ${freeBuilders(p)}/${p.builders} free</span></div>
        <div class="acts">
          ${thUp ? btn(`th:${hall.id}`, `City → ${hall.level + 1}`, `${cost(cityUpgradeCost(s, ME, (hall.level + 1) as 2 | 3))} · ${thUp.turns} turn · +1 builder slot, wider land`) : ''}
          ${nb <= maxBuilders(s, ME) ? btn('builder', `Hire builder ${nb}`, `${NATIONS[p.nation].mods.freeBuilderHire ? 'free' : `${amount('food', BUILDER_HIRE_FOOD[nb as 2 | 3])}`} · eats ${amount('food', BUILDER_UPKEEP_FOOD)}/turn`) : ''}
          ${barNext ? btn('barracks', p.barracks ? `Barracks → ${p.barracks + 1}` : 'Build barracks', `${cost(barNext.cost)} · ${barNext.turns} turn${barNext.turns > 1 ? 's' : ''} · unlocks ${PIECE_NAME[PIECES[p.barracks]].toLowerCase()}s`) : ''}
          ${tavNext ? btn('tavern', p.tavern ? `Tavern → ${p.tavern + 1}` : 'Build tavern', `${cost(tavernCost(s, ME, (p.tavern + 1) as 1 | 2 | 3 | 4))} · ${tavNext.turns} turn${tavNext.turns > 1 ? 's' : ''} · ${p.tavern + 2} generals`) : ''}
          ${res && !p.research.active ? btn('research', `Tactics ${p.research.done + 1}/5`, `${cost(res.cost)} · ${res.turns} turn${res.turns > 1 ? 's' : ''} · new generals +25 ELO`) : ''}
          ${gCount < Math.min(5, p.tavern + 1) ? btn('general', 'Hire a general', `${amount('gold', gCost)} · ELO ${recruitElo(s, ME)} · eats ${amount('food', GENERAL_UPKEEP_FOOD)}/turn`) : ''}
        </div>
        <p class="muted">Barracks ${p.barracks} · Tavern ${p.tavern} · Tactics ${p.research.done}/5${p.research.active ? ' (researching)' : ''}</p>
        ${jobs.length ? `<p class="muted">In progress: ${jobs.map(esc).join('; ')}</p>` : ''}</div>`);
    } else if (hall) {
      parts.push(`<div class="card"><b>${esc(hall.name)} · city level ${hall.level}</b><p class="muted">${esc(ownerName(s, hall.owner))}${hall.siege ? ' · under siege' : ''}</p></div>`);
    }

    // ресурсное здание
    if (!hall && cell.owner === ME) {
      const kinds = (Object.keys(BUILDING_TERRAIN) as ResourceBuilding[]).filter((b) => BUILDING_TERRAIN[b] === cell.terrain);
      if (cell.building) {
        const b = cell.building;
        const busy = p.jobs.some((j) => j.kind === 'resource' && key(j.hex) === k);
        const out = RESOURCE_OUTPUT[b.kind];
        parts.push(`<div class="card"><div class="row"><b class="withico">${iconSvg(b.kind, 20)}${BUILDING_NAME[b.kind]} · level ${b.level}</b><span>+${amount(RES_OF[b.kind], out[b.level - 1])} per turn</span></div>
          ${b.level < 5 ? `<div class="acts">${btn(`up:${k}`, `Upgrade → ${b.level + 1}`, busy ? 'in progress' : `${cost(RESOURCE_COST[b.kind][b.level])} · ${BUILD_TURNS[b.level]} turn${BUILD_TURNS[b.level] > 1 ? 's' : ''} · +${amount(RES_OF[b.kind], out[b.level] - out[b.level - 1])}/turn`, !busy)}</div>` : '<p class="muted">Top level</p>'}</div>`);
      } else if (cell.reserved) {
        parts.push(`<div class="card"><p class="muted">Construction in progress</p></div>`);
      } else if (kinds.length) {
        parts.push(`<div class="acts">${kinds.map((b) => btn(`build:${k}:${b}`, `Build ${BUILDING_NAME[b].toLowerCase()}`, `${cost(RESOURCE_COST[b][0])} · 1 turn · +${amount(RES_OF[b], RESOURCE_OUTPUT[b][0])}/turn`)).join('')}</div>`);
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
    const [a, x, y] = b.dataset.a!.split(':');
    const hex = (k: string) => { const [q, r] = k.split(',').map(Number); return { q, r }; };
    if (a === 'hire') act(hirePiece(s, ME, x, y as Piece));
    else if (a === 'found') act(foundTownHall(s, ME, x));
    else if (a === 'th') act(upgradeTownHall(s, ME, x));
    else if (a === 'builder') act(hireBuilder(s, ME));
    else if (a === 'barracks') act(upgradeBarracks(s, ME));
    else if (a === 'tavern') act(upgradeTavern(s, ME));
    else if (a === 'research') act(startResearch(s, ME));
    else if (a === 'general') act(hireGeneral(s, ME));
    else if (a === 'up') act(upgrade(s, ME, hex(x)));
    else if (a === 'build') act(build(s, ME, hex(`${x}`), y as ResourceBuilding));
    else if (a === 'move') doMove();
    else if (a === 'attack') doAttack();
  });

  const modal = (html: string | null) => {
    const m = app.querySelector<HTMLElement>('#modal')!;
    m.hidden = html === null;
    if (html !== null) app.querySelector('#dialog')!.innerHTML = html;
  };

  const startBattle = async (attackerId: string, defenderId: string) => {
    const att = s.generals[attackerId], def = s.generals[defenderId];
    const defName = ownerName(s, def.owner), defColor = ownerColor(s, def.owner), defElo = def.elo;
    const show = (body: string) => modal(`<h2>Battle</h2>
      <p><b style="color:${ownerColor(s, att.owner)}">Your general</b> (ELO ${att.elo}, White) vs <b style="color:${defColor}">${esc(defName)}</b> (ELO ${defElo}, Black)</p>${body}`);
    show(`<div class="acts">${btn('auto', 'Auto battle', 'the generals play it out')}${btn('cancel', 'Retreat', 'cancel the attack')}</div>
      <p class="muted">Playing the battle yourself arrives in the next build.</p>`);
    const choice = await new Promise<string>((resolve) => {
      app.querySelector('#dialog')!.addEventListener('click', (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
        if (b) resolve(b.dataset.a!);
      });
    });
    if (choice !== 'auto') { modal(null); return; }
    busy = true;
    show(`<p class="big" id="ply">Move 0</p><p class="muted">Stockfish is playing the battle…</p>`);
    try {
      const rec = await autobattle(s, attackerId, defenderId, (n) => {
        const el = app.querySelector('#ply'); if (el) el.textContent = `Move ${Math.ceil(n / 2)}`;
      });
      const before = { ...att.army };
      const out = resolveBattle(s, attackerId, defenderId, rec.report);
      saveGame(s);
      const headline = out.winner === 'attacker' ? 'Victory' : out.winner === 'defender' ? 'Defeat' : 'Draw';
      const mine = s.generals[attackerId];
      const left = mine ? PIECES.filter((x) => mine.army[x]).map((x) => `${mine.army[x]} ${PIECE_NAME[x].toLowerCase()}${mine.army[x] > 1 ? 's' : ''}`).join(', ') || 'no pieces' : 'your general fell';
      const lost = mine ? PIECES.reduce((n, x) => n + Math.max(0, before[x] - mine.army[x]), 0) : null;
      show(`<p class="big">${headline}</p><p>${esc(out.note)} · ${rec.moves.length} half-moves · ${rec.seconds.toFixed(1)} s</p>
        <p>Your army now: ${esc(left)}${lost ? ` (lost ${lost})` : ''}</p>
        <div class="acts">${btn('close', 'Continue', '')}</div>`);
      await new Promise<void>((resolve) => app.querySelector('#dialog')!.addEventListener('click', () => resolve(), { once: true }));
    } catch (e) {
      show(`<p class="bad">${esc(String((e as Error).message ?? e))}</p><div class="acts">${btn('close', 'Close', '')}</div>`);
      await new Promise<void>((resolve) => app.querySelector('#dialog')!.addEventListener('click', () => resolve(), { once: true }));
    }
    busy = false;
    modal(null);
    sel = { hex: s.generals[attackerId]?.hex, gid: s.generals[attackerId] ? attackerId : undefined };
    refresh();
    checkEnd();
  };

  const checkEnd = () => {
    const w = winner(s);
    if (!s.players[ME].alive) modal(`<h2>Defeat</h2><p>Your last city has fallen.</p><div class="acts">${btn('exit', 'Back to menu', '')}</div>`);
    else if (w === ME) modal(`<h2>Victory</h2><p>You are the last nation standing on turn ${s.turn}.</p><div class="acts">${btn('exit', 'Back to menu', '')}</div>`);
    else return;
    app.querySelector('#dialog')!.addEventListener('click', exit, { once: true });
  };

  // ---------- ход ----------
  app.querySelector('#end')!.addEventListener('click', () => {
    if (busy) return;
    tap();
    const from = s.log.length;
    endTurn(s);
    while (s.order[s.current] !== ME && s.players[ME].alive && !winner(s)) {
      aiEconomyTurn(s, s.order[s.current]);
      endTurn(s);
    }
    saveGame(s);
    const news = s.log.slice(from).filter((e) => e.player === ME || /captured|out of the game|famine/.test(e.text));
    if (news.length) toast(news.map((e) => `${e.player && e.player !== ME ? ownerName(s, e.player) + ': ' : ''}${e.text}`).join(' · '));
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
    }
    const mine = Object.values(s.generals).find((g) => g.owner === ME && key(g.hex) === k);
    sel = { hex: h, gid: mine?.id };
    refresh();
  };

  const doMove = () => {
    const h = sel.hex!, gid = sel.gid!;
    const r = move(s, gid, h);
    if (r.ok) { sel = { hex: h, gid }; saveGame(s); } else toast((r as { reason: string }).reason);
    refresh();
  };

  const doAttack = () => {
    const h = sel.hex!, gid = sel.gid!;
    const r = attack(s, gid, h);
    if (r.kind === 'battle') { startBattle(r.attacker, r.defender); return; }
    if (r.kind === 'siege') {
      saveGame(s);
      toast('Siege begins: the city falls at the start of your next turn unless reinforcements arrive.');
      sel = { hex: s.generals[gid].hex, gid };
      refresh();
      return;
    }
    toast(r.reason);
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false, startX = 0, startY = 0, pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
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
      pinch = d; dragged = true; draw(); return;
    }
    if (Math.hypot(e.offsetX - startX, e.offsetY - startY) > 6) dragged = true;
    if (dragged) { view.ox += e.offsetX - prev.x; view.oy += e.offsetY - prev.y; draw(); }
  });
  const up = (e: PointerEvent) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (wasSingle && !dragged) onTap(e.offsetX, e.offsetY);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.offsetX, e.offsetY); draw(); }, { passive: false });

  const refresh = () => { bar(); sheet(); draw(); };
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
