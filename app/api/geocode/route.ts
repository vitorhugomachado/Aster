import { NextResponse } from 'next/server';

interface GeocodePayload {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  partial_match?: boolean;
  place_id?: string;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: GoogleGeocodeResult[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const rateWindows = new Map<string, { count: number; startedAt: number }>();

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength)
    : '';
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(rua|r|avenida|av|rodovia|rod|travessa|tv|estrada|est)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function compatible(expected: string, actual: string) {
  if (!expected) return true;
  const left = normalize(expected);
  const right = normalize(actual);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function component(result: GoogleGeocodeResult, ...types: string[]) {
  return result.address_components?.find((item) => types.some((type) => item.types.includes(type)));
}

function allowRequest(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const now = Date.now();
  const current = rateWindows.get(forwarded);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateWindows.set(forwarded, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_KEY;
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!apiKey || !browserKey) {
    return NextResponse.json(
      { code: 'geocoder_not_configured', message: 'Google Maps Platform ainda não foi configurado.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ message: 'Requisição muito grande.' }, { status: 413 });
  }
  if (!allowRequest(request)) {
    return NextResponse.json(
      { code: 'rate_limited', message: 'Muitas consultas. Aguarde um minuto.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
    );
  }

  let payload: GeocodePayload;
  try {
    payload = await request.json() as GeocodePayload;
  } catch {
    return NextResponse.json({ message: 'Corpo inválido.' }, { status: 400 });
  }

  const street = clean(payload.street, 140);
  const number = clean(payload.number, 20);
  const neighborhood = clean(payload.neighborhood, 90);
  const city = clean(payload.city, 90);
  const state = clean(payload.state, 2).toUpperCase();
  const zip = clean(payload.zip, 10);

  if (!street || !number || !city || !state) {
    return NextResponse.json({ message: 'Endereço incompleto para geocodificação.' }, { status: 400 });
  }

  const address = [street, number, neighborhood, zip, city, state, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ message: 'Google Geocoding indisponível.' }, { status: 502 });
    }

    const data = await response.json() as GoogleGeocodeResponse;
    if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
      return NextResponse.json(
        { code: 'not_found', message: 'Endereço não localizado.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (data.status === 'OVER_QUERY_LIMIT') {
      return NextResponse.json(
        { code: 'quota_exceeded', message: 'Limite temporário do Google atingido.' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } },
      );
    }
    if (data.status !== 'OK') {
      return NextResponse.json({ message: 'O Google não aceitou a consulta.' }, { status: 502 });
    }

    const result = data.results[0];
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ code: 'not_found', message: 'Coordenadas não retornadas.' }, { status: 404 });
    }

    const returnedNumber = component(result, 'street_number')?.long_name ?? '';
    const returnedStreet = component(result, 'route')?.long_name ?? '';
    const returnedCity = component(result, 'locality', 'administrative_area_level_2', 'postal_town')?.long_name ?? '';
    const returnedState = component(result, 'administrative_area_level_1')?.short_name ?? '';
    const returnedZip = component(result, 'postal_code')?.long_name ?? '';
    const checks = {
      number: compatible(number, returnedNumber),
      street: compatible(street, returnedStreet),
      city: compatible(city, returnedCity),
      state: compatible(state, returnedState),
      zip: compatible(zip, returnedZip),
    };
    const locationType = result.geometry?.location_type ?? 'UNKNOWN';
    const exact = locationType === 'ROOFTOP'
      && result.partial_match !== true
      && Object.values(checks).every(Boolean);

    return NextResponse.json({
      lat,
      lng,
      quality: exact ? 'exata' : 'aproximada',
      locationType,
      partialMatch: result.partial_match === true,
      checks,
      formattedAddress: result.formatted_address ?? '',
      placeId: result.place_id ?? '',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { message: 'Falha temporária na geocodificação.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
