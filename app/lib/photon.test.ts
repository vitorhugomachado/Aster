import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotonError, searchPhoton } from './photon';

const feature = (properties: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [-51.46, -25.39] },
  properties: {
    type: 'house',
    osm_id: 101,
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

function photonResponse(features: unknown[], status = 200) {
  return new Response(JSON.stringify({ features }), { status });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Photon geocoder', () => {
  it('parses coordinates and address fields, then reuses the cache', async () => {
    vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
    const fetchMock = vi.fn(async (_url: unknown) => photonResponse([feature()]));
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      street: 'Rua das Acácias',
      number: '184',
      city: 'Guarapuava',
      state: 'PR',
      near: { lat: -25.39, lng: -51.46 },
    };
    const first = await searchPhoton(input);
    const second = await searchPhoton(input);

    expect(first).toEqual([expect.objectContaining({
      lat: -25.39,
      lng: -51.46,
      street: 'Rua das Acácias',
      housenumber: '184',
      city: 'Guarapuava',
      state: 'Paraná',
      countryCode: 'BR',
    })]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://photon.komoot.io');
    expect(url.searchParams.get('q')).toContain('Rua das Acácias, 184');
    expect(url.searchParams.get('lat')).toBe('-25.3900');
    expect(url.searchParams.get('lon')).toBe('-51.4600');
  });

  it('honors a self-hosted PHOTON_BASE_URL', async () => {
    vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
    vi.stubEnv('PHOTON_BASE_URL', 'https://photon.exemplo.com.br/api/');
    const fetchMock = vi.fn(async (_url: unknown) => photonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await searchPhoton({ street: 'Avenida Brasil', number: '10', city: 'Cascavel', state: 'PR' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('photon.exemplo.com.br');
  });

  it('reports provider failures instead of returning an empty match', async () => {
    vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));

    await expect(searchPhoton({ street: 'Rua Nova', number: '1', city: 'Londrina', state: 'PR' }))
      .rejects.toBeInstanceOf(PhotonError);
  });

  it('discards malformed features without coordinates', async () => {
    vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
    vi.stubGlobal('fetch', vi.fn(async () => photonResponse([
      { geometry: { coordinates: [] }, properties: {} },
      { geometry: { coordinates: ['x', 'y'] }, properties: {} },
    ])));

    await expect(searchPhoton({ street: 'Rua Vazia', number: '2', city: 'Maringá', state: 'PR' }))
      .resolves.toEqual([]);
  });

  it('opens the circuit after repeated failures instead of stalling every import row', async () => {
    vi.stubEnv('PHOTON_MIN_INTERVAL_MS', '0');
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    for (const number of ['11', '12', '13']) {
      await expect(searchPhoton({ street: 'Rua Instável', number, city: 'Ponta Grossa', state: 'PR' }))
        .rejects.toBeInstanceOf(PhotonError);
    }
    await expect(searchPhoton({ street: 'Rua Instável', number: '14', city: 'Ponta Grossa', state: 'PR' }))
      .rejects.toBeInstanceOf(PhotonError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
