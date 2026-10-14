// Автосохранение партии в хранилище устройства (localStorage). Сервер с копиями — позже.

import { type GameState, cityName } from '../../../core/src/index.ts';

const KEY = 'chessciv.save.v1';

export const saveGame = (s: GameState): void => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* хранилище недоступно — играем без сохранения */ }
};

export const loadGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // сохранения до появления названий городов
    for (const h of Object.values(s.halls).sort((a, b) => a.order - b.order)) h.name ??= cityName(s, h.owner);
    return s;
  } catch { return null; }
};

export const clearSave = (): void => { try { localStorage.removeItem(KEY); } catch { /* ничего */ } };
