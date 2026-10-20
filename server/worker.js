// src/index.ts
var num = (v, d) => v && Number.isFinite(Number(v)) ? Number(v) : d;
var now = () => Math.floor(Date.now() / 1e3);
var enc = new TextEncoder();
var hmac = async (key, data) => {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
};
var hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
var verifyInitData = async (initData, botToken, maxAgeSec = 86400) => {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), botToken);
  const sign = hex(await hmac(secret, check));
  if (sign !== hash) return null;
  const auth = Number(params.get("auth_date") ?? 0);
  if (!auth || now() - auth > maxAgeSec) return null;
  try {
    const u = JSON.parse(params.get("user") ?? "{}");
    return typeof u.id === "number" ? u.id : null;
  } catch {
    return null;
  }
};
var localDay = (tzMin) => new Date((now() + tzMin * 60) * 1e3).toISOString().slice(0, 10);
var loadUser = async (env, id, tz) => {
  let u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!u) {
    const t = Math.max(-14 * 60, Math.min(14 * 60, Math.round(tz) || 0));
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, tz, day, created) VALUES (?, ?, ?, ?)").bind(id, t, localDay(t), now()).run();
    u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  }
  const today = localDay(u.tz);
  if (u.day !== today) {
    await env.DB.prepare("UPDATE users SET day = ?, used = 0, bonus = 0, ads = 0 WHERE id = ?").bind(today, id).run();
    u = { ...u, day: today, used: 0, bonus: 0, ads: 0 };
  }
  return u;
};
var status = (env, u) => {
  const free = num(env.FREE_MINUTES, 30) * 60;
  return {
    premium: !!u.premium,
    secondsLeft: u.premium ? null : Math.max(0, free + u.bonus - u.used),
    adsLeft: Math.max(0, num(env.ADS_PER_DAY, 12) - u.ads),
    adMinutes: num(env.AD_MINUTES, 10),
    freeMinutes: num(env.FREE_MINUTES, 30),
    price: num(env.CROWN_PRICE, 300)
  };
};
var bot = async (env, method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result;
};
var CROWN_PAYLOAD = (uid) => `crown:${uid}`;
var langOf = (code) => {
  const c = String(code ?? "").slice(0, 2).toLowerCase();
  return c === "ru" || c === "uk" || c === "be" ? "ru" : c === "es" ? "es" : "en";
};
var T = {
  start: {
    en: "\u265B Checkmate Empires \u2014 build an empire where every war is a real chess game.\n\nGrow cities, hire generals, raise an army of chess pieces and checkmate your rivals.",
    ru: "\u265B Checkmate Empires \u2014 \u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u0438\u043C\u043F\u0435\u0440\u0438\u044E, \u0433\u0434\u0435 \u043A\u0430\u0436\u0434\u0430\u044F \u0432\u043E\u0439\u043D\u0430 \u2014 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u0448\u0430\u0445\u043C\u0430\u0442\u043D\u0430\u044F \u043F\u0430\u0440\u0442\u0438\u044F.\n\n\u0420\u0430\u0437\u0432\u0438\u0432\u0430\u0439\u0442\u0435 \u0433\u043E\u0440\u043E\u0434\u0430, \u043D\u0430\u043D\u0438\u043C\u0430\u0439\u0442\u0435 \u0433\u0435\u043D\u0435\u0440\u0430\u043B\u043E\u0432, \u0441\u043E\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0430\u0440\u043C\u0438\u044E \u0438\u0437 \u0448\u0430\u0445\u043C\u0430\u0442\u043D\u044B\u0445 \u0444\u0438\u0433\u0443\u0440 \u0438 \u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043C\u0430\u0442 \u0441\u043E\u0441\u0435\u0434\u044F\u043C.",
    es: "\u265B Checkmate Empires \u2014 construye un imperio donde cada guerra es una partida de ajedrez real.\n\nHaz crecer tus ciudades, contrata generales, re\xFAne un ej\xE9rcito de piezas y da jaque mate a tus rivales."
  },
  play: { en: "\u25B6 Play", ru: "\u25B6 \u0418\u0433\u0440\u0430\u0442\u044C", es: "\u25B6 Jugar" },
  thanks: {
    en: "\u{1F451} The Imperial Crown is yours! All chapters, maps, city auto-development and the Outlaws are open, and the day has no limit. Thank you!",
    ru: "\u{1F451} \u0418\u043C\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0441\u043A\u0430\u044F \u043A\u043E\u0440\u043E\u043D\u0430 \u0432\u0430\u0448\u0430! \u041E\u0442\u043A\u0440\u044B\u0442\u044B \u0432\u0441\u0435 \u0433\u043B\u0430\u0432\u044B, \u043A\u0430\u0440\u0442\u044B, \u0430\u0432\u0442\u043E\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 \u0433\u043E\u0440\u043E\u0434\u043E\u0432 \u0438 \u0438\u0433\u0440\u0430 \u0437\u0430 \u0440\u0430\u0437\u0431\u043E\u0439\u043D\u0438\u043A\u043E\u0432, \u0430 \u043B\u0438\u043C\u0438\u0442\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435\u0442. \u0421\u043F\u0430\u0441\u0438\u0431\u043E!",
    es: "\u{1F451} \xA1La Corona imperial es tuya! Tienes todos los cap\xEDtulos, mapas, el desarrollo autom\xE1tico de ciudades y los Forajidos, y el d\xEDa no tiene l\xEDmite. \xA1Gracias!"
  },
  support: {
    en: "Payment questions: describe the problem in a message here and we will answer. Purchases are refunded in Telegram Stars.",
    ru: "\u0412\u043E\u043F\u0440\u043E\u0441\u044B \u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u0435: \u043E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u043C \u0437\u0434\u0435\u0441\u044C, \u043C\u044B \u043E\u0442\u0432\u0435\u0442\u0438\u043C. \u041F\u043E\u043A\u0443\u043F\u043A\u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u044E\u0442\u0441\u044F \u0432 Telegram Stars.",
    es: "Preguntas sobre pagos: describe el problema en un mensaje aqu\xED y te responderemos. Las compras se reembolsan en Telegram Stars."
  },
  terms: {
    en: "The Imperial Crown is a one-time purchase in Telegram Stars. It unlocks chapters 3\u20138 of the campaign, all maps (opened through dynasty levels), city auto-development, playing as the Outlaws and unlimited play time.",
    ru: "\u0418\u043C\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0441\u043A\u0430\u044F \u043A\u043E\u0440\u043E\u043D\u0430 \u2014 \u0440\u0430\u0437\u043E\u0432\u0430\u044F \u043F\u043E\u043A\u0443\u043F\u043A\u0430 \u0437\u0430 Telegram Stars. \u041E\u043D\u0430 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u0433\u043B\u0430\u0432\u044B 3\u20138 \u043A\u0430\u043C\u043F\u0430\u043D\u0438\u0438, \u0432\u0441\u0435 \u043A\u0430\u0440\u0442\u044B (\u043F\u043E \u0443\u0440\u043E\u0432\u043D\u044E \u0434\u0438\u043D\u0430\u0441\u0442\u0438\u0438), \u0430\u0432\u0442\u043E\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 \u0433\u043E\u0440\u043E\u0434\u043E\u0432, \u0438\u0433\u0440\u0443 \u0437\u0430 \u0440\u0430\u0437\u0431\u043E\u0439\u043D\u0438\u043A\u043E\u0432 \u0438 \u0438\u0433\u0440\u0443 \u0431\u0435\u0437 \u043B\u0438\u043C\u0438\u0442\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438.",
    es: "La Corona imperial es una compra \xFAnica en Telegram Stars. Desbloquea los cap\xEDtulos 3\u20138 de la campa\xF1a, todos los mapas (seg\xFAn el nivel de la dinast\xEDa), el desarrollo autom\xE1tico de ciudades, jugar como los Forajidos y tiempo de juego ilimitado."
  },
  changed: { en: "This offer has changed. Please open the shop again.", ru: "\u041F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D \u0435\u0449\u0451 \u0440\u0430\u0437.", es: "La oferta ha cambiado. Abre la tienda de nuevo." },
  crown: { en: "Imperial Crown", ru: "\u0418\u043C\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0441\u043A\u0430\u044F \u043A\u043E\u0440\u043E\u043D\u0430", es: "Corona imperial" },
  crownDesc: {
    en: "Chapters 3\u20138 of the campaign, all maps, city auto-development, the Outlaws and no daily time limit.",
    ru: "\u0413\u043B\u0430\u0432\u044B 3\u20138 \u043A\u0430\u043C\u043F\u0430\u043D\u0438\u0438, \u0432\u0441\u0435 \u043A\u0430\u0440\u0442\u044B, \u0430\u0432\u0442\u043E\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 \u0433\u043E\u0440\u043E\u0434\u043E\u0432, \u0440\u0430\u0437\u0431\u043E\u0439\u043D\u0438\u043A\u0438 \u0438 \u0438\u0433\u0440\u0430 \u0431\u0435\u0437 \u043B\u0438\u043C\u0438\u0442\u0430 \u0432\u0440\u0435\u043C\u0435\u043D\u0438.",
    es: "Cap\xEDtulos 3\u20138 de la campa\xF1a, todos los mapas, desarrollo autom\xE1tico de ciudades, los Forajidos y sin l\xEDmite diario."
  }
};
var tx = (k, l) => T[k][l];
var onUpdate = async (env, upd) => {
  const price = num(env.CROWN_PRICE, 300);
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query;
    const ok = q.currency === "XTR" && q.total_amount === price && q.invoice_payload === CROWN_PAYLOAD(q.from.id);
    await bot(env, "answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: tx("changed", langOf(q.from.language_code)) });
    return;
  }
  const msg = upd.message;
  if (!msg) return;
  const lang = langOf(msg.from?.language_code);
  if (msg.successful_payment) {
    const p = msg.successful_payment;
    const uid = msg.from.id;
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO payments (charge_id, user_id, amount, payload, at) VALUES (?, ?, ?, ?, ?)").bind(p.telegram_payment_charge_id, uid, p.total_amount, p.invoice_payload, now()).run();
    if ((ins?.meta?.changes ?? ins?.changes ?? 1) > 0) await tellOwner(env, msg.from, p.total_amount);
    if (String(p.invoice_payload).startsWith("crown:")) {
      await loadUser(env, uid, 0);
      await env.DB.prepare("UPDATE users SET premium = 1 WHERE id = ?").bind(uid).run();
      await bot(env, "sendMessage", { chat_id: msg.chat.id, text: tx("thanks", lang) });
    }
    return;
  }
  const text = String(msg.text ?? "");
  if (text.startsWith("/start")) {
    await bot(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: tx("start", lang),
      reply_markup: { inline_keyboard: [[{ text: tx("play", lang), web_app: { url: env.GAME_URL } }]] }
    });
  } else if (text.startsWith("/paysupport")) {
    await bot(env, "sendMessage", { chat_id: msg.chat.id, text: tx("support", lang) });
  } else if (text.startsWith("/terms")) {
    await bot(env, "sendMessage", { chat_id: msg.chat.id, text: tx("terms", lang) });
  } else if (text.startsWith("/stats")) {
    const owner = await env.DB.prepare("SELECT value FROM config WHERE key = 'owner'").first();
    if (owner && String(msg.from?.id) === owner.value) await bot(env, "sendMessage", { chat_id: msg.chat.id, text: await statsText(env) });
  }
};
var cors = (env, req) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return { "access-control-allow-origin": ok ? origin || "*" : allowed[0], "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
};
var json = (data, code, h) => new Response(JSON.stringify(data), { status: code, headers: { "content-type": "application/json", ...h } });
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (url.pathname === "/bot" && req.method === "POST") {
      if (req.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
      try {
        await onUpdate(env, await req.json());
      } catch (e) {
        console.error(e);
      }
      return new Response("ok");
    }
    if (url.pathname === "/setup") {
      if (!env.WEBHOOK_SECRET || url.searchParams.get("key") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
      try {
        return new Response(`OK: ${(await setupBot(env)).join(", ")}`);
      } catch (e) {
        return new Response(`error: ${e.message}`, { status: 500 });
      }
    }
    if (!url.pathname.startsWith("/api/") || req.method !== "POST") return new Response("Checkmate Empires server", { status: 200 });
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400, h);
    }
    const uid = await verifyInitData(body.initData ?? "", env.BOT_TOKEN);
    if (!uid) return json({ error: "not signed by Telegram" }, 401, h);
    let u = await loadUser(env, uid, Number(body.tz ?? 0));
    const t = now();
    const lang = langOf(body.lang ?? userLang(body.initData ?? ""));
    switch (url.pathname) {
      case "/api/me":
        await track(env, uid, "open");
        return json(status(env, u), 200, h);
      case "/api/event": {
        const kind = String(body.kind ?? "");
        if (EVENTS.includes(kind)) await track(env, uid, kind);
        return json({ ok: true }, 200, h);
      }
      case "/api/tick": {
        if (!u.premium) {
          const claimed = Math.max(0, Math.min(120, Math.round(Number(body.seconds ?? 0))));
          const real = u.last_tick ? t - u.last_tick + 5 : claimed;
          const add = Math.min(claimed, real);
          await env.DB.prepare("UPDATE users SET used = used + ?, last_tick = ? WHERE id = ?").bind(add, t, uid).run();
          u = { ...u, used: u.used + add, last_tick: t };
          if (status(env, u).secondsLeft === 0) await track(env, uid, "limit");
        }
        return json(status(env, u), 200, h);
      }
      case "/api/ad": {
        if (!u.premium && u.ads < num(env.ADS_PER_DAY, 12) && t - u.last_ad >= 20) {
          const add = num(env.AD_MINUTES, 10) * 60;
          await env.DB.prepare("UPDATE users SET bonus = bonus + ?, ads = ads + 1, last_ad = ? WHERE id = ?").bind(add, t, uid).run();
          u = { ...u, bonus: u.bonus + add, ads: u.ads + 1, last_ad: t };
          await track(env, uid, "ad");
        }
        return json(status(env, u), 200, h);
      }
      case "/api/invoice": {
        if (u.premium) return json({ error: "already yours" }, 409, h);
        const price = num(env.CROWN_PRICE, 300);
        const link = await bot(env, "createInvoiceLink", {
          title: tx("crown", lang),
          description: tx("crownDesc", lang),
          payload: CROWN_PAYLOAD(uid),
          currency: "XTR",
          // Telegram Stars
          prices: [{ label: tx("crown", lang), amount: price }]
        });
        return json({ link }, 200, h);
      }
    }
    return json({ error: "unknown method" }, 404, h);
  }
};
var tellOwner = async (env, from, amount) => {
  try {
    const owner = await env.DB.prepare("SELECT value FROM config WHERE key = 'owner'").first();
    if (!owner?.value) return;
    const t = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS stars FROM payments WHERE refunded = 0").first();
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || `id ${from.id}`;
    await bot(env, "sendMessage", {
      chat_id: Number(owner.value),
      text: `\u{1F451} \u041A\u043E\u0440\u043E\u043D\u0443 \u043A\u0443\u043F\u0438\u043B\u0438!
${name}${from.username ? ` (@${from.username})` : ""} \u2014 ${amount} \u2B50
\u0412\u0441\u0435\u0433\u043E \u043F\u043E\u043A\u0443\u043F\u043E\u043A: ${t?.n ?? 0}, \u0437\u0432\u0451\u0437\u0434: ${t?.stars ?? 0}`
    });
  } catch {
  }
};
var EVENTS = ["battle", "shop", "buy"];
var utcDay = (sec) => new Date(sec * 1e3).toISOString().slice(0, 10);
var track = async (env, uid, kind) => {
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO events (user_id, day, kind) VALUES (?, ?, ?)").bind(uid, utcDay(now()), kind).run();
  } catch {
  }
};
var userLang = (initData) => {
  try {
    return JSON.parse(new URLSearchParams(initData).get("user") ?? "{}").language_code ?? "";
  } catch {
    return "";
  }
};
var statsText = async (env) => {
  const n = async (sql, ...v) => (await env.DB.prepare(sql).bind(...v).first())?.n ?? 0;
  const today = utcDay(now()), week = utcDay(now() - 6 * 86400);
  const total = await n("SELECT COUNT(*) AS n FROM users");
  const newToday = await n("SELECT COUNT(*) AS n FROM users WHERE created >= ?", Math.floor(Date.parse(today) / 1e3));
  const newWeek = await n("SELECT COUNT(*) AS n FROM users WHERE created >= ?", Math.floor(Date.parse(week) / 1e3));
  const dau = await n("SELECT COUNT(*) AS n FROM events WHERE kind = 'open' AND day = ?", today);
  const wau = await n("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE kind = 'open' AND day >= ?", week);
  const d1base = await n("SELECT COUNT(*) AS n FROM users WHERE created >= ? AND created < ?", Math.floor(Date.parse(week) / 1e3) - 86400, Math.floor(Date.parse(today) / 1e3));
  const d1 = await n(
    `SELECT COUNT(*) AS n FROM users u WHERE u.created >= ? AND u.created < ?
    AND EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id AND e.kind = 'open' AND e.day = date(u.created, 'unixepoch', '+1 day'))`,
    Math.floor(Date.parse(week) / 1e3) - 86400,
    Math.floor(Date.parse(today) / 1e3)
  );
  const ever = (kind) => n("SELECT COUNT(DISTINCT e.user_id) AS n FROM events e JOIN users u ON u.id = e.user_id WHERE e.kind = ? AND u.created >= ?", kind, Math.floor(Date.parse(week) / 1e3));
  const [battle, limit, shop, buy] = [await ever("battle"), await ever("limit"), await ever("shop"), await ever("buy")];
  const ads = await n("SELECT COALESCE(SUM(ads), 0) AS n FROM users WHERE day = ?", today);
  const adUsers = await n("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE kind = 'ad' AND day >= ?", week);
  const buys = await n("SELECT COUNT(*) AS n FROM payments WHERE refunded = 0");
  const stars = await n("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE refunded = 0");
  const buysWeek = await n("SELECT COUNT(*) AS n FROM payments WHERE refunded = 0 AND at >= ?", Math.floor(Date.parse(week) / 1e3));
  const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : "\u2014";
  return [
    "\u{1F4CA} Checkmate Empires",
    "",
    `\u{1F465} \u0418\u0433\u0440\u043E\u043A\u043E\u0432 \u0432\u0441\u0435\u0433\u043E: ${total}`,
    `\u{1F195} \u041D\u043E\u0432\u044B\u0445: \u0441\u0435\u0433\u043E\u0434\u043D\u044F ${newToday}, \u0437\u0430 7 \u0434\u043D\u0435\u0439 ${newWeek}`,
    `\u{1F3AE} \u0418\u0433\u0440\u0430\u043B\u0438: \u0441\u0435\u0433\u043E\u0434\u043D\u044F ${dau}, \u0437\u0430 7 \u0434\u043D\u0435\u0439 ${wau}`,
    `\u{1F501} \u0412\u0435\u0440\u043D\u0443\u043B\u0438\u0441\u044C \u043D\u0430 2-\u0439 \u0434\u0435\u043D\u044C: ${pct(d1, d1base)} (${d1} \u0438\u0437 ${d1base})`,
    "",
    `\u041D\u043E\u0432\u0438\u0447\u043A\u0438 \u0437\u0430 7 \u0434\u043D\u0435\u0439 (${newWeek}):`,
    `\u2694\uFE0F \u0434\u043E\u0448\u043B\u0438 \u0434\u043E \u0431\u0438\u0442\u0432\u044B \u2014 ${pct(battle, newWeek)}`,
    `\u23F3 \u0443\u043F\u0451\u0440\u043B\u0438\u0441\u044C \u0432 \u043B\u0438\u043C\u0438\u0442 \u2014 ${pct(limit, newWeek)}`,
    `\u{1F6D2} \u043E\u0442\u043A\u0440\u044B\u043B\u0438 \u043C\u0430\u0433\u0430\u0437\u0438\u043D \u2014 ${pct(shop, newWeek)}`,
    `\u{1F4B3} \u043D\u0430\u0436\u0430\u043B\u0438 \xAB\u041A\u0443\u043F\u0438\u0442\u044C\xBB \u2014 ${pct(buy, newWeek)}`,
    "",
    `\u25B6\uFE0F \u0420\u0435\u043A\u043B\u0430\u043C\u0430: \u0441\u0435\u0433\u043E\u0434\u043D\u044F ${ads} \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u043E\u0432, \u0437\u0430 7 \u0434\u043D\u0435\u0439 \u0441\u043C\u043E\u0442\u0440\u0435\u043B\u0438 ${adUsers} \u0438\u0433\u0440\u043E\u043A\u043E\u0432`,
    `\u{1F451} \u041F\u043E\u043A\u0443\u043F\u043E\u043A: ${buys} (\u0437\u0430 7 \u0434\u043D\u0435\u0439 ${buysWeek}), \u0437\u0432\u0451\u0437\u0434: ${stars} \u2B50`
  ].join("\n");
};
var DESCR = {
  en: {
    about: "A 4X strategy where every battle is a real game of chess. Build an empire and checkmate your rivals \u265F",
    long: '\u265F Checkmate Empires is a strategy game where every battle is a real game of chess.\n\n\u{1F3F0} Build cities, farms and mines, hire generals and raise an army of chess pieces.\n\u2694\uFE0F Attack your neighbours \u2014 play the battle yourself or leave it to your general.\n\u{1F30D} 26 nations, maps of Europe, Asia, the Mediterranean, Africa and the Americas, and an 8-chapter campaign.\n\u{1F451} Dynasty, achievements and wonders of the world.\n\nTap "Play" \u2014 your first game starts in a minute.',
    cmds: [["start", "Play Checkmate Empires"], ["terms", "About the Imperial Crown"], ["paysupport", "Help with a payment"]]
  },
  ru: {
    about: "\u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F-4X, \u0433\u0434\u0435 \u043A\u0430\u0436\u0434\u0430\u044F \u0431\u0438\u0442\u0432\u0430 \u2014 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u043F\u0430\u0440\u0442\u0438\u044F \u0432 \u0448\u0430\u0445\u043C\u0430\u0442\u044B. \u0421\u0442\u0440\u043E\u0439\u0442\u0435 \u0438\u043C\u043F\u0435\u0440\u0438\u044E \u0438 \u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u043C\u0430\u0442 \u0441\u043E\u0441\u0435\u0434\u044F\u043C \u265F",
    long: "\u265F Checkmate Empires \u2014 \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044F, \u0433\u0434\u0435 \u043A\u0430\u0436\u0434\u0430\u044F \u0431\u0438\u0442\u0432\u0430 \u2014 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0430\u044F \u043F\u0430\u0440\u0442\u0438\u044F \u0432 \u0448\u0430\u0445\u043C\u0430\u0442\u044B.\n\n\u{1F3F0} \u0421\u0442\u0440\u043E\u0439\u0442\u0435 \u0433\u043E\u0440\u043E\u0434\u0430, \u0444\u0435\u0440\u043C\u044B \u0438 \u0448\u0430\u0445\u0442\u044B, \u043D\u0430\u043D\u0438\u043C\u0430\u0439\u0442\u0435 \u0433\u0435\u043D\u0435\u0440\u0430\u043B\u043E\u0432 \u0438 \u0441\u043E\u0431\u0438\u0440\u0430\u0439\u0442\u0435 \u0430\u0440\u043C\u0438\u044E \u0438\u0437 \u0448\u0430\u0445\u043C\u0430\u0442\u043D\u044B\u0445 \u0444\u0438\u0433\u0443\u0440.\n\u2694\uFE0F \u041D\u0430\u043F\u0430\u0434\u0430\u0439\u0442\u0435 \u043D\u0430 \u0441\u043E\u0441\u0435\u0434\u0435\u0439 \u2014 \u0438\u0433\u0440\u0430\u0439\u0442\u0435 \u0431\u043E\u0439 \u0441\u0430\u043C\u0438 \u0438\u043B\u0438 \u0434\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0435\u0433\u043E \u0433\u0435\u043D\u0435\u0440\u0430\u043B\u0443.\n\u{1F30D} 26 \u043D\u0430\u0440\u043E\u0434\u043E\u0432, \u043A\u0430\u0440\u0442\u044B \u0415\u0432\u0440\u043E\u043F\u044B, \u0410\u0437\u0438\u0438, \u0421\u0440\u0435\u0434\u0438\u0437\u0435\u043C\u043D\u043E\u043C\u043E\u0440\u044C\u044F, \u0410\u0444\u0440\u0438\u043A\u0438 \u0438 \u0410\u043C\u0435\u0440\u0438\u043A\u0438, \u043A\u0430\u043C\u043F\u0430\u043D\u0438\u044F \xAB\u0425\u0440\u043E\u043D\u0438\u043A\u0438 \u0438\u043C\u043F\u0435\u0440\u0438\u0439\xBB \u0438\u0437 8 \u0433\u043B\u0430\u0432.\n\u{1F451} \u0414\u0438\u043D\u0430\u0441\u0442\u0438\u044F, \u0434\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F \u0438 \u0447\u0443\u0434\u0435\u0441\u0430 \u0441\u0432\u0435\u0442\u0430.\n\n\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0418\u0433\u0440\u0430\u0442\u044C\xBB \u2014 \u043F\u0430\u0440\u0442\u0438\u044F \u043D\u0430\u0447\u043D\u0451\u0442\u0441\u044F \u0437\u0430 \u043C\u0438\u043D\u0443\u0442\u0443.",
    cmds: [["start", "\u0418\u0433\u0440\u0430\u0442\u044C \u0432 Checkmate Empires"], ["terms", "\u041E\u0431 \u0418\u043C\u043F\u0435\u0440\u0430\u0442\u043E\u0440\u0441\u043A\u043E\u0439 \u043A\u043E\u0440\u043E\u043D\u0435"], ["paysupport", "\u041F\u043E\u043C\u043E\u0449\u044C \u0441 \u043E\u043F\u043B\u0430\u0442\u043E\u0439"]]
  },
  es: {
    about: "Estrategia 4X donde cada batalla es una partida de ajedrez real. Construye un imperio y da jaque mate \u265F",
    long: "\u265F Checkmate Empires es un juego de estrategia donde cada batalla es una partida de ajedrez real.\n\n\u{1F3F0} Construye ciudades, granjas y minas, contrata generales y re\xFAne un ej\xE9rcito de piezas de ajedrez.\n\u2694\uFE0F Ataca a tus vecinos: juega la batalla t\xFA mismo o d\xE9jasela a tu general.\n\u{1F30D} 26 naciones, mapas de Europa, Asia, el Mediterr\xE1neo, \xC1frica y Am\xE9rica, y una campa\xF1a de 8 cap\xEDtulos.\n\u{1F451} Dinast\xEDa, logros y maravillas del mundo.\n\nPulsa \xABJugar\xBB: tu primera partida empieza en un minuto.",
    cmds: [["start", "Jugar a Checkmate Empires"], ["terms", "Sobre la Corona imperial"], ["paysupport", "Ayuda con un pago"]]
  }
};
var setupBot = async (env) => {
  const done = [];
  for (const [l, d] of Object.entries(DESCR)) {
    for (const code of l === "en" ? ["", "en"] : [l]) {
      const lc = code ? { language_code: code } : {};
      await bot(env, "setMyDescription", { description: d.long, ...lc });
      await bot(env, "setMyShortDescription", { short_description: d.about, ...lc });
      await bot(env, "setMyCommands", { commands: d.cmds.map(([command, description]) => ({ command, description })), ...lc });
      done.push(code || "default");
    }
  }
  await bot(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "\u265F Play", web_app: { url: env.GAME_URL } } });
  return done;
};
export {
  index_default as default,
  langOf,
  onUpdate,
  setupBot,
  statsText,
  verifyInitData
};
