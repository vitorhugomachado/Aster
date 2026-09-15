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
  precision: 'exact' | 'interpolated';
  correctedStreet?: string;
}

export interface CnefeStreetCandidate {
  street: string;
  localities: string[];
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
    .replace(/\b(rua|r|avenida|av|rodovia|rod|travessa|tv|estrada|est|alameda|praca|via|acesso|caminho|marginal|prolongamento|do|da|de|dos|das)\b/g, '')
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

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function plausibleStreetDistance(left: string, right: string) {
  const distance = editDistance(left, right);
  const longest = Math.max(left.length, right.length);
  return distance <= 1 || (longest >= 15 && distance <= 2) ? distance : null;
}

function refineByLocation(matches: CnefeRecord[], neighborhood: string, zip: string) {
  let refined = matches;
  const requestedZip = normalize(zip);
  if (requestedZip) {
    const zipMatches = refined.filter((record) => normalize(record.zip) === requestedZip);
    if (zipMatches.length) refined = zipMatches;
  }
  const requestedNeighborhood = normalize(neighborhood);
  if (requestedNeighborhood) {
    const neighborhoodMatches = refined.filter((record) => normalize(record.locality) === requestedNeighborhood);
    if (neighborhoodMatches.length) refined = neighborhoodMatches;
  }
  return refined;
}

function averagedMatch(matches: CnefeRecord[], precision: CnefeMatch['precision']): CnefeMatch | null {
  const first = matches[0];
  if (!first || !matches.every((record) => distanceMeters(first, record) <= 250)) return null;
  return {
    lat: matches.reduce((sum, record) => sum + record.lat, 0) / matches.length,
    lng: matches.reduce((sum, record) => sum + record.lng, 0) / matches.length,
    matchedAddress: first.address,
    matchedPoints: matches.length,
    precision,
  };
}

function interpolatedMatch(
  records: CnefeRecord[],
  streetKey: string,
  requestedNumber: string,
  neighborhood: string,
  zip: string,
): CnefeMatch | null {
  if (!/^\d+$/.test(requestedNumber) || ['0', '999', '9999'].includes(requestedNumber)) return null;
  const target = Number(requestedNumber);
  let streetRecords = records.filter((record) => {
    const parsed = splitAddress(record.address);
    return parsed && normalizeStreet(parsed.street) === streetKey && /^\d+$/.test(normalizeNumber(parsed.number));
  });
  streetRecords = refineByLocation(streetRecords, neighborhood, zip);
  const numbered = streetRecords
    .map((record) => {
      const parsed = splitAddress(record.address);
      return { record, number: Number(normalizeNumber(parsed?.number ?? '')) };
    })
    .filter((item) => Number.isFinite(item.number));
  const sameParity = numbered.filter((item) => item.number % 2 === target % 2);
  const candidates = sameParity.length >= 2 ? sameParity : numbered;
  const lower = candidates
    .filter((item) => item.number < target)
    .sort((left, right) => right.number - left.number)[0];
  const upper = candidates
    .filter((item) => item.number > target)
    .sort((left, right) => left.number - right.number)[0];
  if (!lower || !upper || upper.number - lower.number > 400) return null;
  if (distanceMeters(lower.record, upper.record) > 1_000) return null;
  const ratio = (target - lower.number) / (upper.number - lower.number);
  return {
    lat: lower.record.lat + (upper.record.lat - lower.record.lat) * ratio,
    lng: lower.record.lng + (upper.record.lng - lower.record.lng) * ratio,
    matchedAddress: `${splitAddress(lower.record.address)?.street ?? ''}, ${requestedNumber}`,
    matchedPoints: 2,
    precision: 'interpolated',
  };
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

export async function suggestCnefeStreets(
  ibgeId: number,
  street: string,
  neighborhood = '',
  limit = 10,
): Promise<CnefeStreetCandidate[]> {
  const records = await getDataset(ibgeId);
  const requestedStreet = normalizeStreet(street);
  if (!records?.length || !requestedStreet) return [];

  const streets = new Map<string, { street: string; localities: Set<string> }>();
  for (const record of records) {
    const parsed = splitAddress(record.address);
    if (!parsed) continue;
    const key = normalizeStreet(parsed.street);
    if (!key) continue;
    const current = streets.get(key) ?? { street: parsed.street, localities: new Set<string>() };
    if (record.locality) current.localities.add(record.locality);
    streets.set(key, current);
  }

  const requestedNeighborhood = normalize(neighborhood);
  return [...streets.entries()]
    .map(([key, value]) => {
      const distance = editDistance(requestedStreet, key);
      const longest = Math.max(requestedStreet.length, key.length);
      const similarity = longest ? 1 - distance / longest : 0;
      const neighborhoodMatch = requestedNeighborhood
        && [...value.localities].some((locality) => normalize(locality) === requestedNeighborhood);
      return { value, similarity: similarity + (neighborhoodMatch ? 0.08 : 0) };
    })
    .filter((item) => item.similarity >= 0.45)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, Math.max(1, Math.min(limit, 15)))
    .map(({ value }) => ({ street: value.street, localities: [...value.localities].slice(0, 4) }));
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

  const matchesForStreet = (streetKey: string) => records.filter((record) => {
    const parsed = splitAddress(record.address);
    return parsed
      && normalizeStreet(parsed.street) === streetKey
      && normalizeNumber(parsed.number) === requestedNumber;
  });
  let matchedStreet = requestedStreet;
  let inferredStreet = false;
  let matches = matchesForStreet(matchedStreet);

  if (!matches.length) {
    const streetKeys = Array.from(new Set(records.map((record) => {
      const parsed = splitAddress(record.address);
      return parsed ? normalizeStreet(parsed.street) : '';
    }).filter(Boolean)));
    const ranked = streetKeys
      .map((streetKey) => ({ streetKey, distance: plausibleStreetDistance(requestedStreet, streetKey) }))
      .filter((item): item is { streetKey: string; distance: number } => item.distance !== null)
      .sort((left, right) => left.distance - right.distance);
    const bestDistance = ranked[0]?.distance;
    const bestStreets = ranked.filter((item) => item.distance === bestDistance);
    if (!streetKeys.includes(requestedStreet) && requestedStreet.length >= 6 && bestStreets.length === 1) {
      matchedStreet = bestStreets[0].streetKey;
      inferredStreet = true;
      matches = matchesForStreet(matchedStreet);
    }
  }

  if (matches.length) {
    const match = averagedMatch(refineByLocation(matches, neighborhood, zip), 'exact');
    if (match && inferredStreet) {
      match.correctedStreet = splitAddress(match.matchedAddress)?.street;
    }
    return match;
  }
  return interpolatedMatch(records, matchedStreet, requestedNumber, neighborhood, zip);
}
