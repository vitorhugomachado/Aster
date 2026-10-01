CREATE TABLE IF NOT EXISTS aster_users (
      id uuid PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      name text NOT NULL DEFAULT 'Administrador',
      must_change_password boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS aster_sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS aster_cities (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      name text NOT NULL,
      state text NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS aster_cities_owner_idx ON aster_cities(owner_id, state, name);

CREATE TABLE IF NOT EXISTS aster_import_batches (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      imported_at timestamptz NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS aster_imports_owner_idx ON aster_import_batches(owner_id, city, imported_at DESC);

CREATE TABLE IF NOT EXISTS aster_clients (
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
    );

CREATE INDEX IF NOT EXISTS aster_clients_owner_city_idx ON aster_clients(owner_id, city);

CREATE TABLE IF NOT EXISTS aster_rural_groups (
      id text PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      city text NOT NULL,
      name text NOT NULL,
      data jsonb NOT NULL,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS aster_groups_owner_city_idx ON aster_rural_groups(owner_id, city);

CREATE TABLE IF NOT EXISTS aster_leads (
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
    );

CREATE INDEX IF NOT EXISTS aster_leads_owner_city_idx ON aster_leads(owner_id, city, stage);

CREATE TABLE IF NOT EXISTS aster_activities (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      kind text NOT NULL,
      note text NOT NULL DEFAULT '',
      scheduled_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS aster_activities_entity_idx ON aster_activities(owner_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aster_visit_routes (
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
    );

CREATE TABLE IF NOT EXISTS aster_visit_route_stops (
      id uuid PRIMARY KEY,
      route_id uuid NOT NULL REFERENCES aster_visit_routes(id) ON DELETE CASCADE,
      lead_id uuid NOT NULL REFERENCES aster_leads(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL DEFAULT 'pendente',
      note text NOT NULL DEFAULT '',
      visited_at timestamptz,
      UNIQUE(route_id, lead_id)
    );

CREATE TABLE IF NOT EXISTS aster_geocode_jobs (
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
    );

CREATE TABLE IF NOT EXISTS aster_audit_events (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS aster_api_usage (
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      bucket text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY(owner_id, bucket, window_start)
    );

CREATE TABLE IF NOT EXISTS aster_login_attempts (
      attempt_key text NOT NULL,
      window_start timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0,
      PRIMARY KEY(attempt_key, window_start)
    );

CREATE TABLE IF NOT EXISTS aster_workspace_migrations (
      owner_id uuid NOT NULL REFERENCES aster_users(id) ON DELETE CASCADE,
      checksum text NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      counts jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY(owner_id, checksum)
    );
ALTER TABLE public.aster_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_users FROM anon, authenticated;

ALTER TABLE public.aster_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_sessions FROM anon, authenticated;

ALTER TABLE public.aster_cities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_cities FROM anon, authenticated;

ALTER TABLE public.aster_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_import_batches FROM anon, authenticated;

ALTER TABLE public.aster_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_clients FROM anon, authenticated;

ALTER TABLE public.aster_rural_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_rural_groups FROM anon, authenticated;

ALTER TABLE public.aster_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_leads FROM anon, authenticated;

ALTER TABLE public.aster_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_activities FROM anon, authenticated;

ALTER TABLE public.aster_visit_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_visit_routes FROM anon, authenticated;

ALTER TABLE public.aster_visit_route_stops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_visit_route_stops FROM anon, authenticated;

ALTER TABLE public.aster_geocode_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_geocode_jobs FROM anon, authenticated;

ALTER TABLE public.aster_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_audit_events FROM anon, authenticated;

ALTER TABLE public.aster_api_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_api_usage FROM anon, authenticated;

ALTER TABLE public.aster_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_login_attempts FROM anon, authenticated;

ALTER TABLE public.aster_workspace_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aster_workspace_migrations FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS aster_sessions_expiry_idx ON aster_sessions(expires_at);
CREATE INDEX IF NOT EXISTS aster_audit_owner_time_idx ON aster_audit_events(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS aster_schema_versions (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE aster_schema_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE aster_schema_versions FROM anon, authenticated;
INSERT INTO aster_schema_versions(version) VALUES ('202610010001') ON CONFLICT DO NOTHING;