// Каркас Mini App (этап 1): главный экран, создание партии на ядре правил и замер Stockfish.
// Карта и бои появятся на этапах 3–4.

import {
  NATIONS, income, newGame, playerGenerals, sandboxMap, upkeep, type Aggression, type GameState, type NationId,
} from '../../core/src/index.ts';
import { Engine, profile } from './engine.ts';
import { initTelegram, platformLabel, setBack, tap, userName } from './tg.ts';

const app = document.getElementById('app')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const render = (html: string) => { app.innerHTML = html; };
const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', () => { tap(); fn(); });

// ---------- Главный экран ----------

const home = () => {
  setBack(null);
  const name = userName();
  render(`
    <div><h1>Chess Civilization</h1><p class="muted">Build an empire. Every war is a real chess game.</p></div>
    ${name ? `<p>Welcome, ${esc(name)}.</p>` : ''}
    <button id="new">New game</button>
    <button id="bench" class="ghost">Engine speed test</button>
    <p class="muted">Early build · ${esc(platformLabel())}</p>
    <p class="muted">Chess engine: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">Stockfish</a> (GPL-3.0).</p>`);
  on('new', setup);
  on('bench', bench);
};

// ---------- Новая партия ----------

const MVP_NATIONS: NationId[] = ['russia', 'germany', 'france', 'britain', 'spain', 'turkey'];
const AGGR: Aggression[] = ['warlike', 'moderate', 'peaceful'];

const setup = () => {
  setBack(home);
  let nation: NationId = 'russia';
  const draw = () => {
    render(`
      <h1>New game</h1>
      <div class="card"><h2>Your nation</h2><div class="grid">
        ${MVP_NATIONS.map((id) => `<button class="nation ${id === nation ? 'on' : ''}" data-n="${id}"><b>${NATIONS[id].name}</b><span>${esc(NATIONS[id].bonus)}</span></button>`).join('')}
      </div></div>
      <div class="card">
        <div class="row"><span>Players</span><select id="players">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="row" style="margin-top:10px"><span>Generals' ELO</span><select id="elo">${[800, 1000, 1200, 1400, 1600, 1800, 2000].map((e) => `<option ${e === 1200 ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
        <p class="muted" style="margin-top:10px">One ELO for every general in the game, yours and the AI's.</p>
      </div>
      <button id="start">Start</button>`);
    app.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) =>
      b.addEventListener('click', () => { tap(); nation = b.dataset.n as NationId; draw(); }));
    on('start', () => {
      const players = Number((document.getElementById('players') as HTMLSelectElement).value);
      const elo = Number((document.getElementById('elo') as HTMLSelectElement).value);
      const seed = Math.floor(Math.random() * 1e9);
      const others = MVP_NATIONS.filter((n) => n !== nation).sort(() => Math.random() - 0.5).slice(0, players - 1);
      const s = newGame(sandboxMap(), [
        { nation },
        ...others.map((n) => {
          const aggression = AGGR[Math.floor(Math.random() * 3)];
          return { nation: n, ai: { aggression, ruler: NATIONS[n].rulers[aggression] } };
        }),
      ], { elo, seed });
      created(s);
    });
  };
  draw();
};

const created = (s: GameState) => {
  setBack(setup);
  const me = s.players.p1;
  const g = playerGenerals(s, 'p1')[0];
  const inc = income(s, 'p1');
  render(`
    <h1>${NATIONS[me.nation].name}</h1>
    <p class="muted">${esc(NATIONS[me.nation].bonus)} · turn ${s.turn}</p>
    <div class="card"><h2>Your general</h2>
      <p>ELO ${g.elo} · ${'★'.repeat(g.stars) || 'no stars yet'}</p>
      <p class="muted">White: ${esc(g.white)} · vs 1.e4: ${esc(g.vsE4)} · vs 1.d4: ${esc(g.vsD4)}</p>
      <p>Army: king, ${g.army.p} pawns, ${g.army.n} knight</p></div>
    <div class="card"><h2>Treasury</h2>
      <p>Wood ${me.res.wood} · Food ${me.res.food} · Gold ${me.res.gold}</p>
      <p class="muted">Income ${inc.wood}/${inc.food}/${inc.gold} per turn, army upkeep ${upkeep(s, 'p1')} food</p></div>
    <div class="card"><h2>Rivals</h2><table>
      ${s.order.slice(1).map((id) => { const p = s.players[id]; return `<tr><td>${NATIONS[p.nation].name}</td><td>${esc(p.ai!.ruler)}</td><td class="muted">${p.ai!.aggression}</td></tr>`; }).join('')}
    </table><p class="muted" style="margin-top:8px">${Object.keys(s.neutrals).length} neutral states on the map.</p></div>
    <p class="muted">The map arrives in the next build. This screen checks that the rules core runs inside Telegram.</p>
    <button id="again" class="ghost">Back to menu</button>`);
  on('again', home);
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
  }
  const { fen } = await engine.inspect(`fen ${START_ARMIES}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
  const secs = (performance.now() - tb) / 1000;
  battle.innerHTML = `<h2>Test battle</h2><p class="big">${secs.toFixed(1)} s</p>
    <p>${moves.length} half-moves · ${esc(end)}</p><p class="muted">${esc(fen)}</p>`;
  log(`battle: ${moves.length} plies, ${end}, ${secs.toFixed(2)} s`);
};

initTelegram();
home();
