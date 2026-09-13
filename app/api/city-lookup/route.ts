import { NextResponse } from 'next/server';

interface CityLookupPayload {
  city?: string;
  state?: string;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleCityResult {
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: { lat?: number; lng?: number };
    bounds?: {
      northeast?: { lat?: number; lng?: number };
      southwest?: { lat?: number; lng?: number };
    };
    viewport?: {
      northeast?: { lat?: number; lng?: number };
      southwest?: { lat?: number; lng?: number };
    };
  };
}

interface GoogleCityResponse {
  status?: string;
  results?: GoogleCityResult[];
}

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

function component(result: GoogleCityResult, type: string) {
  return result.address_components?.find((item) => item.types.includes(type));
}

function cityName(result: GoogleCityResult) {
  return component(result, 'locality')?.long_name
    || component(result, 'postal_town')?.long_name
    || component(result, 'administrative_area_level_2')?.long_name
    || '';
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_KEY;
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY;
  if (!apiKey || !browserKey) {
    return NextResponse.json(
      { code: 'google_maps_not_configured', message: 'Google Maps Platform ainda não foi configurado.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1024) {
    return NextResponse.json({ message: 'Requisição muito grande.' }, { status: 413 });
  }

  let payload: CityLookupPayload;
  try {
    payload = await request.json() as CityLookupPayload;
  } catch {
    return NextResponse.json({ message: 'Corpo inválido.' }, { status: 400 });
  }

  const city = clean(payload.city, 90);
  const state = clean(payload.state, 2).toUpperCase();
  if (!city || !state) {
    return NextResponse.json({ message: 'Informe cidade e UF.' }, { status: 400 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${city}, ${state}, Brasil`);
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ message: 'Google Geocoding indisponível.' }, { status: 502 });
    }

    const data = await response.json() as GoogleCityResponse;
    if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
      return NextResponse.json(
        { code: 'city_not_found', message: 'Cidade não encontrada pelo Google.' },
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
      return NextResponse.json(
        { code: 'google_request_denied', message: 'A chave de teste não foi aceita pela Geocoding API.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const result = data.results.find((item) => {
      const returnedCity = cityName(item);
      const returnedState = component(item, 'administrative_area_level_1')?.short_name ?? '';
      return normalize(returnedCity) === normalize(city) && normalize(returnedState) === normalize(state);
    });
    const lat = result?.geometry?.location?.lat;
    const lng = result?.geometry?.location?.lng;
    const viewport = result?.geometry?.bounds ?? result?.geometry?.viewport;
    const north = viewport?.northeast?.lat;
    const east = viewport?.northeast?.lng;
    const south = viewport?.southwest?.lat;
    const west = viewport?.southwest?.lng;

    if (
      !result
      || typeof lat !== 'number'
      || typeof lng !== 'number'
      || typeof north !== 'number'
      || typeof east !== 'number'
      || typeof south !== 'number'
      || typeof west !== 'number'
    ) {
      return NextResponse.json(
        { code: 'city_mismatch', message: 'O resultado do Google não confirma a cidade e a UF informadas.' },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      name: cityName(result),
      state,
      center: { lat, lng },
      bounds: { north, south, east, west },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { message: 'Falha temporária ao validar a cidade.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
