import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import cors from 'cors';
import Database from 'better-sqlite3';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'users.db');
const port = process.env.PORT ? Number(process.env.PORT) : 8787;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://dcp6.github.io';
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

const clearAccountCards = db.prepare(`
  DELETE FROM account_cards
  WHERE account_id = ?
`);

const insertAccountCard = db.prepare(`
  INSERT INTO account_cards (account_id, card_name)
  VALUES (?, ?)
`);

const listAccountCards = db.prepare(`
  SELECT card_name
  FROM account_cards
  WHERE account_id = ?
  ORDER BY id ASC
`);

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
app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = [frontendOrigin, 'http://localhost:5174'];
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
  })
);
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

  const cards = listAccountCards.all(user.id).map((row) => row.card_name);
  return res.json({ cards });
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
  const cards = submittedCards.map((card) => String(card).trim()).filter(Boolean);

  if (cards.length === 0) {
    return res.status(400).json({ error: 'Please provide at least one card.' });
  }

  if (cards.length > 1000) {
    return res.status(400).json({ error: 'Card list is too large (max 1000).' });
  }

  const saveCards = db.transaction((accountId, cardNames) => {
    clearAccountCards.run(accountId);
    for (const cardName of cardNames) {
      insertAccountCard.run(accountId, cardName);
    }
  });

  saveCards(user.id, cards);
  return res.json({ ok: true, count: cards.length, cards });
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
