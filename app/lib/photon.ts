/**
 * Cliente do Photon (OpenStreetMap) usado como geocodificador gratuito.
 *
 * O serviço público é mantido pela Komoot e não exige chave, mas segue uma
 * política de uso justo: as requisições são serializadas (uma por segundo por
 * padrão), identificadas por User-Agent e armazenadas em cache para não repetir
 * consultas. Para uso intenso, defina PHOTON_BASE_URL apontando para uma
 * instância própria.
 */

const DEFAULT_BASE_URL = 'https://photon.komoot.io/api/';
const DEFAULT_MIN_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 1_000;

export interface PhotonSearchInput {
  street: string;
  number: string;
  neighborhood?: string;
  city: string;
  state: string;
  zip?: string;
  near?: { lat: number; lng: number };
  limit?: number;
}

export interface PhotonPlace {
  lat: number;
  lng: number;
  type: string;
  osmId: string;
  osmType: string;
  osmKey: string;
  osmValue: string;
  name: string;
  street: string;
  housenumber: string;
  locality: string;
  district: string;
  city: string;
  county: string;
  state: string;
  postcode: string;
  countryCode: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

export class PhotonError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Photon respondeu ${status}.`);
    this.name = 'PhotonError';
    this.status = status;
  }
}

const cache = new Map<string, { expiresAt: number; places: PhotonPlace[] }>();
const inflight = new Map<string, Promise<PhotonPlace[]>>();
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();
let consecutiveFailures = 0;
let unavailableUntil = 0;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 5 * 60 * 1_000;

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function minIntervalMs() {
  const raw = process.env.PHOTON_MIN_INTERVAL_MS?.trim();
  const configured = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_MIN_INTERVAL_MS;
}

/**
 * Serializa as chamadas para respeitar a política do serviço público. A fila
 * garante que importações em lote nunca disparem requisições simultâneas.
 */
function throttle<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const interval = minIntervalMs();
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < interval) {
      await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
    }
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.places;
}

function writeCache(key: string, places: PhotonPlace[]) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, places });
}

function text(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function toPlace(feature: PhotonFeature): PhotonPlace | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature.properties ?? {};
  return {
    lat,
    lng,
    type: text(properties, 'type'),
    osmId: text(properties, 'osm_id'),
    osmType: text(properties, 'osm_type'),
    osmKey: text(properties, 'osm_key'),
    osmValue: text(properties, 'osm_value'),
    name: text(properties, 'name'),
    street: text(properties, 'street'),
    housenumber: text(properties, 'housenumber'),
    locality: text(properties, 'locality'),
    district: text(properties, 'district'),
    city: text(properties, 'city'),
    county: text(properties, 'county'),
    state: text(properties, 'state'),
    postcode: text(properties, 'postcode'),
    countryCode: text(properties, 'countrycode'),
  };
}

function buildQuery(input: PhotonSearchInput) {
  return [
    `${input.street.trim()}, ${input.number.trim()}`,
    input.neighborhood?.trim(),
    `${input.city.trim()} - ${input.state.trim()}`,
    'Brasil',
  ].filter(Boolean).join(', ');
}

function buildUrl(query: string, input: PhotonSearchInput) {
  const url = new URL(process.env.PHOTON_BASE_URL?.trim() || DEFAULT_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(Math.max(input.limit ?? 10, 1), 20)));
  if (input.near && Number.isFinite(input.near.lat) && Number.isFinite(input.near.lng)) {
    url.searchParams.set('lat', input.near.lat.toFixed(4));
    url.searchParams.set('lon', input.near.lng.toFixed(4));
  }
  return url;
}

async function requestPhoton(query: string, input: PhotonSearchInput) {
  const response = await fetch(buildUrl(query, input), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Aster-CRM/1.0 (geocodificacao de enderecos)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new PhotonError(response.status);
  const data = await response.json() as PhotonResponse;
  return (data.features ?? [])
    .map(toPlace)
    .filter((place): place is PhotonPlace => place !== null);
}

export async function searchPhoton(input: PhotonSearchInput): Promise<PhotonPlace[]> {
  const query = buildQuery(input);
  const key = `${normalizeKey(query)}|${input.near?.lat?.toFixed(3) ?? ''}|${input.near?.lng?.toFixed(3) ?? ''}`;

  const cached = readCache(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  if (Date.now() < unavailableUntil) throw new PhotonError(503);

  const request = throttle(() => requestPhoton(query, input))
    .then((places) => {
      consecutiveFailures = 0;
      writeCache(key, places);
      return places;
    })
    .catch((error) => {
      consecutiveFailures += 1;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        consecutiveFailures = 0;
        unavailableUntil = Date.now() + CIRCUIT_OPEN_MS;
      }
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}
