import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir =
  process.env.DATA_DIR || (process.env.RENDER ? '/var/data' : path.join(__dirname, '..', 'data'));
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
  'preferred_store_phone TEXT'
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
      preferred_store_phone = ?
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
  'scryfall_id TEXT',
  'set_code TEXT',
  'set_name TEXT',
  'collector_number TEXT',
  'image_small TEXT',
  'image_normal TEXT',
  'image_small_back TEXT',
  'image_normal_back TEXT'
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

// One-time migration: move existing saved lists into "my_cards" if present.
db.exec(`
  INSERT INTO my_cards (
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
  SELECT
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
  FROM account_card_items
  WHERE 1 = 1
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

const clearMyCards = db.prepare(`
  DELETE FROM my_cards
  WHERE account_id = ?
`);

const upsertMyCardReplace = db.prepare(`
  INSERT INTO my_cards (
    account_id,
    card_name,
    quantity,
    requesting,
    asking_quantity,
    asking_price_cents,
    scryfall_id,
    set_code,
    set_name,
    collector_number,
    image_small,
    image_normal,
    image_small_back,
    image_normal_back
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, card_name) DO UPDATE SET
    quantity = excluded.quantity,
    requesting = excluded.requesting,
    asking_quantity = excluded.asking_quantity,
    asking_price_cents = excluded.asking_price_cents,
    scryfall_id = excluded.scryfall_id,
    set_code = excluded.set_code,
    set_name = excluded.set_name,
    collector_number = excluded.collector_number,
    image_small = excluded.image_small,
    image_normal = excluded.image_normal,
    image_small_back = excluded.image_small_back,
    image_normal_back = excluded.image_normal_back,
    updated_at = CURRENT_TIMESTAMP
`);

const upsertMyCardAdd = db.prepare(`
  INSERT INTO my_cards (
    account_id,
    card_name,
    quantity,
    requesting,
    asking_quantity,
    asking_price_cents,
    scryfall_id,
    set_code,
    set_name,
    collector_number,
    image_small,
    image_normal,
    image_small_back,
    image_normal_back
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, card_name) DO UPDATE SET
    quantity = my_cards.quantity + excluded.quantity,
    requesting = MAX(my_cards.requesting, excluded.requesting),
    asking_quantity =
      COALESCE(my_cards.asking_quantity, my_cards.quantity) +
      COALESCE(excluded.asking_quantity, excluded.quantity),
    asking_price_cents = COALESCE(excluded.asking_price_cents, my_cards.asking_price_cents),
    scryfall_id = COALESCE(excluded.scryfall_id, my_cards.scryfall_id),
    set_code = COALESCE(excluded.set_code, my_cards.set_code),
    set_name = COALESCE(excluded.set_name, my_cards.set_name),
    collector_number = COALESCE(excluded.collector_number, my_cards.collector_number),
    image_small = COALESCE(excluded.image_small, my_cards.image_small),
    image_normal = COALESCE(excluded.image_normal, my_cards.image_normal),
    image_small_back = COALESCE(excluded.image_small_back, my_cards.image_small_back),
    image_normal_back = COALESCE(excluded.image_normal_back, my_cards.image_normal_back),
    updated_at = CURRENT_TIMESTAMP
`);

const listMyCards = db.prepare(`
  SELECT
    card_name,
    quantity,
    requesting,
    asking_quantity,
    asking_price_cents,
    scryfall_id,
    set_code,
    set_name,
    collector_number,
    image_small,
    image_normal,
    image_small_back,
    image_normal_back
  FROM my_cards
  WHERE account_id = ?
  ORDER BY card_name COLLATE NOCASE ASC
`);

const deleteMyCardByName = db.prepare(`
  DELETE FROM my_cards
  WHERE account_id = ? AND LOWER(card_name) = LOWER(?)
`);

function sqlIdentityKey(alias) {
  return `CASE
    WHEN NULLIF(TRIM(${alias}.scryfall_id), '') IS NOT NULL THEN 'id:' || LOWER(TRIM(${alias}.scryfall_id))
    ELSE 'name:' || LOWER(TRIM(${alias}.card_name))
  END`;
}

const srcIdentityKey = sqlIdentityKey('src');
const rowIdentityKey = sqlIdentityKey('my_cards');

const consolidateMyCardsIdentityKeepRows = db.prepare(`
  UPDATE my_cards
  SET
    quantity = (
      SELECT SUM(src.quantity)
      FROM my_cards src
      WHERE src.account_id = my_cards.account_id
        AND ${srcIdentityKey} = ${rowIdentityKey}
    ),
    requesting = (
      SELECT MAX(src.requesting)
      FROM my_cards src
      WHERE src.account_id = my_cards.account_id
        AND ${srcIdentityKey} = ${rowIdentityKey}
    ),
    asking_quantity = (
      SELECT SUM(COALESCE(src.asking_quantity, src.quantity))
      FROM my_cards src
      WHERE src.account_id = my_cards.account_id
        AND ${srcIdentityKey} = ${rowIdentityKey}
    ),
    asking_price_cents = COALESCE(
      (
        SELECT src.asking_price_cents
        FROM my_cards src
        WHERE src.account_id = my_cards.account_id
          AND ${srcIdentityKey} = ${rowIdentityKey}
          AND src.asking_price_cents IS NOT NULL
        ORDER BY src.updated_at DESC, src.id DESC
        LIMIT 1
      ),
      my_cards.asking_price_cents
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE my_cards.account_id = ?
    AND my_cards.id = (
      SELECT MIN(src.id)
      FROM my_cards src
      WHERE src.account_id = my_cards.account_id
        AND ${srcIdentityKey} = ${rowIdentityKey}
    )
`);

const consolidateMyCardsIdentityDeleteDuplicates = db.prepare(`
  DELETE FROM my_cards
  WHERE account_id = ?
    AND id NOT IN (
      SELECT MIN(src.id)
      FROM my_cards src
      WHERE src.account_id = ?
      GROUP BY ${srcIdentityKey}
    )
`);

const consolidateMyCardsByIdentity = db.transaction((accountId) => {
  consolidateMyCardsIdentityKeepRows.run(accountId);
  consolidateMyCardsIdentityDeleteDuplicates.run(accountId, accountId);
});

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
  res.json({ ok: true });
});

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
  const user = ensureLoggedInUser(req, res);
  if (!user) {
    return;
  }

  const placeIdRaw =
    req.body && Object.prototype.hasOwnProperty.call(req.body, 'placeId')
      ? String(req.body.placeId || '').trim()
      : '';
  const placeId = placeIdRaw ? placeIdRaw : null;

  if (!placeId) {
    updatePreferredStore.run(null, null, null, null, null, null, user.id);
    const account = findAccountById.get(user.id);
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

  try {
    updatePreferredStore.run(placeId, name, address, url, website, phone, user.id);

    const account = findAccountById.get(user.id);
    return res.json({
      ok: true,
      preferredStore: {
        placeId: account.preferred_store_place_id || null,
        name: account.preferred_store_name || null,
        address: account.preferred_store_address || null,
        url: account.preferred_store_url || null,
        website: account.preferred_store_website || null,
        phone: account.preferred_store_phone || null
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

app.post('/api/users', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }

  try {
    const result = insertUser.run(email);
    return res.status(201).json({ id: result.lastInsertRowid, email });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already subscribed.' });
    }

    return res.status(500).json({ error: 'Failed to save user.' });
  }
});

app.post('/api/accounts', (req, res) => {
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
    const result = insertAccount.run(username, fullName, email, passwordHash, null);
    return res.status(201).json({ id: result.lastInsertRowid, username, email, fullName });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res
        .status(409)
        .json({ error: 'An account with this email or username already exists.' });
    }

    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/login', (req, res) => {
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

  const user = authenticateLogin(identifier, password);
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

  const identifier = String(req.body?.identifier || '').trim();
  if (!identifier) {
    recordPasswordResetAttempt(throttleKey, false);
    return res.status(400).json({ error: 'Please provide your username or email.' });
  }

  const genericResponse = {
    ok: true,
    message: 'If an account exists, a password reset link has been sent.'
  };

  try {
    const account = findAccountForPasswordReset.get(identifier, identifier);
    if (!account) {
      recordPasswordResetAttempt(throttleKey, true);
      return res.json(genericResponse);
    }

    const now = Date.now();
    deleteExpiredPasswordResetTokens.run(now);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = now + passwordResetTokenTtlMs;

    const tx = db.transaction(() => {
      markPasswordResetTokensUsedForAccount.run(now, account.id);
      insertPasswordResetToken.run(account.id, tokenHash, getRequestIp(req), expiresAt, now);
    });
    tx();

    const resetUrl = buildPasswordResetUrl(rawToken);
    try {
      await sendPasswordResetEmail({
        email: account.email,
        username: account.username,
        resetUrl
      });
    } catch (_emailError) {
      // Avoid leaking provider failures to clients. Reset tokens remain valid.
    }

    recordPasswordResetAttempt(throttleKey, true);
    return res.json(genericResponse);
  } catch (_error) {
    recordPasswordResetAttempt(throttleKey, false);
    return res.status(500).json({ error: 'Could not start password reset.' });
  }
});

app.post('/api/password-reset/confirm', (req, res) => {
  const rawToken = String(req.body?.token || '').trim();
  const nextPassword = String(req.body?.password || '');

  if (!rawToken) {
    return res.status(400).json({ error: 'Reset token is required.' });
  }
  if (!nextPassword || nextPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const now = Date.now();
  deleteExpiredPasswordResetTokens.run(now);
  const tokenHash = hashResetToken(rawToken);
  const resetTokenRow = findPasswordResetTokenByHash.get(tokenHash);
  if (!resetTokenRow) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }
  if (resetTokenRow.used_at !== null && resetTokenRow.used_at !== undefined) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }
  if (Number(resetTokenRow.expires_at) <= now) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }

  try {
    const tx = db.transaction(() => {
      const passwordHash = hashPassword(nextPassword);
      updateAccountPassword.run(passwordHash, null, resetTokenRow.account_id);
      markPasswordResetTokenUsed.run(now, resetTokenRow.id);
      markPasswordResetTokensUsedForAccount.run(now, resetTokenRow.account_id);
    });
    tx();
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(500).json({ error: 'Could not reset password.' });
  }
});

app.get('/api/me', (req, res) => {
  const user = ensureLoggedInUser(req, res);
  if (!user) {
    return;
  }

  const account = findAccountById.get(user.id);
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

app.patch('/api/me', (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
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
    const row = findAccountPasswordHashById.get(user.id);
    if (!row?.password_hash) {
      return res.status(500).json({ error: 'Failed to verify current password.' });
    }
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
  }

  const saveTx = db.transaction((accountId) => {
    updateAccountProfile.run(fullName, email, accountId);
    if (nextPassword !== null && nextPassword.length > 0) {
      const passwordHash = hashPassword(nextPassword);
      updateAccountPassword.run(passwordHash, null, accountId);
    }
  });

  try {
    saveTx(user.id);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Email already in use.' });
    }
    return res.status(500).json({ error: 'Failed to update account.' });
  }

  const account = findAccountById.get(user.id);
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

app.get('/api/cards', (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const entries = listMyCards.all(user.id).map((row) => ({
    cardName: row.card_name,
    quantity: row.quantity,
    requesting: Boolean(row.requesting),
    askingQuantity:
      row.asking_quantity === null || row.asking_quantity === undefined
        ? null
        : Number(row.asking_quantity),
    askingPriceCents:
      row.asking_price_cents === null || row.asking_price_cents === undefined
        ? null
        : Number(row.asking_price_cents),
    scryfallId: row.scryfall_id || null,
    setCode: row.set_code || null,
    setName: row.set_name || null,
    collectorNumber: row.collector_number || null,
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

app.post('/api/cards', (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const submittedCards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  const saveModeRaw = String(req.body?.mode || '').trim().toLowerCase();
  const saveMode = saveModeRaw === 'add' ? 'add' : 'replace';
  const cardMap = new Map();

  for (const submitted of submittedCards) {
    let cardName = '';
    let quantity = 1;
    let requesting = 0;
    let askingQuantity = null;
    let askingPriceCents = null;
    let scryfallId = null;
    let setCode = null;
    let setName = null;
    let collectorNumber = null;
    let imageSmall = null;
    let imageNormal = null;
    let imageSmallBack = null;
    let imageNormalBack = null;

    if (typeof submitted === 'string') {
      cardName = submitted.trim();
    } else if (submitted && typeof submitted === 'object') {
      cardName = String(submitted.cardName || submitted.name || '').trim();
      quantity = Number(submitted.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        quantity = 1;
      } else {
        quantity = Math.floor(quantity);
      }
      requesting = submitted.requesting ? 1 : 0;
      if (submitted.askingQuantity !== null && submitted.askingQuantity !== undefined) {
        const rawAskQty = Number(submitted.askingQuantity);
        if (Number.isFinite(rawAskQty) && rawAskQty >= 0) {
          askingQuantity = Math.floor(rawAskQty);
        }
      }
      askingPriceCents = parseAskingPriceCentsFromSubmittedCard(submitted);
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

    const identityKey = scryfallId ? `id:${scryfallId.toLowerCase()}` : `name:${cardName.toLowerCase()}`;
    const existing = cardMap.get(identityKey);
    if (existing) {
      existing.quantity += quantity;
      existing.requesting = existing.requesting || requesting ? 1 : 0;
      if (askingPriceCents !== null) {
        existing.askingPriceCents = askingPriceCents;
      }
      if (askingQuantity !== null) {
        existing.askingQuantity = askingQuantity;
      }
      if (scryfallId) {
        existing.scryfallId = scryfallId;
        existing.setCode = setCode;
        existing.setName = setName;
        existing.collectorNumber = collectorNumber;
        existing.imageSmall = imageSmall;
        existing.imageNormal = imageNormal;
      }
    } else {
      cardMap.set(identityKey, {
        cardName,
        quantity,
        requesting,
        askingQuantity,
        askingPriceCents,
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
  }

  const entries = Array.from(cardMap.values());
  const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  if (entries.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one card.' });
  }

  if (entries.length > 1000 || totalCards > 5000) {
    return res.status(400).json({ error: 'Card list is too large (max 1000 unique / 5000 total).' });
  }

  const saveCards = db.transaction((accountId, cardEntries) => {
    for (const entry of cardEntries) {
      const normalizedAskQty =
        entry.askingQuantity === null || entry.askingQuantity === undefined
          ? entry.quantity
          : Math.max(0, Math.floor(Number(entry.askingQuantity)));
      const upsert = saveMode === 'add' ? upsertMyCardAdd : upsertMyCardReplace;
      upsert.run(
        accountId,
        entry.cardName,
        entry.quantity,
        entry.requesting ? 1 : 0,
        normalizedAskQty,
        entry.askingPriceCents ?? null,
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
    consolidateMyCardsByIdentity(accountId);
  });

  saveCards(user.id, entries);
  const expandedCards = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.quantity; i += 1) {
      expandedCards.push(entry.cardName);
    }
  }
  return res.json({
    ok: true,
    uniqueCount: entries.length,
    totalCount: totalCards,
    cards: expandedCards,
    entries
  });
});

app.delete('/api/cards', (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
  if (!user || user.role !== 'user') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const cardName = String(req.body?.cardName || '').trim();
  if (!cardName) {
    return res.status(400).json({ error: 'Please provide a cardName.' });
  }

  const info = deleteMyCardByName.run(user.id, cardName);
  return res.json({ ok: true, deleted: info.changes || 0 });
});

app.get('/api/users', (_req, res) => {
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
    return res.json({ users: listUsers.all() });
  }

  if (!adminApiKey) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const receivedKey = String(_req.header('x-api-key') || '');
  if (receivedKey !== adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  res.json({ users: listUsers.all() });
});

app.get('/api/admin/accounts', (req, res) => {
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const user = authenticateLogin(credentials.identifier, credentials.password);
  if (!user || user.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const accounts = listAccountsForAdmin.all().map((account) => ({
    id: account.id,
    username: account.username,
    fullName: account.full_name,
    email: account.email,
    passkey: formatAdminPasskey(account),
    createdAt: account.created_at
  }));

  return res.json({ accounts });
});

app.listen(port, () => {
  console.log(`User API listening on http://localhost:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});
