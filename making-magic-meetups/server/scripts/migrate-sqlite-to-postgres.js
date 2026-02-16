import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { getPostgresConnectionString } from '../db/postgres/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');
const defaultSqlitePath = path.join(rootDir, 'data', 'users.db');

const sqlitePath = String(process.env.SQLITE_PATH || defaultSqlitePath).trim();
const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function copyRows(client, tableName, columns, rows, mapRow = (row) => row) {
  if (!rows.length) {
    console.log(`[skip] ${tableName}: 0 rows`);
    return 0;
  }

  const valuesPerRow = columns.length;
  let copied = 0;

  for (const part of chunk(rows, 200)) {
    const mapped = part.map(mapRow);
    const params = [];
    const valueGroups = mapped.map((row, rowIndex) => {
      const placeholders = columns.map((_, colIndex) => `$${rowIndex * valuesPerRow + colIndex + 1}`);
      for (const column of columns) {
        params.push(row[column]);
      }
      return `(${placeholders.join(', ')})`;
    });

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${valueGroups.join(', ')}
      ON CONFLICT DO NOTHING
    `;
    await client.query(sql, params);
    copied += mapped.length;
  }

  console.log(`[ok] ${tableName}: ${copied} rows`);
  return copied;
}

async function run() {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL (or POSTGRES_URL) is required for migration.');
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({
    connectionString,
    ssl: parseSslMode()
  });

  const accountIdMap = new Map();

  try {
    const users = sqlite.prepare('SELECT id, email, created_at FROM users').all();
    const accounts = sqlite
      .prepare(
        `SELECT
           id,
           username,
           full_name,
           email,
           password_hash,
           password_plain,
           preferred_store_place_id,
           preferred_store_name,
           preferred_store_address,
           preferred_store_url,
           preferred_store_website,
           preferred_store_phone,
           created_at
         FROM accounts`
      )
      .all();
    const resetTokens = sqlite
      .prepare(
        `SELECT id, account_id, token_hash, request_ip, expires_at, used_at, created_at
         FROM password_reset_tokens`
      )
      .all();
    const resetEvents = sqlite
      .prepare(
        `SELECT id, account_id, identifier, request_ip, event_type, detail, created_at
         FROM password_reset_events`
      )
      .all();
    const myCards = sqlite
      .prepare(
        `SELECT
           id,
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
           image_normal_back,
           created_at,
           updated_at
         FROM my_cards`
      )
      .all();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (dryRun) {
        console.log('DRY_RUN=true set; rolling back after validation pass.');
      }

      await copyRows(client, 'users', ['email', 'created_at'], users, (row) => ({
        email: row.email,
        created_at: row.created_at
      }));

      for (const account of accounts) {
        const result = await client.query(
          `
            INSERT INTO accounts (
              username,
              full_name,
              email,
              password_hash,
              password_plain,
              preferred_store_place_id,
              preferred_store_name,
              preferred_store_address,
              preferred_store_url,
              preferred_store_website,
              preferred_store_phone,
              created_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            ON CONFLICT (email) DO UPDATE SET
              username = EXCLUDED.username,
              full_name = EXCLUDED.full_name,
              password_hash = EXCLUDED.password_hash,
              password_plain = EXCLUDED.password_plain,
              preferred_store_place_id = EXCLUDED.preferred_store_place_id,
              preferred_store_name = EXCLUDED.preferred_store_name,
              preferred_store_address = EXCLUDED.preferred_store_address,
              preferred_store_url = EXCLUDED.preferred_store_url,
              preferred_store_website = EXCLUDED.preferred_store_website,
              preferred_store_phone = EXCLUDED.preferred_store_phone
            RETURNING id
          `,
          [
            account.username,
            account.full_name,
            account.email,
            account.password_hash,
            account.password_plain,
            account.preferred_store_place_id,
            account.preferred_store_name,
            account.preferred_store_address,
            account.preferred_store_url,
            account.preferred_store_website,
            account.preferred_store_phone,
            account.created_at
          ]
        );
        accountIdMap.set(account.id, result.rows[0]?.id);
      }
      console.log(`[ok] accounts: ${accounts.length} rows`);

      await copyRows(
        client,
        'password_reset_tokens',
        ['account_id', 'token_hash', 'request_ip', 'expires_at', 'used_at', 'created_at'],
        resetTokens,
        (row) => ({
          account_id: accountIdMap.get(row.account_id) || null,
          token_hash: row.token_hash,
          request_ip: row.request_ip,
          expires_at: row.expires_at,
          used_at: row.used_at,
          created_at: row.created_at
        })
      );

      await copyRows(
        client,
        'password_reset_events',
        ['account_id', 'identifier', 'request_ip', 'event_type', 'detail', 'created_at'],
        resetEvents,
        (row) => ({
          account_id: row.account_id ? accountIdMap.get(row.account_id) || null : null,
          identifier: row.identifier,
          request_ip: row.request_ip,
          event_type: row.event_type,
          detail: row.detail,
          created_at: row.created_at
        })
      );

      await copyRows(
        client,
        'my_cards',
        [
          'account_id',
          'card_name',
          'quantity',
          'requesting',
          'asking_quantity',
          'asking_price_cents',
          'scryfall_id',
          'set_code',
          'set_name',
          'collector_number',
          'image_small',
          'image_normal',
          'image_small_back',
          'image_normal_back',
          'created_at',
          'updated_at'
        ],
        myCards,
        (row) => ({
          account_id: accountIdMap.get(row.account_id) || null,
          card_name: row.card_name,
          quantity: row.quantity,
          requesting: row.requesting,
          asking_quantity: row.asking_quantity,
          asking_price_cents: row.asking_price_cents,
          scryfall_id: row.scryfall_id,
          set_code: row.set_code,
          set_name: row.set_name,
          collector_number: row.collector_number,
          image_small: row.image_small,
          image_normal: row.image_normal,
          image_small_back: row.image_small_back,
          image_normal_back: row.image_normal_back,
          created_at: row.created_at,
          updated_at: row.updated_at
        })
      );

      await client.query(`
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
          image_normal,
          created_at,
          updated_at
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
          image_normal,
          created_at,
          updated_at
        FROM my_cards
        ON CONFLICT (account_id, card_name) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          asking_quantity = EXCLUDED.asking_quantity,
          asking_price_cents = EXCLUDED.asking_price_cents,
          scryfall_id = EXCLUDED.scryfall_id,
          set_code = EXCLUDED.set_code,
          set_name = EXCLUDED.set_name,
          collector_number = EXCLUDED.collector_number,
          image_small = EXCLUDED.image_small,
          image_normal = EXCLUDED.image_normal,
          updated_at = EXCLUDED.updated_at
      `);
      console.log('[ok] account_card_items mirrored from my_cards');

      if (dryRun) {
        await client.query('ROLLBACK');
        console.log('Dry run complete (transaction rolled back).');
      } else {
        await client.query('COMMIT');
        console.log('Migration complete.');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
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
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
