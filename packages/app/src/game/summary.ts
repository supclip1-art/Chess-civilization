// Итоги кампании: место каждой державы по общей силе и графики экономики и армии по ходам.
// Показываются при победе, поражении и когда игрок сам заканчивает кампанию.

import { TITLES, UNLOCKS, levelOf, type CampaignXp } from '../dynasty.ts';
import { xpBar } from '../dynastyScreen.ts';
import { NATIONS, finalScore, nationStats, rulerOf, type GameState } from '../../../core/src/index.ts';
import { flagSvg } from './flags.ts';
import { portraitSvg } from './portraits.ts';
import { ownerColor } from './render.ts';
import { iconSvg } from './icons.ts';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Series = { id: string; name: string; color: string; points: { turn: number; v: number }[] };

/** «Красивый» верх шкалы: 1, 2, 5 × 10ⁿ. */
const niceMax = (v: number): number => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
};

/** Линейный график на SVG: плавные линии цвета держав, своя — толще и с заливкой, точки на конце; касание показывает ход. */
const lineChart = (title: string, ico: string, series: Series[], note: string, me: string): string => {
  const W = 340, H = 180, L = 34, R = 12, T = 12, B = 22;
  const turns = series.flatMap((s) => s.points.map((p) => p.turn));
  const t0 = Math.min(...turns), t1 = Math.max(...turns, t0 + 1);
  const vals = series.flatMap((s) => s.points.map((p) => p.v));
  const lo = Math.min(0, ...vals), hi = niceMax(Math.max(...vals, 1));
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const marks = lo < 0 ? [lo, 0, hi] : [0, hi / 2, hi];
  const grid = marks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" class="tick">${Math.round(v)}</text>`).join('');
  /** Сглаженная линия (кривые Безье через середины отрезков). */
  const smooth = (pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) d += `Q${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${((pts[i].x + pts[i + 1].x) / 2).toFixed(1)},${((pts[i].y + pts[i + 1].y) / 2).toFixed(1)}`;
    const e = pts[pts.length - 1];
    return d + `L${e.x.toFixed(1)},${e.y.toFixed(1)}`;
  };
  const gid = `g${title.replace(/\W/g, '')}`;
  const order = [...series].sort((a, b) => Number(a.id === me) - Number(b.id === me)); // своя линия — поверх остальных
  const lines = order.map((s) => {
    const pts = s.points.map((p) => ({ x: x(p.turn), y: y(p.v) }));
    const d = smooth(pts);
    const end = pts[pts.length - 1];
    const mine = s.id === me;
    const area = mine && pts.length > 1 ? `<path d="${d}L${end.x.toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}L${pts[0].x.toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}Z" fill="url(#${gid})" stroke="none"/>` : '';
    return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${mine ? 3.4 : 2}" stroke-linejoin="round" stroke-linecap="round" opacity="${mine ? 1 : 0.8}"/>
      <circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="${mine ? 4.2 : 3}" fill="${s.color}" stroke="#fff" stroke-width="1.4"/>`;
  }).join('');
  const myColor = series.find((s) => s.id === me)?.color ?? '#e6b84a';
  const data = esc(JSON.stringify({ t0, t1, L, R, W, series: series.map((s) => ({ name: s.name, color: s.color, points: s.points })) }));
  return `<div class="chart" data-chart="${data}"><div class="charthead"><span class="cico">${ico}</span><h3>${esc(title)}</h3></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} by turn">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${myColor}" stop-opacity=".32"/><stop offset="1" stop-color="${myColor}" stop-opacity="0"/></linearGradient></defs>
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
/** Блок «Династия» в итогах: опыт по пунктам, полоса уровня, новые награды. */
const dynastyBlock = (x: CampaignXp): string => {
  const lb = levelOf(x.before), la = levelOf(x.after);
  const items = UNLOCKS.filter((u) => u.level > lb && u.level <= la);
  const total = x.after - x.before;
  return `<div class="sumdyn"><div class="charthead"><span class="cico">♛</span><h3>Dynasty</h3><b class="xpsum">+${total} XP</b></div>
    <div class="xplines">${x.lines.map(([n, v]) => `<span class="xpl"><span>${esc(n)}</span><b>+${v}</b></span>`).join('')}
    ${x.got.map((a) => `<span class="xpl ach"><span>★ ${esc(a.name)}</span><b>+${a.xp}</b></span>`).join('')}</div>
    <p class="xplvl"><b>${la > lb ? `New level ${la}: ${TITLES[la - 1]}!` : `Level ${la} · ${TITLES[la - 1]}`}</b></p>${xpBar(x.after)}
    ${items.length ? `<div class="chips">${items.map((u) => `<span class="chip gold">🎁 ${esc(u.name)}</span>`).join('')}</div>` : ''}</div>`;
};

export const showSummary = (app: HTMLElement, s: GameState, me: string, how: 'victory' | 'defeat' | 'end', xp?: CampaignXp, custom?: { head: string; sub: string }): Promise<void> =>
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
    const head = custom?.head ?? (how === 'victory' ? 'Victory' : how === 'defeat' ? 'Defeat' : 'Campaign over');
    const sub = custom?.sub ?? (how === 'victory' ? `You are the last nation standing on turn ${s.turn}.`
      : how === 'defeat' ? `Your last city fell on turn ${s.turn}.` : `Ended on turn ${s.turn}. Your nation placed ${myPlace} of ${rows.length}.`);
    const el = document.createElement('div');
    el.className = 'summary';
    const mood = how === 'victory' ? 'win' : how === 'defeat' ? 'lose' : 'end';
    const crown = how === 'victory' ? '♛' : how === 'defeat' ? '⚑' : '⚜';
    const meRow = rows.find((r) => r.id === me);
    const medal = (i: number) => `<span class="rmedal ${i === 1 ? 'r1' : i === 2 ? 'r2' : i === 3 ? 'r3' : ''}">${i}</span>`;
    el.innerHTML = `<div class="sumhero ${mood}" style="--c:${ownerColor(s, me)}">
        <span class="sumcrown">${crown}</span>
        ${meRow ? `<span class="sumport">${portraitSvg(meRow.p.nation, rulerOf(s, me), 74)}</span>` : ''}
        <h1>${esc(head)}</h1><p>${esc(sub)}</p>
        <div class="sumfacts"><span>${medal(myPlace)} Place</span><span>⏳ turn ${s.turn}</span>${meRow ? `<span>🏰 ${meRow.v.cities} cit${meRow.v.cities === 1 ? 'y' : 'ies'}</span>` : ''}</div>
      </div>
      <div class="sumbox">
      ${xp ? dynastyBlock(xp) : ''}
      <h2>Final standings</h2>
      <ol class="standings">${rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''} ${r.p.alive ? '' : 'dead'}" style="--c:${ownerColor(s, r.id)}">
        ${medal(i + 1)}<span class="npc">${portraitSvg(r.p.nation, rulerOf(s, r.id), 42)}</span>
        <div class="who"><b><span class="fc">${flagSvg(r.p.nation, 20)}</span> ${esc(NATIONS[r.p.nation].name)}${r.id === me ? ' · you' : ''}</b>
          <small>${esc(rulerOf(s, r.id))}${r.p.alive ? '' : ' · eliminated'}</small>
          <span class="stchips"><i>🏰 ${r.v.cities}</i><i>⬢ ${r.v.area}</i><i>⚔ ${r.v.military}</i><i>${iconSvg('gold', 11)} ${r.v.economy}</i></span></div>
        <span class="score">${r.p.alive ? r.score : '—'}</span></li>`).join('')}</ol>
      <p class="muted">Strength = economy × 2 + military + area × 3 + 25 per city. Eliminated nations score nothing.</p>
      <div class="legend">${series('economy').map((x) => `<span class="${x.id === me ? 'me' : ''}"><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
      ${lineChart('Economy', iconSvg('gold', 18), series('economy'), 'Income per turn after feeding the army, gold counted ×4. Tap the chart to see a turn.', me)}
      ${lineChart('Military', '⚔', series('military'), 'Value of all pieces, stronger with the generals’ ELO. Tap the chart to see a turn.', me)}
      ${lineChart('Territory', '⬢', series('area'), 'Cells of land each nation holds. Tap the chart to see a turn.', me)}
      <button id="sumdone" class="playbtn">Back to menu</button></div>`;
    app.appendChild(el);
    wireCharts(el);
    el.querySelector('#sumdone')!.addEventListener('click', () => { el.remove(); resolve(); });
  });
