// Сервер Checkmate Empires одним файлом — для вставки в редактор Cloudflare (Workers → Edit code). Собран из src/index.ts.
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
var onUpdate = async (env, upd) => {
  const price = num(env.CROWN_PRICE, 300);
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query;
    const ok = q.currency === "XTR" && q.total_amount === price && q.invoice_payload === CROWN_PAYLOAD(q.from.id);
    await bot(env, "answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "This offer has changed. Please open the shop again." });
    return;
  }
  const msg = upd.message;
  if (!msg) return;
  if (msg.successful_payment) {
    const p = msg.successful_payment;
    const uid = msg.from.id;
    await env.DB.prepare("INSERT OR IGNORE INTO payments (charge_id, user_id, amount, payload, at) VALUES (?, ?, ?, ?, ?)").bind(p.telegram_payment_charge_id, uid, p.total_amount, p.invoice_payload, now()).run();
    if (String(p.invoice_payload).startsWith("crown:")) {
      await loadUser(env, uid, 0);
      await env.DB.prepare("UPDATE users SET premium = 1 WHERE id = ?").bind(uid).run();
      await bot(env, "sendMessage", { chat_id: msg.chat.id, text: "\u{1F451} The Imperial Crown is yours! All chapters, maps and the Outlaws are open, and the day has no limit. Thank you!" });
    }
    return;
  }
  const text = String(msg.text ?? "");
  if (text.startsWith("/start")) {
    await bot(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: "\u265B Checkmate Empires \u2014 build an empire where every war is a real chess game.",
      reply_markup: { inline_keyboard: [[{ text: "\u25B6 Play", web_app: { url: env.GAME_URL } }]] }
    });
  } else if (text.startsWith("/paysupport")) {
    await bot(env, "sendMessage", { chat_id: msg.chat.id, text: "Payment questions: describe the problem in a message here and we will answer. Purchases are refunded in Telegram Stars." });
  } else if (text.startsWith("/terms")) {
    await bot(env, "sendMessage", { chat_id: msg.chat.id, text: "The Imperial Crown is a one-time purchase in Telegram Stars that unlocks chapters 3\u20138 of the campaign, all maps (opened through achievements), playing as the Outlaws and unlimited play time." });
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
    switch (url.pathname) {
      case "/api/me":
        return json(status(env, u), 200, h);
      case "/api/tick": {
        if (!u.premium) {
          const claimed = Math.max(0, Math.min(120, Math.round(Number(body.seconds ?? 0))));
          const real = u.last_tick ? t - u.last_tick + 5 : claimed;
          const add = Math.min(claimed, real);
          await env.DB.prepare("UPDATE users SET used = used + ?, last_tick = ? WHERE id = ?").bind(add, t, uid).run();
          u = { ...u, used: u.used + add, last_tick: t };
        }
        return json(status(env, u), 200, h);
      }
      case "/api/ad": {
        if (!u.premium && u.ads < num(env.ADS_PER_DAY, 12) && t - u.last_ad >= 20) {
          const add = num(env.AD_MINUTES, 10) * 60;
          await env.DB.prepare("UPDATE users SET bonus = bonus + ?, ads = ads + 1, last_ad = ? WHERE id = ?").bind(add, t, uid).run();
          u = { ...u, bonus: u.bonus + add, ads: u.ads + 1, last_ad: t };
        }
        return json(status(env, u), 200, h);
      }
      case "/api/invoice": {
        if (u.premium) return json({ error: "already yours" }, 409, h);
        const price = num(env.CROWN_PRICE, 300);
        const link = await bot(env, "createInvoiceLink", {
          title: "Imperial Crown",
          description: "Chapters 3\u20138 of the campaign, all maps (opened through achievements), playing as the Outlaws and no daily time limit.",
          payload: CROWN_PAYLOAD(uid),
          currency: "XTR",
          // Telegram Stars
          prices: [{ label: "Imperial Crown", amount: price }]
        });
        return json({ link }, 200, h);
      }
    }
    return json({ error: "unknown method" }, 404, h);
  }
};
export {
  index_default as default,
  onUpdate,
  verifyInitData
};
