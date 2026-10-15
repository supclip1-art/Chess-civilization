// Дерево технологий: узлы с рисованными медальонами, линии зависимостей, состояние каждого узла
// (изучено, изучается, доступно, закрыто). Пока в дереве ветка «Тактика» (+ELO новым генералам) и «Марш-бросок».

import { ELO_PER_RESEARCH, RESEARCH, TECHS, researchCost, researchTurns, techCost, techReady, type GameState, type Res, type TechId } from '../../../core/src/index.ts';

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

/** Рисунки для медальонов технологий (внутри круга 48×48, центр 24,24). */
const pawn = (fill: string) => `<path d="M24 12a4 4 0 0 1 2.6 7c2 1 3.4 3 3.4 5.5h-2.5l2 7.5h-11l2-7.5H18c0-2.5 1.4-4.5 3.4-5.5A4 4 0 0 1 24 12z" fill="${fill}" stroke="#22303f" stroke-width="1"/><rect x="16" y="32" width="16" height="3.5" rx="1.5" fill="${fill}" stroke="#22303f" stroke-width="1"/>`;
const ICONS = {
  militia: pawn('#e8edf2') + '<path d="M30 14l5 -3M33 12l1.5 3" stroke="#d1a24a" stroke-width="2" stroke-linecap="round"/>',
  cavalry: '<path d="M17 35h15c0-5-1-8-4-11 2-1 4-1 5 1l2-3c-2-3-6-5-10-5-4 0-6 3-7 6 2 0 3 0 4 1-3 2-5 6-5 11z" fill="#e8edf2" stroke="#22303f" stroke-width="1.1" stroke-linejoin="round"/><circle cx="27" cy="18" r="1" fill="#22303f"/>',
  fortify: '<path d="M14 34V19h3v3h3v-3h3v3h2v-3h3v3h3v-3h3v15z" fill="#d6c7a7" stroke="#4a3a1f" stroke-width="1.1" stroke-linejoin="round"/><path d="M21 34v-5a3 3 0 0 1 6 0v5" fill="#5a4328"/><path d="M24 11v6M24 11l5 2-5 2" stroke="#c0392b" stroke-width="1.6" fill="#c0392b" stroke-linejoin="round"/>',
  veterans: '<path d="M24 12l3.3 6.8 7.5 1.1-5.4 5.3 1.3 7.4L24 29l-6.7 3.6 1.3-7.4-5.4-5.3 7.5-1.1z" fill="#f2cf5b" stroke="#9a7412" stroke-width="1.1" stroke-linejoin="round"/><path d="M18 33l-2 4 3-1 1 3 2-5M30 33l2 4-3-1-1 3-2-5" fill="#c0392b"/>',
  quartermaster: '<path d="M15 22h18l-2 12H17z" fill="#b9824f" stroke="#5a3719" stroke-width="1.1" stroke-linejoin="round"/><path d="M15 22c2-5 16-5 18 0" fill="#e2b13c" stroke="#7c5c17" stroke-width="1"/><path d="M19 26h10M18 30h12" stroke="#5a3719" stroke-width="1"/>',
  guilds: '<path d="M15 34V22l9-7 9 7v12z" fill="#e8d6b0" stroke="#4a3a1f" stroke-width="1.1" stroke-linejoin="round"/><path d="M14 22l10-8 10 8" fill="none" stroke="#9b5a2a" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 13h3v6" stroke="#4a3a1f" stroke-width="1.6" fill="none"/><path d="M21 34v-6h6v6" fill="#5a4328"/><circle cx="24" cy="23" r="2" fill="#f2cf5b"/>',
  masons: '<path d="M15 28h8v6h-8zM25 28h8v6h-8zM20 22h8v6h-8z" fill="#c9bba0" stroke="#4a3a1f" stroke-width="1"/><path d="M30 12l5 5-3 3-5-5z" fill="#9ba5af" stroke="#454d55" stroke-width="1"/><path d="M29 19l-6 6" stroke="#7a4a22" stroke-width="2.4" stroke-linecap="round"/>',
  roads: '<path d="M19 36l3-24h4l3 24z" fill="#c9b48a" stroke="#6b5434" stroke-width="1.1" stroke-linejoin="round"/><path d="M24 14v4M24 21v4M24 28v5" stroke="#fff6d8" stroke-width="1.6" stroke-linecap="round"/><path d="M12 36h24" stroke="#4f8a3a" stroke-width="2"/>',
  academy: '<path d="M10 20l14-7 14 7-14 7z" fill="#2f4a6b" stroke="#16263a" stroke-width="1" stroke-linejoin="round"/><path d="M16 23v6c0 2 4 4 8 4s8-2 8-4v-6l-8 4z" fill="#3e5f86" stroke="#16263a" stroke-width="1" stroke-linejoin="round"/><path d="M36 21v8" stroke="#f2cf5b" stroke-width="1.6"/><circle cx="36" cy="30" r="1.6" fill="#f2cf5b"/>',
  cartography: '<path d="M13 16l7-3 8 3 7-3v19l-7 3-8-3-7 3z" fill="#f4e6c3" stroke="#6b4f1d" stroke-width="1.1" stroke-linejoin="round"/><path d="M20 13v19M28 16v19" stroke="#c9b48a" stroke-width="1"/><circle cx="31" cy="30" r="4.5" fill="none" stroke="#2f4a6b" stroke-width="2"/><path d="M34 33l3 3" stroke="#2f4a6b" stroke-width="2.4" stroke-linecap="round"/>',
};

