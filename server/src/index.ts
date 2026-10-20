// Сервер Checkmate Empires (Cloudflare Worker + D1). Делает только то, что нельзя доверить игре в браузере:
//   • узнаёт игрока по подписанным данным Telegram (initData) — подделать без токена бота нельзя;
//   • хранит покупку «Императорской короны» и выдаёт её только после подтверждённого платежа Stars;
//   • ведёт суточный лимит бесплатной игры (30 минут) и добавляет время за просмотренную рекламу;
//   • отвечает боту: /start с кнопкой игры, предоплатная проверка, успешный платёж, /paysupport.
// Сама игра (правила, бои, сохранения) работает в браузере игрока; сервер о ней ничего не знает.

// ---------- минимальные типы Cloudflare (без пакета @cloudflare/workers-types) ----------
interface D1Result<T> { results: T[] }
interface D1Prepared {
  bind(...v: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface D1Database { prepare(sql: string): D1Prepared }

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string; // секрет: токен бота от @BotFather
  WEBHOOK_SECRET: string; // секрет: Telegram присылает его в заголовке каждого обновления
  GAME_URL: string;
  ALLOWED_ORIGINS?: string; // через запятую; пусто — любой
  CROWN_PRICE?: string;
  FREE_MINUTES?: string;
  AD_MINUTES?: string;
  ADS_PER_DAY?: string;
}

type User = { id: number; premium: number; tz: number; day: string; used: number; bonus: number; ads: number; last_tick: number; last_ad: number };

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const now = () => Math.floor(Date.now() / 1000);

// ---------- проверка initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) ----------
const enc = new TextEncoder();
const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
};
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Telegram user id из initData, если подпись верна и данные не старше суток; иначе null. */
export const verifyInitData = async (initData: string, botToken: string, maxAgeSec = 86400): Promise<number | null> => {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const sign = hex(await hmac(secret, check));
  if (sign !== hash) return null;
  const auth = Number(params.get('auth_date') ?? 0);
  if (!auth || now() - auth > maxAgeSec) return null;
  try { const u = JSON.parse(params.get('user') ?? '{}') as { id?: number }; return typeof u.id === 'number' ? u.id : null; } catch { return null; }
};

// ---------- игрок и его день ----------
const localDay = (tzMin: number) => new Date((now() + tzMin * 60) * 1000).toISOString().slice(0, 10);

const loadUser = async (env: Env, id: number, tz: number): Promise<User> => {
  let u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  if (!u) {
    const t = Math.max(-14 * 60, Math.min(14 * 60, Math.round(tz) || 0));
    await env.DB.prepare('INSERT OR IGNORE INTO users (id, tz, day, created) VALUES (?, ?, ?, ?)').bind(id, t, localDay(t), now()).run();
    u = (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>())!;
  }
  // новый день — счётчики с нуля (часовой пояс запомнен при первом входе: менять его, чтобы обнулить лимит, бесполезно)
  const today = localDay(u.tz);
  if (u.day !== today) {
    await env.DB.prepare('UPDATE users SET day = ?, used = 0, bonus = 0, ads = 0 WHERE id = ?').bind(today, id).run();
    u = { ...u, day: today, used: 0, bonus: 0, ads: 0 };
  }
  return u;
};

const status = (env: Env, u: User) => {
  const free = num(env.FREE_MINUTES, 30) * 60;
  return {
    premium: !!u.premium,
    secondsLeft: u.premium ? null : Math.max(0, free + u.bonus - u.used),
    adsLeft: Math.max(0, num(env.ADS_PER_DAY, 12) - u.ads),
    adMinutes: num(env.AD_MINUTES, 10),
    freeMinutes: num(env.FREE_MINUTES, 30),
    price: num(env.CROWN_PRICE, 300),
  };
};

