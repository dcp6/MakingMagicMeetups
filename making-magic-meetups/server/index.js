import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { getPostgresConnectionString, isPostgresConfigured } from './db/postgres/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir =
  process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'users.db');
const port = process.env.PORT ? Number(process.env.PORT) : 8787;
const frontendOrigins = String(process.env.FRONTEND_ORIGIN || 'https://dcp6.github.io')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const defaultAllowedOrigins = [
  'https://www.makingmagicmeetups.com',
  'https://makingmagicmeetups.com',
  'https://dcp6.github.io'
];
const adminApiKey = process.env.ADMIN_API_KEY || '';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'Magic.12345';
// const foursquareApiKey = String(process.env.FOURSQUARE_API_KEY || '').trim();
const mapkitTeamId = String(process.env.MAPKIT_TEAM_ID || '').trim();
const mapkitKeyId = String(process.env.MAPKIT_KEY_ID || '').trim();
const mapkitPrivateKeyRaw = String(process.env.MAPKIT_PRIVATE_KEY || '').trim();
const mapkitPrivateKeyPath = String(process.env.MAPKIT_PRIVATE_KEY_PATH || '').trim();
const mapkitPrivateKeyBase64 = String(process.env.MAPKIT_PRIVATE_KEY_BASE64 || '').trim();
const mapkitOrigin = String(
  process.env.MAPKIT_ORIGIN || 'https://www.makingmagicmeetups.com'
).trim();
const mapkitTtlSeconds = process.env.MAPKIT_TOKEN_TTL_SECONDS
  ? Number(process.env.MAPKIT_TOKEN_TTL_SECONDS)
  : 60 * 60;
const loginRateLimitWindowMs = process.env.LOGIN_RATE_LIMIT_WINDOW_MS
  ? Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS)
  : 15 * 60 * 1000;
const loginRateLimitMaxAttempts = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS
  ? Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS)
  : 12;
const passwordResetTokenTtlMs = process.env.PASSWORD_RESET_TOKEN_TTL_MS
  ? Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS)
  : 30 * 60 * 1000;
const passwordResetRateLimitWindowMs = process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS
  ? Number(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS)
  : 15 * 60 * 1000;
const passwordResetRateLimitMaxAttempts = process.env.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS
  ? Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS)
  : 6;
const passwordResetBaseUrl = String(
  process.env.PASSWORD_RESET_BASE_URL || 'https://www.makingmagicmeetups.com'
).trim();
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const resetEmailFrom = String(process.env.RESET_EMAIL_FROM || '').trim();
const postgresConnectionString = getPostgresConnectionString();
const isPostgresEnabled = Boolean(postgresConnectionString);
const dbBackendEnv = String(process.env.DB_BACKEND || '').trim().toLowerCase();
const usePostgresRuntime = isPostgresEnabled && dbBackendEnv === 'postgres';
const dbBackend = usePostgresRuntime
  ? 'postgres'
  : isPostgresEnabled
    ? 'sqlite (postgres-configured)'
    : 'sqlite';

