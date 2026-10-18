// Mini App: главное меню, новая партия, партия на карте (этап 3) и замер Stockfish.

import {
  NATIONS, armiesFromFen, insufficientMaterial, type NationId,
} from '../../core/src/index.ts';
import { Engine, profile } from './engine.ts';
import { openGame } from './game/screen.ts';
import { flagSvg } from './game/flags.ts';
import { drawHero } from './hero.ts';
import { openSetup } from './setup.ts';
import { openCampaign } from './campaignScreen.ts';
import { totalStars } from './campaign.ts';
import { resetTutorial } from './game/tutorial.ts';
import { clearSave, loadGame, saveGame } from './game/save.ts';
import { MUSIC_STYLES, audioPrefs, initAudio, page, setMusic, setMusicStyle, setSfx } from './audio.ts';
import { LANGS, initI18n, lang, setLang } from './i18n.ts';
import { initTelegram, platformLabel, setBack, tap, userName } from './tg.ts';
import { applyLook, syncDynasty } from './dynasty.ts';
import { dynastyButton, openDynasty } from './dynastyScreen.ts';
import { MONETIZED, access, fmtLeft, refreshAccess } from './access.ts';
import { openShop } from './shop.ts';

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
  let lastNation: NationId = 'italy';
  try { const n = localStorage.getItem('chessciv.nation') as NationId | null; if (n && NATIONS[n]) lastNation = n; } catch { /* по умолчанию */ }
  const heroNation = alive ? saved!.players.p1.nation : lastNation;
  const cont = alive ? (() => {
    const s = saved!;
    const cities = Object.values(s.halls).filter((h) => h.owner === 'p1').length;
    const gens = Object.values(s.generals).filter((g) => g.owner === 'p1').length;
    return `<div class="contcard"><span class="contflag">${flagSvg(s.players.p1.nation, 44)}</span>
      <div class="conttext"><b>${esc(NATIONS[s.players.p1.nation].name)}</b><small><span>Turn ${s.turn}</span> · <span>${cities} cit${cities === 1 ? 'y' : 'ies'}</span> · <span>${gens} general${gens === 1 ? '' : 's'}</span></small></div>
      <button id="continue" class="contbtn">Continue</button></div>`;
  })() : '';
  render(`
    <div class="hero"><canvas id="herocv" aria-hidden="true"></canvas>
      <div class="herotext"><h1 class="wordmark">Checkmate<br>Empires</h1><p>Build an empire. Every war is a real game of chess.</p></div></div>
    <div class="homebody">
      ${name ? `<p class="hello">Welcome, ${esc(name)}.</p>` : ''}
      ${cont}
      <button id="new" class="playbtn ${alive ? 'second' : ''}">New game</button>
      <button id="campaign" class="campbtn"><span class="campico">📜</span><span><b>Chronicles of Empires</b><small>Campaign · ${totalStars()} / 24 ★</small></span></button>
      ${dynastyButton()}
      ${MONETIZED ? (access().premium ? '<button id="crown" class="crownbtn own"><span>👑</span><b>Imperial Crown</b><small>One purchase, yours forever</small></button>'
        : `<button id="crown" class="crownbtn"><span>👑</span><b>Imperial Crown</b><small>all chapters and maps · no limit</small><i class="notr">⏳ ${fmtLeft(access().secondsLeft)}</i></button>`) : ''}
      <div class="homerow"><button id="howto" class="ghost">How to play</button><button id="settingsbtn" class="ghost" aria-expanded="false">Settings</button></div>
      <div class="settings" id="settings" hidden>
        <div class="row"><span>Language</span><div class="seg notr" id="langs">${LANGS.map(([l, n]) => `<button data-l="${l}" class="${l === lang ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <div class="row soundrow"><button id="music" class="ghost">Music: ${audioPrefs().music ? 'on' : 'off'}</button><button id="sfx" class="ghost">Sounds: ${audioPrefs().sfx ? 'on' : 'off'}</button></div>
        <div class="row"><span>Music style</span><select id="mstyle">${MUSIC_STYLES.map((m) => `<option value="${m.id}" ${m.id === (audioPrefs().style || 1) ? 'selected' : ''}>${m.id}. ${esc(m.name)}</option>`).join('')}</select></div>
        <button id="bench" class="ghost">Engine speed test</button>
        <p class="muted">Version ${esc(__BUILD__)} · ${esc(platformLabel())}</p>
        <p class="muted">Chess engine: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish</a> (GPL-3.0). Pieces: cburnett by Colin M.L. Burnett (GPLv2+).</p>
      </div>
    </div>`);
  void drawHero(document.getElementById('herocv') as HTMLCanvasElement, heroNation);
  let settingsOpen = false;
  try { settingsOpen = sessionStorage.getItem('chessciv.settings') === '1'; } catch { /* ничего */ }
  const showSettings = (on: boolean) => {
    settingsOpen = on;
    document.getElementById('settings')!.hidden = !on;
    document.getElementById('settingsbtn')!.setAttribute('aria-expanded', String(on));
    try { sessionStorage.setItem('chessciv.settings', on ? '1' : '0'); } catch { /* ничего */ }
  };
  showSettings(settingsOpen);
  on('settingsbtn', () => showSettings(!settingsOpen));
  on('continue', () => { if (saved) { onHome = false; openGame(app, saved, home); } });
  on('new', () => { page(); setup(); });
  on('campaign', () => { page(); onHome = false; openCampaign(app, home, (s) => { clearSave(); saveGame(s); openGame(app, s, home); }); });
  on('dynasty', () => { page(); onHome = false; openDynasty(app, home); });
  on('crown', () => { page(); onHome = false; openShop(app, home); });
  for (const b of document.querySelectorAll<HTMLButtonElement>('#langs button')) b.addEventListener('click', () => { if (b.dataset.l !== lang) setLang(b.dataset.l as typeof lang); });
  on('music', () => { setMusic(!audioPrefs().music); home(); });
  on('sfx', () => { setSfx(!audioPrefs().sfx); home(); });
  document.getElementById('mstyle')?.addEventListener('change', (e) => setMusicStyle(Number((e.target as HTMLSelectElement).value)));
  on('bench', () => { onHome = false; bench(); });
  on('howto', () => {
    onHome = false;
    resetTutorial();
    if (alive && saved) openGame(app, saved, home); else setup();
  });
};

// ---------- Новая партия ----------

const setup = () => {
  onHome = false;
  openSetup(app, home, (s) => { clearSave(); saveGame(s); openGame(app, s, home); });
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
// доступ (корона, бесплатное время) — с сервера; пришёл ответ — обновить главное меню
void refreshAccess().then(() => { if (onHome) home(); });
