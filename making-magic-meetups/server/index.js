import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

app.get('/api/users', (_req, res) => {
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
