// Mini App: главное меню, новая партия, партия на карте (этап 3) и замер Stockfish.

import {
  BANDIT_COUNT, NATIONS, NATION_ORDER, armiesFromFen, asiaMap, europeMap, insufficientMaterial, newGame, type Aggression, type NationId,
} from '../../core/src/index.ts';
import { Engine, profile } from './engine.ts';
import { openGame } from './game/screen.ts';
import { flagSvg } from './game/flags.ts';
import { resetTutorial } from './game/tutorial.ts';
import { clearSave, loadGame, saveGame } from './game/save.ts';
import { audioPrefs, initAudio, page, setMusic, setSfx } from './audio.ts';
import { LANGS, initI18n, lang, setLang } from './i18n.ts';
import { initTelegram, platformLabel, setBack, tap, userName } from './tg.ts';
import { applyLook, applyStartBonus, choose, dynasty, level, mapLevel, nationLevel, syncDynasty } from './dynasty.ts';
import { bonusOptions, dynastyButton, openDynasty } from './dynastyScreen.ts';

declare const __BUILD__: string; // подставляет сборка: короткий хеш коммита

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const render = (html: string) => { app.innerHTML = html; };
const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', () => { tap(); fn(); });

// ---------- Главный экран ----------

let onHome = false;
const home = () => {
  onHome = true;
  setBack(null);
  const name = userName();
  const saved = loadGame();
  const alive = saved && saved.players?.p1?.alive && saved.order.filter((id) => saved.players[id].alive).length > 1;
  render(`
    <div><h1>Chess Civilization</h1><p class="muted">Build an empire. Every war is a real chess game.</p></div>
    ${name ? `<p>Welcome, ${esc(name)}.</p>` : ''}
    ${alive ? `<button id="continue">Continue · ${esc(NATIONS[saved!.players.p1.nation].name)}</button>` : ''}
    <button id="new" ${alive ? 'class="ghost"' : ''}>New game</button>
    ${dynastyButton()}
    <button id="howto" class="ghost">How to play</button>
    <div class="row"><span>Language</span><div class="seg notr" id="langs">${LANGS.map(([l, n]) => `<button data-l="${l}" class="${l === lang ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="row soundrow"><button id="music" class="ghost">Music: ${audioPrefs().music ? 'on' : 'off'}</button><button id="sfx" class="ghost">Sounds: ${audioPrefs().sfx ? 'on' : 'off'}</button></div>
    <button id="bench" class="ghost">Engine speed test</button>
    <p class="muted">Version ${esc(__BUILD__)} · ${esc(platformLabel())}</p>
    <p class="muted">Chess engine: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish</a> (GPL-3.0). Pieces: cburnett by Colin M.L. Burnett (GPLv2+).</p>`);
  on('continue', () => { if (saved) { onHome = false; openGame(app, saved, home); } });
  on('new', () => { page(); setup(); });
  on('dynasty', () => { page(); openDynasty(app, home); });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#langs button')) b.addEventListener('click', () => { if (b.dataset.l !== lang) setLang(b.dataset.l as typeof lang); });
  on('music', () => { setMusic(!audioPrefs().music); home(); });
  on('sfx', () => { setSfx(!audioPrefs().sfx); home(); });
  on('bench', () => { onHome = false; bench(); });
  on('howto', () => {
    resetTutorial();
    if (alive && saved) openGame(app, saved, home); else setup();
  });
};

// ---------- Новая партия ----------

// Карты: любая из 26 наций, места на карте игроки получают случайно.
const MAPS = { europe: europeMap, asia: asiaMap } as const;
type MapId = keyof typeof MAPS;
const AGGR: Aggression[] = ['warlike', 'moderate', 'peaceful'];

const setup = () => {
  onHome = false;
  setBack(home);
  let nation: NationId = 'russia';
  const ABC = [...NATION_ORDER].sort((a, b) => NATIONS[a].name.localeCompare(NATIONS[b].name, 'en'));
  let mapId: MapId = 'europe';
  let players = 0;
  let elo = 1200;
  try {
    const m = localStorage.getItem('chessciv.map') as MapId | null;
    if (m && MAPS[m]) mapId = m;
    players = Number(localStorage.getItem('chessciv.players')) || 0;
    elo = Number(localStorage.getItem('chessciv.elo')) || 1200;
    const last = localStorage.getItem('chessciv.nation') as NationId | null;
    if (last && NATIONS[last]) nation = last;
  } catch { /* ничего */ }
  const lv = level();
  if (mapLevel(mapId) > lv) mapId = 'europe';
  if (nationLevel(nation) > lv) nation = 'russia';
  const bonuses = bonusOptions();
  const spawnsOf = (id: MapId) => MAPS[id]().spawns.length;
  const playerOptions = () => {
    const n = spawnsOf(mapId);
    const want = players >= 2 && players <= n ? players : n;
    return Array.from({ length: n - 1 }, (_, i) => i + 2).map((k) => `<option ${k === want ? 'selected' : ''}>${k}</option>`).join('');
  };
  render(`
    <h1>New game</h1>
    <div class="card">
      <div class="row"><span>Map</span><div class="seg" id="maps">${(Object.keys(MAPS) as MapId[]).map((id) =>
        `<button class="${id === mapId ? 'on' : ''}" data-m="${id}" ${mapLevel(id) > lv ? 'disabled' : ''}>${mapLevel(id) > lv ? '🔒 ' : ''}${esc(MAPS[id]().name)}</button>`).join('')}</div></div>
      <p class="muted" id="mapnote" style="margin-top:6px"></p>
      <div class="row" style="margin-top:10px"><span>Players</span><select id="players">${playerOptions()}</select></div>
      <div class="row" style="margin-top:10px"><span>Generals' ELO</span><select id="elo">${[800, 1000, 1200, 1400, 1600, 1800, 2000].map((e) => `<option ${e === elo ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <p class="muted" style="margin-top:10px">One ELO for every general in the game, yours and the AI's.</p>
      <div class="row" style="margin-top:10px"><span>Start bonus</span><select id="bonus">${bonuses.filter((b) => b.open).map((b) => `<option value="${b.id}" ${b.id === dynasty().bonus ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <p class="muted" id="bonusnote" style="margin-top:6px"></p>
    </div>
    <h2 class="pick">Your nation <span class="muted" id="picked"></span></h2>
    <div class="nations" id="nations">
      ${ABC.map((id) => `<button class="nation ${id === nation ? 'on' : ''} ${nationLevel(id) > lv ? 'locked' : ''}" data-n="${id}">
        ${flagSvg(id, 72)}<b>${esc(NATIONS[id].name)}</b><span>${esc(NATIONS[id].bonus)}</span><small>${esc(NATIONS[id].effect)}</small>${nationLevel(id) > lv ? `<em class="lock">🔒 Dynasty level ${nationLevel(id)}</em>` : ''}</button>`).join('')}
    </div>
    <div class="nav"><button class="ghost" id="prevN" aria-label="Previous nation">‹</button><span id="countN"></span><button class="ghost" id="nextN" aria-label="Next nation">›</button></div>
    <button id="start">Start</button>`);
  const playersSel = document.getElementById('players') as HTMLSelectElement;
  const bonusSel = document.getElementById('bonus') as HTMLSelectElement;
  const showBonus = () => { document.getElementById('bonusnote')!.textContent = bonuses.find((b) => b.id === bonusSel.value)?.text ?? ''; };
  showBonus();
  bonusSel.addEventListener('change', () => { choose('bonus', bonusSel.value); showBonus(); });
  const showMap = () => {
    document.getElementById('mapnote')!.textContent = `${MAPS[mapId]().name}: up to ${spawnsOf(mapId)} nations · starting places are random`;
    for (const b of document.querySelectorAll<HTMLButtonElement>('#maps button')) b.classList.toggle('on', b.dataset.m === mapId);
  };
  showMap();
  for (const b of document.querySelectorAll<HTMLButtonElement>('#maps button')) {
    b.addEventListener('click', () => {
      tap(); mapId = b.dataset.m as MapId; players = Number(playersSel.value);
      playersSel.innerHTML = playerOptions(); showMap();
    });
  }
  const strip = document.getElementById('nations')!;
  const cards = [...strip.querySelectorAll<HTMLButtonElement>('.nation')];
  const select = (i: number) => {
    nation = ABC[i];
    cards.forEach((x, j) => x.classList.toggle('on', j === i));
    document.getElementById('picked')!.textContent = `· ${NATIONS[nation].name}`;
    document.getElementById('countN')!.textContent = `${i + 1} / ${ABC.length}`;
    const startBtn = document.getElementById('start') as HTMLButtonElement | null;
    if (startBtn) startBtn.disabled = nationLevel(nation) > lv;
  };
  const goTo = (i: number, smooth = true) => {
    i = (i + ABC.length) % ABC.length;
    strip.scrollTo({ left: i * strip.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    select(i);
  };
  goTo(ABC.indexOf(nation), false);
  // выбранная нация — та, что сейчас в окне карусели
  let t = 0;
  strip.addEventListener('scroll', () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      const i = Math.round(strip.scrollLeft / strip.clientWidth);
      if (ABC[i] && ABC[i] !== nation) { tap(); select(i); }
    }, 80);
  }, { passive: true });
  on('prevN', () => { goTo(ABC.indexOf(nation) - 1); });
  on('nextN', () => { goTo(ABC.indexOf(nation) + 1); });
  on('start', async () => {
    if (nationLevel(nation) > lv) return;
    players = Number(playersSel.value);
    elo = Number((document.getElementById('elo') as HTMLSelectElement).value);
    const seed = Math.floor(Math.random() * 1e9);
    const others = NATION_ORDER.filter((n) => n !== nation).sort(() => Math.random() - 0.5).slice(0, players - 1);
    const s = newGame(MAPS[mapId](), [
      { nation },
      ...others.map((n) => {
        const aggression = AGGR[Math.floor(Math.random() * 3)];
        return { nation: n, ai: { aggression, ruler: NATIONS[n].rulers[aggression] } };
      }),
    ], { elo, seed, bandits: BANDIT_COUNT });
    choose('bonus', bonusSel.value);
    applyStartBonus(s, 'p1');
    clearSave();
    saveGame(s);
    try {
      localStorage.setItem('chessciv.nation', nation); localStorage.setItem('chessciv.map', mapId);
      localStorage.setItem('chessciv.players', String(players)); localStorage.setItem('chessciv.elo', String(elo));
    } catch { /* ничего */ }
    openGame(app, s, home);
  });
};

// ---------- Замер движка ----------

const BENCH_FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N2N2/PP2BPPP/R2QKB1R w KQ - 0 9',
  '4k3/2pppp2/8/8/8/8/2PPPP2/1N2K3 w - - 0 1',
];
const START_ARMIES = '1n2k3/2pppp2/8/8/8/8/2PPPP2/1N2K3 w - - 0 1';
const ELOS = [800, 1200, 1600, 2000, 2400];

