import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
vi.mock('../../data/cnefe', () => ({ lookupCnefeAddress: vi.fn(async () => null) }));
vi.mock('../../data/municipalities', () => ({
  findMunicipalityByName: () => ({ id: 4106902, name: 'Curitiba', lat: -25.43, lng: -49.27 }),
  findMunicipality: () => ({ id: 4106902, name: 'Curitiba', lat: -25.43, lng: -49.27 }),
}));
vi.mock('../../lib/auth', () => ({ currentUser: vi.fn() }));
vi.mock('../../lib/db', () => ({ databaseConfigured: () => false, consumeUsage: vi.fn() }));
import { POST } from './route';
import { POST as review } from '../address-suggestion/route';
import { decideAddress } from '../../lib/address-decision';
vi.mock('../../lib/address-decision', () => ({ decideAddress: vi.fn() }));
vi.mock('../address-suggestion/route', () => ({ POST: vi.fn() }));
const building = { lat: -25.43, lon: -49.27, country_code: 'br', city: 'Curitiba',
  state_code: 'PR', street: 'Rua XV de Novembro', housenumber: '100', result_type: 'building',
  rank: { confidence: 1, confidence_building_level: 1, match_type: 'full_match' } };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
async function request(result: unknown, status = 200) {
  vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
  vi.stubEnv('GOOGLE_MAPS_GEOCODING_KEY', 'unused-google-key');
  const fetchMock = vi.fn(async (_url: unknown) => new Response(JSON.stringify(result), { status }));
  vi.stubGlobal('fetch', fetchMock);
  const response = await POST(new Request('http://localhost/api/geocode', { method: 'POST',
    body: JSON.stringify({ street: 'Rua XV de Novembro', number: '100', city: 'Curitiba', state: 'PR' }) }));
  expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.geoapify.com');
  return { response, body: await response.json() as Record<string, unknown> };
}
describe('Geoapify geocoding', () => {
  it('accepts a fully matched high-confidence building', async () => {
    expect((await request({ results: [building] })).body).toMatchObject({ quality: 'exata', source: 'GEOAPIFY' });
  });
  it('requires review for uncertain buildings and missing numbers', async () => {
    for (const item of [{ ...building, rank: { ...building.rank, confidence: 0.75 } }, { ...building, housenumber: undefined }]) {
      const { response, body } = await request({ results: [item] });
      expect(response.status).toBe(422);
      expect(body.suggestionSource).toBe('GEOAPIFY');
    }
  });
  it('does not suggest a point in another city', async () => {
    const { body } = await request({ results: [{ ...building, city: 'Londrina' }] });
    expect(body.suggestedLocation).toBeUndefined();
    expect(body.code).toBe('outside_active_city');
  });
  it('explains empty results, missing streets, numbers and low precision', async () => {
    expect((await request({ results: [] })).body.code).toBe('address_not_found');
    expect((await request({ results: [{ ...building, street: 'Rua Outra' }] })).body.code).toBe('street_not_confirmed');
    const missingNumber = await request({ results: [{ ...building, housenumber: undefined }] });
    expect(missingNumber.body.code).toBe('number_not_confirmed');
    expect(missingNumber.body.suggestedLocation).toEqual({ lat: building.lat, lng: building.lon });
    expect((await request({ results: [{ ...building, rank: { ...building.rank, confidence: 0.75 } }] })).body.code).toBe('insufficient_precision');
  });
  it('does not fall back to Google when quota is exhausted', async () => {
    expect((await request({}, 429)).response.status).toBe(429);
  });
  it('orchestrates a correction and never applies the proposed different number', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-geo');
    vi.mocked(decideAddress).mockImplementation(async (_address, candidates) => ({ decision: 'confirmar', candidate: candidates.find((item) => item.numberMatched)!, reason: 'Endereço correspondente' }));
    vi.mocked(review).mockResolvedValue(NextResponse.json({ changed: true, confidence: 0.95,
      reason: 'Nome oficial encontrado', suggestedNumber: '40',
      address: { street: 'Rua XV de Novembro', number: '40', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip: '' } }));
    const mock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ results: [building] }))).mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [building] })));
    vi.stubGlobal('fetch', mock);
    const response = await POST(new Request('http://localhost/api/geocode', { method: 'POST',
      body: JSON.stringify({ street: 'Rua XV Novembr', number: '100', city: 'Curitiba', state: 'PR' }) }));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.reviewedByAi).toBe(true);
    expect(body.correctedAddress).toMatchObject({ street: 'Rua XV de Novembro', number: '100' });
    expect(body.suggestedNumber).toBeUndefined();
    expect(mock.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [query] of mock.mock.calls) {
      const url = new URL(String(query));
      expect(url.searchParams.get('housenumber') || url.searchParams.get('text')).toContain('100');
    }
  });
  it('preserves location evidence when the AI quota is exhausted', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.mocked(review).mockResolvedValue(NextResponse.json({ message: 'Quota atingida' }, { status: 429 }));
    const { body, response } = await request({ results: [{ ...building, housenumber: undefined }] });
    expect(response.status).toBe(422);
    expect(body.suggestedLocation).toEqual({ lat: building.lat, lng: building.lon });
    expect(body.reviewedByAi).toBe(true);
  });
  it('accepts low confidence only when Groq confirms the supplied candidate', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.mocked(decideAddress).mockImplementation(async (_address, candidates) => ({ decision: 'confirmar', candidate: candidates[0], reason: 'Número e rua correspondem' }));
    const { response, body } = await request({ results: [{ ...building, rank: { confidence: 0.5, confidence_building_level: 0, match_type: 'full_match' } }] });
    expect(response.status).toBe(200);
    expect(body.quality).toBe('aproximada');
    expect(body.confirmationSource).toBe('groq');
  });
  it('confirms an exact base candidate without consulting Groq', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-groq');
    vi.mocked(decideAddress).mockRejectedValue(new Error('quota'));
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-geo');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [building] })));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(new Request('http://localhost/api/geocode', { method: 'POST',
      body: JSON.stringify({ street: building.street, number: '100', city: 'Curitiba', state: 'PR' }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lat: building.lat, quality: 'exata', source: 'GEOAPIFY' });
    expect(decideAddress).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});



