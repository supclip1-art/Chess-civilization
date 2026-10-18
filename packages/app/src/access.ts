// Доступ к игре: «Императорская корона» (разовая покупка за Telegram Stars) и 30 минут бесплатной игры в день.
//   Бесплатно: главы 1–2 кампании, карта Европы, династия и достижения, 30 минут игры в день (+10 минут за рекламу).
//   Корона: главы 3–8, остальные карты (по-прежнему открываются уровнем династии), игра за разбойников, без лимита.
// Сервер (server/) — источник правды: время и покупку считает он, игра лишь показывает. Адрес сервера задаёт сборка
// (переменная CE_API); без него игра работает как раньше — всё открыто и без лимита.
// Вне Telegram (обычный браузер) подписи нет: лимит считается в браузере, а купить корону можно только в Telegram.

import { initData, inTelegram, openInvoice } from './tg.ts';

declare const __API__: string;
declare const __ADS__: string;

export const MONETIZED = typeof __API__ === 'string' && __API__ !== '';
const API = MONETIZED ? __API__.replace(/\/$/, '') : '';
const ADS_BLOCK = typeof __ADS__ === 'string' ? __ADS__ : '';

export type Access = {
  premium: boolean;
  /** Секунд бесплатной игры на сегодня (null — без лимита). */
  secondsLeft: number | null;
  adsLeft: number;
  adMinutes: number;
  freeMinutes: number;
  price: number;
};

const CACHE = 'ce.access';
const LOCAL = 'ce.localtime'; // учёт времени вне Telegram: { day, used, bonus }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const load = <T>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T; } catch { return null; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };

let st: Access = MONETIZED
  ? { premium: load<Access>(CACHE)?.premium ?? false, secondsLeft: 30 * 60, adsLeft: 0, adMinutes: 10, freeMinutes: 30, price: load<Access>(CACHE)?.price ?? 300 }
  : { premium: true, secondsLeft: null, adsLeft: 0, adMinutes: 10, freeMinutes: 30, price: 0 };

const listeners = new Set<() => void>();
const changed = () => { for (const f of listeners) f(); };
/** Подписаться на изменения доступа (время, покупка). Возвращает отписку. */
export const onAccess = (f: () => void): (() => void) => { listeners.add(f); return () => listeners.delete(f); };
export const access = (): Access => ({ ...st });
export const premium = (): boolean => st.premium;
/** Купить можно только в Telegram и только когда сервер подключён. */
export const canBuy = (): boolean => MONETIZED && inTelegram() && !!initData();
export const adsAvailable = (): boolean => MONETIZED && !!ADS_BLOCK && inTelegram() && st.adsLeft > 0 && !st.premium;

// ---------- что закрыто без короны ----------
export const chapterLocked = (id: number): boolean => MONETIZED && !st.premium && id > 2;
export const mapLocked = (id: string): boolean => MONETIZED && !st.premium && id !== 'europe';
export const outlawsLocked = (): boolean => MONETIZED && !st.premium;
/** Авторазвитие городов — только с короной. */
export const autoLocked = (): boolean => MONETIZED && !st.premium;

// ---------- сервер ----------
const call = async (path: string, body: Record<string, unknown> = {}): Promise<Access | null> => {
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: initData(), tz: -new Date().getTimezoneOffset(), ...body }),
    });
    if (!r.ok) return null;
    return (await r.json()) as Access;
  } catch { return null; }
};
const apply = (a: Access | null) => {
  if (!a) return;
  st = { ...a };
  save(CACHE, { premium: st.premium, price: st.price });
  changed();
};

/** Вне Telegram: время считаем в браузере. */
const localTime = () => {
  const l = load<{ day: string; used: number; bonus: number }>(LOCAL);
  return l && l.day === today() ? l : { day: today(), used: 0, bonus: 0 };
};

/** Обновить доступ с сервера (при запуске и после покупки). */
export const refreshAccess = async (): Promise<void> => {
  if (!MONETIZED) return;
  if (!initData()) { // обычный браузер: без подписи — только бесплатный режим со счётом времени здесь
    const l = localTime();
    st = { ...st, premium: false, secondsLeft: Math.max(0, st.freeMinutes * 60 + l.bonus - l.used), adsLeft: 0 };
    changed();
    return;
  }
  apply(await call('/api/me'));
};