function parsePgSsl() {
  const mode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (!mode || mode === 'disable') {
    return undefined;
  }
  if (mode === 'no-verify' || mode === 'require') {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

const pgPool = isPostgresEnabled
  ? new Pool({
      connectionString: postgresConnectionString,
      ssl: parsePgSsl()
    })
  : null;

function assertRuntimeConfigOrExit() {
  if (dbBackendEnv === 'postgres' && !isPostgresEnabled) {
    console.error(
      'Startup failed: DB_BACKEND=postgres is set but DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL is missing.'
    );
    process.exit(1);
  }
}

fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_plain TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec(`ALTER TABLE accounts ADD COLUMN username TEXT`);
} catch (_error) {
  // Column already exists; ignore migration error.
}

try {
  db.exec(`ALTER TABLE accounts ADD COLUMN password_plain TEXT`);
} catch (_error) {
  // Column already exists; ignore migration error.
}

for (const column of [
  'preferred_store_place_id TEXT',
  'preferred_store_name TEXT',
  'preferred_store_address TEXT',
  'preferred_store_url TEXT',
  'preferred_store_website TEXT',
  'preferred_store_phone TEXT',
  'preferred_store_latitude REAL',
  'preferred_store_longitude REAL'
]) {
  try {
    db.exec(`ALTER TABLE accounts ADD COLUMN ${column}`);
  } catch (_error) {
    // Column already exists; ignore migration error.
  }
}

db.exec(`
  UPDATE accounts
  SET username = 'user' || id
  WHERE username IS NULL OR TRIM(username) = ''
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_unique
  ON accounts (username)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    request_ip TEXT,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS password_reset_tokens_account_id_idx
  ON password_reset_tokens (account_id)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON password_reset_tokens (expires_at)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    identifier TEXT,
    request_ip TEXT,
    event_type TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS password_reset_events_created_at_idx
  ON password_reset_events (created_at)
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS password_reset_events_account_id_idx
  ON password_reset_events (account_id)
`);

const insertUser = db.prepare(`
  INSERT INTO users (email)
  VALUES (?)
`);

const listUsers = db.prepare(`
  SELECT id, email, created_at
  FROM users
  ORDER BY id DESC
  LIMIT 500
`);

const insertAccount = db.prepare(`
  INSERT INTO accounts (username, full_name, email, password_hash, password_plain)
  VALUES (?, ?, ?, ?, ?)
`);

const findAccountForLogin = db.prepare(`
  SELECT id, username, full_name, email, password_hash
  FROM accounts
  WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
  LIMIT 1
`);

const findAccountForPasswordReset = db.prepare(`
  SELECT id, username, email
  FROM accounts
  WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
  LIMIT 1
`);

const findAccountById = db.prepare(`
  SELECT
    id,
    username,
    full_name,
    email,
    created_at,
    preferred_store_place_id,
    preferred_store_name,
    preferred_store_address,
    preferred_store_url,
    preferred_store_website,
    preferred_store_phone
  FROM accounts
  WHERE id = ?
  LIMIT 1
`);

const findAccountPasswordHashById = db.prepare(`
  SELECT password_hash
  FROM accounts
  WHERE id = ?
  LIMIT 1
`);

const updateAccountProfile = db.prepare(`
  UPDATE accounts
  SET full_name = ?,
      email = ?
  WHERE id = ?
`);

const updateAccountPassword = db.prepare(`
  UPDATE accounts
  SET password_hash = ?,
      password_plain = ?
  WHERE id = ?
`);

const updatePreferredStore = db.prepare(`
  UPDATE accounts
  SET preferred_store_place_id = ?,
      preferred_store_name = ?,
      preferred_store_address = ?,
      preferred_store_url = ?,
      preferred_store_website = ?,
      preferred_store_phone = ?,
      preferred_store_latitude = ?,
      preferred_store_longitude = ?
  WHERE id = ?
`);

const listAccountsForAdmin = db.prepare(`
  SELECT id, username, full_name, email, password_plain, password_hash, created_at
  FROM accounts
  ORDER BY id DESC
  LIMIT 1000
`);

const insertPasswordResetToken = db.prepare(`
  INSERT INTO password_reset_tokens (account_id, token_hash, request_ip, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const markPasswordResetTokensUsedForAccount = db.prepare(`
  UPDATE password_reset_tokens
  SET used_at = ?
  WHERE account_id = ?
    AND used_at IS NULL
`);

const findPasswordResetTokenByHash = db.prepare(`
  SELECT id, account_id, expires_at, used_at
  FROM password_reset_tokens
  WHERE token_hash = ?
  LIMIT 1
`);

const markPasswordResetTokenUsed = db.prepare(`
  UPDATE password_reset_tokens
  SET used_at = ?
  WHERE id = ?
    AND used_at IS NULL
`);

const deleteExpiredPasswordResetTokens = db.prepare(`
  DELETE FROM password_reset_tokens
  WHERE expires_at < ?
`);

const insertPasswordResetEvent = db.prepare(`
  INSERT INTO password_reset_events (
    account_id,
    identifier,
    request_ip,
    event_type,
    detail,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const listPasswordResetEventsForAdmin = db.prepare(`
  SELECT
    e.id,
    e.account_id,
    a.username,
    a.email,
    e.identifier,
    e.request_ip,
    e.event_type,
    e.detail,
    e.created_at
  FROM password_reset_events e
  LEFT JOIN accounts a ON a.id = e.account_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 200
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS account_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    card_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS account_cards_account_id_idx
  ON account_cards (account_id)
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS account_card_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    card_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    asking_quantity INTEGER,
    asking_price_cents INTEGER,
    scryfall_id TEXT,
    set_code TEXT,
    set_name TEXT,
    collector_number TEXT,
    image_small TEXT,
    image_normal TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE (account_id, card_name)
  );
`);

// "My Cards" is the permanent per-account card list table used by the app moving forward.
db.exec(`
  CREATE TABLE IF NOT EXISTS my_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    card_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    requesting INTEGER NOT NULL DEFAULT 0,
    asking_quantity INTEGER,
    asking_price_cents INTEGER,
    scryfall_id TEXT,
    set_code TEXT,
    set_name TEXT,
    collector_number TEXT,
    image_small TEXT,
    image_normal TEXT,
    image_small_back TEXT,
    image_normal_back TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE (account_id, card_name)
  );
`);

for (const column of [
  'requesting INTEGER',
  'asking_quantity INTEGER',
  'asking_price_cents INTEGER',
  'offer_price_cents INTEGER',
  'market_price_cents INTEGER',
  'condition TEXT',
  'scryfall_id TEXT',
  'set_code TEXT',
  'set_name TEXT',
  'collector_number TEXT',
  'image_small TEXT',
  'image_normal TEXT',
  'image_small_back TEXT',
  'image_normal_back TEXT',
  'foil INTEGER NOT NULL DEFAULT 0'
]) {
  try {
    db.exec(`ALTER TABLE my_cards ADD COLUMN ${column}`);
  } catch (_error) {
    // Column already exists; ignore migration error.
  }
}

db.exec(`
  UPDATE my_cards
  SET requesting = 0
  WHERE requesting IS NULL
`);

// Migration: drop UNIQUE(account_id, card_name) so each row is one individual card.
{
  const mcSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='my_cards'").get();
  if (mcSchema?.sql?.includes('UNIQUE (account_id, card_name)')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE my_cards_individual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        card_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        requesting INTEGER NOT NULL DEFAULT 0,
        asking_quantity INTEGER,
        asking_price_cents INTEGER,
        offer_price_cents INTEGER,
        market_price_cents INTEGER,
        condition TEXT,
        foil INTEGER NOT NULL DEFAULT 0,
        scryfall_id TEXT,
        set_code TEXT,
        set_name TEXT,
        collector_number TEXT,
        image_small TEXT,
        image_normal TEXT,
        image_small_back TEXT,
        image_normal_back TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
    `);
    const existingRows = db.prepare('SELECT * FROM my_cards').all();
    const insertIndividual = db.prepare(`
      INSERT INTO my_cards_individual
        (account_id, card_name, quantity, requesting, asking_quantity, asking_price_cents,
         offer_price_cents, condition, scryfall_id, set_code, set_name, collector_number,
         image_small, image_normal, image_small_back, image_normal_back)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const expandRows = db.transaction(() => {
      for (const card of existingRows) {
        const copies = Math.max(1, card.quantity || 1);
        for (let i = 0; i < copies; i++) {
          insertIndividual.run(
            card.account_id, card.card_name, card.requesting,
            card.asking_quantity, card.asking_price_cents, card.offer_price_cents,
            card.condition, card.scryfall_id, card.set_code, card.set_name,
            card.collector_number, card.image_small, card.image_normal,
            card.image_small_back, card.image_normal_back
          );
        }
      }
    });
    expandRows();
    db.exec(`
      DROP TABLE my_cards;
      ALTER TABLE my_cards_individual RENAME TO my_cards;
      CREATE INDEX IF NOT EXISTS my_cards_account_id_idx ON my_cards (account_id);
      PRAGMA foreign_keys = ON;
    `);
    console.log('[migration] Removed UNIQUE(account_id, card_name) — my_cards now stores individual card instances.');
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS my_cards_account_id_idx
  ON my_cards (account_id)
`);

try {
  db.exec(`ALTER TABLE account_card_items ADD COLUMN asking_price_cents INTEGER`);
} catch (_error) {
  // Column already exists; ignore migration error.
}

for (const column of [
  'asking_quantity INTEGER',
  'scryfall_id TEXT',
  'set_code TEXT',
  'set_name TEXT',
  'collector_number TEXT',
  'image_small TEXT',
  'image_normal TEXT'
]) {
  try {
    db.exec(`ALTER TABLE account_card_items ADD COLUMN ${column}`);
  } catch (_error) {
    // Column already exists; ignore migration error.
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS account_card_items_account_id_idx
  ON account_card_items (account_id)
`);

db.exec(`
  INSERT INTO account_card_items (account_id, card_name, quantity)
  SELECT account_id, card_name, COUNT(*) AS quantity
  FROM account_cards
  GROUP BY account_id, card_name
  ON CONFLICT(account_id, card_name) DO NOTHING
`);

// One-time migration: copy legacy account_card_items rows into my_cards.
// Only runs if my_cards is empty and account_card_items has rows (new installs skip this).
{
  const myCardsEmpty = db.prepare('SELECT 1 FROM my_cards LIMIT 1').get() == null;
  const legacyHasRows = db.prepare('SELECT 1 FROM account_card_items LIMIT 1').get() != null;
  if (myCardsEmpty && legacyHasRows) {
    db.exec(`
      INSERT INTO my_cards (
        account_id, card_name, quantity, asking_quantity, asking_price_cents,
        scryfall_id, set_code, set_name, collector_number, image_small, image_normal
      )
      SELECT
        account_id, card_name, quantity, asking_quantity, asking_price_cents,
        scryfall_id, set_code, set_name, collector_number, image_small, image_normal
      FROM account_card_items
    `);
  }
}

// Messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id)`);

const MESSAGE_INBOX_LIMIT = 25;

const insertMessage = db.prepare(`
  INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)
`);

const countInboxMessages = db.prepare(`
  SELECT COUNT(*) AS count FROM messages WHERE recipient_id = ?
`);

const listMessagesForUser = db.prepare(`
  SELECT
    m.id, m.sender_id, m.recipient_id, m.body, m.read_at, m.created_at,
    s.username AS sender_username, s.full_name AS sender_full_name,
    r.username AS recipient_username, r.full_name AS recipient_full_name
  FROM messages m
  JOIN accounts s ON s.id = m.sender_id
  JOIN accounts r ON r.id = m.recipient_id
  WHERE m.sender_id = ? OR m.recipient_id = ?
  ORDER BY m.created_at ASC
`);

const markMessageRead = db.prepare(`
  UPDATE messages SET read_at = CURRENT_TIMESTAMP
  WHERE id = ? AND recipient_id = ? AND read_at IS NULL
`);

const deleteMessage = db.prepare(`
  DELETE FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)
`);

const findAccountForMessaging = db.prepare(`
  SELECT id, username, full_name FROM accounts
  WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
  LIMIT 1
`);

const searchAccounts = db.prepare(`
  SELECT id, username, full_name FROM accounts
  WHERE LOWER(username) LIKE LOWER(?) AND id != ?
  ORDER BY username ASC
  LIMIT 10
`);

const findMatchesSqlite = db.prepare(`
  SELECT
    other.username,
    mc_me.card_name,
    CASE WHEN mc_me.offer_price_cents IS NOT NULL THEN 'buyer' ELSE 'seller' END AS my_role,
    CASE WHEN mc_me.offer_price_cents IS NOT NULL
         THEN mc_me.offer_price_cents
         ELSE mc_me.asking_price_cents
    END AS my_price_cents,
    CASE WHEN mc_me.offer_price_cents IS NOT NULL
         THEN mc_other.asking_price_cents
         ELSE mc_other.offer_price_cents
    END AS their_price_cents,
    me.preferred_store_latitude AS my_store_lat,
    me.preferred_store_longitude AS my_store_lng,
    other.preferred_store_latitude AS their_store_lat,
    other.preferred_store_longitude AS their_store_lng
  FROM my_cards mc_me
  JOIN accounts me ON me.id = mc_me.account_id
  JOIN my_cards mc_other
    ON LOWER(TRIM(mc_other.card_name)) = LOWER(TRIM(mc_me.card_name))
    AND mc_other.account_id != mc_me.account_id
  JOIN accounts other ON other.id = mc_other.account_id
  WHERE mc_me.account_id = ?
    AND (
      (mc_me.offer_price_cents IS NOT NULL
       AND mc_other.asking_price_cents IS NOT NULL
       AND mc_me.offer_price_cents * 10 >= mc_other.asking_price_cents * 8)
      OR
      (mc_me.asking_price_cents IS NOT NULL
       AND mc_other.offer_price_cents IS NOT NULL
       AND mc_other.offer_price_cents * 10 >= mc_me.asking_price_cents * 8)
    )
  ORDER BY mc_me.card_name COLLATE NOCASE ASC
`);

const clearAccountCards = db.prepare(`
  DELETE FROM account_card_items
  WHERE account_id = ?
`);

const upsertAccountCard = db.prepare(`
  INSERT INTO account_card_items (
    account_id,
    card_name,
    quantity,
    asking_quantity,
    asking_price_cents,
    scryfall_id,
    set_code,
    set_name,
    collector_number,
    image_small,
    image_normal
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, card_name) DO UPDATE SET
    quantity = excluded.quantity,
    asking_quantity = excluded.asking_quantity,
    asking_price_cents = excluded.asking_price_cents,
    scryfall_id = excluded.scryfall_id,
    set_code = excluded.set_code,
    set_name = excluded.set_name,
    collector_number = excluded.collector_number,
    image_small = excluded.image_small,
    image_normal = excluded.image_normal,
    updated_at = CURRENT_TIMESTAMP
`);

const listAccountCards = db.prepare(`
  SELECT
    card_name,
    quantity,
    asking_quantity,
    asking_price_cents,
    scryfall_id,
    set_code,
    set_name,
    collector_number,
    image_small,
    image_normal
  FROM account_card_items
  WHERE account_id = ?
  ORDER BY card_name COLLATE NOCASE ASC
`);

const deleteAllMyCards = db.prepare(`DELETE FROM my_cards WHERE account_id = ?`);

const insertMyCard = db.prepare(`
  INSERT INTO my_cards (
    account_id, card_name, quantity, requesting, asking_quantity, asking_price_cents,
    offer_price_cents, market_price_cents, condition, foil, scryfall_id, set_code, set_name,
    collector_number, image_small, image_normal, image_small_back, image_normal_back
  )
  VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listMyCards = db.prepare(`
  SELECT
    id, card_name, quantity, requesting, asking_quantity, asking_price_cents, offer_price_cents,
    market_price_cents, condition, foil, scryfall_id, set_code, set_name, collector_number,
    image_small, image_normal, image_small_back, image_normal_back
  FROM my_cards
  WHERE account_id = ?
  ORDER BY id ASC
`);

const deleteMyCardById = db.prepare(`
  DELETE FROM my_cards WHERE id = ? AND account_id = ?
`);

function parseAskingPriceCents(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const cents = Math.round(value * 100);
    return cents >= 0 ? cents : null;
  }

  const normalized = String(value).trim().replace(/^\$/, '').replace(/,/g, '');
  if (!normalized) {
    return null;
  }

  const dollarsValue = Number(normalized);
  if (!Number.isFinite(dollarsValue) || dollarsValue < 0) {
    return null;
  }
  // Asking For is stored as cents (dollars + cents).
  return Math.round(dollarsValue * 100);
}

function parseAskingPriceCentsFromSubmittedCard(submitted) {
  // Preferred: client sends cents directly.
  if (submitted && Object.prototype.hasOwnProperty.call(submitted, 'askingPriceCents')) {
    const raw = submitted.askingPriceCents;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const cents = typeof raw === 'string' ? Number(raw) : raw;
    if (!Number.isFinite(cents)) {
      return null;
    }
    const rounded = Math.round(cents);
    return rounded >= 0 ? rounded : null;
  }

  // Back-compat: accept dollars in askingPrice / asking_price.
  return parseAskingPriceCents(submitted?.askingPrice ?? submitted?.asking_price);
}

function parseOfferPriceCentsFromSubmittedCard(submitted) {
  // Preferred: client sends cents directly.
  if (submitted && Object.prototype.hasOwnProperty.call(submitted, 'offerPriceCents')) {
    const raw = submitted.offerPriceCents;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const cents = typeof raw === 'string' ? Number(raw) : raw;
    if (!Number.isFinite(cents)) {
      return null;
    }
    const rounded = Math.round(cents);
    return rounded >= 0 ? rounded : null;
  }
  return null;
}

function parseMarketPriceCentsFromSubmittedCard(submitted) {
  if (!submitted || !Object.prototype.hasOwnProperty.call(submitted, 'marketPriceCents')) {
    return null;
  }
  const raw = submitted.marketPriceCents;
  if (raw === null || raw === undefined || raw === '') return null;
  const cents = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(cents) || cents < 0) return null;
  return Math.round(cents);
}

const VALID_CONDITIONS = new Set(['nm', 'lp', 'mp', 'hp', 'dmg']);

function parseConditionFromSubmittedCard(submitted) {
  const raw = String(submitted?.condition || '').trim().toLowerCase();
  return VALID_CONDITIONS.has(raw) ? raw : null;
}

function marketStatusToCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'requesting') {
    return 2;
  }
  if (normalized === 'offering') {
    return 1;
  }
  return 0;
}

function marketStatusFromCode(value) {
  const numeric = Number(value);
  if (numeric === 2) {
    return 'requesting';
  }
  if (numeric === 1) {
    return 'offering';
  }
  return 'have';
}

function parseMarketStatusFromSubmittedCard(submitted) {
  if (submitted && Object.prototype.hasOwnProperty.call(submitted, 'marketStatus')) {
    return marketStatusToCode(submitted.marketStatus);
  }
  if (submitted && Object.prototype.hasOwnProperty.call(submitted, 'requesting')) {
    return submitted.requesting ? 2 : 0;
  }
  return 0;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const normalizedHash = String(storedHash || '').trim();
  if (!normalizedHash) {
    return false;
  }

  if (normalizedHash.startsWith('scrypt$')) {
    const parts = normalizedHash.split('$');
    if (parts.length !== 3) {
      return false;
    }
    const salt = parts[1];
    const expectedHex = parts[2];
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(actual, expected);
  }

  // Backward compatibility with legacy SHA-256 hashes.
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return legacyHash === normalizedHash;
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function logPasswordResetEvent({ accountId = null, identifier = '', requestIp = '', eventType, detail = '' }) {
  try {
    insertPasswordResetEvent.run(
      accountId,
      identifier || null,
      requestIp || null,
      eventType,
      detail || null,
      Date.now()
    );
  } catch (_error) {
    // Audit logging should never break auth flows.
  }
}

function authenticateLogin(identifier, password) {
  const normalizedIdentifier = String(identifier || '').trim();
  if (normalizedIdentifier.toLowerCase() === adminUsername.toLowerCase() && password === adminPassword) {
    return {
      id: 0,
      username: adminUsername,
      fullName: 'Administrator',
      email: `${adminUsername}@local`,
      role: 'admin'
    };
  }

  const account = findAccountForLogin.get(normalizedIdentifier, normalizedIdentifier);
  if (!account || !verifyPassword(password, account.password_hash)) {
    return null;
  }

  // Opportunistic migration: legacy SHA-256 hashes are upgraded to scrypt after successful login.
  if (!String(account.password_hash || '').startsWith('scrypt$')) {
    try {
      updateAccountPassword.run(hashPassword(password), null, account.id);
    } catch (_error) {
      // ignore migration failure and allow login
    }
  }

  return {
    id: account.id,
    username: account.username,
    fullName: account.full_name,
    email: account.email,
    role: 'user'
  };
}

function parseBasicAuth(req) {
  const basicAuth = String(req.header('authorization') || '');
  const basicPrefix = 'Basic ';
  if (!basicAuth.startsWith(basicPrefix)) {
    return null;
  }

  try {
    const decoded = Buffer.from(basicAuth.slice(basicPrefix.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    const identifier = decoded.slice(0, separatorIndex).trim();
    const password = decoded.slice(separatorIndex + 1);
    if (!identifier || !password) {
      return null;
    }
    return { identifier, password };
  } catch (_error) {
    return null;
  }
}

function formatAdminPasskey(account) {
  const hash = String(account?.password_hash || '').trim();
  if (!hash || hash.length < 12) {
    return null;
  }
  return `pk_${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

function ensureLoggedInUser(req, res) {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }

  return user;
}

async function pgQuery(text, params = []) {
  if (!pgPool) {
    throw new Error('Postgres pool is not configured.');
  }
  return pgPool.query(text, params);
}

async function withPgTransaction(run) {
  if (!pgPool) {
    throw new Error('Postgres pool is not configured.');
  }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function authenticateLoginRuntime(identifier, password) {
  if (!usePostgresRuntime) {
    return authenticateLogin(identifier, password);
  }

  const normalizedIdentifier = String(identifier || '').trim();
  if (normalizedIdentifier.toLowerCase() === adminUsername.toLowerCase() && password === adminPassword) {
    return {
      id: 0,
      username: adminUsername,
      fullName: 'Administrator',
      email: `${adminUsername}@local`,
      role: 'admin'
    };
  }

  const { rows } = await pgQuery(
    `
      SELECT id, username, full_name, email, password_hash
      FROM accounts
      WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)
      LIMIT 1
    `,
    [normalizedIdentifier, normalizedIdentifier]
  );
  const account = rows[0];
  if (!account || !verifyPassword(password, account.password_hash)) {
    return null;
  }

  if (!String(account.password_hash || '').startsWith('scrypt$')) {
    try {
      await pgQuery(
        `UPDATE accounts SET password_hash = $1, password_plain = NULL WHERE id = $2`,
        [hashPassword(password), account.id]
      );
    } catch (_error) {
      // ignore migration failure and allow login
    }
  }

  return {
    id: account.id,
    username: account.username,
    fullName: account.full_name,
    email: account.email,
    role: 'user'
  };
}

async function ensureLoggedInUserRuntime(req, res) {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }
  return user;
}

async function findAccountByIdRuntime(accountId) {
  if (!usePostgresRuntime) {
    return findAccountById.get(accountId);
  }
  const { rows } = await pgQuery(
    `
      SELECT
        id, username, full_name, email, created_at,
        preferred_store_place_id, preferred_store_name, preferred_store_address,
        preferred_store_url, preferred_store_website, preferred_store_phone
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
    [accountId]
  );
  return rows[0] || null;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function updatePreferredStoreRuntime(placeId, name, address, url, website, phone, latitude, longitude, accountId) {
  const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : null;
  const lng = Number.isFinite(Number(longitude)) ? Number(longitude) : null;
  if (!usePostgresRuntime) {
    updatePreferredStore.run(placeId, name, address, url, website, phone, lat, lng, accountId);
    return;
  }
  await pgQuery(
    `
      UPDATE accounts
      SET preferred_store_place_id = $1,
          preferred_store_name = $2,
          preferred_store_address = $3,
          preferred_store_url = $4,
          preferred_store_website = $5,
          preferred_store_phone = $6,
          preferred_store_latitude = $7,
          preferred_store_longitude = $8
      WHERE id = $9
    `,
    [placeId, name, address, url, website, phone, lat, lng, accountId]
  );
}

async function insertUserRuntime(email) {
  if (!usePostgresRuntime) {
    return insertUser.run(email);
  }
  const { rows } = await pgQuery(
    `INSERT INTO users (email) VALUES ($1) RETURNING id, email`,
    [email]
  );
  return { lastInsertRowid: rows[0]?.id, email: rows[0]?.email };
}

async function insertAccountRuntime(username, fullName, email, passwordHash) {
  if (!usePostgresRuntime) {
    return insertAccount.run(username, fullName, email, passwordHash, null);
  }
  const { rows } = await pgQuery(
    `
      INSERT INTO accounts (username, full_name, email, password_hash, password_plain)
      VALUES ($1, $2, $3, $4, NULL)
      RETURNING id, username, email, full_name
    `,
    [username, fullName, email, passwordHash]
  );
  return { lastInsertRowid: rows[0]?.id };
}

async function findAccountForPasswordResetRuntime(identifier) {
  if (!usePostgresRuntime) {
    return findAccountForPasswordReset.get(identifier, identifier);
  }
  const { rows } = await pgQuery(
    `
      SELECT id, username, email
      FROM accounts
      WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)
      LIMIT 1
    `,
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function deleteExpiredPasswordResetTokensRuntime(now) {
  if (!usePostgresRuntime) {
    deleteExpiredPasswordResetTokens.run(now);
    return;
  }
  await pgQuery(`DELETE FROM password_reset_tokens WHERE expires_at < $1`, [now]);
}

async function markPasswordResetTokensUsedForAccountRuntime(now, accountId, client = null) {
  if (!usePostgresRuntime) {
    markPasswordResetTokensUsedForAccount.run(now, accountId);
    return;
  }
  const queryClient = client || pgPool;
  await queryClient.query(
    `UPDATE password_reset_tokens SET used_at = $1 WHERE account_id = $2 AND used_at IS NULL`,
    [now, accountId]
  );
}

async function insertPasswordResetTokenRuntime(accountId, tokenHash, requestIp, expiresAt, now, client = null) {
  if (!usePostgresRuntime) {
    insertPasswordResetToken.run(accountId, tokenHash, requestIp, expiresAt, now);
    return;
  }
  const queryClient = client || pgPool;
  await queryClient.query(
    `
      INSERT INTO password_reset_tokens (account_id, token_hash, request_ip, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [accountId, tokenHash, requestIp, expiresAt, now]
  );
}

async function findPasswordResetTokenByHashRuntime(tokenHash) {
  if (!usePostgresRuntime) {
    return findPasswordResetTokenByHash.get(tokenHash);
  }
  const { rows } = await pgQuery(
    `SELECT id, account_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function markPasswordResetTokenUsedRuntime(now, tokenId, client = null) {
  if (!usePostgresRuntime) {
    return markPasswordResetTokenUsed.run(now, tokenId);
  }
  const queryClient = client || pgPool;
  return queryClient.query(
    `UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2 AND used_at IS NULL`,
    [now, tokenId]
  );
}

async function logPasswordResetEventRuntime({ accountId = null, identifier = '', requestIp = '', eventType, detail = '' }) {
  if (!usePostgresRuntime) {
    logPasswordResetEvent({ accountId, identifier, requestIp, eventType, detail });
    return;
  }
  try {
    await pgQuery(
      `
        INSERT INTO password_reset_events (account_id, identifier, request_ip, event_type, detail, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [accountId, identifier || null, requestIp || null, eventType, detail || null, Date.now()]
    );
  } catch (_error) {
    // Audit logging should never break auth flows.
  }
}

async function listAccountsForAdminRuntime() {
  if (!usePostgresRuntime) {
    return listAccountsForAdmin.all();
  }
  const { rows } = await pgQuery(
    `
      SELECT id, username, full_name, email, password_plain, password_hash, created_at
      FROM accounts
      ORDER BY id DESC
      LIMIT 1000
    `
  );
  return rows;
}

async function listPasswordResetEventsForAdminRuntime() {
  if (!usePostgresRuntime) {
    return listPasswordResetEventsForAdmin.all();
  }
  const { rows } = await pgQuery(
    `
      SELECT
        e.id, e.account_id, a.username, a.email, e.identifier,
        e.request_ip, e.event_type, e.detail, e.created_at
      FROM password_reset_events e
      LEFT JOIN accounts a ON a.id = e.account_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 200
    `
  );
  return rows;
}

async function listUsersRuntime() {
  if (!usePostgresRuntime) {
    return listUsers.all();
  }
  const { rows } = await pgQuery(
    `SELECT id, email, created_at FROM users ORDER BY id DESC LIMIT 500`
  );
  return rows;
}

async function validatePostgresRuntimeOrExit() {
  if (!usePostgresRuntime) {
    return;
  }
  if (!pgPool) {
    console.error(
      'Startup failed: DB_BACKEND=postgres requires a valid DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL.'
    );
    process.exit(1);
  }

  try {
    await pgQuery('SELECT 1');
    const schemaCheck = await pgQuery(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('accounts', 'my_cards', 'password_reset_tokens')
      `
    );
    const found = new Set(schemaCheck.rows.map((row) => row.table_name));
    const required = ['accounts', 'my_cards', 'password_reset_tokens'];
    const missing = required.filter((tableName) => !found.has(tableName));
    if (missing.length > 0) {
      console.error(
        `Startup failed: Postgres schema is incomplete (missing: ${missing.join(', ')}). Run npm run db:init:postgres.`
      );
      process.exit(1);
    }

    // Incremental column migrations — safe to run repeatedly (IF NOT EXISTS).
    await pgQuery(`ALTER TABLE my_cards ADD COLUMN IF NOT EXISTS offer_price_cents INTEGER`);
    await pgQuery(`ALTER TABLE my_cards ADD COLUMN IF NOT EXISTS market_price_cents INTEGER`);
    await pgQuery(`ALTER TABLE my_cards ADD COLUMN IF NOT EXISTS condition TEXT`);
    await pgQuery(`ALTER TABLE my_cards ADD COLUMN IF NOT EXISTS foil INTEGER NOT NULL DEFAULT 0`);
    await pgQuery(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS preferred_store_latitude DOUBLE PRECISION`);
    await pgQuery(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS preferred_store_longitude DOUBLE PRECISION`);

    // Drop the (account_id, card_name) unique constraint so multiple rows per card are allowed.
    // The constraint name may vary; try both the default Postgres name and an explicit one.
    await pgQuery(`ALTER TABLE my_cards DROP CONSTRAINT IF EXISTS my_cards_account_id_card_name_key`);

    // Messages table (created if not present; harmless on existing schemas).
    await pgQuery(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        sender_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        recipient_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pgQuery(`CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (recipient_id)`);
    await pgQuery(`CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id)`);
  } catch (error) {
    console.error(`Startup failed: could not connect to Postgres (${error.message || error}).`);
    process.exit(1);
  }
}

async function findAccountPasswordHashByIdRuntime(accountId) {
  if (!usePostgresRuntime) {
    return findAccountPasswordHashById.get(accountId);
  }
  const { rows } = await pgQuery(
    `SELECT password_hash FROM accounts WHERE id = $1 LIMIT 1`,
    [accountId]
  );
  return rows[0] || null;
}

async function updateAccountProfileAndPasswordRuntime(accountId, fullName, email, nextPassword) {
  if (!usePostgresRuntime) {
    const saveTx = db.transaction((id) => {
      updateAccountProfile.run(fullName, email, id);
      if (nextPassword !== null && nextPassword.length > 0) {
        const passwordHash = hashPassword(nextPassword);
        updateAccountPassword.run(passwordHash, null, id);
      }
    });
    saveTx(accountId);
    return;
  }

  await withPgTransaction(async (client) => {
    await client.query(
      `UPDATE accounts SET full_name = $1, email = $2 WHERE id = $3`,
      [fullName, email, accountId]
    );
    if (nextPassword !== null && nextPassword.length > 0) {
      await client.query(
        `UPDATE accounts SET password_hash = $1, password_plain = NULL WHERE id = $2`,
        [hashPassword(nextPassword), accountId]
      );
    }
  });
}

async function listMyCardsRuntime(accountId) {
  if (!usePostgresRuntime) {
    return listMyCards.all(accountId);
  }
  const { rows } = await pgQuery(
    `
      SELECT
        id, card_name, quantity, requesting, asking_quantity, asking_price_cents, offer_price_cents,
        market_price_cents, condition, scryfall_id, set_code, set_name, collector_number,
        image_small, image_normal, image_small_back, image_normal_back
      FROM my_cards
      WHERE account_id = $1
      ORDER BY id ASC
    `,
    [accountId]
  );
  return rows;
}

async function deleteMyCardByIdRuntime(accountId, cardId) {
  if (!usePostgresRuntime) {
    return deleteMyCardById.run(cardId, accountId);
  }
  return pgQuery(
    `DELETE FROM my_cards WHERE id = $1 AND account_id = $2`,
    [cardId, accountId]
  );
}

async function saveCardsRuntime(accountId, entries, saveMode) {
  if (!usePostgresRuntime) {
    const saveCards = db.transaction((id, cardEntries) => {
      if (saveMode === 'replace') {
        deleteAllMyCards.run(id);
      }
      for (const entry of cardEntries) {
        insertMyCard.run(
          id,
          entry.cardName,
          entry.marketStatusCode ?? 0,
          null,
          entry.askingPriceCents ?? null,
          entry.offerPriceCents ?? null,
          entry.marketPriceCents ?? null,
          entry.condition ?? null,
          entry.foil ? 1 : 0,
          entry.scryfallId ?? null,
          entry.setCode ?? null,
          entry.setName ?? null,
          entry.collectorNumber ?? null,
          entry.imageSmall ?? null,
          entry.imageNormal ?? null,
          entry.imageSmallBack ?? null,
          entry.imageNormalBack ?? null
        );
      }
    });
    saveCards(accountId, entries);
    return;
  }

  await withPgTransaction(async (client) => {
    if (saveMode === 'replace') {
      await client.query(`DELETE FROM my_cards WHERE account_id = $1`, [accountId]);
    }
    for (const entry of entries) {
      await client.query(
        `
          INSERT INTO my_cards (
            account_id, card_name, quantity, requesting, asking_quantity, asking_price_cents,
            offer_price_cents, market_price_cents, condition, foil, scryfall_id, set_code,
            set_name, collector_number, image_small, image_normal, image_small_back, image_normal_back
          )
          VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        `,
        [
          accountId,
          entry.cardName,
          entry.marketStatusCode ?? 0,
          null,
          entry.askingPriceCents ?? null,
          entry.offerPriceCents ?? null,
          entry.marketPriceCents ?? null,
          entry.condition ?? null,
          entry.foil ? 1 : 0,
          entry.scryfallId ?? null,
          entry.setCode ?? null,
          entry.setName ?? null,
          entry.collectorNumber ?? null,
          entry.imageSmall ?? null,
          entry.imageNormal ?? null,
          entry.imageSmallBack ?? null,
          entry.imageNormalBack ?? null
        ]
      );
    }
  });
}

// ── Messages runtime ────────────────────────────────────────────────────────

async function countInboxMessagesRuntime(accountId) {
  if (!usePostgresRuntime) {
    return Number(countInboxMessages.get(accountId)?.count ?? 0);
  }
  const { rows } = await pgQuery(
    `SELECT COUNT(*)::int AS count FROM messages WHERE recipient_id = $1`,
    [accountId]
  );
  return Number(rows[0]?.count ?? 0);
}

async function insertMessageRuntime(senderId, recipientId, body) {
  if (!usePostgresRuntime) {
    return insertMessage.run(senderId, recipientId, body);
  }
  return pgQuery(
    `INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1, $2, $3)`,
    [senderId, recipientId, body]
  );
}

async function listMessagesForUserRuntime(accountId) {
  if (!usePostgresRuntime) {
    return listMessagesForUser.all(accountId, accountId);
  }
  const { rows } = await pgQuery(
    `
      SELECT
        m.id, m.sender_id, m.recipient_id, m.body, m.read_at, m.created_at,
        s.username AS sender_username, s.full_name AS sender_full_name,
        r.username AS recipient_username, r.full_name AS recipient_full_name
      FROM messages m
      JOIN accounts s ON s.id = m.sender_id
      JOIN accounts r ON r.id = m.recipient_id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      ORDER BY m.created_at ASC
    `,
    [accountId]
  );
  return rows;
}

async function markMessageReadRuntime(messageId, accountId) {
  if (!usePostgresRuntime) {
    return markMessageRead.run(messageId, accountId);
  }
  return pgQuery(
    `UPDATE messages SET read_at = NOW() WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [messageId, accountId]
  );
}

async function deleteMessageRuntime(messageId, accountId) {
  if (!usePostgresRuntime) {
    return deleteMessage.run(messageId, accountId, accountId);
  }
  return pgQuery(
    `DELETE FROM messages WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
    [messageId, accountId]
  );
}

async function findAccountForMessagingRuntime(usernameOrEmail) {
  if (!usePostgresRuntime) {
    return findAccountForMessaging.get(usernameOrEmail, usernameOrEmail) || null;
  }
  const { rows } = await pgQuery(
    `SELECT id, username, full_name FROM accounts
     WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1`,
    [usernameOrEmail, usernameOrEmail]
  );
  return rows[0] || null;
}

async function searchAccountsRuntime(query, excludeId) {
  if (!usePostgresRuntime) {
    return searchAccounts.all(`%${query}%`, excludeId);
  }
  const { rows } = await pgQuery(
    `SELECT id, username, full_name FROM accounts
     WHERE LOWER(username) LIKE LOWER($1) AND id != $2
     ORDER BY username ASC LIMIT 10`,
    [`%${query}%`, excludeId]
  );
  return rows;
}

function applyStoreProximity(rows) {
  const NEAR_MILES = 50;
  return rows
    .map((row) => {
      const dist = haversineMiles(
        row.my_store_lat ?? row.my_store_lat,
        row.my_store_lng ?? row.my_store_lng,
        row.their_store_lat,
        row.their_store_lng
      );
      return { ...row, distance_miles: dist };
    })
    .sort((a, b) => {
      const aNear = a.distance_miles !== null && a.distance_miles <= NEAR_MILES;
      const bNear = b.distance_miles !== null && b.distance_miles <= NEAR_MILES;
      if (aNear !== bNear) return aNear ? -1 : 1;
      const aName = String(a.card_name || '').toLowerCase();
      const bName = String(b.card_name || '').toLowerCase();
      return aName < bName ? -1 : aName > bName ? 1 : 0;
    });
}

async function findMatchesRuntime(accountId) {
  if (!usePostgresRuntime) {
    return applyStoreProximity(findMatchesSqlite.all(accountId));
  }
  const { rows } = await pgQuery(
    `SELECT
       other.username,
       mc_me.card_name,
       CASE WHEN mc_me.offer_price_cents IS NOT NULL THEN 'buyer' ELSE 'seller' END AS my_role,
       CASE WHEN mc_me.offer_price_cents IS NOT NULL
            THEN mc_me.offer_price_cents
            ELSE mc_me.asking_price_cents
       END AS my_price_cents,
       CASE WHEN mc_me.offer_price_cents IS NOT NULL
            THEN mc_other.asking_price_cents
            ELSE mc_other.offer_price_cents
       END AS their_price_cents,
       me.preferred_store_latitude AS my_store_lat,
       me.preferred_store_longitude AS my_store_lng,
       other.preferred_store_latitude AS their_store_lat,
       other.preferred_store_longitude AS their_store_lng
     FROM my_cards mc_me
     JOIN accounts me ON me.id = mc_me.account_id
     JOIN my_cards mc_other
       ON LOWER(TRIM(mc_other.card_name)) = LOWER(TRIM(mc_me.card_name))
       AND mc_other.account_id != mc_me.account_id
     JOIN accounts other ON other.id = mc_other.account_id
     WHERE mc_me.account_id = $1
       AND (
         (mc_me.offer_price_cents IS NOT NULL
          AND mc_other.asking_price_cents IS NOT NULL
          AND mc_me.offer_price_cents * 10 >= mc_other.asking_price_cents * 8)
         OR
         (mc_me.asking_price_cents IS NOT NULL
          AND mc_other.offer_price_cents IS NOT NULL
          AND mc_other.offer_price_cents * 10 >= mc_me.asking_price_cents * 8)
       )
     ORDER BY LOWER(mc_me.card_name) ASC`,
    [accountId]
  );
  return applyStoreProximity(rows);
}

// ── End messages runtime ─────────────────────────────────────────────────────

const loginAttemptStore = new Map();
const passwordResetAttemptStore = new Map();

function getRequestIp(req) {
  const forwardedFor = String(req.header('x-forwarded-for') || '').split(',')[0].trim();
  return forwardedFor || req.ip || 'unknown';
}

function getLoginThrottleKey(req) {
  const identifierRaw = String(req.body?.identifier || req.body?.username || '').trim().toLowerCase();
  return `${getRequestIp(req)}|${identifierRaw}`;
}

function getPasswordResetThrottleKey(req) {
  const identifierRaw = String(req.body?.identifier || '').trim().toLowerCase();
  return `${getRequestIp(req)}|${identifierRaw}`;
}

function isLoginRateLimited(key) {
  const entry = loginAttemptStore.get(key);
  if (!entry) {
    return false;
  }
  const now = Date.now();
  if (now - entry.windowStartMs > loginRateLimitWindowMs) {
    loginAttemptStore.delete(key);
    return false;
  }
  return entry.count >= loginRateLimitMaxAttempts;
}

function recordLoginAttempt(key, success) {
  if (success) {
    loginAttemptStore.delete(key);
    return;
  }
  const now = Date.now();
  const current = loginAttemptStore.get(key);
  if (!current || now - current.windowStartMs > loginRateLimitWindowMs) {
    loginAttemptStore.set(key, { count: 1, windowStartMs: now });
    return;
  }
  current.count += 1;
  loginAttemptStore.set(key, current);
}

function isPasswordResetRateLimited(key) {
  const entry = passwordResetAttemptStore.get(key);
  if (!entry) {
    return false;
  }
  const now = Date.now();
  if (now - entry.windowStartMs > passwordResetRateLimitWindowMs) {
    passwordResetAttemptStore.delete(key);
    return false;
  }
  return entry.count >= passwordResetRateLimitMaxAttempts;
}

function recordPasswordResetAttempt(key, success) {
  if (success) {
    passwordResetAttemptStore.delete(key);
    return;
  }
  const now = Date.now();
  const current = passwordResetAttemptStore.get(key);
  if (!current || now - current.windowStartMs > passwordResetRateLimitWindowMs) {
    passwordResetAttemptStore.set(key, { count: 1, windowStartMs: now });
    return;
  }
  current.count += 1;
  passwordResetAttemptStore.set(key, current);
}

function buildPasswordResetUrl(rawToken) {
  const base = passwordResetBaseUrl.replace(/\/+$/, '');
  return `${base}/#/reset-password?token=${encodeURIComponent(rawToken)}`;
}

async function sendPasswordResetEmail({ email, username, resetUrl }) {
  if (!resendApiKey || !resetEmailFrom) {
    return false;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`
    },
    body: JSON.stringify({
      from: resetEmailFrom,
      to: [email],
      subject: 'Reset your Making Magic Meetups password',
      text: `Hello ${username || 'there'},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 30 minutes.\n`,
      html: `<p>Hello ${username || 'there'},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 30 minutes.</p>`
    })
  });

  if (!response.ok) {
    throw new Error('Email provider request failed');
  }
  return true;
}

function loadMapKitPrivateKey() {
  if (mapkitPrivateKeyPath) {
    try {
      return fs.readFileSync(mapkitPrivateKeyPath, 'utf8');
    } catch (_error) {
      return '';
    }
  }

  if (mapkitPrivateKeyBase64) {
    try {
      return Buffer.from(mapkitPrivateKeyBase64, 'base64').toString('utf8');
    } catch (_error) {
      return '';
    }
  }

  if (mapkitPrivateKeyRaw) {
    return mapkitPrivateKeyRaw.replace(/\\n/g, '\n');
  }

  return '';
}

assertRuntimeConfigOrExit();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (String(req.header('x-forwarded-proto') || '').toLowerCase() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});

const corsOptions = {
  origin(origin, callback) {
    // Keep this permissive enough for our known frontends so deployments don't break on env var drift.
    // Origin is scheme + host (+ port), no trailing slash.
    const allowedOrigins = [
      ...defaultAllowedOrigins,
      ...frontendOrigins,
      'http://localhost:5173',
      'http://localhost:5174'
    ];

    // Allow all if explicitly configured.
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Safety net: accept production domain and subdomains (with optional explicit port).
    if (/^https:\/\/([a-z0-9-]+\.)?makingmagicmeetups\.com(?::\d+)?$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Api-Key'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Preflight hardening: handle OPTIONS at middleware level so it never falls through to a 404.
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') {
    return next();
  }
  return cors(corsOptions)(req, res, () => res.sendStatus(204));
});
// Ensure browsers can complete CORS preflight requests (OPTIONS) for all endpoints.
// Note: Express 5 (path-to-regexp v6) does not accept '*' as a route pattern.
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'making-magic-meetups-api' });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dbBackend,
    postgresConfigured: isPostgresEnabled
  });
});

/* Foursquare store search — commented out until API key is configured
app.get('/api/stores/search', async (req, res) => {
  if (!foursquareApiKey) {
    return res.status(503).json({ error: 'Store search not configured (FOURSQUARE_API_KEY missing).' });
  }

  const near = String(req.query.near || '').trim();
  if (!near) {
    return res.status(400).json({ error: 'near query param is required.' });
  }

  try {
    // Foursquare category IDs for gaming/hobby stores:
    // 4bf58dd8d48988d1f1931735 = Toy / Game Store
    // 4bf58dd8d48988d1f7941735 = Hobby Shop
    // 52e81612bcbc57f1066b7a0d = Comic Shop
    const categories = '4bf58dd8d48988d1f1931735,4bf58dd8d48988d1f7941735,52e81612bcbc57f1066b7a0d';
    const fields = 'fsq_id,name,location,tel,website,geocodes';
    const fsqUrl =
      `https://api.foursquare.com/v3/places/search` +
      `?query=trading+card+game+store` +
      `&near=${encodeURIComponent(near)}` +
      `&categories=${categories}` +
      `&limit=20` +
      `&fields=${fields}`;

    const fsqResponse = await fetch(fsqUrl, {
      headers: { Authorization: foursquareApiKey }
    });

    if (!fsqResponse.ok) {
      const errBody = await fsqResponse.text().catch(() => '');
      return res.status(502).json({ error: `Foursquare returned ${fsqResponse.status}.`, detail: errBody });
    }

    const fsqData = await fsqResponse.json();
    const stores = (Array.isArray(fsqData.results) ? fsqData.results : [])
      .map((place) => {
        const loc = place.location || {};
        const addressParts = [loc.address, loc.locality, loc.region].filter(Boolean);
        return {
          placeId: place.fsq_id || null,
          name: place.name || null,
          address: addressParts.join(', ') || null,
          phone: place.tel || null,
          website: place.website || null,
          latitude: place.geocodes?.main?.latitude ?? null,
          longitude: place.geocodes?.main?.longitude ?? null,
          isActualStore: true
        };
      })
      .filter((s) => s.name);

    return res.json({ ok: true, stores });
  } catch (_error) {
    return res.status(500).json({ error: 'Store search failed.' });
  }
});
*/

app.get('/api/mapkit/token', (_req, res) => {
  if (!mapkitTeamId || !mapkitKeyId) {
    return res.status(500).json({ error: 'MapKit credentials not configured.' });
  }

  const privateKey = loadMapKitPrivateKey();
  if (!privateKey) {
    return res.status(500).json({ error: 'MapKit private key not configured.' });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    iss: mapkitTeamId,
    iat: nowSeconds,
    exp: nowSeconds + (Number.isFinite(mapkitTtlSeconds) ? mapkitTtlSeconds : 60 * 60),
    origin: mapkitOrigin
  };

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      header: { kid: mapkitKeyId, typ: 'JWT' }
    });
    return res.json({ ok: true, token });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to issue MapKit token.' });
  }
});

app.patch('/api/me/preferred-store', async (req, res) => {
  const user = await ensureLoggedInUserRuntime(req, res);
  if (!user) {
    return;
  }

  const placeIdRaw =
    req.body && Object.prototype.hasOwnProperty.call(req.body, 'placeId')
      ? String(req.body.placeId || '').trim()
      : '';
  const placeId = placeIdRaw ? placeIdRaw : null;

  if (!placeId) {
    await updatePreferredStoreRuntime(null, null, null, null, null, null, null, null, user.id);
    const account = await findAccountByIdRuntime(user.id);
    return res.json({
      ok: true,
      preferredStore: null,
      account: {
        id: account.id,
        username: account.username,
        fullName: account.full_name,
        email: account.email,
        createdAt: account.created_at
      }
    });
  }

  const name = String(req.body?.name || '').trim() || null;
  const address = String(req.body?.address || '').trim() || null;
  const url = String(req.body?.url || '').trim() || null;
  const website = String(req.body?.website || '').trim() || null;
  const phone = String(req.body?.phone || '').trim() || null;
  const latitude = req.body?.latitude != null ? Number(req.body.latitude) : null;
  const longitude = req.body?.longitude != null ? Number(req.body.longitude) : null;

  try {
    await updatePreferredStoreRuntime(placeId, name, address, url, website, phone, latitude, longitude, user.id);

    const account = await findAccountByIdRuntime(user.id);
    return res.json({
      ok: true,
      preferredStore: {
        placeId: account.preferred_store_place_id || null,
        name: account.preferred_store_name || null,
        address: account.preferred_store_address || null,
        url: account.preferred_store_url || null,
        website: account.preferred_store_website || null,
        phone: account.preferred_store_phone || null,
        latitude: account.preferred_store_latitude != null ? Number(account.preferred_store_latitude) : null,
        longitude: account.preferred_store_longitude != null ? Number(account.preferred_store_longitude) : null
      }
    });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to save preferred store.' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const throttleKey = getLoginThrottleKey(req);
  if (isLoginRateLimited(throttleKey)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  if (username === adminUsername && password === adminPassword) {
    recordLoginAttempt(throttleKey, true);
    return res.json({ ok: true });
  }

  recordLoginAttempt(throttleKey, false);
  return res.status(401).json({ error: 'Invalid admin credentials.' });
});

app.post('/api/users', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }

  try {
    const result = await insertUserRuntime(email);
    return res.status(201).json({ id: result.lastInsertRowid, email });
  } catch (error) {
    if (
      String(error?.message || '').includes('UNIQUE constraint failed') ||
      String(error?.code || '') === '23505'
    ) {
      return res.status(409).json({ error: 'Email already subscribed.' });
    }

    return res.status(500).json({ error: 'Failed to save user.' });
  }
});

app.post('/api/accounts', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-24 chars and use letters, numbers, or underscores.'
    });
  }

  if (!fullName || fullName.length < 2) {
    return res.status(400).json({ error: 'Please provide your full name.' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = hashPassword(password);
    const result = await insertAccountRuntime(username, fullName, email, passwordHash);
    return res.status(201).json({ id: result.lastInsertRowid, username, email, fullName });
  } catch (error) {
    if (
      String(error?.message || '').includes('UNIQUE constraint failed') ||
      String(error?.code || '') === '23505'
    ) {
      return res
        .status(409)
        .json({ error: 'An account with this email or username already exists.' });
    }

    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const throttleKey = getLoginThrottleKey(req);
  if (isLoginRateLimited(throttleKey)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!identifier || !password) {
    recordLoginAttempt(throttleKey, false);
    return res.status(400).json({ error: 'Please provide username/email and password.' });
  }

  const user = await authenticateLoginRuntime(identifier, password);
  if (!user) {
    recordLoginAttempt(throttleKey, false);
    return res.status(401).json({ error: 'Invalid login credentials.' });
  }
  recordLoginAttempt(throttleKey, true);

  return res.json({
    ok: true,
    user
  });
});

app.post('/api/password-reset/request', async (req, res) => {
  const throttleKey = getPasswordResetThrottleKey(req);
  if (isPasswordResetRateLimited(throttleKey)) {
    return res.status(429).json({ error: 'Too many reset attempts. Try again later.' });
  }

  if (!resendApiKey || !resetEmailFrom) {
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier: String(req.body?.identifier || '').trim(),
      requestIp: getRequestIp(req),
      eventType: 'email_config_missing',
      detail: 'RESEND_API_KEY or RESET_EMAIL_FROM not configured'
    });
    return res.status(503).json({
      error: 'Password reset email is not configured. Set RESEND_API_KEY and RESET_EMAIL_FROM.'
    });
  }

  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier) {
    recordPasswordResetAttempt(throttleKey, false);
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier,
      requestIp: getRequestIp(req),
      eventType: 'request_invalid',
      detail: 'Missing identifier'
    });
    return res.status(400).json({ error: 'Please provide your username or email.' });
  }

  const genericResponse = {
    ok: true,
    message: 'If an account exists, a password reset link has been sent.'
  };

  try {
    const account = await findAccountForPasswordResetRuntime(identifier);
    if (!account) {
      await logPasswordResetEventRuntime({
        accountId: null,
        identifier,
        requestIp: getRequestIp(req),
        eventType: 'request_no_account',
        detail: 'No account matched identifier'
      });
      recordPasswordResetAttempt(throttleKey, true);
      return res.json(genericResponse);
    }

    const now = Date.now();
    await deleteExpiredPasswordResetTokensRuntime(now);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = now + passwordResetTokenTtlMs;

    if (usePostgresRuntime) {
      await withPgTransaction(async (client) => {
        await markPasswordResetTokensUsedForAccountRuntime(now, account.id, client);
        await insertPasswordResetTokenRuntime(
          account.id,
          tokenHash,
          getRequestIp(req),
          expiresAt,
          now,
          client
        );
      });
    } else {
      const tx = db.transaction(() => {
        markPasswordResetTokensUsedForAccount.run(now, account.id);
        insertPasswordResetToken.run(account.id, tokenHash, getRequestIp(req), expiresAt, now);
      });
      tx();
    }

    await logPasswordResetEventRuntime({
      accountId: account.id,
      identifier,
      requestIp: getRequestIp(req),
      eventType: 'token_requested',
      detail: 'Reset token created'
    });

    const resetUrl = buildPasswordResetUrl(rawToken);
    try {
      await sendPasswordResetEmail({
        email: account.email,
        username: account.username,
        resetUrl
      });
      await logPasswordResetEventRuntime({
        accountId: account.id,
        identifier,
        requestIp: getRequestIp(req),
        eventType: 'email_sent',
        detail: 'Reset email sent successfully'
      });
    } catch (emailError) {
      console.error('Password reset email delivery failed:', emailError);
      await logPasswordResetEventRuntime({
        accountId: account.id,
        identifier,
        requestIp: getRequestIp(req),
        eventType: 'email_failed',
        detail: String(emailError?.message || 'Email delivery failed')
      });
      recordPasswordResetAttempt(throttleKey, false);
      return res.status(502).json({ error: 'Could not send password reset email.' });
    }

    recordPasswordResetAttempt(throttleKey, true);
    return res.json(genericResponse);
  } catch (_error) {
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier,
      requestIp: getRequestIp(req),
      eventType: 'request_error',
      detail: 'Unhandled error during request flow'
    });
    recordPasswordResetAttempt(throttleKey, false);
    return res.status(500).json({ error: 'Could not start password reset.' });
  }
});

