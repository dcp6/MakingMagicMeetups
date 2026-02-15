import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'users.db');

fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const mockUsers = [
  'ava.turner@example.com',
  'liam.brooks@example.com',
  'mia.ross@example.com',
  'noah.kim@example.com',
  'zoe.patel@example.com',
  'ethan.rivera@example.com',
  'nora.bennett@example.com',
  'oliver.reed@example.com',
  'luna.garcia@example.com',
  'jackson.hughes@example.com',
  'ella.ward@example.com',
  'leo.flores@example.com',
  'chloe.perry@example.com',
  'henry.price@example.com',
  'grace.kelly@example.com'
];

const insertUser = db.prepare('INSERT OR IGNORE INTO users (email) VALUES (?)');
const countUsers = db.prepare('SELECT COUNT(*) AS count FROM users');

const beforeCount = countUsers.get().count;
const insertMany = db.transaction((emails) => {
  for (const email of emails) {
    insertUser.run(email);
  }
});

insertMany(mockUsers);

const afterCount = countUsers.get().count;
const addedCount = afterCount - beforeCount;

console.log(`Mock users seeded: ${addedCount} added, ${afterCount} total`);
console.log(`DB path: ${dbPath}`);
