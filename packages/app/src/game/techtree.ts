// Дерево технологий: узлы с рисованными медальонами, линии зависимостей, состояние каждого узла
// (изучено, изучается, доступно, закрыто). Пока в дереве ветка «Тактика» (+ELO новым генералам) и «Марш-бросок».

import { ARMY_MOVE_MARCH, ELO_PER_RESEARCH, MARCH_RESEARCH, RESEARCH, researchCost, researchTurns, type GameState, type Res } from '../../../core/src/index.ts';

export type TechState = 'done' | 'active' | 'open' | 'locked';
export type TechNode = {
  id: string; name: string; text: string; icon: string;
  col: number; row: number; needs: string[];
  state: TechState; cost: Res; turns: number; finish?: number;
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const TIER = [['#c98b4a', '#7a4a1e'], ['#d6dbe0', '#7d8791'], ['#f2cf5b', '#9a7412'], ['#7fd1c8', '#21716a'], ['#c9a0ff', '#5b2c9e']];

/** Медальон: круг с кантом и рисунком внутри. */
const medal = (inner: string, rim: [string, string]) => `<svg viewBox="0 0 48 48" class="techicon" aria-hidden="true">
  <defs><radialGradient id="g${rim[0].slice(1)}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".25" stop-color="${rim[0]}"/><stop offset="1" stop-color="${rim[1]}"/></radialGradient></defs>
  <circle cx="24" cy="24" r="22" fill="url(#g${rim[0].slice(1)})" stroke="${rim[1]}" stroke-width="1.5"/>
  <circle cx="24" cy="24" r="17" fill="#22303f" stroke="rgba(255,255,255,.35)" stroke-width="1"/>${inner}</svg>`;

/** Скрещённые мечи и римская цифра ступени. */
const swords = (n: number) => `
  <g stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 33L31 15" stroke="#e8edf2" stroke-width="3"/><path d="M33 33L17 15" stroke="#e8edf2" stroke-width="3"/>
    <path d="M13.5 30.5l5 5M34.5 30.5l-5 5" stroke="#d1a24a" stroke-width="3"/>
    <path d="M31 15l2-2M17 15l-2-2" stroke="#ffffff" stroke-width="2"/>
  </g>
  <text x="24" y="44.5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" stroke="#22303f" stroke-width="2.5" paint-order="stroke" font-family="Georgia, serif">${ROMAN[n]}</text>`;

/** Крылатый сапог — марш-бросок. */
const boot = `
  <path d="M18 13h7v13l8 4c2 1 3 3 3 5v1H16v-6z" fill="#c98b4a" stroke="#5a3719" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M16 36h20" stroke="#5a3719" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M25 17c4-5 9-6 13-5-3 1-5 2-6 4 3-1 5-1 7 0-3 1-6 2-8 4 2 0 4 0 5 1-4 1-7 1-11 0z" fill="#ffffff" stroke="#9fb3c8" stroke-width=".8"/>`;

export const techNodes = (s: GameState, pid: string): TechNode[] => {
  const r = s.players[pid].research;
  const nodes: TechNode[] = RESEARCH.map((_, i) => ({
    id: `t${i}`, name: `Tactics ${ROMAN[i]}`,
    text: `Every general hired after this is ${ELO_PER_RESEARCH} ELO stronger.`,
    icon: medal(swords(i), TIER[i] as [string, string]),
    col: 0, row: i, needs: i ? [`t${i - 1}`] : [],
    state: (i < r.done ? 'done' : r.active?.step === i ? 'active' : i === r.done && !r.active ? 'open' : 'locked') as TechState,
    cost: researchCost(s, pid, i), turns: researchTurns(s, pid, i), finish: r.active?.step === i ? r.active.finish : undefined,
  }));
  nodes.push({
    id: 'march', name: 'Forced march', text: `Generals and settlers move ${ARMY_MOVE_MARCH} cells per turn instead of 2.`,
    icon: medal(boot, ['#9ad0ff', '#2d6aa0']), col: 1, row: 2, needs: ['t1'],
    state: r.march ? 'done' : r.marchFinish ? 'active' : r.done >= 2 ? 'open' : 'locked',
    cost: MARCH_RESEARCH.cost, turns: MARCH_RESEARCH.turns, finish: r.marchFinish,
  });
  return nodes;
};

/** Разметка дерева: узлы-кнопки поверх линий зависимостей. */
export const techTreeHtml = (nodes: TechNode[], picked?: string): string => {
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;
  const ROW = 88, COLX = [28, 72]; // проценты ширины для колонок
  const pos = (n: TechNode) => ({ x: COLX[n.col], y: n.row * ROW + 40 });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lines = nodes.flatMap((n) => n.needs.map((id) => {
    const a = pos(byId.get(id)!), b = pos(n);
    const done = byId.get(id)!.state === 'done';
    const path = a.x === b.x ? `M${a.x} ${a.y} L${b.x} ${b.y}` : `M${a.x} ${a.y} C${a.x} ${(a.y + b.y) / 2} ${b.x} ${a.y} ${b.x} ${b.y}`;
    return `<path d="${path}" class="${done ? 'lit' : ''}" vector-effect="non-scaling-stroke"/>`;
  })).join('');
  return `<div class="tree" style="height:${rows * ROW}px">
    <svg class="treelines" viewBox="0 0 100 ${rows * ROW}" preserveAspectRatio="none">${lines}</svg>
    ${nodes.map((n) => { const p = pos(n); return `<button class="tnode ${n.state} ${picked === n.id ? 'picked' : ''}" data-a="tech:${n.id}" style="left:${p.x}%;top:${p.y}px">
      ${n.icon}<span>${n.name}</span>${n.state === 'done' ? '<i class="tick">✓</i>' : n.state === 'active' ? '<i class="tick busy">⏳</i>' : n.state === 'locked' ? '<i class="tick lock">🔒</i>' : ''}</button>`; }).join('')}
  </div>`;
};
