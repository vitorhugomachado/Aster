import { afterEach, expect, it, vi } from 'vitest';
import { generateWithGemini } from './gemini';
import { decideAddress, type LocationCandidate } from './address-decision';
vi.mock('./gemini', () => ({ generateWithGemini: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const candidate: LocationCandidate = { id: 'geo:0', lat: -23, lng: -52, source: 'GEOAPIFY', formattedAddress: 'Rua Ivaí 400', numberMatched: true, streetMatched: true, precision: 'aproximada' };
it('selects coordinates exclusively from the supplied candidate', async () => {
  vi.mocked(generateWithGemini).mockResolvedValue(JSON.stringify({ decision: 'confirmar', candidateId: 'geo:0', reason: 'Correspondência encontrada', lat: 0, lng: 0 }));
  expect((await decideAddress({}, [candidate])).candidate).toEqual(candidate);
});
it('rejects nonexistent candidates, mismatched numbers, streets and invalid coordinates', async () => {
  vi.mocked(generateWithGemini).mockResolvedValue(JSON.stringify({ decision: 'confirmar', candidateId: 'ghost', reason: 'Encontrado' }));
  await expect(decideAddress({}, [candidate])).rejects.toThrow();
  vi.mocked(generateWithGemini).mockResolvedValue(JSON.stringify({ decision: 'confirmar', candidateId: 'geo:0', reason: 'Encontrado' }));
  for (const invalid of [{ ...candidate, numberMatched: false }, { ...candidate, streetMatched: false }, { ...candidate, lat: NaN }]) {
    await expect(decideAddress({}, [invalid])).rejects.toThrow();
  }
});
it('allows a review suggestion when the number is missing', async () => {
  vi.mocked(generateWithGemini).mockResolvedValue(JSON.stringify({ decision: 'revisar', candidateId: 'geo:0', reason: 'Numeração não localizada' }));
  expect((await decideAddress({}, [{ ...candidate, numberMatched: false }])).decision).toBe('revisar');
});
