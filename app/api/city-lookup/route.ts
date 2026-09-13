import { NextResponse } from 'next/server';
import { findMunicipality } from '../../data/municipalities';

interface CityLookupPayload {
  city?: string;
  state?: string;
  ibgeId?: number;
}

type Position = [number, number];

interface IbgeGeometry {
  type?: 'Polygon' | 'MultiPolygon';
  coordinates?: Position[][] | Position[][][];
}

interface IbgeFeature {
  type?: 'Feature';
  geometry?: IbgeGeometry;
}

interface IbgeFeatureCollection {
  type?: 'FeatureCollection';
  features?: IbgeFeature[];
}

const BRAZILIAN_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

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

function geometryRings(geometry: IbgeGeometry | undefined): Position[][] {
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates as Position[][];
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Position[][][]).flatMap((polygon) => polygon);
  }
  return [];
}

export async function POST(request: Request) {
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
  const ibgeId = Number(payload.ibgeId);
  if (!city || !BRAZILIAN_STATES.has(state) || !Number.isInteger(ibgeId) || ibgeId < 1_000_000) {
    return NextResponse.json({ message: 'Selecione um município válido da lista do IBGE.' }, { status: 400 });
  }

  const officialCity = findMunicipality(state, ibgeId);
  if (!officialCity || normalize(officialCity.name) !== normalize(city)) {
    return NextResponse.json(
      { code: 'city_mismatch', message: 'O município não pertence à UF selecionada.' },
      { status: 422 },
    );
  }

  const baseProfile = {
    ibgeId,
    name: officialCity.name,
    state,
    center: { lat: officialCity.lat, lng: officialCity.lng },
  };
  const boundaryUrl = new URL(
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${ibgeId}`,
  );
  boundaryUrl.searchParams.set('formato', 'application/vnd.geo+json');
  boundaryUrl.searchParams.set('qualidade', 'minima');

  try {
    const boundaryResponse = await fetch(boundaryUrl, { cache: 'force-cache' });
    if (!boundaryResponse.ok) {
      return NextResponse.json(
        { ...baseProfile, source: 'local_ibge_snapshot' },
        { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
      );
    }

    const rawBoundary = await boundaryResponse.json() as IbgeFeature | IbgeFeature[] | IbgeFeatureCollection;
    const features = Array.isArray(rawBoundary)
      ? rawBoundary
      : rawBoundary.type === 'FeatureCollection'
        ? rawBoundary.features ?? []
        : [rawBoundary as IbgeFeature];
    const feature = features
      .find((item) => item?.geometry);
    const rings = geometryRings(feature?.geometry);
    const points = rings.flat();
    if (!points.length) {
      return NextResponse.json(
        { ...baseProfile, source: 'local_ibge_snapshot' },
        { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
      );
    }

    const longitudes = points.map(([lng]) => lng).filter(Number.isFinite);
    const latitudes = points.map(([, lat]) => lat).filter(Number.isFinite);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);
    if (![west, east, south, north].every(Number.isFinite)) {
      return NextResponse.json(
        { ...baseProfile, source: 'local_ibge_snapshot' },
        { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
      );
    }

    return NextResponse.json({
      ...baseProfile,
      center: { lat: (north + south) / 2, lng: (east + west) / 2 },
      bounds: { north, south, east, west },
      boundary: rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
      source: 'IBGE',
    }, { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
  } catch {
    return NextResponse.json(
      { ...baseProfile, source: 'local_ibge_snapshot' },
      { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  }
}