// ---------- Telegram Bot API ----------
const bot = async <T = unknown>(env: Env, method: string, body: unknown): Promise<T> => {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = (await r.json()) as { ok: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result as T;
};

const CROWN_PAYLOAD = (uid: number) => `crown:${uid}`;

// ---------- тексты бота на языке игрока (язык Telegram: ru, es, иначе английский) ----------
type Lang = 'en' | 'ru' | 'es';
export const langOf = (code: unknown): Lang => { const c = String(code ?? '').slice(0, 2).toLowerCase(); return c === 'ru' || c === 'uk' || c === 'be' ? 'ru' : c === 'es' ? 'es' : 'en'; };
const T = {
  start: {
    en: '♛ Checkmate Empires — build an empire where every war is a real chess game.\n\nGrow cities, hire generals, raise an army of chess pieces and checkmate your rivals.',
    ru: '♛ Checkmate Empires — стройте империю, где каждая война — настоящая шахматная партия.\n\nРазвивайте города, нанимайте генералов, собирайте армию из шахматных фигур и ставьте мат соседям.',
    es: '♛ Checkmate Empires — construye un imperio donde cada guerra es una partida de ajedrez real.\n\nHaz crecer tus ciudades, contrata generales, reúne un ejército de piezas y da jaque mate a tus rivales.',
  },
  play: { en: '▶ Play', ru: '▶ Играть', es: '▶ Jugar' },
  thanks: {
    en: '👑 The Imperial Crown is yours! All chapters, maps, city auto-development and the Outlaws are open, and the day has no limit. Thank you!',
    ru: '👑 Императорская корона ваша! Открыты все главы, карты, авторазвитие городов и игра за разбойников, а лимита времени больше нет. Спасибо!',
    es: '👑 ¡La Corona imperial es tuya! Tienes todos los capítulos, mapas, el desarrollo automático de ciudades y los Forajidos, y el día no tiene límite. ¡Gracias!',
  },
  support: {
    en: 'Payment questions: describe the problem in a message here and we will answer. Purchases are refunded in Telegram Stars.',
    ru: 'Вопросы об оплате: опишите проблему сообщением здесь, мы ответим. Покупки возвращаются в Telegram Stars.',
    es: 'Preguntas sobre pagos: describe el problema en un mensaje aquí y te responderemos. Las compras se reembolsan en Telegram Stars.',
  },
  terms: {
    en: 'The Imperial Crown is a one-time purchase in Telegram Stars. It unlocks chapters 3–8 of the campaign, all maps (opened through dynasty levels), city auto-development, playing as the Outlaws and unlimited play time.',
    ru: 'Императорская корона — разовая покупка за Telegram Stars. Она открывает главы 3–8 кампании, все карты (по уровню династии), авторазвитие городов, игру за разбойников и игру без лимита времени.',
    es: 'La Corona imperial es una compra única en Telegram Stars. Desbloquea los capítulos 3–8 de la campaña, todos los mapas (según el nivel de la dinastía), el desarrollo automático de ciudades, jugar como los Forajidos y tiempo de juego ilimitado.',
  },
  changed: { en: 'This offer has changed. Please open the shop again.', ru: 'Предложение изменилось. Откройте магазин ещё раз.', es: 'La oferta ha cambiado. Abre la tienda de nuevo.' },
  crown: { en: 'Imperial Crown', ru: 'Императорская корона', es: 'Corona imperial' },
  crownDesc: {
    en: 'Chapters 3–8 of the campaign, all maps, city auto-development, the Outlaws and no daily time limit.',
    ru: 'Главы 3–8 кампании, все карты, авторазвитие городов, разбойники и игра без лимита времени.',
    es: 'Capítulos 3–8 de la campaña, todos los mapas, desarrollo automático de ciudades, los Forajidos y sin límite diario.',
  },
} satisfies Record<string, Record<Lang, string>>;
const tx = (k: keyof typeof T, l: Lang) => T[k][l];

/** Ответ на обновление бота (вебхук). */
export const onUpdate = async (env: Env, upd: Record<string, any>): Promise<void> => {
  const price = num(env.CROWN_PRICE, 300);
  // перед оплатой Telegram спрашивает, можно ли продать: проверяем товар и сумму (ответить надо за 10 секунд)
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query;
    const ok = q.currency === 'XTR' && q.total_amount === price && q.invoice_payload === CROWN_PAYLOAD(q.from.id);
    await bot(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: tx('changed', langOf(q.from.language_code)) });
    return;
  }
  const msg = upd.message;
  if (!msg) return;
  const lang = langOf(msg.from?.language_code);
  // оплата прошла: записываем платёж (повтор того же платежа ничего не выдаст второй раз) и открываем корону
  if (msg.successful_payment) {
    const p = msg.successful_payment;
    const uid = msg.from.id as number;
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO payments (charge_id, user_id, amount, payload, at) VALUES (?, ?, ?, ?, ?)')
      .bind(p.telegram_payment_charge_id, uid, p.total_amount, p.invoice_payload, now()).run() as { changes?: number; meta?: { changes?: number } };
    if ((ins?.meta?.changes ?? ins?.changes ?? 1) > 0) await tellOwner(env, msg.from, p.total_amount);
    if (String(p.invoice_payload).startsWith('crown:')) {
      await loadUser(env, uid, 0);
      await env.DB.prepare('UPDATE users SET premium = 1 WHERE id = ?').bind(uid).run();
      await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: tx('thanks', lang) });
    }
    return;
  }
  const text = String(msg.text ?? '');
  if (text.startsWith('/start')) {
    await bot(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: tx('start', lang),
      reply_markup: { inline_keyboard: [[{ text: tx('play', lang), web_app: { url: env.GAME_URL } }]] },
    });
  } else if (text.startsWith('/paysupport')) {
    await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: tx('support', lang) });
  } else if (text.startsWith('/terms')) {
    await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: tx('terms', lang) });
  } else if (text.startsWith('/stats')) {
    // сводка — только владельцу (его id в таблице config)
    const owner = await env.DB.prepare("SELECT value FROM config WHERE key = 'owner'").first<{ value: string }>();
    if (owner && String(msg.from?.id) === owner.value) await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: await statsText(env) });
  }
};

