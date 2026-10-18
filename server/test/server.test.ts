// Тесты сервера без Cloudflare: D1 — на встроенном SQLite Node, Telegram Bot API — подменённый fetch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { type D1Database, type Env, verifyInitData } from '../src/index.ts';

const TOKEN = '123456:TEST-TOKEN';
const d1 = (): D1Database => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const st = {
        bind(...v: unknown[]) { args = v; return st; },
        async first<T>() { return (db.prepare(sql).get(...(args as never[])) as T) ?? null; },
        async run() { return db.prepare(sql).run(...(args as never[])); },
        async all<T>() { return { results: db.prepare(sql).all(...(args as never[])) as T[] }; },
      };
      return st;
    },
  };
};
const sign = (user: object, auth = Math.floor(Date.now() / 1000)) => {
  const p = new URLSearchParams({ auth_date: String(auth), query_id: 'Q', user: JSON.stringify(user) });
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
};
const calls: { method: string; body: any }[] = [];
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const method = String(url).split('/').pop()!;
  const body = JSON.parse(String(init.body));
  calls.push({ method, body });
  return new Response(JSON.stringify({ ok: true, result: method === 'createInvoiceLink' ? 'https://t.me/$invoice123' : true }));
}) as typeof fetch;

const env: Env = { DB: d1(), BOT_TOKEN: TOKEN, WEBHOOK_SECRET: 'whs', GAME_URL: 'https://game', CROWN_PRICE: '300', FREE_MINUTES: '30', AD_MINUTES: '10', ADS_PER_DAY: '2' };
const api = async (path: string, body: object) => (await worker.fetch(new Request(`https://srv${path}`, { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://supclip1-art.github.io' } }), env));
const hook = (upd: object, secret = 'whs') => worker.fetch(new Request('https://srv/bot', { method: 'POST', body: JSON.stringify(upd), headers: { 'x-telegram-bot-api-secret-token': secret } }), env);

test('подпись Telegram: верная — id игрока, подделка и старая — нет', async () => {
  const good = sign({ id: 42 });
  assert.equal(await verifyInitData(good, TOKEN), 42);
  assert.equal(await verifyInitData(good.replace('42', '43'), TOKEN), null);
  assert.equal(await verifyInitData(sign({ id: 42 }, 1000), TOKEN), null);
  assert.equal((await api('/api/me', { initData: 'hash=1' })).status, 401);
});

test('30 минут в день, реклама добавляет 10, не больше лимита реклам; честный счёт времени', async () => {
  const initData = sign({ id: 7 });
  let r = await (await api('/api/me', { initData, tz: 180 })).json();
  assert.equal(r.secondsLeft, 1800);
  assert.equal(r.premium, false);
  r = await (await api('/api/tick', { initData, seconds: 60 })).json();
  assert.equal(r.secondsLeft, 1740);
  // сразу ещё «60 секунд» — реально прошло ~0: засчитается не больше прошедшего (+5 с запаса)
  r = await (await api('/api/tick', { initData, seconds: 60 })).json();
  assert.ok(r.secondsLeft >= 1735);
  r = await (await api('/api/ad', { initData })).json();
  assert.ok(r.secondsLeft >= 1735 + 600);
  assert.equal(r.adsLeft, 1);
  const before = r.secondsLeft;
  r = await (await api('/api/ad', { initData })).json(); // чаще раза в 20 секунд — не засчитывается
  assert.equal(r.secondsLeft, before);
});

test('покупка короны: счёт в Stars, проверка перед оплатой, платёж открывает корону один раз', async () => {
  const initData = sign({ id: 99 });
  const inv = await (await api('/api/invoice', { initData })).json();
  assert.equal(inv.link, 'https://t.me/$invoice123');
  const c = calls.find((x) => x.method === 'createInvoiceLink')!;
  assert.equal(c.body.currency, 'XTR');
  assert.equal(c.body.prices[0].amount, 300);
  assert.equal(c.body.payload, 'crown:99');
  // вебхук без секрета — отказ
  assert.equal((await hook({}, 'wrong')).status, 403);
  await hook({ pre_checkout_query: { id: 'pc1', from: { id: 99 }, currency: 'XTR', total_amount: 300, invoice_payload: 'crown:99' } });
  assert.deepEqual(calls.at(-1), { method: 'answerPreCheckoutQuery', body: { pre_checkout_query_id: 'pc1', ok: true } });
  await hook({ pre_checkout_query: { id: 'pc2', from: { id: 99 }, currency: 'XTR', total_amount: 1, invoice_payload: 'crown:99' } });
  assert.equal(calls.at(-1)!.body.ok, false, 'чужая сумма — отказ');
  await env.DB.prepare("INSERT INTO config (key, value) VALUES ('owner', '777')").run();
  const pay = { message: { chat: { id: 99 }, from: { id: 99, first_name: 'Ann', username: 'ann' }, successful_payment: { currency: 'XTR', total_amount: 300, invoice_payload: 'crown:99', telegram_payment_charge_id: 'ch1' } } };
  await hook(pay);
  await hook(pay); // повтор того же обновления
  const told = calls.filter((x) => x.method === 'sendMessage' && x.body.chat_id === 777);
  assert.equal(told.length, 1, 'владельцу — одно сообщение о покупке, без повторов');
  assert.match(told[0].body.text, /Ann \(@ann\) — 300 ⭐/);
  const me = await (await api('/api/me', { initData })).json();
  assert.equal(me.premium, true);
  assert.equal(me.secondsLeft, null, 'у короны нет лимита времени');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM payments').first<{ n: number }>();
  assert.equal(n!.n, 1);
  assert.equal((await api('/api/invoice', { initData })).status, 409);
});

test('/start присылает кнопку игры', async () => {
  await hook({ message: { chat: { id: 5 }, from: { id: 5 }, text: '/start' } });
  assert.equal(calls.at(-1)!.body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://game');
});