app.post('/api/password-reset/confirm', async (req, res) => {
  const rawToken = String(req.body?.token || '').trim();
  const nextPassword = String(req.body?.password || '');

  if (!rawToken) {
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'confirm_invalid',
      detail: 'Missing reset token'
    });
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (!nextPassword || nextPassword.length < 6) {
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'confirm_invalid',
      detail: 'Password below minimum length'
    });
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const now = Date.now();
  await deleteExpiredPasswordResetTokensRuntime(now);
  const tokenHash = hashResetToken(rawToken);
  const resetTokenRow = await findPasswordResetTokenByHashRuntime(tokenHash);
  if (!resetTokenRow) {
    await logPasswordResetEventRuntime({
      accountId: null,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'token_invalid',
      detail: 'Token hash not found'
    });
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }
  if (resetTokenRow.used_at !== null && resetTokenRow.used_at !== undefined) {
    await logPasswordResetEventRuntime({
      accountId: resetTokenRow.account_id,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'token_invalid',
      detail: 'Token already used'
    });
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }
  if (Number(resetTokenRow.expires_at) <= now) {
    await logPasswordResetEventRuntime({
      accountId: resetTokenRow.account_id,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'token_invalid',
      detail: 'Token expired'
    });
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }

  try {
    if (usePostgresRuntime) {
      await withPgTransaction(async (client) => {
        const passwordHash = hashPassword(nextPassword);
        await client.query(
          `UPDATE accounts SET password_hash = $1, password_plain = NULL WHERE id = $2`,
          [passwordHash, resetTokenRow.account_id]
        );
        await markPasswordResetTokenUsedRuntime(now, resetTokenRow.id, client);
        await markPasswordResetTokensUsedForAccountRuntime(now, resetTokenRow.account_id, client);
      });
    } else {
      const tx = db.transaction(() => {
        const passwordHash = hashPassword(nextPassword);
        updateAccountPassword.run(passwordHash, null, resetTokenRow.account_id);
        markPasswordResetTokenUsed.run(now, resetTokenRow.id);
        markPasswordResetTokensUsedForAccount.run(now, resetTokenRow.account_id);
      });
      tx();
    }
    await logPasswordResetEventRuntime({
      accountId: resetTokenRow.account_id,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'token_used',
      detail: 'Password reset completed'
    });
    return res.json({ ok: true });
  } catch (_error) {
    await logPasswordResetEventRuntime({
      accountId: resetTokenRow.account_id,
      identifier: '',
      requestIp: getRequestIp(req),
      eventType: 'confirm_error',
      detail: 'Unhandled error during confirm flow'
    });
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

app.get('/api/me', async (req, res) => {
  const user = await ensureLoggedInUserRuntime(req, res);
  if (!user) {
    return;
  }

  const account = await findAccountByIdRuntime(user.id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  return res.json({
    ok: true,
    account: {
      id: account.id,
      username: account.username,
      fullName: account.full_name,
      email: account.email,
      createdAt: account.created_at,
      preferredStore: account.preferred_store_place_id
        ? {
            placeId: account.preferred_store_place_id || null,
            name: account.preferred_store_name || null,
            address: account.preferred_store_address || null,
            url: account.preferred_store_url || null,
            website: account.preferred_store_website || null,
            phone: account.preferred_store_phone || null
          }
        : null
    }
  });
});

app.patch('/api/me', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const fullName = String(req.body?.fullName ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const nextPassword = req.body?.password === undefined ? null : String(req.body?.password || '');
  const currentPassword =
    req.body?.currentPassword === undefined ? null : String(req.body?.currentPassword || '');

  const requestedUsername =
    req.body && Object.prototype.hasOwnProperty.call(req.body, 'username')
      ? String(req.body.username ?? '').trim().toLowerCase()
      : null;
  if (requestedUsername && requestedUsername !== String(user.username || '').trim().toLowerCase()) {
    return res.status(400).json({ error: 'Username cannot be changed.' });
  }
  if (!fullName || fullName.length < 2) {
    return res.status(400).json({ error: 'Please provide your full name.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }
  if (nextPassword !== null && nextPassword.length > 0 && nextPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (nextPassword !== null && nextPassword.length > 0) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Please provide your current password.' });
    }
    const row = await findAccountPasswordHashByIdRuntime(user.id);
    if (!row?.password_hash) {
      return res.status(500).json({ error: 'Failed to verify current password.' });
    }
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
  }

  try {
    await updateAccountProfileAndPasswordRuntime(user.id, fullName, email, nextPassword);
  } catch (error) {
    if (
      String(error?.message || '').includes('UNIQUE constraint failed') ||
      String(error?.code || '') === '23505'
    ) {
      return res.status(409).json({ error: 'Email already in use.' });
    }
    return res.status(500).json({ error: 'Failed to update account.' });
  }

  const account = await findAccountByIdRuntime(user.id);
  return res.json({
    ok: true,
    account: {
      id: account.id,
      username: account.username,
      fullName: account.full_name,
      email: account.email,
      createdAt: account.created_at
    }
  });
});

app.get('/api/cards', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const rows = await listMyCardsRuntime(user.id);
  const entries = rows.map((row) => ({
    id: Number(row.id),
    marketStatus: marketStatusFromCode(row.requesting),
    cardName: row.card_name,
    quantity: row.quantity,
    requesting: Number(row.requesting) === 2,
    askingQuantity:
      row.asking_quantity === null || row.asking_quantity === undefined
        ? null
        : Number(row.asking_quantity),
    askingPriceCents:
      row.asking_price_cents === null || row.asking_price_cents === undefined
        ? null
        : Number(row.asking_price_cents),
    offerPriceCents:
      row.offer_price_cents === null || row.offer_price_cents === undefined
        ? null
        : Number(row.offer_price_cents),
    scryfallId: row.scryfall_id || null,
    setCode: row.set_code || null,
    setName: row.set_name || null,
    collectorNumber: row.collector_number || null,
    condition: row.condition || null,
    foil: Number(row.foil) === 1,
    imageSmall: row.image_small || null,
    imageNormal: row.image_normal || null,
    imageSmallBack: row.image_small_back || null,
    imageNormalBack: row.image_normal_back || null
  }));
  const cards = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.quantity; i += 1) {
      cards.push(entry.cardName);
    }
  }
  return res.json({ cards, entries, totalCards: cards.length });
});

app.post('/api/cards', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const submittedCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const saveModeRaw = String(req.body?.mode || '').trim().toLowerCase();
  const saveMode = saveModeRaw === 'add' ? 'add' : 'replace';
  const entries = [];

  for (const submitted of submittedCards) {
    let cardName = '';
    let marketStatusCode = 0;
    let askingPriceCents = null;
    let offerPriceCents = null;
    let condition = null;
    let scryfallId = null;
    let setCode = null;
    let setName = null;
    let collectorNumber = null;
    let imageSmall = null;
    let imageNormal = null;
    let imageSmallBack = null;
    let imageNormalBack = null;
    let foil = false;
    let marketPriceCents = null;

    if (typeof submitted === 'string') {
      cardName = submitted.trim();
    } else if (submitted && typeof submitted === 'object') {
      cardName = String(submitted.cardName || submitted.name || '').trim();
      marketStatusCode = parseMarketStatusFromSubmittedCard(submitted);
      askingPriceCents = parseAskingPriceCentsFromSubmittedCard(submitted);
      offerPriceCents = parseOfferPriceCentsFromSubmittedCard(submitted);
      marketPriceCents = parseMarketPriceCentsFromSubmittedCard(submitted);
      condition = parseConditionFromSubmittedCard(submitted);
      foil = Boolean(submitted.foil);
      scryfallId = submitted.scryfallId ? String(submitted.scryfallId).trim() : null;
      setCode = submitted.setCode ? String(submitted.setCode).trim() : null;
      setName = submitted.setName ? String(submitted.setName).trim() : null;
      collectorNumber = submitted.collectorNumber ? String(submitted.collectorNumber).trim() : null;
      imageSmall = submitted.imageSmall ? String(submitted.imageSmall).trim() : null;
      imageNormal = submitted.imageNormal ? String(submitted.imageNormal).trim() : null;
      imageSmallBack = submitted.imageSmallBack ? String(submitted.imageSmallBack).trim() : null;
      imageNormalBack = submitted.imageNormalBack
        ? String(submitted.imageNormalBack).trim()
        : null;
    }

    if (!cardName) {
      continue;
    }

    // Each submitted entry is one individual card — no deduplication.
    entries.push({
      cardName,
      quantity: 1,
      marketStatusCode,
      askingQuantity: null,
      askingPriceCents,
      offerPriceCents,
      marketPriceCents,
      condition,
      foil,
      scryfallId,
      setCode,
      setName,
      collectorNumber,
      imageSmall,
      imageNormal,
      imageSmallBack,
      imageNormalBack
    });
  }

  const totalCards = entries.length;

  if (entries.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one card.' });
  }

  if (entries.length > 5000) {
    return res.status(400).json({ error: 'Card list is too large (max 5000 individual cards).' });
  }

  await saveCardsRuntime(user.id, entries, saveMode);
  const expandedCards = entries.map((entry) => entry.cardName);
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    marketStatus: marketStatusFromCode(entry.marketStatusCode),
    requesting: entry.marketStatusCode === 2
  }));
  return res.json({
    ok: true,
    uniqueCount: entries.length,
    totalCount: totalCards,
    cards: expandedCards,
    entries: normalizedEntries
  });
});

