# Сервер Checkmate Empires

Маленький сервер на Cloudflare Workers (бесплатный тариф) с базой D1. Он:

- узнаёт игрока по подписи Telegram (подделать нельзя без токена бота);
- продаёт «Императорскую корону» за Telegram Stars и хранит покупку;
- считает 30 бесплатных минут в день и добавляет 10 минут за просмотренную рекламу;
- отвечает боту: `/start` (кнопка «Играть»), `/paysupport`, `/terms`, проверка перед оплатой и успешный платёж.

Токен бота живёт **только** в секретах Cloudflare — ни в коде, ни в чате, ни в репозитории.

## Без терминала: всё через сайт Cloudflare

1. **D1 → Create** → имя `checkmate-empires` → открыть базу → **Console** → вставить весь текст `schema.sql` → **Execute**.
2. **Workers & Pages → Create → Worker** (Hello World) → имя `checkmate-empires` → **Deploy** → **Edit code** →
   стереть всё и вставить весь `worker.js` → **Deploy**.
3. Воркер → **Settings → Bindings → Add → D1 database**: имя переменной `DB`, база `checkmate-empires`.
4. Воркер → **Settings → Variables and Secrets → Add**:
   секреты (Secret) `BOT_TOKEN`, `WEBHOOK_SECRET`; текст (Text) `GAME_URL`, `ALLOWED_ORIGINS`, `CROWN_PRICE`, `FREE_MINUTES`, `AD_MINUTES`, `ADS_PER_DAY` — значения как в таблице ниже.
5. Адрес воркера (`https://checkmate-empires.<имя>.workers.dev`) → в браузере открыть
   `https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=<АДРЕС>/bot&secret_token=<WEBHOOK_SECRET>` — должно быть `"ok":true`.
6. GitHub → Settings → Secrets and variables → Actions → Variables: `CE_API` = адрес воркера.

`worker.js` — тот же `src/index.ts`, собранный в один файл (`npx esbuild src/index.ts --bundle --format=esm --outfile=worker.js`).

## Через терминал: настройка

Понадобятся аккаунт Cloudflare (бесплатный) и Node.js на компьютере.

```bash
cd server
npm install                      # ставит wrangler
npx wrangler login               # откроется браузер — войти в Cloudflare

npx wrangler d1 create checkmate-empires
# скопировать database_id из вывода в wrangler.toml (строка database_id)
npm run db:init                  # создать таблицы

npx wrangler secret put BOT_TOKEN        # вставить токен бота от @BotFather
npx wrangler secret put WEBHOOK_SECRET   # придумать длинную случайную строку (буквы и цифры)

npm run deploy
# в выводе будет адрес вида https://checkmate-empires.<ваше-имя>.workers.dev
```

Подключить бота к серверу (одна команда; подставить токен, адрес и секрет):

```bash
curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
  -d "url=https://checkmate-empires.<ваше-имя>.workers.dev/bot" \
  -d "secret_token=<WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","pre_checkout_query"]'
```

Сообщить игре адрес сервера: на GitHub в репозитории → Settings → Secrets and variables → Actions →
вкладка **Variables** → New repository variable:

- `CE_API` = `https://checkmate-empires.<ваше-имя>.workers.dev`
- `CE_ADSGRAM_BLOCK` = номер рекламного блока из кабинета Adsgram (можно добавить позже)

После этого следующий пуш (или Actions → Build and publish → Run workflow) соберёт игру с оплатой и лимитом.
Если `CE_API` не задан, игра обращается к боевому серверу `https://checkmate-empires.supclip1.workers.dev` (вписан в `packages/app/build.mjs`). `CE_API=off` — сборка без оплаты и лимита.

## Настройки (wrangler.toml → [vars])

| Переменная | По умолчанию | Что это |
|---|---|---|
| `CROWN_PRICE` | 300 | цена короны в Stars |
| `FREE_MINUTES` | 30 | бесплатной игры в день |
| `AD_MINUTES` | 10 | минут за одну рекламу |
| `ADS_PER_DAY` | 12 | реклам в день, не больше |
| `GAME_URL` | адрес на GitHub Pages | куда ведёт кнопка «Играть» |
| `ALLOWED_ORIGINS` | GitHub Pages | с каких сайтов игра может обращаться к серверу |

Изменили — `npm run deploy`.

## Возврат денег

Telegram требует уметь возвращать Stars. Номер платежа — в таблице `payments` (`charge_id`):

```bash
npx wrangler d1 execute checkmate-empires --remote --command "SELECT * FROM payments ORDER BY at DESC LIMIT 20"
curl "https://api.telegram.org/bot<ТОКЕН>/refundStarPayment" -d user_id=<ID> -d telegram_payment_charge_id=<CHARGE_ID>
npx wrangler d1 execute checkmate-empires --remote --command "UPDATE users SET premium = 0 WHERE id = <ID>; UPDATE payments SET refunded = 1 WHERE charge_id = '<CHARGE_ID>'"
```

## Тесты

`npm test` — проверка подписи, лимита времени, рекламы и оплаты без Cloudflare (база — встроенный SQLite Node 22).
