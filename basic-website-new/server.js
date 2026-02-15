const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SEED_USERNAME = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const ADMIN_SEED_PASSWORD = process.env.ADMIN_PASSWORD || 'test123';
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 8;
const adminSessions = new Map();

const dbPath = path.join(__dirname, 'users.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(__dirname));

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureUserSchema() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  const hasUsername = columns.some((column) => column.name === 'username');
  const hasRole = columns.some((column) => column.name === 'role');

  if (!hasUsername) {
    db.exec(`ALTER TABLE users ADD COLUMN username TEXT`);
  }
  if (!hasRole) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT`);
  }

  db.exec(`UPDATE users SET role = 'user' WHERE role IS NULL OR TRIM(role) = ''`);

  const taken = new Set(
    db
      .prepare(`SELECT LOWER(username) AS username FROM users WHERE username IS NOT NULL`)
      .all()
      .map((row) => row.username)
  );

  const rows = db
    .prepare(`SELECT id, email, username FROM users ORDER BY id ASC`)
    .all();

  const updateUsername = db.prepare(`UPDATE users SET username = ? WHERE id = ?`);
  for (const row of rows) {
    if (row.username && String(row.username).trim()) continue;

    let base = normalizeUsername(String(row.email || '').split('@')[0]) || `user${row.id}`;
    let candidate = base;
    let suffix = 1;
    while (taken.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    taken.add(candidate);
    updateUsername.run(candidate, row.id);
  }

  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username COLLATE NOCASE)`
  );
}

function ensureAdminUser() {
  const adminUser = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = ?')
    .get(ADMIN_SEED_USERNAME);

  if (!adminUser) {
    db.prepare(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'Admin',
      ADMIN_SEED_USERNAME,
      `${ADMIN_SEED_USERNAME}@local.user`,
      hashPassword(ADMIN_SEED_PASSWORD),
      'admin'
    );
    return;
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', adminUser.id);
}

ensureUserSchema();
ensureAdminUser();

function issueAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
  return token;
}

function isAdminTokenValid(token) {
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = req.headers['x-admin-token'];
  const token = bearer || headerToken;

  if (!isAdminTokenValid(token)) {
    return res.status(403).json({ error: 'admin authorization required' });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function handleCreateUser(req, res) {
  const { name, username, password } = req.body || {};

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'name, username, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  if (password.length > 12) {
    return res.status(400).json({ error: 'password must be at most 12 characters' });
  }

  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) {
    return res.status(400).json({ error: 'username must contain letters, numbers, or underscores' });
  }

  const syntheticEmail = `${cleanUsername}@local.user`;
  const cleanName = String(name).trim();

  try {
    const insert = db.prepare(
      'INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    );
    const result = insert.run(
      cleanName,
      cleanUsername,
      syntheticEmail,
      hashPassword(password),
      'user'
    );

    return res.status(201).json({
      id: result.lastInsertRowid,
      name: cleanName,
      username: cleanUsername
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'username already exists' });
    }
    return res.status(500).json({ error: 'failed to register user' });
  }
}

app.post('/api/users/register', handleCreateUser);
app.post('/api/users/add', handleCreateUser);

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const cleanUsername = normalizeUsername(username);
  const user = db
    .prepare(
      'SELECT id, name, username, role, password_hash FROM users WHERE LOWER(username) = ?'
    )
    .get(cleanUsername);

  if (!user) {
    return res.status(401).json({ error: 'Invalid Username' });
  }

  if (user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Incorrect Password' });
  }

  return res.json({
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = String(username || '').trim().toLowerCase();

  if (!cleanUsername || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const adminUser = db
    .prepare(
      'SELECT id, username, role, password_hash FROM users WHERE LOWER(username) = ?'
    )
    .get(cleanUsername);

  if (!adminUser || adminUser.role !== 'admin') {
    return res.status(401).json({ error: 'invalid admin credentials' });
  }

  if (adminUser.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'invalid admin credentials' });
  }

  return res.json({ token: issueAdminToken() });
});

app.get('/api/users', requireAdmin, (_req, res) => {
  const users = db
    .prepare(
      'SELECT id, name, username, role, email, password_hash, created_at FROM users ORDER BY id DESC'
    )
    .all();

  return res.json(users);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