app.delete('/api/cards', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const cardId = Number(req.body?.id);
  if (!Number.isFinite(cardId) || cardId <= 0) {
    return res.status(400).json({ error: 'Please provide a card id.' });
  }

  const info = await deleteMyCardByIdRuntime(user.id, cardId);
  return res.json({ ok: true, deleted: info.changes || info.rowCount || 0 });
});

app.get('/api/users', async (_req, res) => {
  const basicAuth = String(_req.header('authorization') || '');
  const basicPrefix = 'Basic ';
  let basicAuthorized = false;

  if (basicAuth.startsWith(basicPrefix)) {
    try {
      const decoded = Buffer.from(basicAuth.slice(basicPrefix.length), 'base64').toString('utf8');
      const [username, password] = decoded.split(':');
      basicAuthorized = username === adminUsername && password === adminPassword;
    } catch (_error) {
      basicAuthorized = false;
    }
  }

  if (basicAuthorized) {
    const users = await listUsersRuntime();
    return res.json({ users });
  }

  if (!adminApiKey) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const receivedKey = String(_req.header('x-api-key') || '');
  if (receivedKey !== adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const users = await listUsersRuntime();
  res.json({ users });
});

app.get('/api/admin/accounts', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const accountRows = await listAccountsForAdminRuntime();
  const accounts = accountRows.map((account) => ({
    id: account.id,
    username: account.username,
    fullName: account.full_name,
    email: account.email,
    passkey: formatAdminPasskey(account),
    createdAt: account.created_at
  }));

  return res.json({ accounts });
});

