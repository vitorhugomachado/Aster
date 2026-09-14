import { NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth';
import { audit, db, ensureSchema } from '../../lib/db';

const STATUSES = new Set(['planejada', 'em_andamento', 'concluida', 'cancelada']);

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const city = new URL(request.url).searchParams.get('city')?.trim().slice(0, 90) ?? '';
    const routes = city
      ? await db()`SELECT * FROM aster_visit_routes WHERE owner_id=${user.id} AND city=${city} ORDER BY created_at DESC LIMIT 100`
      : await db()`SELECT * FROM aster_visit_routes WHERE owner_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
    const ids = routes.map((route) => route.id);
    const stops = ids.length
      ? await db()`SELECT s.*, l.name AS lead_name, l.lat, l.lng FROM aster_visit_route_stops s JOIN aster_leads l ON l.id=s.lead_id WHERE s.route_id IN ${db()(ids)} ORDER BY s.position`
      : [];
    return NextResponse.json({ routes: routes.map((route) => ({ ...route, stops: stops.filter((stop) => stop.route_id === route.id) })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível carregar as rotas.' }, { status: error instanceof Response ? error.status : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.slice(0, 100) : '';
    const status = typeof body.status === 'string' && STATUSES.has(body.status) ? body.status : '';
    if (!id || !status) return NextResponse.json({ message: 'Rota e status válidos são obrigatórios.' }, { status: 400 });
    const rows = await db()`UPDATE aster_visit_routes SET status=${status}, updated_at=now() WHERE id=${id} AND owner_id=${user.id} RETURNING *`;
    if (!rows[0]) return NextResponse.json({ message: 'Rota não encontrada.' }, { status: 404 });
    await audit(user.id, 'route.updated', 'visit_route', id, { status });
    return NextResponse.json({ route: rows[0] });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível atualizar a rota.' }, { status: error instanceof Response ? error.status : 500 });
  }
}
