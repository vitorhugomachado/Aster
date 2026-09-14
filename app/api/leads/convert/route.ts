import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/auth';
import { audit, db, ensureSchema } from '../../../lib/db';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await request.json() as { id?: string; status?: string; plan?: string };
    const id = typeof body.id === 'string' ? body.id.slice(0, 80) : '';
    await ensureSchema();
    const sql = db();
    const rows = await sql`SELECT * FROM aster_leads WHERE id=${id} AND owner_id=${user.id} AND deleted_at IS NULL LIMIT 1`;
    const lead = rows[0];
    if (!lead) return NextResponse.json({ message: 'Lead não encontrado.' }, { status: 404 });
    if (lead.converted_client_id) return NextResponse.json({ message: 'Este lead já foi convertido.', clientId: lead.converted_client_id }, { status: 409 });
    const clientId = `lead-${id}`;
    const client = {
      id: clientId,
      externalId: undefined,
      name: lead.name || `Cliente — ${lead.street}, ${lead.number}`,
      street: lead.street,
      number: lead.number,
      complement: '',
      neighborhood: lead.neighborhood,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      status: body.status || 'Ativo',
      plan: body.plan || lead.interested_plan || 'Não informado',
      phone: lead.phone,
      email: lead.email,
      lat: lead.lat === null ? undefined : Number(lead.lat),
      lng: lead.lng === null ? undefined : Number(lead.lng),
      locationQuality: lead.location_quality,
      source: 'manual',
      leadOriginId: id,
    };
    await sql.begin(async (tx) => {
      await tx`INSERT INTO aster_clients (id, owner_id, city, name, lat, lng, data)
        VALUES (${clientId}, ${user.id}, ${String(lead.city)}, ${String(client.name)}, ${lead.lat}, ${lead.lng}, ${tx.json(client)})
        ON CONFLICT (id) DO UPDATE SET data=excluded.data, deleted_at=NULL, updated_at=now()`;
      await tx`UPDATE aster_leads SET stage='ganho', converted_client_id=${clientId}, updated_at=now() WHERE id=${id} AND owner_id=${user.id}`;
      await tx`INSERT INTO aster_activities (id, owner_id, entity_type, entity_id, kind, note, completed_at)
        VALUES (${crypto.randomUUID()}, ${user.id}, 'lead', ${id}, 'conversão', 'Lead convertido em cliente', now())`;
    });
    await audit(user.id, 'lead.converted', 'lead', id, { clientId });
    return NextResponse.json({ clientId, client });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível converter o lead.' }, { status: error instanceof Response ? error.status : 500 });
  }
}
