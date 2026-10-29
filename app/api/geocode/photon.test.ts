import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../data/cnefe', () => ({ lookupCnefeAddress: vi.fn(async () => null) }));
vi.mock('../../data/municipalities', () => ({
  findMunicipalityByName: () => ({ id: 4109401, name: 'Guarapuava', lat: -25.39, lng: -51.46 }),
  findMunicipality: () => ({ id: 4109401, name: 'Guarapuava', lat: -25.39, lng: -51.46 }),
}));
vi.mock('../../lib/auth', () => ({ currentUser: vi.fn() }));
vi.mock('../../lib/db', () => ({ databaseConfigured: () => false, consumeUsage: vi.fn() }));
vi.mock('../../lib/address-decision', () => ({ decideAddress: vi.fn() }));
vi.mock('../address-suggestion/route', () => ({ POST: vi.fn() }));

import { POST } from './route';

const photonFeature = (properties: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [-51.46, -25.39] },
  properties: {
    type: 'house',
    osm_id: 202,
    osm_type: 'W',
    osm_key: 'building',
    osm_value: 'yes',
    street: 'Rua das Acácias',
    housenumber: '184',
    district: 'Centro',
    city: 'Guarapuava',
    state: 'Paraná',
    postcode: '85010-000',
    countrycode: 'BR',
    ...properties,
  },
});

function stubPhoton(properties: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [photonFeature(properties)] }), { status: 200 })));
}

function request(body: Record<string, unknown> = {}) {
  return POST(new Request('http://localhost/api/geocode', {
    method: 'POST',
    body: JSON.stringify({
      street: 'Rua das Acácias', number: '184', city: 'Guarapuava', state: 'PR', zip: '85010-000', ...body,
    }),
  }));
}

beforeEach(() => {
  vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
  vi.stubEnv('GEOAPIFY_API_KEY', '');
  vi.stubEnv('GOOGLE_MAPS_GEOCODING_KEY', '');
  vi.stubEnv('GOOGLE_MAPS_ADDRESS_VALIDATION_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('Photon fallback geocoding', () => {
  it('confirms a building with exact street and number only from OSM', async () => {
    stubPhoton();
    const response = await request();
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      quality: 'exata',
      source: 'PHOTON_OSM',
      locationType: 'PHOTON_HOUSE',
      lat: -25.39,
      lng: -51.46,
    });
  });

  it('requests review when OSM confirms the street but not the number', async () => {
    stubPhoton({ street: 'Rua Sem Número', housenumber: undefined });
    const response = await request({ street: 'Rua Sem Número' });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body.code).toBe('number_not_confirmed');
    expect(body.suggestionSource).toBe('PHOTON_OSM');
  });

  it('flags a postcode divergence instead of confirming the building', async () => {
    stubPhoton({ street: 'Rua CEP Divergente', postcode: '85020-000' });
    const response = await request({ street: 'Rua CEP Divergente' });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body.code).toBe('postcode_mismatch');
  });

  it('ignores an OSM result from another city', async () => {
    stubPhoton({ city: 'Londrina' });
    const response = await request({ street: 'Rua de Outra Cidade' });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body.code).toBe('geocoder_not_configured');
  });
});
