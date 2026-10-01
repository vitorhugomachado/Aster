import { describe, expect, it } from 'vitest';
import { addressSearchVariants } from './address-search';
describe('alternative address searches', () => {
  it('drops an incorrect postcode while preserving the number and municipality', () => {
    const base = new URL('https://api.geoapify.com/v1/geocode/search?postcode=12345678&housenumber=400&city=Curitiba&state=PR&filter=countrycode:br');
    const variants = addressSearchVariants(base, 'R.  Ivaí', '400', 'Curitiba', 'PR');
    expect(variants[0].searchParams.has('postcode')).toBe(false);
    expect(variants[0].searchParams.get('housenumber')).toBe('400');
    expect(variants[1].searchParams.get('text')).toBe('Rua Ivaí, 400, Curitiba, PR, Brasil');
    expect(variants[1].searchParams.get('filter')).toBe('countrycode:br');
  });
});
