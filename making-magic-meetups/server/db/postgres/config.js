export function getPostgresConnectionString() {
  return String(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    ''
  ).trim();
}

export function isPostgresConfigured() {
  return Boolean(getPostgresConnectionString());
}