// ---------- HTTP ----------
const cors = (env: Env, req: Request): Record<string, string> => {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return { 'access-control-allow-origin': ok ? origin || '*' : allowed[0], 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
};
const json = (data: unknown, code: number, h: Record<string, string>) => new Response(JSON.stringify(data), { status: code, headers: { 'content-type': 'application/json', ...h } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    // вебхук бота: только с секретом, который мы сами передали Telegram в setWebhook
    if (url.pathname === '/bot' && req.method === 'POST') {
      if (req.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      try { await onUpdate(env, await req.json()); } catch (e) { console.error(e); }
      return new Response('ok');
    }

    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      try { return new Response(`OK: ${(await setupBot(env)).join(', ')}`); } catch (e) { return new Response(`error: ${(e as Error).message}`, { status: 500 }); }
    }

    if (!url.pathname.startsWith('/api/') || req.method !== 'POST') return new Response('Checkmate Empires server', { status: 200 });
    let body: { initData?: string; tz?: number; seconds?: number; kind?: string; lang?: string };
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    const uid = await verifyInitData(body.initData ?? '', env.BOT_TOKEN);
    if (!uid) return json({ error: 'not signed by Telegram' }, 401, h);
    let u = await loadUser(env, uid, Number(body.tz ?? 0));
    const t = now();
    const lang = langOf(body.lang ?? userLang(body.initData ?? ''));

    switch (url.pathname) {
      case '/api/me':
        await track(env, uid, 'open');
        return json(status(env, u), 200, h);

      case '/api/event': {
        // шаги игрока для статистики: первая битва, открыл магазин, нажал «купить»
        const kind = String(body.kind ?? '');
        if (EVENTS.includes(kind)) await track(env, uid, kind);
        return json({ ok: true }, 200, h);
      }

      case '/api/tick': {
        // засчитываем не больше, чем прошло на самом деле с прошлого отчёта (и не больше двух минут за раз)
        if (!u.premium) {
          const claimed = Math.max(0, Math.min(120, Math.round(Number(body.seconds ?? 0))));
          const real = u.last_tick ? t - u.last_tick + 5 : claimed;
          const add = Math.min(claimed, real);
          await env.DB.prepare('UPDATE users SET used = used + ?, last_tick = ? WHERE id = ?').bind(add, t, uid).run();
          u = { ...u, used: u.used + add, last_tick: t };
          if (status(env, u).secondsLeft === 0) await track(env, uid, 'limit');
        }
        return json(status(env, u), 200, h);
      }

      case '/api/ad': {
        // реклама досмотрена (Adsgram отдаёт это в игру): +10 минут, не чаще раза в 20 секунд и не больше 12 за день
        if (!u.premium && u.ads < num(env.ADS_PER_DAY, 12) && t - u.last_ad >= 20) {
          const add = num(env.AD_MINUTES, 10) * 60;
          await env.DB.prepare('UPDATE users SET bonus = bonus + ?, ads = ads + 1, last_ad = ? WHERE id = ?').bind(add, t, uid).run();
          u = { ...u, bonus: u.bonus + add, ads: u.ads + 1, last_ad: t };
          await track(env, uid, 'ad');
        }
        return json(status(env, u), 200, h);
      }

      case '/api/invoice': {
        if (u.premium) return json({ error: 'already yours' }, 409, h);
        const price = num(env.CROWN_PRICE, 300);
        const link = await bot<string>(env, 'createInvoiceLink', {
          title: tx('crown', lang),
          description: tx('crownDesc', lang),
          payload: CROWN_PAYLOAD(uid),
          currency: 'XTR', // Telegram Stars
          prices: [{ label: tx('crown', lang), amount: price }],
        });
        return json({ link }, 200, h);
      }
    }
    return json({ error: 'unknown method' }, 404, h);
  },
};

/** Владельцу — сообщение о каждой новой покупке. Кто владелец, хранит таблица config (key = 'owner'), а не код. */
const tellOwner = async (env: Env, from: { id: number; first_name?: string; last_name?: string; username?: string }, amount: number): Promise<void> => {
  try {
    const owner = await env.DB.prepare("SELECT value FROM config WHERE key = 'owner'").first<{ value: string }>();
    if (!owner?.value) return;
    const t = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS stars FROM payments WHERE refunded = 0').first<{ n: number; stars: number }>();
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || `id ${from.id}`;
    await bot(env, 'sendMessage', {
      chat_id: Number(owner.value),
      text: `👑 Корону купили!\n${name}${from.username ? ` (@${from.username})` : ''} — ${amount} ⭐\nВсего покупок: ${t?.n ?? 0}, звёзд: ${t?.stars ?? 0}`,
    });
  } catch { /* уведомление не должно мешать выдаче покупки */ }
};

// ---------- статистика ----------
// events: одна строка на игрока, день (UTC) и вид события — «был в игре», «первая битва», «упёрся в лимит»…
const EVENTS = ['battle', 'shop', 'buy'];
const utcDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
const track = async (env: Env, uid: number, kind: string): Promise<void> => {
  try { await env.DB.prepare('INSERT OR IGNORE INTO events (user_id, day, kind) VALUES (?, ?, ?)').bind(uid, utcDay(now()), kind).run(); } catch { /* статистика не должна мешать игре */ }
};
/** Язык Telegram игрока из initData (подпись уже проверена). */
const userLang = (initData: string): string => { try { return JSON.parse(new URLSearchParams(initData).get('user') ?? '{}').language_code ?? ''; } catch { return ''; } };

/** Сводка для владельца (/stats): игроки, удержание, воронка, деньги. */
export const statsText = async (env: Env): Promise<string> => {
  const n = async (sql: string, ...v: unknown[]) => (await env.DB.prepare(sql).bind(...v).first<{ n: number }>())?.n ?? 0;
  const today = utcDay(now()), week = utcDay(now() - 6 * 86400);
  const total = await n('SELECT COUNT(*) AS n FROM users');
  const newToday = await n('SELECT COUNT(*) AS n FROM users WHERE created >= ?', Math.floor(Date.parse(today) / 1000));
  const newWeek = await n('SELECT COUNT(*) AS n FROM users WHERE created >= ?', Math.floor(Date.parse(week) / 1000));
  const dau = await n("SELECT COUNT(*) AS n FROM events WHERE kind = 'open' AND day = ?", today);
  const wau = await n("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE kind = 'open' AND day >= ?", week);
  // удержание 1-го дня: новички за 7 дней до вчера включительно, кто пришёл на следующий день
  const d1base = await n("SELECT COUNT(*) AS n FROM users WHERE created >= ? AND created < ?", Math.floor(Date.parse(week) / 1000) - 86400, Math.floor(Date.parse(today) / 1000));
  const d1 = await n(`SELECT COUNT(*) AS n FROM users u WHERE u.created >= ? AND u.created < ?
    AND EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id AND e.kind = 'open' AND e.day = date(u.created, 'unixepoch', '+1 day'))`,
  Math.floor(Date.parse(week) / 1000) - 86400, Math.floor(Date.parse(today) / 1000));
  const ever = (kind: string) => n('SELECT COUNT(DISTINCT e.user_id) AS n FROM events e JOIN users u ON u.id = e.user_id WHERE e.kind = ? AND u.created >= ?', kind, Math.floor(Date.parse(week) / 1000));
  const [battle, limit, shop, buy] = [await ever('battle'), await ever('limit'), await ever('shop'), await ever('buy')];
  const ads = await n("SELECT COALESCE(SUM(ads), 0) AS n FROM users WHERE day = ?", today);
  const adUsers = await n("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE kind = 'ad' AND day >= ?", week);
  const buys = await n('SELECT COUNT(*) AS n FROM payments WHERE refunded = 0');
  const stars = await n('SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE refunded = 0');
  const buysWeek = await n('SELECT COUNT(*) AS n FROM payments WHERE refunded = 0 AND at >= ?', Math.floor(Date.parse(week) / 1000));
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return [
    '📊 Checkmate Empires',
    '',
    `👥 Игроков всего: ${total}`,
    `🆕 Новых: сегодня ${newToday}, за 7 дней ${newWeek}`,
    `🎮 Играли: сегодня ${dau}, за 7 дней ${wau}`,
    `🔁 Вернулись на 2-й день: ${pct(d1, d1base)} (${d1} из ${d1base})`,
    '',
    `Новички за 7 дней (${newWeek}):`,
    `⚔️ дошли до битвы — ${pct(battle, newWeek)}`,
    `⏳ упёрлись в лимит — ${pct(limit, newWeek)}`,
    `🛒 открыли магазин — ${pct(shop, newWeek)}`,
    `💳 нажали «Купить» — ${pct(buy, newWeek)}`,
    '',
    `▶️ Реклама: сегодня ${ads} просмотров, за 7 дней смотрели ${adUsers} игроков`,
    `👑 Покупок: ${buys} (за 7 дней ${buysWeek}), звёзд: ${stars} ⭐`,
  ].join('\n');
};

// ---------- одноразовая настройка бота: описания и команды на трёх языках ----------
// Открыть в браузере: https://<сервер>/setup?key=<WEBHOOK_SECRET>
const DESCR: Record<Lang, { about: string; long: string; cmds: [string, string][] }> = {
  en: {
    about: 'A 4X strategy where every battle is a real game of chess. Build an empire and checkmate your rivals ♟',
    long: '♟ Checkmate Empires is a strategy game where every battle is a real game of chess.\n\n🏰 Build cities, farms and mines, hire generals and raise an army of chess pieces.\n⚔️ Attack your neighbours — play the battle yourself or leave it to your general.\n🌍 26 nations, maps of Europe, Asia, the Mediterranean, Africa and the Americas, and an 8-chapter campaign.\n👑 Dynasty, achievements and wonders of the world.\n\nTap "Play" — your first game starts in a minute.',
    cmds: [['start', 'Play Checkmate Empires'], ['terms', 'About the Imperial Crown'], ['paysupport', 'Help with a payment']],
  },
  ru: {
    about: 'Стратегия-4X, где каждая битва — настоящая партия в шахматы. Стройте империю и ставьте мат соседям ♟',
    long: '♟ Checkmate Empires — стратегия, где каждая битва — настоящая партия в шахматы.\n\n🏰 Стройте города, фермы и шахты, нанимайте генералов и собирайте армию из шахматных фигур.\n⚔️ Нападайте на соседей — играйте бой сами или доверьте его генералу.\n🌍 26 народов, карты Европы, Азии, Средиземноморья, Африки и Америки, кампания «Хроники империй» из 8 глав.\n👑 Династия, достижения и чудеса света.\n\nНажмите «Играть» — партия начнётся за минуту.',
    cmds: [['start', 'Играть в Checkmate Empires'], ['terms', 'Об Императорской короне'], ['paysupport', 'Помощь с оплатой']],
  },
  es: {
    about: 'Estrategia 4X donde cada batalla es una partida de ajedrez real. Construye un imperio y da jaque mate ♟',
    long: '♟ Checkmate Empires es un juego de estrategia donde cada batalla es una partida de ajedrez real.\n\n🏰 Construye ciudades, granjas y minas, contrata generales y reúne un ejército de piezas de ajedrez.\n⚔️ Ataca a tus vecinos: juega la batalla tú mismo o déjasela a tu general.\n🌍 26 naciones, mapas de Europa, Asia, el Mediterráneo, África y América, y una campaña de 8 capítulos.\n👑 Dinastía, logros y maravillas del mundo.\n\nPulsa «Jugar»: tu primera partida empieza en un minuto.',
    cmds: [['start', 'Jugar a Checkmate Empires'], ['terms', 'Sobre la Corona imperial'], ['paysupport', 'Ayuda con un pago']],
  },
};
export const setupBot = async (env: Env): Promise<string[]> => {
  const done: string[] = [];
  for (const [l, d] of Object.entries(DESCR) as [Lang, (typeof DESCR)[Lang]][]) {
    for (const code of l === 'en' ? ['', 'en'] : [l]) { // английский — и для всех остальных языков
      const lc = code ? { language_code: code } : {};
      await bot(env, 'setMyDescription', { description: d.long, ...lc });
      await bot(env, 'setMyShortDescription', { short_description: d.about, ...lc });
      await bot(env, 'setMyCommands', { commands: d.cmds.map(([command, description]) => ({ command, description })), ...lc });
      done.push(code || 'default');
    }
  }
  await bot(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '♟ Play', web_app: { url: env.GAME_URL } } });
  return done;
};
