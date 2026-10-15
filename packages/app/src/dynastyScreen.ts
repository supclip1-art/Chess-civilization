// Экран династии: уровень и титул, награды по уровням, облик фигур и доски, стартовый бонус, достижения. Плюс золотая плашка «достижение получено» для экрана партии.

import {
  ACHIEVEMENTS, BOARDS, SKINS, TITLES, UNLOCKS, choose, dynasty, levelOf, unlocked, xpFor, type Ach, type Unlock,
} from './dynasty.ts';
import { pieceHtml } from './game/pieces.ts';
import { chestOpen } from './audio.ts';
import { setBack, tap } from './tg.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Полоса опыта: от начала текущего уровня до следующего. */
export const xpBar = (xp: number): string => {
  const l = levelOf(xp);
  if (l >= 10) return `<div class="xpbar"><i style="width:100%"></i></div><small class="muted">${xp} XP · highest level</small>`;
  const a = xpFor(l), b = xpFor(l + 1);
  return `<div class="xpbar"><i style="width:${Math.round(((xp - a) / (b - a)) * 100)}%"></i></div><small class="muted">${xp} / ${b} XP to level ${l + 1}</small>`;
};

/** Кнопка династии на главном экране. */
export const dynastyButton = (): string => {
  const d = dynasty(), l = levelOf(d.xp);
  return `<button id="dynasty" class="dynbtn"><span class="dyncrest">${l}</span><span class="dyntext"><b>Dynasty · ${TITLES[l - 1]}</b>${xpBar(d.xp)}</span></button>`;
};

const KIND_LABEL: Record<Unlock['kind'], string> = { skin: 'Pieces', board: 'Board', bonus: 'Start bonus', nation: 'Nation', map: 'Map' };

const skinTile = (id: string, on: boolean, u?: Unlock) => {
  const open = !u || unlocked(u);
  return `<button class="looktile ${on ? 'on' : ''}" data-skin="${id}" ${open ? '' : 'disabled'}>
    <span class="lookpcs" style="background:${BOARDS[dynasty().board]?.[0] ?? '#ebecd0'}">${pieceHtml(true, 'k', id)}${pieceHtml(false, 'q', id)}</span>
    <b>${esc(u?.name ?? id)}</b><small>${open ? (on ? 'chosen' : 'tap to choose') : `level ${u!.level}`}</small></button>`;
};
const boardTile = (id: string, on: boolean, u?: Unlock) => {
  const open = !u || unlocked(u);
  const [l, d] = BOARDS[id];
  return `<button class="looktile ${on ? 'on' : ''}" data-board="${id}" ${open ? '' : 'disabled'}>
    <span class="lookboard" style="--l:${l};--d:${d}"><i></i><i></i><i></i><i></i></span>
    <b>${esc(u?.name ?? id)}</b><small>${open ? (on ? 'chosen' : 'tap to choose') : `level ${u!.level}`}</small></button>`;
};

/** Список стартовых бонусов (для экрана династии и новой партии). */
export const bonusOptions = (): { id: string; name: string; text: string; open: boolean; level: number }[] => [
  { id: 'none', name: 'No bonus', text: 'a plain start', open: true, level: 1 },
  ...UNLOCKS.filter((u) => u.kind === 'bonus').map((u) => ({ id: u.id, name: u.name, text: u.text, open: unlocked(u), level: u.level })),
];

