import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'users.db');

fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
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
  db.exec(`ALTER TABLE accounts ADD COLUMN password_plain TEXT`);
} catch (_error) {
  // Column already exists; ignore migration error.
}

const fakeAccounts = [
  {
    username: 'neo_trade',
    fullName: 'Neo Trader',
    email: 'neo.trade@example.com',
    password: 'trade1234'
  },
  {
    username: 'manafox',
    fullName: 'Mana Fox',
    email: 'mana.fox@example.com',
    password: 'mana5678'
  },
  {
    username: 'cardbyte',
    fullName: 'Card Byte',
    email: 'card.byte@example.com',
    password: 'deck9012'
  },
  {
    username: 'tapland',
    fullName: 'Tap Land',
    email: 'tap.land@example.com',
    password: 'tapland10'
  },
  {
    username: 'swampcat',
    fullName: 'Swamp Cat',
    email: 'swamp.cat@example.com',
    password: 'catmana77'
  }
];

const insertAccount = db.prepare(`
  INSERT OR IGNORE INTO accounts (username, full_name, email, password_hash, password_plain)
  VALUES (?, ?, ?, ?, ?)
`);
const countAccounts = db.prepare('SELECT COUNT(*) AS count FROM accounts');

const beforeCount = countAccounts.get().count;
const insertMany = db.transaction((accounts) => {
  for (const account of accounts) {
    if (!account.password || account.password.length > 10) {
      throw new Error(`Invalid password length for ${account.username}`);
    }
    const passwordHash = crypto.createHash('sha256').update(account.password).digest('hex');
    insertAccount.run(
      account.username,
      account.fullName,
      account.email,
      passwordHash,
      account.password
    );
  }
});

insertMany(fakeAccounts);

const afterCount = countAccounts.get().count;
const addedCount = afterCount - beforeCount;

console.log(`Production account seed complete: ${addedCount} added, ${afterCount} total accounts`);
console.log(`DB path: ${dbPath}`);
