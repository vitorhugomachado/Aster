import { NextResponse } from 'next/server';
import { requireUser } from '../../lib/auth';
import { audit, db, ensureSchema } from '../../lib/db';
import type { LeadStage } from '../../../lib/opportunities';

const STAGES = new Set<LeadStage>(['novo', 'contatado', 'qualificado', 'proposta', 'ganho', 'perdido']);
function text(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function leadFromRow(row: Record<string, unknown>) {
  return {
    id: String(row.id), city: String(row.city), state: String(row.state), name: row.name ? String(row.name) : undefined,
    street: String(row.street), number: String(row.number), neighborhood: String(row.neighborhood), zip: String(row.zip),
    phone: String(row.phone), email: String(row.email), stage: String(row.stage), source: String(row.source),
    interestedPlan: String(row.interested_plan), notes: String(row.notes), lat: row.lat === null ? undefined : Number(row.lat),
    lng: row.lng === null ? undefined : Number(row.lng), locationQuality: String(row.location_quality),
    nextActionAt: row.next_action_at ? new Date(String(row.next_action_at)).toISOString() : undefined,
    lastContactAt: row.last_contact_at ? new Date(String(row.last_contact_at)).toISOString() : undefined,
    convertedClientId: row.converted_client_id ? String(row.converted_client_id) : undefined,
    metadata: row.metadata ?? {}, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureSchema();
    const city = new URL(request.url).searchParams.get('city')?.slice(0, 90) ?? '';
    const rows = city
      ? await db()`SELECT * FROM aster_leads WHERE owner_id = ${user.id} AND city = ${city} AND deleted_at IS NULL ORDER BY updated_at DESC`
      : await db()`SELECT * FROM aster_leads WHERE owner_id = ${user.id} AND deleted_at IS NULL ORDER BY updated_at DESC`;
    return NextResponse.json({ leads: rows.map((row) => leadFromRow(row as Record<string, unknown>)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ message: 'Não autorizado.' }, { status: error instanceof Response ? error.status : 500 }); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const name = text(body.name, 180);
    const street = text(body.street, 180);
    const addressNumber = text(body.number, 30);
    if (!name && !(street && addressNumber)) return NextResponse.json({ message: 'Informe o nome ou um endereço completo.' }, { status: 400 });
    const id = crypto.randomUUID();
    const stage = STAGES.has(body.stage as LeadStage) ? body.stage as LeadStage : 'novo';
    const lat = number(body.lat); const lng = number(body.lng);
    await ensureSchema();
    const rows = await db()`INSERT INTO aster_leads (
      id, owner_id, city, state, name, street, number, neighborhood, zip, phone, email, stage, source,
      interested_plan, notes, lat, lng, location_quality, next_action_at, metadata
    ) VALUES (
      ${id}, ${user.id}, ${text(body.city, 90)}, ${text(body.state, 2).toUpperCase()}, ${name || null}, ${street}, ${addressNumber},
      ${text(body.neighborhood, 120)}, ${text(body.zip, 12)}, ${text(body.phone, 40)}, ${text(body.email, 180)}, ${stage},
      ${['manual', 'mapa', 'importação'].includes(String(body.source)) ? String(body.source) : 'manual'}, ${text(body.interestedPlan, 120)},
      ${text(body.notes, 4000)}, ${lat}, ${lng}, ${lat !== null && lng !== null ? text(body.locationQuality, 30) || 'informada' : 'pendente'},
      ${body.nextActionAt ? new Date(String(body.nextActionAt)) : null}, ${db().json(JSON.parse(JSON.stringify(typeof body.metadata === 'object' && body.metadata ? body.metadata : {})))}
    ) RETURNING *`;
    await audit(user.id, 'lead.created', 'lead', id, { city: text(body.city, 90), source: body.source });
    return NextResponse.json({ lead: leadFromRow(rows[0] as Record<string, unknown>) }, { status: 201 });
  } catch (error) { return NextResponse.json({ message: error instanceof Response ? 'Não autorizado.' : 'Não foi possível criar o lead.' }, { status: error instanceof Response ? error.status : 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 80);
    const stage = STAGES.has(body.stage as LeadStage) ? body.stage as LeadStage : 'novo';
    const lat = number(body.lat); const lng = number(body.lng);
    const rows = await db()`UPDATE aster_leads SET
      name=${text(body.name, 180) || null}, street=${text(body.street, 180)}, number=${text(body.number, 30)},
      neighborhood=${text(body.neighborhood, 120)}, zip=${text(body.zip, 12)}, phone=${text(body.phone, 40)}, email=${text(body.email, 180)},
      stage=${stage}, interested_plan=${text(body.interestedPlan, 120)}, notes=${text(body.notes, 4000)}, lat=${lat}, lng=${lng},
      location_quality=${lat !== null && lng !== null ? text(body.locationQuality, 30) || 'informada' : 'pendente'},
      next_action_at=${body.nextActionAt ? new Date(String(body.nextActionAt)) : null},
      last_contact_at=${body.lastContactAt ? new Date(String(body.lastContactAt)) : null}, updated_at=now()
      WHERE id=${id} AND owner_id=${user.id} AND deleted_at IS NULL RETURNING *`;
    if (!rows[0]) return NextResponse.json({ message: 'Lead não encontrado.' }, { status: 404 });
    await audit(user.id, 'lead.updated', 'lead', id, { stage });
    return NextResponse.json({ lead: leadFromRow(rows[0] as Record<string, unknown>) });
  } catch (error) { return NextResponse.json({ message: 'Não foi possível atualizar o lead.' }, { status: error instanceof Response ? error.status : 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const id = new URL(request.url).searchParams.get('id')?.slice(0, 80) ?? '';
    await db()`UPDATE aster_leads SET deleted_at=now(), updated_at=now() WHERE id=${id} AND owner_id=${user.id}`;
    await audit(user.id, 'lead.deleted', 'lead', id);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ message: 'Não foi possível excluir o lead.' }, { status: error instanceof Response ? error.status : 500 }); }
}
