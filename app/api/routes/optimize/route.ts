import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/auth';
import { audit, consumeUsage, db, ensureSchema } from '../../../lib/db';
import { distanceMeters } from '../../../../lib/opportunities';

interface Point { lat: number; lng: number }

function validPoint(value: unknown): value is Point {
  const point = value as Point;
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
}

function nearestOrder(origin: Point, leads: Array<{ id: string; lat: number; lng: number }>) {
  const remaining = [...leads];
  const ordered: typeof leads = [];
  let current = origin;
  while (remaining.length) {
    remaining.sort((a, b) => distanceMeters(current, a) - distanceMeters(current, b));
    const next = remaining.shift()!;
    ordered.push(next); current = next;
  }
  return ordered;
}

function mapsUrl(origin: Point, ordered: Array<{ lat: number; lng: number }>, returnToOrigin: boolean) {
  const destination = returnToOrigin ? origin : ordered.at(-1)!;
  const intermediates = returnToOrigin ? ordered : ordered.slice(0, -1);
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  if (intermediates.length) url.searchParams.set('waypoints', intermediates.map((point) => `${point.lat},${point.lng}`).join('|'));
  url.searchParams.set('travelmode', 'driving');
  return url.toString();
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!(await consumeUsage(user.id, 'routes', 20))) return NextResponse.json({ message: 'Limite de rotas atingido. Aguarde um minuto.' }, { status: 429 });
    const body = await request.json() as { leadIds?: string[]; origin?: Point; returnToOrigin?: boolean; name?: string; city?: string };
    const ids = Array.from(new Set(Array.isArray(body.leadIds) ? body.leadIds.filter((id) => typeof id === 'string').slice(0, 10) : []));
    if (ids.length < 2 || !validPoint(body.origin)) return NextResponse.json({ message: 'Escolha de 2 a 10 leads e uma origem válida.' }, { status: 400 });
    await ensureSchema();
    const sql = db();
    const rows = await sql`SELECT id, lat, lng, city FROM aster_leads
      WHERE owner_id=${user.id} AND id IN ${sql(ids)} AND deleted_at IS NULL AND lat IS NOT NULL AND lng IS NOT NULL`;
    if (rows.length !== ids.length) return NextResponse.json({ message: 'Há leads sem localização ou indisponíveis.' }, { status: 422 });
    const points = rows.map((row) => ({ id: String(row.id), lat: Number(row.lat), lng: Number(row.lng) }));
    let ordered = nearestOrder(body.origin, points);
    let encodedPolyline = '';
    let distance = Math.round(ordered.reduce((sum, point, index) => sum + distanceMeters(index ? ordered[index - 1] : body.origin!, point), 0));
    let duration = Math.round(distance / 9.7);
    let provider = 'aproximado';
    const apiKey = process.env.GOOGLE_MAPS_ROUTES_KEY?.trim() || process.env.GOOGLE_MAPS_GEOCODING_KEY?.trim();
    if (apiKey) {
      const finalLead = body.returnToOrigin ? null : points[points.length - 1];
      const destination = finalLead ?? body.origin;
      const candidates = finalLead ? points.filter((point) => point.id !== finalLead.id) : points;
      const googleResponse = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex' },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: body.origin.lat, longitude: body.origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          intermediates: candidates.map((point) => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } })),
          travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', optimizeWaypointOrder: true,
        }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (googleResponse?.ok) {
        const data = await googleResponse.json() as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string }; optimizedIntermediateWaypointIndex?: number[] }> };
        const route = data.routes?.[0];
        if (route) {
          const reordered = (route.optimizedIntermediateWaypointIndex ?? []).map((index) => candidates[index]).filter(Boolean);
          ordered = finalLead ? [...reordered, finalLead] : reordered;
          distance = Number(route.distanceMeters) || distance;
          duration = Math.round(Number.parseFloat(route.duration || '') || duration);
          encodedPolyline = route.polyline?.encodedPolyline ?? '';
          provider = 'google';
        }
      }
    }
    const routeId = crypto.randomUUID();
    const routeUrl = mapsUrl(body.origin, ordered, Boolean(body.returnToOrigin));
    await sql.begin(async (tx) => {
      await tx`INSERT INTO aster_visit_routes (id, owner_id, city, name, origin_lat, origin_lng, return_to_origin, distance_meters, duration_seconds, encoded_polyline, route_url)
        VALUES (${routeId}, ${user.id}, ${(body.city || String(rows[0].city)).slice(0, 90)}, ${(body.name || `Rota ${new Date().toLocaleDateString('pt-BR')}`).slice(0, 180)},
        ${body.origin!.lat}, ${body.origin!.lng}, ${Boolean(body.returnToOrigin)}, ${distance}, ${duration}, ${encodedPolyline || null}, ${routeUrl})`;
      for (let index = 0; index < ordered.length; index += 1) {
        await tx`INSERT INTO aster_visit_route_stops (id, route_id, lead_id, position) VALUES (${crypto.randomUUID()}, ${routeId}, ${ordered[index].id}, ${index + 1})`;
      }
    });
    await audit(user.id, 'route.created', 'visit_route', routeId, { stops: ordered.length, provider });
    return NextResponse.json({ id: routeId, orderedLeadIds: ordered.map((point) => point.id), distanceMeters: distance, durationSeconds: duration, encodedPolyline, routeUrl, provider });
  } catch (error) {
    return NextResponse.json({ message: 'Não foi possível criar a rota.' }, { status: error instanceof Response ? error.status : 500 });
  }
}
