// Язык интерфейса: английский (исходный), испанский, русский.
// Код игры пишет тексты по-английски; перевод накладывается на страницу: наблюдатель за DOM заменяет известные
// фразы в текстовых узлах и подсказках (title, aria-label) по словарю i18n-dict.ts — за один проход, длинные фразы первыми.
// Числа с существительными («3 turns left») переводятся отдельными правилами, с русскими падежами.

import { DICT } from './i18n-dict.ts';

export type Lang = 'en' | 'es' | 'ru';
export const LANGS: [Lang, string][] = [['en', 'English'], ['es', 'Español'], ['ru', 'Русский']];
const KEY = 'chessciv.lang';

const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved && LANGS.some(([l]) => l === saved)) return saved;
  } catch { /* по умолчанию */ }
  const tg = (globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } }).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const nav = (tg ?? navigator.language ?? 'en').slice(0, 2).toLowerCase();
  return nav === 'ru' || nav === 'uk' || nav === 'be' || nav === 'kk' ? 'ru' : nav === 'es' ? 'es' : 'en';
};

export let lang: Lang = detect();

/** Сменить язык: запоминаем и перезагружаем страницу (так возвращается и исходный английский). */
export const setLang = (l: Lang): void => {
  try { localStorage.setItem(KEY, l); } catch { /* ничего */ }
  location.reload();
};

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};

/** Правила с числами — до словаря. */
const NUMBER_RULES: Record<Exclude<Lang, 'en'>, [RegExp, (n: number) => string][]> = {
  ru: [
    [/(\d+) turns? left/g, (n) => `${plural(n, 'остался', 'осталось', 'осталось')} ${n} ${plural(n, 'ход', 'хода', 'ходов')}`],
    [/(\d+) turns? ago/g, (n) => `${n} ${plural(n, 'ход', 'хода', 'ходов')} назад`],
    [/(\d+) turns?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`],
    [/(\d+) cit(?:y|ies)/g, (n) => `${n} ${plural(n, 'город', 'города', 'городов')}`],
    [/(\d+) generals?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'генерал', 'генерала', 'генералов')}`],
    [/(\d+) pieces?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'фигура', 'фигуры', 'фигур')}`],
    [/(\d+) pawns?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'пешка', 'пешки', 'пешек')}`],
    [/(\d+) nations?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'страна', 'страны', 'стран')}`],
    [/(\d+) rivals?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'соперник', 'соперника', 'соперников')}`],
    [/(\d+) moves? left/g, (n) => `${plural(n, 'остался', 'осталось', 'осталось')} ${n} ${plural(n, 'шаг', 'шага', 'шагов')}`],
    [/(\d+) moves?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'шаг', 'шага', 'шагов')}`],
    [/(\d+) cells?(?![A-Za-z])/g, (n) => `${n} ${plural(n, 'клетка', 'клетки', 'клеток')}`],
    [/(\d+)(?:st|nd|rd|th)(?![A-Za-z])/g, (n) => `${n}-е`],
  ],
  es: [
    [/(\d+) turns? left/g, (n) => (n === 1 ? 'queda 1 turno' : `quedan ${n} turnos`)],
    [/(\d+) turns? ago/g, (n) => `hace ${n} ${n === 1 ? 'turno' : 'turnos'}`],
    [/(\d+) turns?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'turno' : 'turnos'}`],
    [/(\d+) cit(?:y|ies)/g, (n) => `${n} ${n === 1 ? 'ciudad' : 'ciudades'}`],
    [/(\d+) generals?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'general' : 'generales'}`],
    [/(\d+) pieces?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`],
    [/(\d+) pawns?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'peón' : 'peones'}`],
    [/(\d+) nations?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'nación' : 'naciones'}`],
    [/(\d+) rivals?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'rival' : 'rivales'}`],
    [/(\d+) moves? left/g, (n) => (n === 1 ? 'queda 1 paso' : `quedan ${n} pasos`)],
    [/(\d+) moves?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'paso' : 'pasos'}`],
    [/(\d+) cells?(?![A-Za-z])/g, (n) => `${n} ${n === 1 ? 'casilla' : 'casillas'}`],
    [/(\d+)(?:st|nd|rd|th)(?![A-Za-z])/g, (n) => `${n}.º`],
  ],
};

let matcher: RegExp | null = null;
let table: Map<string, string> | null = null;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const build = () => {
  if (lang === 'en') return;
  const col = lang === 'es' ? 1 : 2;
  table = new Map(DICT.map((row) => [row[0], row[col]]));
  const keys = [...table.keys()].sort((a, b) => b.length - a.length);
  // фраза, начинающаяся/кончающаяся буквой, не должна быть частью другого слова
  const alt = keys.map((k) => `${/^[A-Za-z]/.test(k) ? '(?<![A-Za-z])' : ''}${esc(k)}${/[A-Za-z]$/.test(k) ? '(?![A-Za-z])' : ''}`);
  // правила с числами — в той же регулярке: совпадение, начавшееся раньше, побеждает (целые фразы с числами внутри — из словаря)
  const nums = NUMBER_RULES[lang].map(([re]) => re.source.replace('(\\d+)', '\\d+'));
  matcher = new RegExp([...nums, ...alt].join('|'), 'g');
};

/** Перевести строку (для текста, который не попадает в DOM, — например, подсказок). */
export const tr = (text: string): string => {
  if (lang === 'en' || !text || !/[A-Za-z]/.test(text)) return text;
  if (!matcher) build();
  return text.replace(matcher!, (m) => {
    const hit = table!.get(m);
    if (hit !== undefined) return hit;
    for (const [re, f] of NUMBER_RULES[lang as 'ru']) {
      const one = new RegExp(`^(?:${re.source})$`).exec(m);
      if (one) return f(Number(one[1]));
    }
    return m;
  });
};

const ATTRS = ['title', 'aria-label', 'placeholder'];
const skip = (el: Element | null) => !!el && (el.closest('script, style, .notr') !== null);

const translateNode = (node: Node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    if (skip(node.parentElement)) return;
    const t = node.nodeValue ?? '';
    const r = tr(t);
    if (r !== t) node.nodeValue = r;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const r = tr(v); if (r !== v) el.setAttribute(a, r); }
  }
  for (const c of [...el.childNodes]) translateNode(c);
};

/** Включить перевод страницы: сразу и при каждом изменении DOM. */
export const initI18n = (): void => {
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  build();
  translateNode(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
};
