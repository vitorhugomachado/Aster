export type ClientStatus = 'Ativo' | 'Instalação' | 'Atenção' | 'Inativo' | 'Pendente';

export type LocationQuality = 'exata' | 'aproximada' | 'informada' | 'pendente';

export interface CityProfile {
  ibgeId?: number;
  name: string;
  state: string;
  center?: { lat: number; lng: number };
  bounds?: { north: number; south: number; east: number; west: number };
  boundary?: Array<Array<{ lat: number; lng: number }>>;
}

export interface ClientRecord {
  id: string;
  externalId?: string;
  name: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  status: ClientStatus;
  plan: string;
  registeredAt?: string;
  customerType?: string;
  phone?: string;
  email?: string;
  document?: string;
  contract?: string;
  pendingReason?: string;
  lat?: number;
  lng?: number;
  suggestedLat?: number;
  suggestedLng?: number;
  suggestedAddress?: string;
  suggestionSource?: string;
  locationQuality: LocationQuality;
  source: 'demo' | 'importação' | 'manual';
  importBatchId?: string;
  importRowNumber?: number;
  importIssues?: string[];
}

export interface ParsedClient extends ClientRecord {
  rowNumber: number;
  issues: string[];
  needsGeocoding: boolean;
}

export interface ImportBatch {
  id: string;
  name: string;
  fileName: string;
  city: string;
  state: string;
  importedAt: Date;
  total: number;
  mapped: number;
  pending: number;
  rejected: number;
  clientIds: string[];
}

export const STATUS_COLORS: Record<ClientStatus, string> = {
  Ativo: '#05944f',
  Instalação: '#e57200',
  Atenção: '#e11900',
  Inativo: '#6f6f6f',
  Pendente: '#545454',
};

export const DEMO_CLIENTS: ClientRecord[] = [
  {
    id: 'CLI-001', name: 'Cliente 001', street: 'Rua das Acácias', number: '184',
    complement: '', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Ativo', plan: '600 Mega', lat: -23.3421, lng: -52.7754,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-002', name: 'Cliente 002', street: 'Alameda Horizonte', number: '92',
    complement: 'Casa 2', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Ativo', plan: '400 Mega', lat: -23.3417, lng: -52.7767,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-003', name: 'Cliente 003', street: 'Rua do Bosque', number: '415',
    complement: '', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Instalação', plan: '800 Mega', lat: -23.3355, lng: -52.7741,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-004', name: 'Cliente 004', street: 'Avenida Central', number: '710',
    complement: 'Loja 2', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Ativo', plan: '1 Giga', lat: -23.3388, lng: -52.7802,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-005', name: 'Cliente 005', street: 'Rua Primavera', number: '51',
    complement: '', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Atenção', plan: '500 Mega', lat: -23.3442, lng: -52.7798,
    locationQuality: 'aproximada', source: 'demo',
  },
  {
    id: 'CLI-006', name: 'Cliente 006', street: 'Rua das Palmeiras', number: '288',
    complement: 'Casa 2', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Ativo', plan: '700 Mega', lat: -23.3374, lng: -52.7769,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-007', name: 'Cliente 007', street: 'Travessa Ipê', number: '19',
    complement: '', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Instalação', plan: '500 Mega', lat: -23.3408, lng: -52.7821,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-008', name: 'Cliente 008', street: 'Alameda Aurora', number: '133',
    complement: '', neighborhood: 'Centro', city: 'Guaporema', state: 'PR', zip: '',
    status: 'Inativo', plan: '300 Mega', lat: -23.3460, lng: -52.7772,
    locationQuality: 'informada', source: 'demo',
  },
];

export function normalizeText(value: unknown) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text.startsWith('=') ? '' : text;
}

export function normalizeKey(value: unknown) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeStatus(value: unknown): ClientStatus {
  const key = normalizeKey(value);
  if (['ativo', 'active'].includes(key)) return 'Ativo';
  if (['instalacao', 'em_instalacao', 'aguardando_instalacao'].includes(key)) return 'Instalação';
  if (['atencao', 'inadimplente', 'suspenso', 'bloqueado'].includes(key)) return 'Atenção';
  if (['inativo', 'cancelado', 'cancelada'].includes(key)) return 'Inativo';
  return 'Pendente';
}

export const HEADER_ALIASES = {
  id: ['cliente_id', 'id_cliente', 'codigo_cliente', 'codigo', 'id'],
  name: ['nome', 'nome_cliente', 'cliente', 'razao_social'],
  street: ['logradouro', 'rua', 'endereco', 'endereco_completo'],
  number: ['numero', 'numero_endereco', 'n', 'nr'],
  complement: ['complemento', 'complemento_endereco'],
  neighborhood: ['bairro'],
  city: ['cidade', 'municipio'],
  state: ['uf', 'estado'],
  zip: ['cep', 'codigo_postal'],
  status: ['status_cliente', 'status', 'situacao'],
  plan: ['plano', 'plano_atual', 'velocidade'],
  registeredAt: ['cadastro', 'data_cadastro', 'cadastrado_em'],
  customerType: ['tipo_cadastro', 'tipo_de_cadastro'],
  phone: ['celular', 'telefone', 'telefone_celular', 'whatsapp', 'fone'],
  email: ['email', 'e_mail'],
  document: ['documento', 'cpf', 'cnpj', 'cpf_cnpj'],
  contract: ['contrato', 'numero_contrato', 'id_contrato'],
  classification: ['classif', 'classificacao'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
} as const;

export const TEMPLATE_CSV = [
  'nome,logradouro,numero,cliente_id,contrato,celular,email,documento,complemento,bairro,cidade,uf,cep,status_cliente,plano,latitude,longitude',
  'Cliente exemplo,Rua Exemplo,120,CLI-1001,CT-1001,(44) 99999-9999,cliente@exemplo.com,000.000.000-00,,Centro,Guaporema,PR,,Ativo,600 Mega,,',
].join('\r\n');