app.get('/api/admin/password-reset-events', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const eventRows = await listPasswordResetEventsForAdminRuntime();
  const events = eventRows.map((row) => ({
    id: row.id,
    accountId: row.account_id || null,
    username: row.username || null,
    email: row.email || null,
    identifier: row.identifier || null,
    requestIp: row.request_ip || null,
    eventType: row.event_type,
    detail: row.detail || null,
    createdAt: row.created_at
  }));

  return res.json({ events });
});

// ── Messages API ─────────────────────────────────────────────────────────────

app.get('/api/messages', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const rows = await listMessagesForUserRuntime(user.id);
  const inboxCount = await countInboxMessagesRuntime(user.id);

  const messages = rows.map((row) => ({
    id: Number(row.id),
    senderId: Number(row.sender_id),
    senderUsername: row.sender_username,
    senderFullName: row.sender_full_name,
    recipientId: Number(row.recipient_id),
    recipientUsername: row.recipient_username,
    recipientFullName: row.recipient_full_name,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at || null,
    fromMe: Number(row.sender_id) === Number(user.id)
  }));

  return res.json({ messages, inboxCount, inboxLimit: MESSAGE_INBOX_LIMIT });
});

app.post('/api/messages', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const recipientIdentifier = String(req.body?.to || '').trim();
  const body = String(req.body?.body || '').trim();

  if (!recipientIdentifier) {
    return res.status(400).json({ error: 'Please specify a recipient (username or email).' });
  }
  if (!body) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (body.length > 1000) {
    return res.status(400).json({ error: 'Message is too long (max 1000 characters).' });
  }

  const recipient = await findAccountForMessagingRuntime(recipientIdentifier);
  if (!recipient) {
    return res.status(404).json({ error: 'No user found with that username or email.' });
  }
  if (Number(recipient.id) === Number(user.id)) {
    return res.status(400).json({ error: 'You cannot message yourself.' });
  }

  const inboxCount = await countInboxMessagesRuntime(Number(recipient.id));
  if (inboxCount >= MESSAGE_INBOX_LIMIT) {
    return res.status(400).json({
      error: `That user's inbox is full (${MESSAGE_INBOX_LIMIT} message limit). They need to delete some messages first.`
    });
  }

  await insertMessageRuntime(Number(user.id), Number(recipient.id), body);
  return res.json({ ok: true });
});

