-- База сервера Checkmate Empires (Cloudflare D1, SQLite).
-- Игроки: покупка «Короны» и суточный лимит бесплатной игры.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,            -- Telegram user id
  premium INTEGER NOT NULL DEFAULT 0,
  tz INTEGER NOT NULL DEFAULT 0,     -- смещение часового пояса игрока в минутах (запоминается при первом входе)
  day TEXT NOT NULL DEFAULT '',      -- местная дата игрока, к которой относятся счётчики
  used INTEGER NOT NULL DEFAULT 0,   -- сыграно секунд за день
  bonus INTEGER NOT NULL DEFAULT 0,  -- добавлено секунд за рекламу
  ads INTEGER NOT NULL DEFAULT 0,    -- просмотрено реклам за день
  last_tick INTEGER NOT NULL DEFAULT 0,
  last_ad INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0
);
-- Платежи Stars: один платёж — одна выдача (charge_id уникален).
CREATE TABLE IF NOT EXISTS payments (
  charge_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0
);
