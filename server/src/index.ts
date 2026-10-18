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

/** Ответ на обновление бота (вебхук). */
export const onUpdate = async (env: Env, upd: Record<string, any>): Promise<void> => {
  const price = num(env.CROWN_PRICE, 300);
  // перед оплатой Telegram спрашивает, можно ли продать: проверяем товар и сумму (ответить надо за 10 секунд)
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query;
    const ok = q.currency === 'XTR' && q.total_amount === price && q.invoice_payload === CROWN_PAYLOAD(q.from.id);
    await bot(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: 'This offer has changed. Please open the shop again.' });
    return;
  }
  const msg = upd.message;
  if (!msg) return;
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
      await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: '👑 The Imperial Crown is yours! All chapters, maps and the Outlaws are open, and the day has no limit. Thank you!' });
    }
    return;
  }
  const text = String(msg.text ?? '');
  if (text.startsWith('/start')) {
    await bot(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '♛ Checkmate Empires — build an empire where every war is a real chess game.',
      reply_markup: { inline_keyboard: [[{ text: '▶ Play', web_app: { url: env.GAME_URL } }]] },
    });
  } else if (text.startsWith('/paysupport')) {
    await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: 'Payment questions: describe the problem in a message here and we will answer. Purchases are refunded in Telegram Stars.' });
  } else if (text.startsWith('/terms')) {
    await bot(env, 'sendMessage', { chat_id: msg.chat.id, text: 'The Imperial Crown is a one-time purchase in Telegram Stars that unlocks chapters 3–8 of the campaign, all maps (opened through achievements), playing as the Outlaws and unlimited play time.' });
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

    if (!url.pathname.startsWith('/api/') || req.method !== 'POST') return new Response('Checkmate Empires server', { status: 200 });
    let body: { initData?: string; tz?: number; seconds?: number };
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
    const uid = await verifyInitData(body.initData ?? '', env.BOT_TOKEN);
    if (!uid) return json({ error: 'not signed by Telegram' }, 401, h);
    let u = await loadUser(env, uid, Number(body.tz ?? 0));
    const t = now();

    switch (url.pathname) {
      case '/api/me':
        return json(status(env, u), 200, h);

      case '/api/tick': {
        // засчитываем не больше, чем прошло на самом деле с прошлого отчёта (и не больше двух минут за раз)
        if (!u.premium) {
          const claimed = Math.max(0, Math.min(120, Math.round(Number(body.seconds ?? 0))));
          const real = u.last_tick ? t - u.last_tick + 5 : claimed;
          const add = Math.min(claimed, real);
          await env.DB.prepare('UPDATE users SET used = used + ?, last_tick = ? WHERE id = ?').bind(add, t, uid).run();
          u = { ...u, used: u.used + add, last_tick: t };
        }
        return json(status(env, u), 200, h);
      }

      case '/api/ad': {
        // реклама досмотрена (Adsgram отдаёт это в игру): +10 минут, не чаще раза в 20 секунд и не больше 12 за день
        if (!u.premium && u.ads < num(env.ADS_PER_DAY, 12) && t - u.last_ad >= 20) {
          const add = num(env.AD_MINUTES, 10) * 60;
          await env.DB.prepare('UPDATE users SET bonus = bonus + ?, ads = ads + 1, last_ad = ? WHERE id = ?').bind(add, t, uid).run();
          u = { ...u, bonus: u.bonus + add, ads: u.ads + 1, last_ad: t };
        }
        return json(status(env, u), 200, h);
      }

      case '/api/invoice': {
        if (u.premium) return json({ error: 'already yours' }, 409, h);
        const price = num(env.CROWN_PRICE, 300);
        const link = await bot<string>(env, 'createInvoiceLink', {
          title: 'Imperial Crown',
          description: 'Chapters 3–8 of the campaign, all maps (opened through achievements), playing as the Outlaws and no daily time limit.',
          payload: CROWN_PAYLOAD(uid),
          currency: 'XTR', // Telegram Stars
          prices: [{ label: 'Imperial Crown', amount: price }],
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