app.patch('/api/messages/:id/read', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) {
    return res.status(400).json({ error: 'Invalid message ID.' });
  }

  await markMessageReadRuntime(messageId, Number(user.id));
  return res.json({ ok: true });
});

app.delete('/api/messages/:id', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const messageId = Number(req.params.id);
  if (!Number.isFinite(messageId)) {
    return res.status(400).json({ error: 'Invalid message ID.' });
  }

  await deleteMessageRuntime(messageId, Number(user.id));
  return res.json({ ok: true });
});

app.get('/api/users/search', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ users: [] });
  }

  const accounts = await searchAccountsRuntime(q, Number(user.id));
  return res.json({
    users: accounts.map((a) => ({ username: a.username, fullName: a.full_name }))
  });
});

app.get('/api/great-offers', async (_req, res) => {
  try {
    const DISCOUNT_THRESHOLD = 0.85; // offer must be ≤ 85% of market (15%+ off)
    const LIMIT = 24;

    if (!usePostgresRuntime) {
      const rows = db.prepare(`
        SELECT
          mc.id, mc.card_name, mc.offer_price_cents, mc.market_price_cents,
          mc.condition, mc.foil, mc.scryfall_id, mc.set_code, mc.set_name,
          mc.collector_number, mc.image_small, mc.image_normal,
          a.username
        FROM my_cards mc
        JOIN accounts a ON a.id = mc.account_id
        WHERE mc.requesting = 1
          AND mc.offer_price_cents IS NOT NULL
          AND mc.market_price_cents IS NOT NULL
          AND mc.market_price_cents > 0
          AND mc.offer_price_cents * 100 <= mc.market_price_cents * 85
        ORDER BY (mc.market_price_cents - mc.offer_price_cents) DESC
        LIMIT ${LIMIT}
      `).all();
      return res.json({ offers: rows.map(normalizeGreatOffer) });
    }

    const { rows } = await pgQuery(`
      SELECT
        mc.id, mc.card_name, mc.offer_price_cents, mc.market_price_cents,
        mc.condition, mc.foil, mc.scryfall_id, mc.set_code, mc.set_name,
        mc.collector_number, mc.image_small, mc.image_normal,
        a.username
      FROM my_cards mc
      JOIN accounts a ON a.id = mc.account_id
      WHERE mc.requesting = 1
        AND mc.offer_price_cents IS NOT NULL
        AND mc.market_price_cents IS NOT NULL
        AND mc.market_price_cents > 0
        AND mc.offer_price_cents::numeric * 100 <= mc.market_price_cents::numeric * 85
      ORDER BY (mc.market_price_cents - mc.offer_price_cents) DESC
      LIMIT $1
    `, [LIMIT]);
    return res.json({ offers: rows.map(normalizeGreatOffer) });
  } catch (err) {
    console.error('/api/great-offers error', err);
    return res.status(500).json({ error: 'Could not load great offers.' });
  }
});

