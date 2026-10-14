// Тонкая обёртка над Telegram WebApp SDK. Вне Telegram (в обычном браузере) всё просто молчит.

type TgWebApp = {
  ready(): void;
  expand(): void;
  /** Bot API 7.7+: не сворачивать мини-приложение свайпом вниз. */
  disableVerticalSwipes?(): void;
  platform: string;
  version: string;
  colorScheme: 'light' | 'dark';
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void };
  initDataUnsafe?: { user?: { first_name?: string } };
};

const tg = (): TgWebApp | undefined => (globalThis as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

export const inTelegram = (): boolean => !!tg() && tg()!.platform !== 'unknown';

export const initTelegram = (): void => {
  const w = tg();
  if (!w || !inTelegram()) return;
  document.documentElement.classList.add('tg');
  w.ready();
  w.expand();
  // свайп вниз по карте не должен сворачивать игру
  try { w.disableVerticalSwipes?.(); } catch { /* старый клиент Telegram */ }
};

let backHandler: (() => void) | null = null;

/** Показать системную кнопку «Назад» Telegram (или убрать её, если cb = null). */
export const setBack = (cb: (() => void) | null): void => {
  const w = tg();
  if (!w || !inTelegram()) return;
  if (backHandler) w.BackButton.offClick(backHandler);
  backHandler = cb;
  if (cb) { w.BackButton.onClick(cb); w.BackButton.show(); } else w.BackButton.hide();
};

export const tap = (): void => tg()?.HapticFeedback?.impactOccurred('light');

export const platformLabel = (): string => {
  const w = tg();
  return inTelegram() && w ? `Telegram ${w.platform} ${w.version}` : 'browser';
};

export const userName = (): string | undefined => tg()?.initDataUnsafe?.user?.first_name;
