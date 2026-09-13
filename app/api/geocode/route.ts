import { NextResponse } from 'next/server';
import { lookupCnefeAddress } from '../../data/cnefe';
import { findMunicipality, findMunicipalityByName } from '../../data/municipalities';

interface GeocodePayload {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  ibgeId?: number;
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
const MAX_REQUESTS_PER_WINDOW = 2_000;
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
    .replace(/[^a-z0-9]/g, '');
}

function normalizeStreet(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(rua|r|avenida|av|rodovia|rod|travessa|tv|estrada|est)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function exact(expected: string, actual: string) {
  if (!expected) return true;
  return Boolean(actual && normalize(expected) === normalize(actual));
}

function exactStreet(expected: string, actual: string) {
  return Boolean(expected && actual && normalizeStreet(expected) === normalizeStreet(actual));
}

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function component(result: GoogleGeocodeResult, ...types: string[]) {
  for (const type of types) {
    const match = result.address_components?.find((item) => item.types.includes(type));
    if (match) return match;
  }
  return undefined;
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
  const requestedIbgeId = Number(payload.ibgeId);

  if (!street || !number || !city || !state) {
    return NextResponse.json({ message: 'Endereço incompleto para geocodificação.' }, { status: 400 });
  }

  const municipality = Number.isInteger(requestedIbgeId)
    ? findMunicipality(state, requestedIbgeId)
    : findMunicipalityByName(state, city);
  if (!municipality || normalize(municipality.name) !== normalize(city)) {
    return NextResponse.json(
      { code: 'invalid_city', message: 'A cidade ativa não corresponde ao cadastro municipal.' },
      { status: 422, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const cnefeMatch = await lookupCnefeAddress(
    municipality.id,
    street,
    number,
    neighborhood,
    zip,
  );
  if (cnefeMatch) {
    return NextResponse.json({
      lat: cnefeMatch.lat,
      lng: cnefeMatch.lng,
      quality: cnefeMatch.precision === 'exact' ? 'exata' : 'aproximada',
      locationType: cnefeMatch.precision === 'exact' ? 'IBGE_CNEFE' : 'IBGE_CNEFE_INTERPOLATED',
      source: 'IBGE_CNEFE',
      partialMatch: false,
      checks: { number: true, street: true, city: true, state: true, zip: true },
      formattedAddress: `${cnefeMatch.matchedAddress}, ${municipality.name} - ${state}, Brasil`,
      matchedPoints: cnefeMatch.matchedPoints,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { code: 'geocoder_not_configured', message: 'O endereço não está na base do IBGE e o Google Maps ainda não foi configurado.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const address = [street, number, neighborhood, zip, city, state, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set(
    'bounds',
    `${municipality.lat - 0.35},${municipality.lng - 0.35}|${municipality.lat + 0.35},${municipality.lng + 0.35}`,
  );
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

    const candidates = data.results.map((result) => {
      const returnedNumber = component(result, 'street_number')?.long_name ?? '';
      const returnedStreet = component(result, 'route')?.long_name ?? '';
      const returnedCity = component(result, 'locality', 'postal_town', 'administrative_area_level_2')?.long_name ?? '';
      const returnedState = component(result, 'administrative_area_level_1')?.short_name ?? '';
      const returnedZip = component(result, 'postal_code')?.long_name ?? '';
      const checks = {
        number: exact(number, returnedNumber),
        street: exactStreet(street, returnedStreet),
        city: exact(city, returnedCity),
        state: exact(state, returnedState),
        zip: exact(zip.replace(/\D/g, ''), returnedZip.replace(/\D/g, '')),
      };
      return { result, checks };
    });

    const candidate = candidates.find(({ result, checks }) =>
      Object.values(checks).every(Boolean)
      && result.partial_match !== true
      && ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(result.geometry?.location_type ?? ''),
    );
    if (!candidate) {
      const insideCity = candidates.some(({ checks }) => checks.city && checks.state);
      const addressMatchedWithoutPrecision = candidates.some(({ checks }) => Object.values(checks).every(Boolean));
      return NextResponse.json(
        {
          code: addressMatchedWithoutPrecision
            ? 'insufficient_precision'
            : insideCity ? 'imprecise_address' : 'outside_active_city',
          message: addressMatchedWithoutPrecision
            ? 'O Google encontrou o endereço, mas sem precisão suficiente para marcar a residência.'
            : insideCity
              ? 'O Google não confirmou exatamente a rua e o número dentro da cidade ativa.'
              : 'O resultado não pertence à cidade e UF selecionadas.',
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { result, checks } = candidate;
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ code: 'not_found', message: 'Coordenadas não retornadas.' }, { status: 404 });
    }
    if (distanceKm({ lat: municipality.lat, lng: municipality.lng }, { lat, lng }) > 150) {
      return NextResponse.json(
        { code: 'outside_active_city', message: 'As coordenadas retornadas estão longe da cidade ativa.' },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const locationType = result.geometry?.location_type ?? 'UNKNOWN';
    const isRooftop = locationType === 'ROOFTOP'
      && Object.values(checks).every(Boolean);

    return NextResponse.json({
      lat,
      lng,
      quality: isRooftop ? 'exata' : 'aproximada',
      locationType,
      source: 'GOOGLE',
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