let engine: Engine | null = null;

const bench = () => {
  setBack(home);
  render(`
    <h1>Engine speed test</h1>
    <p class="muted">Runs Stockfish on this phone. Keep the app open until it finishes.</p>
    <div class="card" id="load"><p>Loading the engine…</p></div>
    <div class="card" id="speed" hidden></div>
    <div class="card" id="battle" hidden></div>
    <div class="card"><div class="log" id="log"></div></div>`);
  const log = (t: string) => { const el = document.getElementById('log'); if (el) el.textContent += t + '\n'; };
  run(log).catch((e) => {
    const el = document.getElementById('load');
    if (el) el.innerHTML = `<p class="bad">${esc(String(e?.message ?? e))}</p>`;
    log(String(e?.stack ?? e));
  });
};

const run = async (log: (t: string) => void) => {
  const t0 = performance.now();
  engine ??= await Engine.load();
  const loadMs = performance.now() - t0;
  document.getElementById('load')!.innerHTML = `<p>Engine ready in ${(loadMs / 1000).toFixed(1)} s</p><p class="muted">Stockfish 18 lite · WASM · 1 thread</p>`;
  log(`engine loaded in ${Math.round(loadMs)} ms`);

  // скорость: 3 позиции по 300 000 узлов
  let nodes = 0, ms = 0;
  for (const [i, fen] of BENCH_FENS.entries()) {
    await engine.ready();
    const r = await engine.search(`fen ${fen}`, 300000);
    nodes += r.nodes; ms += r.ms;
    log(`position ${i + 1}: ${r.nodes} nodes in ${Math.round(r.ms)} ms`);
  }
  const nps = nodes / (ms / 1000);
  // накладные расходы короткого хода
  let small = 0;
  for (let i = 0; i < 10; i++) small += (await engine.search(`fen ${BENCH_FENS[1]}`, 1)).ms;
  const overhead = small / 10;
  const rows = ELOS.map((elo) => {
    const p = profile(elo);
    const perMove = (1 - p.blunder) * (p.nodes / nps * 1000 + overhead);
    const worst = perMove * 150 / 1000;
    const cls = worst <= 10 ? 'ok' : worst <= 20 ? 'warn' : 'bad';
    return `<tr><td>${elo}</td><td class="n">${p.nodes.toLocaleString('en')}</td><td class="n">${perMove.toFixed(0)} ms</td><td class="n ${cls}">${worst.toFixed(1)} s</td></tr>`;
  }).join('');
  const speed = document.getElementById('speed')!;
  speed.hidden = false;
  speed.innerHTML = `<h2>Speed</h2><p class="big">${Math.round(nps / 1000)}k <span class="muted">nodes/s</span></p>
    <table><tr><th>ELO</th><th class="n">Nodes/move</th><th class="n">Per move</th><th class="n">Worst battle</th></tr>${rows}</table>
    <p class="muted" style="margin-top:8px">Worst battle = 150 half-moves, both generals at that ELO. Green ≤ 10 s, amber ≤ 20 s.</p>`;
  log(`nps ${Math.round(nps)}, overhead ${overhead.toFixed(1)} ms`);

  // тестовый автобой стартовых армий
  const battle = document.getElementById('battle')!;
  battle.hidden = false;
  battle.innerHTML = `<h2>Test battle</h2><p class="muted">Starting armies, both generals ELO 1600…</p>`;
  const moves: string[] = [];
  const budget = profile(1600).nodes;
  const tb = performance.now();
  let end = 'limit';
  await engine.ready();
  for (let ply = 0; ply < 150; ply++) {
    const pos = `fen ${START_ARMIES}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;
    const r = await engine.search(pos, budget);
    if (r.best === '(none)' || !r.best) {
      const { inCheck } = await engine.inspect(pos);
      end = inCheck ? `mate, ${ply % 2 ? 'White' : 'Black'} wins` : 'stalemate';
      break;
    }
    moves.push(r.best);
    const after = await engine.inspect(`fen ${START_ARMIES} moves ${moves.join(' ')}`);
    const { white, black } = armiesFromFen(after.fen);
    if (insufficientMaterial(white, black)) { end = 'draw, neither side can mate'; break; }
  }
  const { fen } = await engine.inspect(`fen ${START_ARMIES}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
  const secs = (performance.now() - tb) / 1000;
  battle.innerHTML = `<h2>Test battle</h2><p class="big">${secs.toFixed(1)} s</p>
    <p>${moves.length} half-moves · ${esc(end)}</p><p class="muted">${esc(fen)}</p>`;
  log(`battle: ${moves.length} plies, ${end}, ${secs.toFixed(2)} s`);
};

initTelegram();
initI18n();
initAudio();
applyLook();
syncDynasty(() => { applyLook(); if (onHome && document.getElementById('dynasty')) home(); });
// iOS не слушается user-scalable=no: щипок и двойной тап вне карты гасим сами (быстрые тапы по меню найма не зумят экран)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 && !(e.target as Element | null)?.closest?.('#map')) e.preventDefault();
}, { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 350 && !(e.target as Element | null)?.closest?.('#map')) {
    e.preventDefault(); // второй быстрый тап — не зум; сам клик отдаём кнопке вручную
    (e.target as HTMLElement | null)?.closest<HTMLElement>('button, [data-a], label')?.click();
  }
  lastTouch = now;
}, { passive: false });
home();
