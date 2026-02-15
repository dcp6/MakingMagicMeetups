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
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
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
  INSERT INTO accounts (full_name, email, password_hash)
  VALUES (?, ?, ?)
`);

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
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

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
    const result = insertAccount.run(fullName, email, passwordHash);
    return res.status(201).json({ id: result.lastInsertRowid, email, fullName });
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    return res.status(500).json({ error: 'Failed to create account.' });
  }
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

app.listen(port, () => {
  console.log(`User API listening on http://localhost:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});
