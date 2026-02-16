import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { getPostgresConnectionString } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL (or POSTGRES_URL) is required to initialize Postgres schema.');
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const pool = new Pool({ connectionString, ssl: parseSslMode() });

  try {
    await pool.query(sql);
    console.log('Postgres schema initialized.');
  } finally {
    await pool.end();
  }
}

function parseSslMode() {
  const mode = String(process.env.PGSSLMODE || '').toLowerCase();
  if (!mode || mode === 'disable') {
    return undefined;
  }
  if (mode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