/** Крылатый сапог — марш-бросок. */
const boot = `
  <path d="M18 13h7v13l8 4c2 1 3 3 3 5v1H16v-6z" fill="#c98b4a" stroke="#5a3719" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M16 36h20" stroke="#5a3719" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M25 17c4-5 9-6 13-5-3 1-5 2-6 4 3-1 5-1 7 0-3 1-6 2-8 4 2 0 4 0 5 1-4 1-7 1-11 0z" fill="#ffffff" stroke="#9fb3c8" stroke-width=".8"/>`;

const TECH_ICON: Record<TechId, string> = {
  militia: medal(ICONS.militia, ['#c98b4a', '#7a4a1e']), cavalry: medal(ICONS.cavalry, ['#d6dbe0', '#7d8791']),
  fortify: medal(ICONS.fortify, ['#e0b06a', '#7a5520']), veterans: medal(ICONS.veterans, ['#f2cf5b', '#9a7412']),
  quartermaster: medal(ICONS.quartermaster, ['#a8d08d', '#3f6b2a']), guilds: medal(ICONS.guilds, ['#f0c27a', '#8a5a1a']),
  masons: medal(ICONS.masons, ['#cfc6b8', '#6b6255']), march: medal(boot, ['#9ad0ff', '#2d6aa0']),
  roads: medal(ICONS.roads, ['#e4d2a4', '#7a6334']), academy: medal(ICONS.academy, ['#b9c8e0', '#2f4a6b']), cartography: medal(ICONS.cartography, ['#9fd3e0', '#2a6b7d']),
};

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
  // остальные технологии: колонка «Армия» и колонка «Хозяйство и держава»
  const place: Record<TechId, [number, number]> = {
    militia: [1, 0], cavalry: [1, 1], fortify: [1, 2], veterans: [1, 3], quartermaster: [1, 4], academy: [1, 5],
    guilds: [2, 0], masons: [2, 1], march: [2, 2], roads: [2, 3], cartography: [2, 4],
  };
  for (const id of Object.keys(TECHS) as TechId[]) {
    const t = TECHS[id];
    nodes.push({
      id, name: t.name, text: t.text, icon: TECH_ICON[id], col: place[id][0], row: place[id][1], needs: [...t.needs],
      state: r.techs?.[id] ? 'done' : r.tech?.id === id ? 'active' : !r.tech && techReady(s, pid, id) ? 'open' : 'locked',
      cost: techCost(s, pid, id), turns: t.turns, finish: r.tech?.id === id ? r.tech.finish : undefined,
    });
  }
  return nodes;
};

/** Разметка дерева: узлы-кнопки поверх линий зависимостей. */
export const techTreeHtml = (nodes: TechNode[], picked?: string): string => {
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;
  const ROW = 92, COLX = [17, 50, 83], TOP = 24; // проценты ширины для колонок, место под заголовки
  const pos = (n: TechNode) => ({ x: COLX[n.col], y: n.row * ROW + 40 + TOP });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lines = nodes.flatMap((n) => n.needs.map((id) => {
    const a = pos(byId.get(id)!), b = pos(n);
    const done = byId.get(id)!.state === 'done';
    const path = a.x === b.x ? `M${a.x} ${a.y} L${b.x} ${b.y}` : `M${a.x} ${a.y} C${a.x} ${(a.y + b.y) / 2} ${b.x} ${a.y} ${b.x} ${b.y}`;
    return `<path d="${path}" class="${done ? 'lit' : ''}" vector-effect="non-scaling-stroke"/>`;
  })).join('');
  return `<div class="tree" style="height:${rows * ROW + TOP}px">
    <div class="treehead"><span>Tactics</span><span>Army</span><span>Economy & state</span></div>
    <svg class="treelines" viewBox="0 0 100 ${rows * ROW + TOP}" preserveAspectRatio="none">${lines}</svg>
    ${nodes.map((n) => { const p = pos(n); return `<button class="tnode ${n.state} ${picked === n.id ? 'picked' : ''}" data-a="tech:${n.id}" style="left:${p.x}%;top:${p.y}px">
      ${n.icon}<span>${n.name}</span>${n.state === 'done' ? '<i class="tick">✓</i>' : n.state === 'active' ? '<i class="tick busy">⏳</i>' : n.state === 'locked' ? '<i class="tick lock">🔒</i>' : ''}</button>`; }).join('')}
  </div>`;
};
