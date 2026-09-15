import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { lookupCnefeAddress } from './cnefe';

const features = [
  {
    "properties": {
      "LOGRAD_NUM": "RUA LUIS CASSARO, 22",
      "CEP": "87235000",
      "DSC_LOCALIDADE": "CENTRO"
    },
    "geometry": {
      "type": "Point",
      "coordinates": [
        -52.69996,
        -23.4764099993099
      ]
    }
  },
  {
    "properties": {
      "LOGRAD_NUM": "RUA LUIS CASSARO, 92",
      "CEP": "87235000",
      "DSC_LOCALIDADE": "CENTRO"
    },
    "geometry": {
      "type": "Point",
      "coordinates": [
        -52.700244,
        -23.4751719993099
      ]
    }
  },
  {
    "properties": {
      "LOGRAD_NUM": "RUA LUIS CASSARO, 41",
      "CEP": "87235000",
      "DSC_LOCALIDADE": "CENTRO"
    },
    "geometry": {
      "type": "Point",
      "coordinates": [
        -52.700109,
        -23.4760609993099
      ]
    }
  },
  {
    "properties": {
      "LOGRAD_NUM": "RUA LUIS CASSARO, 35",
      "CEP": "87235000",
      "DSC_LOCALIDADE": "CENTRO"
    },
    "geometry": {
      "type": "Point",
      "coordinates": [
        -52.700087,
        -23.4761619993099
      ]
    }
  },
  {
    "properties": {
      "LOGRAD_NUM": "RUA LUIS CASSARO, 17",
      "CEP": "87235000",
      "DSC_LOCALIDADE": "CENTRO"
    },
    "geometry": {
      "type": "Point",
      "coordinates": [
        -52.700002,
        -23.4766199993099
      ]
    }
  }
];
let municipalityId = 4190000;
function dataset(streets: Array<[string, number, number]>) {
  const data = { features: streets.map(([address, lat, lng]) => ({
    properties: { LOGRAD_NUM: address, CEP: '87235000', DSC_LOCALIDADE: 'CENTRO' },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  })) };
  return mockDataset(data);
}
function mockDataset(data: unknown) {
  const bytes = zipSync({ 'addresses.json': strToU8(JSON.stringify(data)) });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
  return ++municipalityId;
}
afterEach(() => vi.unstubAllGlobals());
describe('CNEFE spelling correction', () => {
  it('corrects Luiz Cassaro and locates all five reported house numbers', async () => {
    const id = mockDataset({ features });
    for (const number of ['17', '41', '92', '35', '22']) {
      const corrected = await lookupCnefeAddress(id, 'rua luiz cassaro', number, 'centro');
      const exact = await lookupCnefeAddress(id, 'RUA LUIS CASSARO', number, 'CENTRO');
      expect(corrected).toEqual({ ...exact, correctedStreet: 'RUA LUIS CASSARO' });
      expect(corrected?.precision).toBe('exact');
    }
  });
  it('does not choose between equally similar street names', async () => {
    const id = dataset([['RUA LUIS CASSARO, 17', -23.47, -52.70], ['RUA LUIZ CASSARI, 17', -23.48, -52.71]]);
    expect(await lookupCnefeAddress(id, 'Rua Luiz Cassaro', '17')).toBeNull();
  });
  it('does not switch an existing street to a similar street for a missing number', async () => {
    const id = dataset([['RUA LUIZ CASSARO, 10', -23.47, -52.70], ['RUA LUIS CASSARO, 17', -23.48, -52.71]]);
    expect(await lookupCnefeAddress(id, 'Rua Luiz Cassaro', '17')).toBeNull();
  });
  it('keeps an estimated house number interpolated', async () => {
    const id = dataset([['RUA LUIS CASSARO, 10', -23.47, -52.70], ['RUA LUIS CASSARO, 20', -23.4701, -52.70]]);
    expect((await lookupCnefeAddress(id, 'Rua Luiz Cassaro', '14'))?.precision).toBe('interpolated');
  });
  it('rejects geographically conflicting records', async () => {
    const id = dataset([['RUA LUIS CASSARO, 17', -23.47, -52.70], ['RUA LUIS CASSARO, 17', -23.49, -52.70]]);
    expect(await lookupCnefeAddress(id, 'Rua Luiz Cassaro', '17')).toBeNull();
  });
});