export const openDynasty = (app: HTMLElement, back: () => void): void => {
  setBack(back);
  let tab: 'rewards' | 'looks' | 'achievements' = 'rewards';
  try { tab = (localStorage.getItem('chessciv.dyntab') as typeof tab) || 'rewards'; } catch { /* по умолчанию */ }
  if (!['rewards', 'looks', 'achievements'].includes(tab)) tab = 'rewards';
  const draw = () => {
    const d = dynasty(), l = levelOf(d.xp);
    const got = ACHIEVEMENTS.filter((a) => d.achievements[a.id]).length;
    let body = '';
    if (tab === 'rewards') {
      body = TITLES.map((t, i) => {
        const lv = i + 1, items = UNLOCKS.filter((u) => u.level === lv);
        return `<div class="lvrow ${lv <= l ? 'open' : ''} ${lv === l ? 'cur' : ''}"><span class="lvnum">${lv}</span>
          <div><b>${t}</b>${lv === 1 ? '<small class="muted">where every dynasty begins</small>' : ''}
          <div class="chips">${items.map((u) => `<span class="chip ck-${u.kind}">${KIND_LABEL[u.kind]}: ${esc(u.name)}</span>`).join('')}</div>
          ${lv > 1 ? `<small class="muted">${xpFor(lv)} XP</small>` : ''}</div></div>`;
      }).join('');
      body += '<p class="muted" style="margin-top:8px">Experience comes from every campaign (turns played, final strength, your place, victory) and from achievements.</p>';
    } else if (tab === 'looks') {
      const skins = UNLOCKS.filter((u) => u.kind === 'skin'), boards = UNLOCKS.filter((u) => u.kind === 'board');
      body = `<h2>Pieces</h2><div class="looks">${skins.map((u) => (SKINS[u.id] ? skinTile(u.id, d.skin === u.id, u) : '')).join('')}</div>
        <h2>Board</h2><div class="looks">${boards.map((u) => boardTile(u.id, d.board === u.id, u)).join('')}</div>
        <h2>Start bonus</h2><div class="bonuses">${bonusOptions().map((b) => `<button class="bonus ${d.bonus === b.id ? 'on' : ''}" data-bonus="${b.id}" ${b.open ? '' : 'disabled'}>
          <b>${esc(b.name)}</b><small>${b.open ? esc(b.text) : `level ${b.level}`}</small></button>`).join('')}</div>
        <p class="muted">The start bonus works in every new campaign until you change it.</p>`;
    } else {
      body = `<div class="achlist">${ACHIEVEMENTS.map((a) => {
        const at = d.achievements[a.id];
        return `<div class="ach ${at ? 'got' : ''}"><span class="medal">${at ? '★' : '☆'}</span><div><b>${esc(a.name)}</b><small>${esc(a.text)}</small></div><span class="axp">+${a.xp}</span></div>`;
      }).join('')}</div>`;
    }
    app.innerHTML = `
      <h1>Dynasty</h1>
      <div class="card dynhead"><span class="dyncrest big">${l}</span><div class="dyntext"><b>${TITLES[l - 1]}</b>${xpBar(d.xp)}
        <small class="muted">Campaigns: ${d.campaigns} · Won: ${d.wins} · Achievements: ${got} / ${ACHIEVEMENTS.length}</small></div></div>
      <div class="seg wide" id="dyntabs">${([['rewards', 'Rewards'], ['looks', 'Looks'], ['achievements', 'Achievements']] as const)
        .map(([id, n]) => `<button data-t="${id}" class="${id === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="dynbody">${body}</div>
      <button id="dynback" class="ghost">Back</button>`;
    for (const b of app.querySelectorAll<HTMLButtonElement>('#dyntabs button')) b.onclick = () => {
      tap(); tab = b.dataset.t as typeof tab;
      try { localStorage.setItem('chessciv.dyntab', tab); } catch { /* ничего */ }
      draw();
    };
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-skin]')) b.onclick = () => { tap(); choose('skin', b.dataset.skin!); draw(); };
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-board]')) b.onclick = () => { tap(); choose('board', b.dataset.board!); draw(); };
    for (const b of app.querySelectorAll<HTMLButtonElement>('[data-bonus]')) b.onclick = () => { tap(); choose('bonus', b.dataset.bonus!); draw(); };
    app.querySelector<HTMLButtonElement>('#dynback')!.onclick = () => { tap(); back(); };
  };
  draw();
};

/** Золотая плашка сверху: достижения по очереди, потом — новый уровень династии. */
let queue: string[] = [];
let showing = false;
const pump = (root: HTMLElement) => {
  if (showing || !queue.length) return;
  showing = true;
  const el = document.createElement('div');
  el.className = 'achv';
  el.innerHTML = queue.shift()!;
  root.appendChild(el);
  chestOpen('rare');
  requestAnimationFrame(() => el.classList.add('in'));
  const done = () => { el.classList.remove('in'); setTimeout(() => { el.remove(); showing = false; pump(root); }, 350); };
  const t = setTimeout(done, 3600);
  el.onclick = () => { clearTimeout(t); done(); };
};
export const announce = (root: HTMLElement, got: Ach[], levelBefore: number): void => {
  for (const a of got) queue.push(`<span class="achstar">★</span><div><small>Achievement</small><b>${esc(a.name)}</b><small>${esc(a.text)} · +${a.xp} XP</small></div>`);
  const now = levelOf(dynasty().xp);
  if (now > levelBefore) {
    const items = UNLOCKS.filter((u) => u.level > levelBefore && u.level <= now);
    queue.push(`<span class="achstar">♛</span><div><small>Dynasty level ${now}</small><b>${TITLES[now - 1]}</b><small>${items.length ? `Unlocked: ${items.map((u) => esc(u.name)).join(', ')}` : 'Your house grows in renown'}</small></div>`);
  }
  pump(root);
};
