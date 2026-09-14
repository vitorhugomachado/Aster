export type LeadStage = 'novo' | 'contatado' | 'qualificado' | 'proposta' | 'ganho' | 'perdido';
export type LeadSource = 'manual' | 'mapa' | 'importação';
export type LeadLocationQuality = 'exata' | 'aproximada' | 'informada' | 'pendente';

export interface LeadRecord {
  id: string;
  city: string;
  state: string;
  name?: string;
  street: string;
  number: string;
  neighborhood: string;
  zip: string;
  phone: string;
  email: string;
  stage: LeadStage;
  source: LeadSource;
  interestedPlan: string;
  notes: string;
  lat?: number;
  lng?: number;
  locationQuality: LeadLocationQuality;
  nextActionAt?: string;
  lastContactAt?: string;
  convertedClientId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface OpportunityScore {
  score: number;
  reasons: string[];
}

export interface NearbyClient {
  lat?: number;
  lng?: number;
  status?: string;
}

export const LEAD_STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: 'novo', label: 'Novo' },
  { id: 'contatado', label: 'Contatado' },
  { id: 'qualificado', label: 'Qualificado' },
  { id: 'proposta', label: 'Proposta' },
  { id: 'ganho', label: 'Ganho' },
  { id: 'perdido', label: 'Perdido' },
];

export const LEAD_STAGE_COLORS: Record<LeadStage, string> = {
  novo: '#5b3df5',
  contatado: '#3558d4',
  qualificado: '#a85200',
  proposta: '#8a3ffc',
  ganho: '#087a55',
  perdido: '#77737f',
};

export function distanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateOpportunityScore(lead: LeadRecord, clients: NearbyClient[], now = new Date()): OpportunityScore {
  if (lead.stage === 'ganho' || lead.stage === 'perdido') return { score: 0, reasons: ['Oportunidade encerrada'] };
  let score = 0;
  const reasons: string[] = [];
  if (lead.nextActionAt) {
    const actionAt = new Date(lead.nextActionAt);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const sevenDays = new Date(todayEnd.getTime() + 7 * 86_400_000);
    if (actionAt <= todayEnd) { score += 30; reasons.push('Retorno vencido ou para hoje +30'); }
    else if (actionAt <= sevenDays) { score += 15; reasons.push('Retorno nos próximos 7 dias +15'); }
  }
  const stagePoints: Partial<Record<LeadStage, number>> = { proposta: 25, qualificado: 20, contatado: 10 };
  const stagePoint = stagePoints[lead.stage] ?? 0;
  if (stagePoint) { score += stagePoint; reasons.push(`${LEAD_STAGES.find((item) => item.id === lead.stage)?.label} +${stagePoint}`); }
  if (lead.lat !== undefined && lead.lng !== undefined) {
    const nearest = clients
      .filter((client) => client.status === 'Ativo' && Number.isFinite(client.lat) && Number.isFinite(client.lng))
      .reduce((best, client) => Math.min(best, distanceMeters(
        { lat: lead.lat!, lng: lead.lng! },
        { lat: client.lat!, lng: client.lng! },
      )), Number.POSITIVE_INFINITY);
    if (nearest <= 500) { score += 20; reasons.push('Cliente ativo em até 500 m +20'); }
    else if (nearest <= 1_500) { score += 10; reasons.push('Cliente ativo em até 1,5 km +10'); }
  }
  if (lead.phone.trim()) { score += 15; reasons.push('Telefone informado +15'); }
  if (lead.interestedPlan.trim()) { score += 10; reasons.push('Plano de interesse +10'); }
  if (lead.locationQuality === 'exata') { score += 5; reasons.push('Localização exata +5'); }
  return { score: Math.min(100, score), reasons };
}

export function leadTitle(lead: Pick<LeadRecord, 'name' | 'street' | 'number'>) {
  return lead.name?.trim() || `Oportunidade — ${[lead.street, lead.number].filter(Boolean).join(', ') || 'sem endereço'}`;
}
