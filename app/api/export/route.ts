import { NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth';
import { audit, db, ensureSchema } from '../../lib/db';

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const sql = db();
    const [clients, cities, imports, groups, leads, activities, routes, stops] = await Promise.all([
      sql`SELECT data FROM aster_clients WHERE owner_id=${user.id} AND deleted_at IS NULL ORDER BY created_at`,
      sql`SELECT data FROM aster_cities WHERE owner_id=${user.id} AND deleted_at IS NULL ORDER BY name`,
      sql`SELECT data FROM aster_import_batches WHERE owner_id=${user.id} AND deleted_at IS NULL ORDER BY imported_at DESC`,
      sql`SELECT data FROM aster_rural_groups WHERE owner_id=${user.id} AND deleted_at IS NULL ORDER BY name`,
      sql`SELECT * FROM aster_leads WHERE owner_id=${user.id} AND deleted_at IS NULL ORDER BY created_at`,
      sql`SELECT * FROM aster_activities WHERE owner_id=${user.id} ORDER BY created_at`,
      sql`SELECT * FROM aster_visit_routes WHERE owner_id=${user.id} ORDER BY created_at`,
      sql`SELECT s.* FROM aster_visit_route_stops s JOIN aster_visit_routes r ON r.id=s.route_id WHERE r.owner_id=${user.id} ORDER BY s.route_id, s.position`,
    ]);
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    await audit(user.id, 'workspace.exported', 'workspace', user.id, { format });
    if (format === 'csv') {
      const rows = leads as Array<Record<string, unknown>>;
      const columns = ['id', 'name', 'stage', 'city', 'state', 'street', 'number', 'neighborhood', 'zip', 'phone', 'email', 'interested_plan', 'notes', 'lat', 'lng', 'location_quality', 'next_action_at', 'created_at'];
      const csv = `\uFEFF${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}`;
      return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aster-oportunidades-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      clients: clients.map((row) => row.data), cities: cities.map((row) => row.data), imports: imports.map((row) => row.data), groups: groups.map((row) => row.data),
      leads, activities, routes, routeStops: stops,
    }, { headers: { 'Content-Disposition': `attachment; filename="aster-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível exportar os dados.' }, { status: error instanceof Response ? error.status : 500 });
  }
}
