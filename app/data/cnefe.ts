import { strFromU8, unzipSync } from 'fflate';
import guaporemaAddresses from './cnefe/4109104.json';

interface CnefeRecord {
  address: string;
  locality: string;
  zip: string;
  lat: number;
  lng: number;
  level?: string | number | null;
}

interface CnefeFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown[];
  };
  properties?: {
    LOGRAD_NUM?: string;
    DSC_LOCALIDADE?: string;
    CEP?: string;
    NV_GEO_COORD?: string | number | null;
  };
}

interface CnefeFeatureCollection {
  features?: CnefeFeature[];
}

export interface CnefeMatch {
  lat: number;
  lng: number;
  matchedAddress: string;
  matchedPoints: number;
}

const CNEFE_BASE_URL = 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/GeoJSON/Municipio_20240910';
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_JSON_BYTES = 55 * 1024 * 1024;
const datasetCache = new Map<number, Promise<CnefeRecord[] | null>>();
const bundledDatasets = new Map<number, CnefeRecord[]>([
  [4109104, guaporemaAddresses as CnefeRecord[]],
]);

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
    .replace(/\b(rua|r|avenida|av|rodovia|rod|travessa|tv|estrada|est|alameda|praca|via|acesso|caminho|marginal|prolongamento)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeNumber(value: string) {
  const normalized = normalize(value);
  return ['sn', 'semnumero'].includes(normalized) ? 'sn' : normalized;
}

function splitAddress(value: string) {
  const separator = value.lastIndexOf(',');
  if (separator < 0) return null;
  const street = value.slice(0, separator).trim();
  const number = value.slice(separator + 1).trim();
  return street && number ? { street, number } : null;
}

function distanceMeters(from: CnefeRecord, to: CnefeRecord) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function recordsFromGeoJson(data: CnefeFeatureCollection): CnefeRecord[] {
  const records: CnefeRecord[] = [];
  for (const feature of data.features ?? []) {
    const coordinates = feature.geometry?.coordinates;
    const address = feature.properties?.LOGRAD_NUM?.trim();
    const lng = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    if (feature.geometry?.type !== 'Point' || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    records.push({
      address,
      locality: feature.properties?.DSC_LOCALIDADE?.trim() ?? '',
      zip: feature.properties?.CEP?.trim() ?? '',
      lat,
      lng,
      level: feature.properties?.NV_GEO_COORD,
    });
  }
  return records;
}

async function downloadDataset(ibgeId: number): Promise<CnefeRecord[] | null> {
  if (!String(ibgeId).startsWith('41')) return null;
  const url = `${CNEFE_BASE_URL}/qg_810_endereco_Munic${ibgeId}.json.zip`;
  const response = await fetch(url, {
    cache: 'force-cache',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_ARCHIVE_BYTES) return null;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) return null;
  const files = unzipSync(new Uint8Array(buffer));
  const jsonFile = Object.entries(files).find(([name]) => name.toLowerCase().endsWith('.json'))?.[1];
  if (!jsonFile || jsonFile.byteLength > MAX_JSON_BYTES) return null;
  const parsed = JSON.parse(strFromU8(jsonFile)) as CnefeFeatureCollection;
  return recordsFromGeoJson(parsed);
}

async function getDataset(ibgeId: number) {
  const bundled = bundledDatasets.get(ibgeId);
  if (bundled) return bundled;
  const cached = datasetCache.get(ibgeId);
  if (cached) return cached;
  const pending = downloadDataset(ibgeId).catch(() => null);
  datasetCache.set(ibgeId, pending);
  return pending;
}

export async function lookupCnefeAddress(
  ibgeId: number,
  street: string,
  number: string,
  neighborhood = '',
  zip = '',
): Promise<CnefeMatch | null> {
  const records = await getDataset(ibgeId);
  if (!records?.length) return null;
  const requestedStreet = normalizeStreet(street);
  const requestedNumber = normalizeNumber(number);
  if (!requestedStreet || !requestedNumber) return null;

  let matches = records.filter((record) => {
    const parsed = splitAddress(record.address);
    return parsed
      && normalizeStreet(parsed.street) === requestedStreet
      && normalizeNumber(parsed.number) === requestedNumber;
  });
  if (!matches.length) return null;

  const requestedZip = normalize(zip);
  if (requestedZip) {
    const zipMatches = matches.filter((record) => normalize(record.zip) === requestedZip);
    if (zipMatches.length) matches = zipMatches;
  }
  const requestedNeighborhood = normalize(neighborhood);
  if (requestedNeighborhood) {
    const neighborhoodMatches = matches.filter((record) => normalize(record.locality) === requestedNeighborhood);
    if (neighborhoodMatches.length) matches = neighborhoodMatches;
  }

  const first = matches[0];
  if (!matches.every((record) => distanceMeters(first, record) <= 250)) return null;
  return {
    lat: matches.reduce((sum, record) => sum + record.lat, 0) / matches.length,
    lng: matches.reduce((sum, record) => sum + record.lng, 0) / matches.length,
    matchedAddress: first.address,
    matchedPoints: matches.length,
  };
}
