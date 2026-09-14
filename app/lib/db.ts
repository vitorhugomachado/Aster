import postgres from 'postgres';

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
    client = postgres(connectionString, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return client;
}

export async function ensureSchema() {
  if (!databaseConfigured()) return;
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS aster_users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      name text NOT NULL DEFAULT 'Administrador',
      must_change_password boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_cities (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      name text NOT NULL,
      state text NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_cities_owner_idx ON aster_cities(owner_id, state, name)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_import_batches (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      imported_at timestamptz NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_imports_owner_idx ON aster_import_batches(owner_id, city, imported_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_clients (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      import_batch_id text,
      name text NOT NULL,
      lat double precision,
      lng double precision,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_clients_owner_city_idx ON aster_clients(owner_id, city)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_rural_groups (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      name text NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_groups_owner_city_idx ON aster_rural_groups(owner_id, city)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_leads (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      state text NOT NULL,
      name text,
      street text NOT NULL DEFAULT '',
      number text NOT NULL DEFAULT '',
      neighborhood text NOT NULL DEFAULT '',
      zip text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      stage text NOT NULL DEFAULT 'novo',
      source text NOT NULL DEFAULT 'manual',
      interested_plan text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      lat double precision,
      lng double precision,
      location_quality text NOT NULL DEFAULT 'pendente',
      next_action_at timestamptz,
      last_contact_at timestamptz,
      converted_client_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_leads_owner_city_idx ON aster_leads(owner_id, city, stage)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_activities (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      kind text NOT NULL,
      note text NOT NULL DEFAULT '',
      scheduled_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS aster_activities_entity_idx ON aster_activities(owner_id, entity_type, entity_id, created_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS aster_visit_routes (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'planejada',
      origin_lat double precision NOT NULL,
      origin_lng double precision NOT NULL,
      return_to_origin boolean NOT NULL DEFAULT false,
      distance_meters integer,
      duration_seconds integer,
      encoded_polyline text,
      route_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_visit_route_stops (
      id uuid PRIMARY KEY,
      route_id uuid NOT NULL REFERENCES aster_visit_routes(id) ON DELETE CASCADE,
      lead_id uuid NOT NULL REFERENCES aster_leads(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL DEFAULT 'pendente',
      note text NOT NULL DEFAULT '',
      visited_at timestamptz,
      UNIQUE(route_id, lead_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_geocode_jobs (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      status text NOT NULL DEFAULT 'pendente',
      attempts integer NOT NULL DEFAULT 0,
      payload jsonb NOT NULL,
      result jsonb,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_audit_events (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_api_usage (
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      bucket text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY(owner_id, bucket, window_start)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_login_attempts (
      attempt_key text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY(attempt_key, window_start)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS aster_workspace_migrations (
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      checksum text NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      counts jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(owner_id, checksum)
    )`;
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
