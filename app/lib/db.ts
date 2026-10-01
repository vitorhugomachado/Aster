import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type SqlClient = ReturnType<typeof postgres>;

let client: SqlClient | null = null;
let schemaPromise: Promise<void> | null = null;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function db() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL não configurada.');
  if (!client) {
    const options = {
      max: process.env.VERCEL ? 2 : 4,
      max_pipeline: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ...(connectionString.includes('.supabase.com') || connectionString.includes('.railway.internal') ? { ssl: 'require' as const } : {}),
    };
    client = postgres(connectionString, options);
  }
  return client;
}

export async function ensureSchema() {
  if (!databaseConfigured()) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = db();
    const tables = await sql`SELECT to_regclass('public.aster_schema_versions') AS name`;
    if (tables[0]?.name) {
      const versions = await sql`SELECT 1 FROM aster_schema_versions WHERE version = '202610010001'`;
      if (versions.length) return;
    }
    const migration = await readFile(join(process.cwd(), 'supabase/migrations/202610010001_aster.sql'), 'utf8');
    await sql.begin(async (tx) => {
      await tx`SET LOCAL search_path TO public`;
      await tx`SELECT pg_advisory_xact_lock(194782301)`;
      await tx.unsafe(migration);
    });
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function audit(ownerId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  await ensureSchema();
  await db()`INSERT INTO aster_audit_events (id, owner_id, action, entity_type, entity_id, details)
    VALUES (${crypto.randomUUID()}, ${ownerId}, ${action}, ${entityType}, ${entityId}, ${db().json(JSON.parse(JSON.stringify(details)))})`;
}

export async function consumeUsage(ownerId: string, bucket: string, limit: number) {
  await ensureSchema();
  const rows = await db()`INSERT INTO aster_api_usage (owner_id, bucket, window_start, count)
    VALUES (${ownerId}, ${bucket}, date_trunc('minute', now()), 1)
    ON CONFLICT (owner_id, bucket, window_start) DO UPDATE SET count = aster_api_usage.count + 1
    RETURNING count`;
  return Number(rows[0]?.count ?? 1) <= limit;
}

export async function consumeLoginAttempt(attemptKey: string, limit = 8) {
  await ensureSchema();
  const rows = await db()`INSERT INTO aster_login_attempts (attempt_key, window_start, count)
    VALUES (${attemptKey}, date_trunc('minute', now()), 1)
    ON CONFLICT (attempt_key, window_start) DO UPDATE SET count = aster_login_attempts.count + 1
    RETURNING count`;
  return Number(rows[0]?.count ?? 1) <= limit;
}



