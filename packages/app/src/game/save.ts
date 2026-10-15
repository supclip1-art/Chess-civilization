// Автосохранение партии в хранилище устройства (localStorage). Сервер с копиями — позже.

import { ARMY_MAX, PIECES, type GameState, cityName } from '../../../core/src/index.ts';

const KEY = 'chessciv.save.v1';

export const saveGame = (s: GameState): void => {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, econ: 10 })); } catch { /* хранилище недоступно — играем без сохранения */ }
};

export const loadGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState & { econ?: number };
    // сохранения до экономики ×10: ресурсы умножаем, остальное уже считается по новым ценам
    if (!s.econ) {
      for (const p of Object.values(s.players)) { p.res.wood *= 10; p.res.food = Math.round(p.res.food * 10); p.res.gold = Math.round(p.res.gold * 10); }
      s.econ = 10;
    }
    // сохранения до появления названий городов
    for (const h of Object.values(s.halls).sort((a, b) => a.order - b.order)) h.name ??= cityName(s, h.owner);
    // казарма и таверна раньше были общими на страну — переносим в столицу
    for (const p of Object.values(s.players) as (typeof s.players[string] & { barracks?: number; tavern?: number })[]) {
      const cap = Object.values(s.halls).filter((h) => h.owner === p.id).sort((a, b) => a.order - b.order)[0];
      if (cap && p.barracks !== undefined) { cap.barracks = Math.max(cap.barracks ?? 0, p.barracks); cap.tavern = Math.max(cap.tavern ?? 0, p.tavern ?? 0); }
      const pb = (p as { builders?: number }).builders;
      if (cap && pb && cap.builders === undefined) cap.builders = Math.min(pb, cap.level); // строители были общими — теперь у столицы
      delete (p as { builders?: number }).builders;
      delete p.barracks; delete p.tavern;
      for (const j of [...p.jobs, ...(p.queue ?? []).map((q) => q.job)]) if ((j.kind === 'barracks' || j.kind === 'tavern') && !j.hallId && cap) j.hallId = cap.id;
    }
    // армии больше обычного шахматного набора (до лимита) урезаем
    for (const g of Object.values(s.generals)) for (const x of PIECES) g.army[x] = Math.min(g.army[x], ARMY_MAX[x]);
    return s;
  } catch { return null; }
};

export const clearSave = (): void => { try { localStorage.removeItem(KEY); } catch { /* ничего */ } };
