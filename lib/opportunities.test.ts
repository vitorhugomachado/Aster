import { describe, expect, it } from 'vitest';
import { calculateOpportunityScore, distanceMeters, leadTitle, type LeadRecord } from './opportunities';

const baseLead: LeadRecord = {
  id: 'lead-1', city: 'Guaporema', state: 'PR', name: 'Mercado Central', street: 'Rua Paraná', number: '10',
  neighborhood: 'Centro', zip: '', phone: '', email: '', stage: 'novo', source: 'manual', interestedPlan: '', notes: '',
  lat: -23.3402, lng: -52.7786, locationQuality: 'informada', createdAt: '2026-09-14T10:00:00.000Z', updatedAt: '2026-09-14T10:00:00.000Z',
};

describe('opportunity intelligence', () => {
  it('keeps a closed lead out of the ranking', () => {
    expect(calculateOpportunityScore({ ...baseLead, stage: 'ganho' }, []).score).toBe(0);
  });

  it('calculates and caps transparent priority signals', () => {
    const result = calculateOpportunityScore({
      ...baseLead, stage: 'proposta', phone: '(44) 99999-9999', interestedPlan: '700 Mega', locationQuality: 'exata',
      nextActionAt: '2026-09-14T08:00:00.000Z',
    }, [{ lat: -23.3401, lng: -52.7785, status: 'Ativo' }], new Date('2026-09-14T12:00:00.000Z'));
    expect(result.score).toBe(100);
    expect(result.reasons).toContain('Retorno vencido ou para hoje +30');
    expect(result.reasons).toContain('Cliente ativo em até 500 m +20');
  });

  it('creates a useful title for unnamed addresses', () => {
    expect(leadTitle({ name: '', street: 'Rua Paraná', number: '10' })).toBe('Oportunidade — Rua Paraná, 10');
  });

  it('measures nearby coordinates in meters', () => {
    expect(distanceMeters({ lat: -23.3402, lng: -52.7786 }, { lat: -23.3402, lng: -52.7786 })).toBe(0);
  });
});