// ---------- часы игры ----------
let timer = 0, pending = 0, upFired = false, onUp: (() => void) | null = null;
const flush = async () => {
  const sec = pending;
  pending = 0;
  if (!sec) return;
  if (!initData()) { const l = localTime(); l.used += sec; save(LOCAL, l); return; }
  const a = await call('/api/tick', { seconds: sec });
  if (a) apply(a);
};
/** Партия на экране: тикают бесплатные минуты; кончились — onTimeUp (один раз, пока не добавят время). */
export const startClock = (onTimeUp: () => void): void => {
  stopClock();
  onUp = onTimeUp;
  upFired = false;
  if (!MONETIZED || st.premium) return;
  timer = window.setInterval(() => {
    if (st.premium || document.hidden || st.secondsLeft === null) return;
    if (st.secondsLeft <= 0) { if (!upFired) { upFired = true; void flush(); onUp?.(); } return; }
    st.secondsLeft--;
    pending++;
    if (pending >= 60) void flush();
    if (st.secondsLeft % 15 === 0 || st.secondsLeft <= 0) changed();
  }, 1000);
};
export const stopClock = (): void => { if (timer) { clearInterval(timer); timer = 0; void flush(); } onUp = null; };
/** Время снова есть (реклама, покупка): часы можно останавливать заново. */
const rearm = () => { upFired = false; };

/** Сколько осталось — «12:05». */
export const fmtLeft = (sec: number | null): string => {
  if (sec === null) return '∞';
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- реклама (Adsgram) ----------
type AdController = { show(): Promise<{ done: boolean }> };
let adCtl: AdController | null = null;
const adsgram = (): Promise<AdController | null> => new Promise((resolve) => {
  if (adCtl) { resolve(adCtl); return; }
  const w = window as unknown as { Adsgram?: { init(o: { blockId: string }): AdController } };
  const ready = () => { try { adCtl = w.Adsgram!.init({ blockId: ADS_BLOCK }); resolve(adCtl); } catch { resolve(null); } };
  if (w.Adsgram) { ready(); return; }
  const sc = document.createElement('script');
  sc.src = 'https://sad.adsgram.ai/js/sad.min.js';
  sc.onload = ready;
  sc.onerror = () => resolve(null);
  document.head.appendChild(sc);
});
/** Показать рекламу; досмотрел — +10 минут. true, если время добавлено. */
export const watchAd = async (): Promise<boolean> => {
  if (!adsAvailable()) return false;
  const ctl = await adsgram();
  if (!ctl) return false;
  try { await ctl.show(); } catch { return false; } // пропустил или ошибка — без награды
  const before = st.secondsLeft ?? 0;
  apply(await call('/api/ad'));
  const ok = (st.secondsLeft ?? 0) > before;
  if (ok) rearm();
  return ok;
};

// ---------- покупка короны ----------
/** Купить корону: счёт Stars → окно оплаты Telegram → ждём, пока сервер получит платёж. */
export const buyCrown = async (): Promise<'paid' | 'cancelled' | 'failed'> => {
  if (!canBuy()) return 'failed';
  let link = '';
  try {
    const r = await fetch(`${API}/api/invoice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData() }) });
    if (r.status === 409) { await refreshAccess(); return 'paid'; }
    link = ((await r.json()) as { link?: string }).link ?? '';
  } catch { return 'failed'; }
  if (!link) return 'failed';
  const status = await openInvoice(link);
  if (status !== 'paid' && status !== 'pending') return status === 'cancelled' ? 'cancelled' : 'failed';
  // платёж подтверждает бот: ждём, пока сервер отметит корону (обычно секунда-две)
  for (let i = 0; i < 15 && !st.premium; i++) { await new Promise((r) => setTimeout(r, 1000)); await refreshAccess(); }
  if (st.premium) { rearm(); stopTicking(); }
  return st.premium ? 'paid' : 'failed';
};
const stopTicking = () => { if (timer) { clearInterval(timer); timer = 0; } };
