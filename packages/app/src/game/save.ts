// Автосохранение партии в хранилище устройства (localStorage). Сервер с копиями — позже.

import { type GameState } from '../../../core/src/index.ts';

const KEY = 'chessciv.save.v1';

export const saveGame = (s: GameState): void => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* хранилище недоступно — играем без сохранения */ }
};

export const loadGame = (): GameState | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch { return null; }
};

export const clearSave = (): void => { try { localStorage.removeItem(KEY); } catch { /* ничего */ } };