function normalizeGreatOffer(row) {
  const offerCents = Number(row.offer_price_cents);
  const marketCents = Number(row.market_price_cents);
  const discountPct = marketCents > 0 ? Math.round((1 - offerCents / marketCents) * 100) : 0;
  return {
    id: row.id,
    cardName: row.card_name,
    offerPriceCents: offerCents,
    marketPriceCents: marketCents,
    discountPct,
    condition: row.condition || null,
    foil: Boolean(row.foil),
    scryfallId: row.scryfall_id || null,
    setCode: row.set_code || null,
    setName: row.set_name || null,
    collectorNumber: row.collector_number || null,
    imageSmall: row.image_small || null,
    imageNormal: row.image_normal || null,
    username: row.username,
  };
}

app.get('/api/matches', async (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) return res.status(401).json({ error: 'Unauthorized.' });
  const user = await authenticateLoginRuntime(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') return res.status(401).json({ error: 'Unauthorized.' });

  const rows = await findMatchesRuntime(Number(user.id));
  const matches = rows.map((row) => {
    const dist = row.distance_miles != null ? Math.round(row.distance_miles) : null;
    return {
      cardName: row.card_name,
      username: row.username,
      myRole: row.my_role,
      myPriceCents: row.my_price_cents === null ? null : Number(row.my_price_cents),
      theirPriceCents: row.their_price_cents === null ? null : Number(row.their_price_cents),
      nearStore: dist !== null && dist <= 50,
      distanceMiles: dist
    };
  });
  return res.json({ matches });
});

// ── End Messages API ──────────────────────────────────────────────────────────

await validatePostgresRuntimeOrExit();

app.listen(port, () => {
  console.log(`User API listening on http://localhost:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
  console.log(`DB backend mode: ${dbBackend}`);
});
