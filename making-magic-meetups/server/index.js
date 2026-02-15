import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';

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
const adminApiKey = process.env.ADMIN_API_KEY || '';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'test123';

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

db.exec(`
  UPDATE accounts
  SET username = 'user' || id
  WHERE username IS NULL OR TRIM(username) = ''
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_unique
  ON accounts (username)
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
  WHERE username = ? OR email = ?
  LIMIT 1
`);

const listAccountsForAdmin = db.prepare(`
  SELECT id, username, full_name, email, password_plain, password_hash, created_at
  FROM accounts
  ORDER BY id DESC
  LIMIT 1000
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

function authenticateLogin(identifier, password) {
  if (identifier === adminUsername.toLowerCase() && password === adminPassword) {
    return {
      id: 0,
      username: adminUsername,
      fullName: 'Administrator',
      email: `${adminUsername}@local`,
      role: 'admin'
    };
  }

  const account = findAccountForLogin.get(identifier, identifier);
  const providedHash = crypto.createHash('sha256').update(password).digest('hex');

  if (!account || account.password_hash !== providedHash) {
    return null;
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
    const identifier = decoded.slice(0, separatorIndex).trim().toLowerCase();
    const password = decoded.slice(separatorIndex + 1);
    if (!identifier || !password) {
      return null;
    }
    return { identifier, password };
  } catch (_error) {
    return null;
  }
}

const app = express();
const corsOptions = {
  origin(origin, callback) {
    const allowedOrigins = [...frontendOrigins, 'http://localhost:5174'];
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Api-Key'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Ensure browsers can complete CORS preflight requests (OPTIONS) for all endpoints.
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'making-magic-meetups-api' });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');

  if (username === adminUsername && password === adminPassword) {
    return res.json({ ok: true });
  }

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
  const username = String(req.body?.username || '').trim().toLowerCase();
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3-24 chars and use lowercase letters, numbers, or underscores.'
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
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const result = insertAccount.run(username, fullName, email, passwordHash, password);
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
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please provide username/email and password.' });
  }

  const user = authenticateLogin(identifier, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid login credentials.' });
  }

  return res.json({
    ok: true,
    user
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

  const entries = listAccountCards.all(user.id).map((row) => ({
    cardName: row.card_name,
    quantity: row.quantity,
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
    imageNormal: row.image_normal || null
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
  const cardMap = new Map();

  for (const submitted of submittedCards) {
    let cardName = '';
    let quantity = 1;
    let askingQuantity = null;
    let askingPriceCents = null;
    let scryfallId = null;
    let setCode = null;
    let setName = null;
    let collectorNumber = null;
    let imageSmall = null;
    let imageNormal = null;

    if (typeof submitted === 'string') {
      cardName = submitted.trim();
    } else if (submitted && typeof submitted === 'object') {
      cardName = String(submitted.cardName || submitted.name || '').trim();
      quantity = Number(submitted.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        quantity = 1;
      }
      if (submitted.askingQuantity !== null && submitted.askingQuantity !== undefined) {
        const rawAskQty = Number(submitted.askingQuantity);
        if (Number.isFinite(rawAskQty) && rawAskQty > 0) {
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
    }

    if (!cardName) {
      continue;
    }

    const normalized = cardName.toLowerCase();
    const existing = cardMap.get(normalized);
    if (existing) {
      existing.quantity += quantity;
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
      cardMap.set(normalized, {
        cardName,
        quantity,
        askingQuantity,
        askingPriceCents,
        scryfallId,
        setCode,
        setName,
        collectorNumber,
        imageSmall,
        imageNormal
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
    clearAccountCards.run(accountId);
    for (const entry of cardEntries) {
      const normalizedAskQty =
        entry.askingQuantity === null || entry.askingQuantity === undefined
          ? entry.quantity
          : Math.max(1, Math.min(entry.quantity, Math.floor(Number(entry.askingQuantity))));
      upsertAccountCard.run(
        accountId,
        entry.cardName,
        entry.quantity,
        normalizedAskQty,
        entry.askingPriceCents ?? null,
        entry.scryfallId ?? null,
        entry.setCode ?? null,
        entry.setName ?? null,
        entry.collectorNumber ?? null,
        entry.imageSmall ?? null,
        entry.imageNormal ?? null
      );
    }
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
    password: account.password_plain || null,
    passwordHash: account.password_hash,
    createdAt: account.created_at
  }));

  return res.json({ accounts });
});

app.listen(port, () => {
  console.log(`User API listening on http://localhost:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});
