// Экран «Новая игра»: миниатюры карт, выбор «страна или разбойники», карусель наций с правителем,
// соперники и ELO — степперами, стартовый бонус — пилюлями, внизу липкая золотая кнопка старта.

import {
  BANDIT_COUNT, NATIONS, NATION_ORDER, africaMap, asiaMap, europeMap, mediterraneanMap, newGame, newWorldMap, southAmericaMap,
  type Aggression, type GameState, type MapDef, type NationId, type Terrain,
} from '../../core/src/index.ts';
import { flagSvg } from './game/flags.ts';
import { portraitSvg } from './game/portraits.ts';
import { applyStartBonus, choose, dynasty, level, mapLevel, nationLevel } from './dynasty.ts';
import { bonusOptions } from './dynastyScreen.ts';
import { setBack, tap } from './tg.ts';

export const MAPS = {
  europe: europeMap, asia: asiaMap, mediterranean: mediterraneanMap, newworld: newWorldMap, africa: africaMap, southamerica: southAmericaMap,
} as const;
export type MapId = keyof typeof MAPS;
const MAP_BLURB: Record<MapId, string> = {
  europe: 'Kingdoms packed shoulder to shoulder',
  asia: 'Vast steppes and two great free cities',
  mediterranean: 'A ring of lands around the sea',
  newworld: 'From Mexico to the Great Lakes',
  africa: 'The Sahara, the Nile and southern gold',
  southamerica: 'The Andes, the Amazon and the pampas',
};
const AGGR: Aggression[] = ['warlike', 'moderate', 'peaceful'];
const ELOS = [800, 1000, 1200, 1400, 1600, 1800, 2000];
/** Игра за разбойников открывается достижением «Гроза разбойников». */
export const OUTLAW_ACH = 'bandit_bane';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------- миниатюры карт ----------
const TINT: Record<Terrain, string> = {
  water: '#3d6fa3', field: '#9cc865', forest: '#4f8f4a', mountain: '#8a8178', deposit: '#d6a24e', tundra: '#dfe5ea', desert: '#e3c98f',
};
const thumbs = new Map<MapId, string>();
const thumb = (id: MapId): string => {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const m: MapDef = MAPS[id]();
  const xs = m.cells.map((c) => Math.sqrt(3) * (c.q + c.r / 2)), ys = m.cells.map((c) => 1.5 * c.r);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 300, H = 190;
  const k = Math.min((W - 8) / (maxX - minX + 2), (H - 8) / (maxY - minY + 2));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#2f5d8f'; ctx.fillRect(0, 0, W, H);
  const ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  m.cells.forEach((c, i) => {
    if (c.terrain === 'water') return;
    ctx.fillStyle = TINT[c.terrain];
    const x = ox + (xs[i] - minX) * k, y = oy + (ys[i] - minY) * k;
    ctx.beginPath(); ctx.arc(x, y, k * 0.95, 0, Math.PI * 2); ctx.fill();
  });
  for (const s of m.spawns) {
    const x = ox + (Math.sqrt(3) * (s.q + s.r / 2) - minX) * k, y = oy + (1.5 * s.r - minY) * k;
    ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = '#7a4d0e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const url = cv.toDataURL('image/png');
  thumbs.set(id, url);
  return url;
};

export const openSetup = (app: HTMLElement, back: () => void, start: (s: GameState) => void): void => {
  setBack(back);
  const lv = level();
  const canOutlaw = !!dynasty().achievements[OUTLAW_ACH];
  const ABC = [...NATION_ORDER].sort((a, b) => NATIONS[a].name.localeCompare(NATIONS[b].name, 'en'));
  let nation: NationId = 'russia', mapId: MapId = 'europe', players = 0, elo = 1200, outlaw = false;
  try {
    const m = localStorage.getItem('chessciv.map') as MapId | null;
    if (m && MAPS[m]) mapId = m;
    players = Number(localStorage.getItem('chessciv.players')) || 0;
    elo = Number(localStorage.getItem('chessciv.elo')) || 1200;
    const last = localStorage.getItem('chessciv.nation') as NationId | null;
    if (last && NATIONS[last] && last !== 'outlaws') nation = last;
    outlaw = localStorage.getItem('chessciv.outlaw') === '1';
  } catch { /* по умолчанию */ }
  if (mapLevel(mapId) > lv) mapId = 'europe';
  if (nationLevel(nation) > lv) nation = 'russia';
  if (!canOutlaw) outlaw = false;
  let bonus = dynasty().bonus;
  const bonuses = bonusOptions().filter((b) => b.open);
  if (!bonuses.some((b) => b.id === bonus)) bonus = 'none';
  const spawns = (id: MapId) => MAPS[id]().spawns.length;
  const clampPlayers = () => { const n = spawns(mapId); if (players < 2 || players > n) players = n; };
  clampPlayers();

  app.innerHTML = `
    <div class="sethero"><h1 class="wordmark small">New game</h1><p>Pick a world, a banner and the rules of war.</p></div>
    <h2 class="sethead">World</h2>
    <div class="mapstrip" id="maps">${(Object.keys(MAPS) as MapId[]).map((id) => {
      const locked = mapLevel(id) > lv;
      return `<button class="mapcard ${id === mapId ? 'on' : ''} ${locked ? 'locked' : ''}" data-m="${id}" ${locked ? 'disabled' : ''}>
        <img src="${thumb(id)}" alt=""><b>${esc(MAPS[id]().name)}</b><small>${locked ? `🔒 Dynasty level ${mapLevel(id)}` : esc(MAP_BLURB[id])}</small></button>`;
    }).join('')}</div>
    <h2 class="sethead">Play as</h2>
    <div class="modes" id="mode">
      <button class="modecard ${outlaw ? '' : 'on'}" data-o="0"><span class="modeico">♛</span><b>A nation</b><small>Diplomacy, trade and alliances</small></button>
      <button class="modecard ${outlaw ? 'on' : ''} ${canOutlaw ? '' : 'locked'}" data-o="1" ${canOutlaw ? '' : 'disabled'}><span class="modeico">${flagSvg('outlaws', 40)}</span><b>Outlaws</b>
        <small>${canOutlaw ? 'No city, no crown, eternal war' : '🔒 Achievement: Bandit bane'}</small></button>
    </div>
    <div id="nationbox">
      <h2 class="sethead">Your nation <span class="muted" id="picked"></span></h2>
      <div class="nations" id="nations">
        ${ABC.map((id) => { const locked = nationLevel(id) > lv; const n = NATIONS[id];
          return `<button class="nation ${id === nation ? 'on' : ''} ${locked ? 'locked' : ''}" data-n="${id}">
            <div class="ntop"><span class="nflag">${flagSvg(id, 92)}</span><span class="nruler">${portraitSvg(id, n.rulers.moderate, 64)}</span></div>
            <b>${esc(n.name)}</b><span class="nbonus">${esc(n.bonus)}</span><small>${esc(n.effect)}</small>
            ${locked ? `<em class="lock">🔒 Dynasty level ${nationLevel(id)}</em>` : ''}</button>`; }).join('')}
      </div>
      <div class="nav"><button class="ghost" id="prevN" aria-label="Previous nation">‹</button><span id="countN"></span><button class="ghost" id="nextN" aria-label="Next nation">›</button></div>
    </div>
    <div id="outlawbox" class="outlawcard" hidden>
      <span class="oflag">${flagSvg('outlaws', 92)}</span>
      <div><b>Outlaws</b><span class="nbonus">${esc(NATIONS.outlaws.bonus)}</span>
      <p>You start as a bandit band with no city. Seize one to found your kingdom — but no crown will recognise you: eternal war with every nation, no peace or trade. Vassals are still possible.</p>
      <small>${esc(NATIONS.outlaws.effect)}</small></div>
    </div>
    <h2 class="sethead">Rules of war</h2>
    <div class="rules">
      <div class="stepper"><span>Rivals</span><button class="ghost stepb" data-s="players:-1" aria-label="Fewer">−</button><b id="playersv"></b><button class="ghost stepb" data-s="players:1" aria-label="More">+</button></div>
      <div class="stepper"><span>Generals' ELO</span><button class="ghost stepb" data-s="elo:-1" aria-label="Lower">−</button><b id="elov"></b><button class="ghost stepb" data-s="elo:1" aria-label="Higher">+</button></div>
      <p class="muted">One ELO for every general in the game, yours and the AI's.</p>
      <span class="ruletitle">Start bonus</span>
      <div class="pills" id="bonus">${bonuses.map((b) => `<button class="pill ${b.id === bonus ? 'on' : ''}" data-b="${b.id}" title="${esc(b.text)}">${esc(b.name)}</button>`).join('')}</div>
      <p class="muted" id="bonusnote"></p>
    </div>
    <div class="startbar"><button id="start" class="playbtn"><span>Start</span><small id="startsum"></small></button></div>`;

  const $ = (sel: string) => app.querySelector<HTMLElement>(sel)!;
  const strip = $('#nations');
  const cards = [...strip.querySelectorAll<HTMLButtonElement>('.nation')];
  const refresh = () => {
    clampPlayers();
    $('#playersv').textContent = String(players - 1);
    $('#elov').textContent = String(elo);
    for (const b of app.querySelectorAll<HTMLButtonElement>('#maps .mapcard')) b.classList.toggle('on', b.dataset.m === mapId);
    for (const b of app.querySelectorAll<HTMLButtonElement>('#mode .modecard')) b.classList.toggle('on', (b.dataset.o === '1') === outlaw);
    for (const b of app.querySelectorAll<HTMLButtonElement>('#bonus .pill')) b.classList.toggle('on', b.dataset.b === bonus);
    $('#bonusnote').textContent = bonuses.find((b) => b.id === bonus)?.text ?? '';
    $('#nationbox').hidden = outlaw;
    $('#outlawbox').hidden = !outlaw;
    const who = outlaw ? 'Outlaws' : NATIONS[nation].name;
    $('#startsum').textContent = `${who} · ${MAPS[mapId]().name} · ${players} nations`;
    ($('#start') as HTMLButtonElement).disabled = !outlaw && nationLevel(nation) > lv;
  };
  const select = (i: number) => {
    nation = ABC[i];
    cards.forEach((x, j) => x.classList.toggle('on', j === i));
    $('#picked').textContent = `· ${NATIONS[nation].name}`;
    $('#countN').textContent = `${i + 1} / ${ABC.length}`;
    refresh();
  };
  const goTo = (i: number, smooth = true) => {
    i = (i + ABC.length) % ABC.length;
    strip.scrollTo({ left: i * strip.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    select(i);
  };
  goTo(ABC.indexOf(nation), false);
  let t = 0;
  strip.addEventListener('scroll', () => {
    clearTimeout(t);
    t = window.setTimeout(() => { const i = Math.round(strip.scrollLeft / strip.clientWidth); if (ABC[i] && ABC[i] !== nation) { tap(); select(i); } }, 80);
  }, { passive: true });
  $('#prevN').onclick = () => { tap(); goTo(ABC.indexOf(nation) - 1); };
  $('#nextN').onclick = () => { tap(); goTo(ABC.indexOf(nation) + 1); };
  for (const b of app.querySelectorAll<HTMLButtonElement>('#maps .mapcard')) b.onclick = () => { tap(); mapId = b.dataset.m as MapId; players = spawns(mapId); refresh(); };
  for (const b of app.querySelectorAll<HTMLButtonElement>('#mode .modecard')) b.onclick = () => { tap(); outlaw = b.dataset.o === '1'; refresh(); };
  for (const b of app.querySelectorAll<HTMLButtonElement>('#bonus .pill')) b.onclick = () => { tap(); bonus = b.dataset.b!; choose('bonus', bonus); refresh(); };
  for (const b of app.querySelectorAll<HTMLButtonElement>('.stepb')) b.onclick = () => {
    tap();
    const [what, d] = b.dataset.s!.split(':');
    if (what === 'players') players = Math.max(2, Math.min(spawns(mapId), players + Number(d)));
    else elo = ELOS[Math.max(0, Math.min(ELOS.length - 1, ELOS.indexOf(elo) + Number(d)))] ?? 1200;
    refresh();
  };
  refresh();
  // карта выбранной миниатюры — в поле зрения
  app.querySelector<HTMLElement>('#maps .mapcard.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  $('#start').onclick = () => {
    tap();
    if (!outlaw && nationLevel(nation) > lv) return;
    const me: NationId = outlaw ? 'outlaws' : nation;
    const others = NATION_ORDER.filter((n) => n !== me).sort(() => Math.random() - 0.5).slice(0, players - 1);
    const s = newGame(MAPS[mapId](), [
      { nation: me, ...(outlaw ? { outlaw: true } : {}) },
      ...others.map((n) => { const aggression = AGGR[Math.floor(Math.random() * 3)]; return { nation: n, ai: { aggression, ruler: NATIONS[n].rulers[aggression] } }; }),
    ], { elo, seed: Math.floor(Math.random() * 1e9), bandits: BANDIT_COUNT });
    choose('bonus', bonus);
    applyStartBonus(s, 'p1');
    try {
      localStorage.setItem('chessciv.nation', nation); localStorage.setItem('chessciv.map', mapId);
      localStorage.setItem('chessciv.players', String(players)); localStorage.setItem('chessciv.elo', String(elo));
      localStorage.setItem('chessciv.outlaw', outlaw ? '1' : '0');
    } catch { /* ничего */ }
    start(s);
  };
};
