import { NextResponse } from 'next/server';

interface CityLookupPayload {
  city?: string;
  state?: string;
  ibgeId?: number;
}

interface IbgeMunicipality {
  id?: number;
  nome?: string;
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

  const municipalitiesUrl = new URL(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios`,
  );
  municipalitiesUrl.searchParams.set('orderBy', 'nome');
  const boundaryUrl = new URL(
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${ibgeId}`,
  );
  boundaryUrl.searchParams.set('formato', 'application/vnd.geo+json');
  boundaryUrl.searchParams.set('qualidade', 'minima');

  try {
    const [municipalitiesResponse, boundaryResponse] = await Promise.all([
      fetch(municipalitiesUrl, { cache: 'force-cache' }),
      fetch(boundaryUrl, { cache: 'force-cache' }),
    ]);
    if (!municipalitiesResponse.ok || !boundaryResponse.ok) {
      return NextResponse.json({ message: 'A API do IBGE está temporariamente indisponível.' }, { status: 502 });
    }

    const municipalities = await municipalitiesResponse.json() as IbgeMunicipality[];
    const officialCity = municipalities.find(
      (item) => item.id === ibgeId && typeof item.nome === 'string' && normalize(item.nome) === normalize(city),
    );
    if (!officialCity?.nome) {
      return NextResponse.json(
        { code: 'city_mismatch', message: 'O município não pertence à UF selecionada.' },
        { status: 422 },
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
      return NextResponse.json({ message: 'O IBGE não retornou a malha desse município.' }, { status: 502 });
    }

    const longitudes = points.map(([lng]) => lng).filter(Number.isFinite);
    const latitudes = points.map(([, lat]) => lat).filter(Number.isFinite);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);
    if (![west, east, south, north].every(Number.isFinite)) {
      return NextResponse.json({ message: 'A malha do município é inválida.' }, { status: 502 });
    }

    return NextResponse.json({
      ibgeId,
      name: officialCity.nome,
      state,
      center: { lat: (north + south) / 2, lng: (east + west) / 2 },
      bounds: { north, south, east, west },
      boundary: rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
      source: 'IBGE',
    }, { headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } });
  } catch {
    return NextResponse.json(
      { message: 'Falha temporária ao consultar a malha do município no IBGE.' },
      { status: 502 },
    );
  }
}
