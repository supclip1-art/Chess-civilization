// Mini App: главное меню, новая партия, партия на карте (этап 3) и замер Stockfish.

import {
  NATIONS, NATION_ORDER, armiesFromFen, europeMap, insufficientMaterial, newGame, type Aggression, type NationId,
} from '../../core/src/index.ts';
import { Engine, profile } from './engine.ts';
import { openGame } from './game/screen.ts';
import { showPuzzle } from './game/puzzle.ts';
import { flagSvg } from './game/flags.ts';
import { resetTutorial } from './game/tutorial.ts';
import { clearSave, loadGame, saveGame } from './game/save.ts';
import { initTelegram, platformLabel, setBack, tap, userName } from './tg.ts';

declare const __BUILD__: string; // подставляет сборка: короткий хеш коммита

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const render = (html: string) => { app.innerHTML = html; };
const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', () => { tap(); fn(); });

// ---------- Главный экран ----------

const home = () => {
  setBack(null);
  const name = userName();
  const saved = loadGame();
  const alive = saved && saved.players?.p1?.alive && saved.order.filter((id) => saved.players[id].alive).length > 1;
  render(`
    <div><h1>Chess Civilization</h1><p class="muted">Build an empire. Every war is a real chess game.</p></div>
    ${name ? `<p>Welcome, ${esc(name)}.</p>` : ''}
    ${alive ? `<button id="continue">Continue · ${esc(NATIONS[saved!.players.p1.nation].name)}, turn ${saved!.turn}</button>` : ''}
    <button id="new" ${alive ? 'class="ghost"' : ''}>New game</button>
    <button id="puzzle" class="ghost">Warm-up puzzle</button>
    <button id="howto" class="ghost">How to play</button>
    <button id="bench" class="ghost">Engine speed test</button>
    <p class="muted">Build ${esc(__BUILD__)} · ${esc(platformLabel())}</p>
    <p class="muted">Chess engine: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish</a> (GPL-3.0).</p>`);
  on('continue', () => { if (saved) openGame(app, saved, home); });
  on('new', setup);
  on('bench', bench);
  on('howto', () => {
    resetTutorial();
    if (alive && saved) openGame(app, saved, home); else setup();
  });
  on('puzzle', async () => { setBack(null); await showPuzzle(app, 'Back to menu'); home(); });
};

// ---------- Новая партия ----------

// Карта «Европа»: любая из 26 наций, места на карте игроки получают случайно.
const MAP = europeMap;
const AGGR: Aggression[] = ['warlike', 'moderate', 'peaceful'];

const setup = () => {
  setBack(home);
  let nation: NationId = 'russia';
  let warmup = true;
  try {
    warmup = localStorage.getItem('chessciv.warmup') !== '0';
    const last = localStorage.getItem('chessciv.nation') as NationId | null;
    if (last && NATIONS[last]) nation = last;
  } catch { /* ничего */ }
  const spawns = MAP().spawns.length;
  render(`
    <h1>New game</h1>
    <p class="muted">Map: Europe · up to ${spawns} nations · starting places are random</p>
    <h2 class="pick">Your nation <span class="muted" id="picked"></span></h2>
    <div class="nations" id="nations">
      ${NATION_ORDER.map((id) => `<button class="nation ${id === nation ? 'on' : ''}" data-n="${id}">
        ${flagSvg(id, 54)}<b>${esc(NATIONS[id].name)}</b><span>${esc(NATIONS[id].bonus)}</span><small>${esc(NATIONS[id].effect)}</small></button>`).join('')}
    </div>
    <div class="card">
      <div class="row"><span>Players</span><select id="players">${Array.from({ length: spawns - 1 }, (_, i) => i + 2).map((n) => `<option ${n === spawns ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:10px"><span>Generals' ELO</span><select id="elo">${[800, 1000, 1200, 1400, 1600, 1800, 2000].map((e) => `<option ${e === 1200 ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <p class="muted" style="margin-top:10px">One ELO for every general in the game, yours and the AI's.</p>
      <label class="row" style="margin-top:10px"><span>Warm-up puzzle before the game</span><input type="checkbox" id="warmup" ${warmup ? 'checked' : ''}></label>
    </div>
    <button id="start">Start</button>`);
  const picked = () => { document.getElementById('picked')!.textContent = `· ${NATIONS[nation].name}`; };
  picked();
  const strip = document.getElementById('nations')!;
  strip.querySelector<HTMLElement>('.nation.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  strip.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-n]');
    if (!b) return;
    tap();
    nation = b.dataset.n as NationId;
    strip.querySelectorAll('.nation').forEach((x) => x.classList.toggle('on', x === b));
    b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    picked();
  });
  on('start', async () => {
    const players = Number((document.getElementById('players') as HTMLSelectElement).value);
    const elo = Number((document.getElementById('elo') as HTMLSelectElement).value);
    const seed = Math.floor(Math.random() * 1e9);
    const others = NATION_ORDER.filter((n) => n !== nation).sort(() => Math.random() - 0.5).slice(0, players - 1);
    const s = newGame(MAP(), [
      { nation },
      ...others.map((n) => {
        const aggression = AGGR[Math.floor(Math.random() * 3)];
        return { nation: n, ai: { aggression, ruler: NATIONS[n].rulers[aggression] } };
      }),
    ], { elo, seed });
    clearSave();
    saveGame(s);
    const wantPuzzle = (document.getElementById('warmup') as HTMLInputElement).checked;
    try { localStorage.setItem('chessciv.warmup', wantPuzzle ? '1' : '0'); localStorage.setItem('chessciv.nation', nation); } catch { /* ничего */ }
    if (wantPuzzle) { setBack(null); await showPuzzle(app); }
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
home();
