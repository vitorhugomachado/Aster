import { NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth';
import { audit, db, ensureSchema } from '../../lib/db';

function text(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const url = new URL(request.url);
    const entityType = text(url.searchParams.get('entityType'), 40);
    const entityId = text(url.searchParams.get('entityId'), 100);
    const rows = entityType && entityId
      ? await db()`SELECT * FROM aster_activities WHERE owner_id=${user.id} AND entity_type=${entityType} AND entity_id=${entityId} ORDER BY created_at DESC LIMIT 250`
      : await db()`SELECT * FROM aster_activities WHERE owner_id=${user.id} ORDER BY created_at DESC LIMIT 250`;
    return NextResponse.json({ activities: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível carregar as atividades.' }, { status: error instanceof Response ? error.status : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const entityType = text(body.entityType, 40);
    const entityId = text(body.entityId, 100);
    const kind = text(body.kind, 50);
    if (!entityType || !entityId || !kind) return NextResponse.json({ message: 'Entidade e tipo da atividade são obrigatórios.' }, { status: 400 });
    const id = crypto.randomUUID();
    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    await ensureSchema();
    const rows = await db()`INSERT INTO aster_activities (id, owner_id, entity_type, entity_id, kind, note, scheduled_at)
      VALUES (${id}, ${user.id}, ${entityType}, ${entityId}, ${kind}, ${text(body.note, 4000)}, ${scheduledAt}) RETURNING *`;
    await audit(user.id, 'activity.created', entityType, entityId, { activityId: id, kind });
    return NextResponse.json({ activity: rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível salvar a atividade.' }, { status: error instanceof Response ? error.status : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 100);
    const rows = await db()`UPDATE aster_activities SET completed_at=${body.completed ? new Date() : null}, note=${text(body.note, 4000)}
      WHERE id=${id} AND owner_id=${user.id} RETURNING *`;
    if (!rows[0]) return NextResponse.json({ message: 'Atividade não encontrada.' }, { status: 404 });
    await audit(user.id, 'activity.updated', 'activity', id, { completed: Boolean(body.completed) });
    return NextResponse.json({ activity: rows[0] });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível atualizar a atividade.' }, { status: error instanceof Response ? error.status : 500 });
  }
}
