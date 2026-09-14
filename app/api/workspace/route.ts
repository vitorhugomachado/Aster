import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth';
import { audit, db, ensureSchema } from '../../lib/db';

interface WorkspacePayload {
  city?: string;
  clients?: Array<Record<string, unknown>>;
  cityProfiles?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  ruralGroups?: Array<Record<string, unknown>>;
  checksum?: string;
  sync?: boolean;
}

function text(value: unknown, max = 180) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function checksum(payload: WorkspacePayload) {
  return payload.checksum || createHash('sha256').update(JSON.stringify({
    clients: payload.clients ?? [], cityProfiles: payload.cityProfiles ?? [], history: payload.history ?? [], ruralGroups: payload.ruralGroups ?? [],
  })).digest('hex');
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const sql = db();
    const [clients, cities, imports, groups] = await Promise.all([
      sql`SELECT data FROM aster_clients WHERE owner_id = ${user.id} AND deleted_at IS NULL ORDER BY created_at`,
      sql`SELECT data FROM aster_cities WHERE owner_id = ${user.id} AND deleted_at IS NULL ORDER BY name`,
      sql`SELECT data FROM aster_import_batches WHERE owner_id = ${user.id} AND deleted_at IS NULL ORDER BY imported_at DESC`,
      sql`SELECT data FROM aster_rural_groups WHERE owner_id = ${user.id} AND deleted_at IS NULL ORDER BY name`,
    ]);
    return NextResponse.json({
      clients: clients.map((row) => row.data),
      cityProfiles: cities.map((row) => row.data),
      history: imports.map((row) => row.data),
      ruralGroups: groups.map((row) => row.data),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Response ? error.status : 500;
    return NextResponse.json({ message: status === 401 ? 'Não autorizado.' : 'Não foi possível carregar a base.' }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as WorkspacePayload;
    const clients = Array.isArray(body.clients) ? body.clients.slice(0, 100_000) : [];
    const cityProfiles = Array.isArray(body.cityProfiles) ? body.cityProfiles.slice(0, 399) : [];
    const history = Array.isArray(body.history) ? body.history.slice(0, 10_000) : [];
    const ruralGroups = Array.isArray(body.ruralGroups) ? body.ruralGroups.slice(0, 10_000) : [];
    const migrationChecksum = checksum(body);
    await ensureSchema();
    const sql = db();
    const existing = await sql`SELECT 1 FROM aster_workspace_migrations WHERE owner_id = ${user.id} AND checksum = ${migrationChecksum}`;
    if (existing.length) return NextResponse.json({ ok: true, duplicate: true, checksum: migrationChecksum });

    await sql.begin(async (tx) => {
      if (body.sync === true) {
        await tx`UPDATE aster_clients SET deleted_at = now(), updated_at = now() WHERE owner_id = ${user.id} AND deleted_at IS NULL`;
        await tx`UPDATE aster_cities SET deleted_at = now(), updated_at = now() WHERE owner_id = ${user.id} AND deleted_at IS NULL`;
        await tx`UPDATE aster_import_batches SET deleted_at = now(), updated_at = now() WHERE owner_id = ${user.id} AND deleted_at IS NULL`;
        await tx`UPDATE aster_rural_groups SET deleted_at = now(), updated_at = now() WHERE owner_id = ${user.id} AND deleted_at IS NULL`;
      }
      for (const city of cityProfiles) {
        const name = text(city.name, 90);
        const state = text(city.state, 2).toUpperCase();
        if (!name || !state) continue;
        const id = `${user.id}:${state}:${text(city.ibgeId || name, 100)}`;
        await tx`INSERT INTO aster_cities (id, owner_id, name, state, data)
          VALUES (${id}, ${user.id}, ${name}, ${state}, ${tx.json(JSON.parse(JSON.stringify(city)))})
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, name = excluded.name, state = excluded.state, deleted_at = NULL, updated_at = now()`;
      }
      for (const batch of history) {
        const id = text(batch.id, 200);
        if (!id) continue;
        const importedAt = new Date(text(batch.importedAt, 80) || Date.now());
        await tx`INSERT INTO aster_import_batches (id, owner_id, city, imported_at, data)
          VALUES (${id}, ${user.id}, ${text(batch.city, 90)}, ${importedAt}, ${tx.json(JSON.parse(JSON.stringify(batch)))})
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, city = excluded.city, imported_at = excluded.imported_at, deleted_at = NULL, updated_at = now()`;
      }
      for (const client of clients) {
        const id = text(client.id, 240);
        if (!id) continue;
        const lat = typeof client.lat === 'number' && Number.isFinite(client.lat) ? client.lat : null;
        const lng = typeof client.lng === 'number' && Number.isFinite(client.lng) ? client.lng : null;
        await tx`INSERT INTO aster_clients (id, owner_id, city, import_batch_id, name, lat, lng, data)
          VALUES (${id}, ${user.id}, ${text(client.city, 90)}, ${text(client.importBatchId, 200) || null}, ${text(client.name, 180) || 'Cliente'}, ${lat}, ${lng}, ${tx.json(JSON.parse(JSON.stringify(client)))})
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, city = excluded.city, import_batch_id = excluded.import_batch_id,
            name = excluded.name, lat = excluded.lat, lng = excluded.lng, deleted_at = NULL, updated_at = now()`;
      }
      for (const group of ruralGroups) {
        const id = text(group.id, 200);
        if (!id) continue;
        await tx`INSERT INTO aster_rural_groups (id, owner_id, city, name, data)
          VALUES (${id}, ${user.id}, ${text(group.city, 90)}, ${text(group.name, 180) || 'Grupo rural'}, ${tx.json(JSON.parse(JSON.stringify(group)))})
          ON CONFLICT (id) DO UPDATE SET data = excluded.data, city = excluded.city, name = excluded.name, deleted_at = NULL, updated_at = now()`;
      }
      await tx`INSERT INTO aster_workspace_migrations (owner_id, checksum, counts)
        VALUES (${user.id}, ${migrationChecksum}, ${tx.json({ clients: clients.length, cities: cityProfiles.length, imports: history.length, groups: ruralGroups.length })})`;
    });
    await audit(user.id, 'workspace.migrated', 'workspace', user.id, { checksum: migrationChecksum, clients: clients.length });
    return NextResponse.json({ ok: true, checksum: migrationChecksum, counts: { clients: clients.length, cities: cityProfiles.length, imports: history.length, groups: ruralGroups.length } });
  } catch (error) {
    const status = error instanceof Response ? error.status : 500;
    return NextResponse.json({ message: status === 401 ? 'Não autorizado.' : 'Não foi possível salvar a base.' }, { status });
  }
}
