export function getPostgresConnectionString() {
  return String(process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
}

export function isPostgresConfigured() {
  return Boolean(getPostgresConnectionString());
}
