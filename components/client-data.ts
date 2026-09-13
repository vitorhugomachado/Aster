export type ClientStatus = 'Ativo' | 'Instalação' | 'Atenção' | 'Inativo' | 'Pendente';

export type LocationQuality = 'exata' | 'aproximada' | 'informada' | 'pendente';

export interface ClientRecord {
  id: string;
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
  pendingReason?: string;
  lat?: number;
  lng?: number;
  locationQuality: LocationQuality;
  source: 'demo' | 'importação';
}

export interface ParsedClient extends ClientRecord {
  rowNumber: number;
  issues: string[];
  needsGeocoding: boolean;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  importedAt: Date;
  total: number;
  mapped: number;
  pending: number;
  rejected: number;
}

export const STATUS_COLORS: Record<ClientStatus, string> = {
  Ativo: '#12845f',
  Instalação: '#d99a28',
  Atenção: '#dc5a56',
  Inativo: '#7c8b84',
  Pendente: '#6f7e77',
};

export const DEMO_CLIENTS: ClientRecord[] = [
  {
    id: 'CLI-001', name: 'Cliente 001', street: 'Rua das Acácias', number: '184',
    complement: '', neighborhood: 'Jardins', city: 'São Paulo', state: 'SP', zip: '01418-000',
    status: 'Ativo', plan: '600 Mega', lat: -23.5676, lng: -46.6572,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-002', name: 'Cliente 002', street: 'Alameda Horizonte', number: '92',
    complement: 'Apto. 34', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', zip: '01310-100',
    status: 'Ativo', plan: '400 Mega', lat: -23.5619, lng: -46.6488,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-003', name: 'Cliente 003', street: 'Rua do Bosque', number: '415',
    complement: '', neighborhood: 'Paraíso', city: 'São Paulo', state: 'SP', zip: '04002-002',
    status: 'Instalação', plan: '800 Mega', lat: -23.5742, lng: -46.6424,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-004', name: 'Cliente 004', street: 'Avenida Central', number: '710',
    complement: 'Loja 2', neighborhood: 'Liberdade', city: 'São Paulo', state: 'SP', zip: '01503-000',
    status: 'Ativo', plan: '1 Giga', lat: -23.5568, lng: -46.6362,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-005', name: 'Cliente 005', street: 'Rua Primavera', number: '51',
    complement: '', neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', zip: '01303-050',
    status: 'Atenção', plan: '500 Mega', lat: -23.5507, lng: -46.6547,
    locationQuality: 'aproximada', source: 'demo',
  },
  {
    id: 'CLI-006', name: 'Cliente 006', street: 'Rua das Palmeiras', number: '288',
    complement: 'Casa 2', neighborhood: 'Vila Mariana', city: 'São Paulo', state: 'SP', zip: '04102-000',
    status: 'Ativo', plan: '700 Mega', lat: -23.5841, lng: -46.6358,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-007', name: 'Cliente 007', street: 'Travessa Ipê', number: '19',
    complement: '', neighborhood: 'Aclimação', city: 'São Paulo', state: 'SP', zip: '01531-010',
    status: 'Instalação', plan: '500 Mega', lat: -23.5711, lng: -46.6269,
    locationQuality: 'informada', source: 'demo',
  },
  {
    id: 'CLI-008', name: 'Cliente 008', street: 'Alameda Aurora', number: '133',
    complement: '', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP', zip: '05422-010',
    status: 'Inativo', plan: '300 Mega', lat: -23.5645, lng: -46.6858,
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
  id: ['cliente_id', 'id_cliente', 'codigo_cliente', 'codigo', 'id', 'contrato', 'numero_contrato', 'id_contrato'],
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
  classification: ['classif', 'classificacao'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'lon', 'long'],
} as const;

export const TEMPLATE_CSV = [
  'nome,logradouro,numero,cliente_id,complemento,bairro,cidade,uf,cep,status_cliente,plano,latitude,longitude',
  'Cliente exemplo,Rua Exemplo,120,CLI-1001,,Centro,São Paulo,SP,01000-000,Ativo,600 Mega,-23.5505,-46.6333',
].join('\r\n');
