import { describe, expect, it } from 'vitest';
import { isProviderClientRow } from './client-data';
describe('provider export rows', () => {
  it('accepts addresses in exports without a code column', () => {
    expect(isProviderClientRow({ id: '', name: 'Cliente exemplo', street: 'Rua Exemplo', number: '884' })).toBe(true);
  });
  it('ignores city-only group headings', () => {
    expect(isProviderClientRow({ id: '', name: '', street: '', number: '' })).toBe(false);
  });
  it('keeps incomplete records for review instead of silently dropping them', () => {
    expect(isProviderClientRow({ id: '', name: 'Cliente incompleto', street: '', number: '' })).toBe(true);
    expect(isProviderClientRow({ id: '123', name: '', street: '', number: '' })).toBe(true);
  });
});
