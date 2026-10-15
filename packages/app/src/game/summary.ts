// Итоги кампании: место каждой державы по общей силе и графики экономики и армии по ходам.
// Показываются при победе, поражении и когда игрок сам заканчивает кампанию.

import { NATIONS, finalScore, nationStats, rulerOf, type GameState } from '../../../core/src/index.ts';
import { flagSvg } from './flags.ts';
import { portraitSvg } from './portraits.ts';
import { ownerColor } from './render.ts';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Series = { id: string; name: string; color: string; points: { turn: number; v: number }[] };

/** «Красивый» верх шкалы: 1, 2, 5 × 10ⁿ. */
const niceMax = (v: number): number => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
};

/** Линейный график на SVG: одна ось, тонкие линии цвета держав, касание показывает значения хода. */
const lineChart = (title: string, series: Series[], note: string): string => {
  const W = 340, H = 170, L = 34, R = 10, T = 10, B = 22;
  const turns = series.flatMap((s) => s.points.map((p) => p.turn));
  const t0 = Math.min(...turns), t1 = Math.max(...turns, t0 + 1);
  const vals = series.flatMap((s) => s.points.map((p) => p.v));
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(...vals, 1));
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const marks = lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi];
  const grid = marks.map((v) => {
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" class="tick">${Math.round(v)}</text>`;
  }).join('');
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
    points="${s.points.map((p) => `${x(p.turn).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`).join('');
  const data = esc(JSON.stringify({ t0, t1, L, R, W, series: series.map((s) => ({ name: s.name, color: s.color, points: s.points })) }));
  return `<div class="chart" data-chart="${data}"><h3>${esc(title)}</h3>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} by turn">
      ${grid}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="axis"/>
      <text x="${L}" y="${H - 6}" class="tick">turn ${t0}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="tick">turn ${t1}</text>
      ${lines}<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    </svg><p class="chartnote muted">${esc(note)}</p></div>`;
};

/** Касание графика: вертикальная линия и значения всех держав в этот ход. */
const wireCharts = (root: HTMLElement) => {
  for (const el of root.querySelectorAll<HTMLElement>('[data-chart]')) {
    const d = JSON.parse(el.dataset.chart!) as { t0: number; t1: number; L: number; R: number; W: number; series: Series[] };
    const svg = el.querySelector('svg')!;
    const cross = svg.querySelector<SVGLineElement>('.cross')!;
    const note = el.querySelector<HTMLElement>('.chartnote')!;
    const base = note.textContent;
    const show = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * d.W;
      const t = Math.round(d.t0 + ((px - d.L) / (d.W - d.L - d.R)) * (d.t1 - d.t0));
      const turn = Math.max(d.t0, Math.min(d.t1, t));
      const cx = d.L + ((turn - d.t0) / (d.t1 - d.t0)) * (d.W - d.L - d.R);
      cross.setAttribute('x1', String(cx)); cross.setAttribute('x2', String(cx)); cross.setAttribute('visibility', 'visible');
      const row = d.series.map((s) => {
        const p = [...s.points].reverse().find((q) => q.turn <= turn);
        return p ? `<span><i style="background:${s.color}"></i>${esc(s.name)} ${p.v}</span>` : '';
      }).filter(Boolean).join('');
      note.innerHTML = `<b>Turn ${turn}</b> ${row}`;
    };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons) show(ev); });
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); note.textContent = base; });
  }
};

/** Экран итогов. Возвращается, когда игрок нажал «В меню». */
export const showSummary = (app: HTMLElement, s: GameState, me: string, how: 'victory' | 'defeat' | 'end'): Promise<void> =>
  new Promise((resolve) => {
    const hist = s.history ?? [];
    const last = (id: string) => [...hist].reverse().find((h) => h.p[id])?.p[id];
    const rows = s.order.map((id) => {
      const p = s.players[id];
      const st = p.alive ? nationStats(s, id) : undefined;
      const v = st ? { economy: st.economy, military: st.military, cities: st.cities, area: st.area } : last(id) ?? { economy: 0, military: 0, cities: 0, area: 0 };
      const score = p.alive ? finalScore(v) : 0;
      return { id, p, v, score, peak: Math.max(0, ...hist.map((h) => (h.p[id] ? finalScore(h.p[id]) : 0))) };
    }).sort((a, b) => b.score - a.score || b.peak - a.peak);
    const series = (k: 'economy' | 'military' | 'area'): Series[] => s.order.map((id) => ({
      id, name: NATIONS[s.players[id].nation].name, color: ownerColor(s, id)!,
      points: hist.filter((h) => h.p[id]).map((h) => ({ turn: h.turn, v: h.p[id][k] })),
    })).filter((x) => x.points.length);
    const myPlace = rows.findIndex((r) => r.id === me) + 1;
    const head = how === 'victory' ? 'Victory' : how === 'defeat' ? 'Defeat' : 'Campaign over';
    const sub = how === 'victory' ? `You are the last nation standing on turn ${s.turn}.`
      : how === 'defeat' ? `Your last city fell on turn ${s.turn}.` : `Ended on turn ${s.turn}. Your nation placed ${myPlace} of ${rows.length}.`;
    const el = document.createElement('div');
    el.className = 'summary';
    el.innerHTML = `<div class="sumbox">
      <h1>${head}</h1><p class="muted">${esc(sub)}</p>
      <h2>Final standings</h2>
      <ol class="standings">${rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''} ${r.p.alive ? '' : 'dead'}">
        <span class="place">${i + 1}</span>${portraitSvg(r.p.nation, rulerOf(s, r.id), 40)}
        <div class="who"><b>${flagSvg(r.p.nation, 20)} ${esc(NATIONS[r.p.nation].name)}${r.id === me ? ' · you' : ''}</b>
          <small>${esc(rulerOf(s, r.id))}${r.p.alive ? '' : ' · eliminated'}</small>
          <small>${r.v.cities} cit${r.v.cities === 1 ? 'y' : 'ies'} · area ${r.v.area} · army ${r.v.military} · economy ${r.v.economy}</small></div>
        <span class="score">${r.p.alive ? r.score : '—'}</span></li>`).join('')}</ol>
      <p class="muted">Strength = economy × 2 + military + area × 3 + 25 per city. Eliminated nations score nothing.</p>
      ${lineChart('Economy', series('economy'), 'Income per turn after feeding the army, gold counted ×4. Tap the chart to see a turn.')}
      ${lineChart('Military', series('military'), 'Value of all pieces, stronger with the generals’ ELO. Tap the chart to see a turn.')}
      ${lineChart('Territory', series('area'), 'Cells of land each nation holds. Tap the chart to see a turn.')}
      <div class="legend">${series('economy').map((x) => `<span><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
      <button id="sumdone">Back to menu</button></div>`;
    app.appendChild(el);
    wireCharts(el);
    el.querySelector('#sumdone')!.addEventListener('click', () => { el.remove(); resolve(); });
  });
