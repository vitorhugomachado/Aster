'use client';

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { readSheet } from 'read-excel-file/browser';
import * as Papa from 'papaparse';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  FileUp,
  History,
  List,
  LoaderCircle,
  MapPin,
  MapPinned,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { ClientMap } from './ClientMap';
import {
  CityProfile,
  ClientRecord,
  ClientStatus,
  DEMO_CLIENTS,
  HEADER_ALIASES,
  ImportBatch,
  ParsedClient,
  STATUS_COLORS,
  TEMPLATE_CSV,
  normalizeKey,
  normalizeStatus,
  normalizeText,
} from './client-data';

type ViewName = 'mapa' | 'lista' | 'importacoes';

interface ImportPreview {
  fileName: string;
  rows: ParsedClient[];
  providerTemplate: boolean;
  missingCity: boolean;
  missingState: boolean;
}

const STATUS_OPTIONS: Array<ClientStatus | 'Todos'> = [
  'Todos',
  'Ativo',
  'Instalação',
  'Atenção',
  'Inativo',
  'Pendente',
];

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const CITY_STATE_HINTS: Record<string, string> = {
  guaporema: 'SP',
};

const DEFAULT_CITY_PROFILE: CityProfile = {
  name: 'São Paulo',
  state: 'SP',
  center: { lat: -23.5505, lng: -46.6333 },
};

function asNumber(value: unknown) {
  const text = normalizeText(value).replace(',', '.');
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function recordFromParsed(row: ParsedClient): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    street: row.street,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    zip: row.zip,
    status: row.status,
    plan: row.plan,
    registeredAt: row.registeredAt,
    customerType: row.customerType,
    pendingReason: row.pendingReason,
    lat: row.lat,
    lng: row.lng,
    locationQuality: row.locationQuality,
    source: row.source,
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CL';
}

function generatedClientId(name: string, street: string, number: string, city: string) {
  const source = normalizeKey([name, street, number, city].join('|'));
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `AUTO-${(hash >>> 0).toString(36).toUpperCase()}`;
}

export function FibraMapApp() {
  const [clients, setClients] = useState<ClientRecord[]>(DEMO_CLIENTS);
  const [view, setView] = useState<ViewName>('mapa');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [cityProfiles, setCityProfiles] = useState<CityProfile[]>([DEFAULT_CITY_PROFILE]);
  const [cityOpen, setCityOpen] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [newCityState, setNewCityState] = useState('SP');
  const [cityBusy, setCityBusy] = useState(false);
  const [cityError, setCityError] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'Todos'>('Todos');
  const [plan, setPlan] = useState('Todos');
  const [selectedId, setSelectedId] = useState<string | null>('CLI-001');
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importCityOverride, setImportCityOverride] = useState('');
  const [importStateOverride, setImportStateOverride] = useState('');
  const [importDefaultStatus, setImportDefaultStatus] = useState<ClientStatus>('Ativo');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [toast, setToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cities = useMemo(
    () => [...cityProfiles].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    [cityProfiles],
  );

  const activeCityProfile = useMemo(
    () => cityProfiles.find((profile) => normalizeKey(profile.name) === normalizeKey(city)) ?? null,
    [city, cityProfiles],
  );

  const plans = useMemo(
    () => Array.from(new Set(clients.map((client) => client.plan).filter(Boolean))).sort(),
    [clients],
  );

  const cityClients = useMemo(
    () => clients.filter((client) => normalizeKey(client.city) === normalizeKey(city)),
    [city, clients],
  );

  const visibleClients = useMemo(() => {
    const search = normalizeKey(query);
    return cityClients.filter((client) => {
      const matchesStatus = status === 'Todos' || client.status === status;
      const matchesPlan = plan === 'Todos' || client.plan === plan;
      const haystack = normalizeKey([
        client.id,
        client.name,
        client.street,
        client.number,
        client.neighborhood,
        client.city,
        client.zip,
        client.plan,
      ].join(' '));
      return matchesStatus && matchesPlan && (!search || haystack.includes(search));
    });
  }, [cityClients, plan, query, status]);

  const selected = visibleClients.find((client) => client.id === selectedId) ?? null;
  const locatedCount = cityClients.filter((client) => client.lat !== undefined && client.lng !== undefined).length;
  const pendingCount = cityClients.length - locatedCount;

  const counts = useMemo(() => {
    return STATUS_OPTIONS.slice(1).reduce<Record<string, number>>((result, option) => {
      result[option] = cityClients.filter((client) => client.status === option).length;
      return result;
    }, {});
  }, [cityClients]);

  const handleMapSelect = useCallback((id: string) => setSelectedId(id), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && importOpen) setImportOpen(false);
      if (event.key === 'Escape' && cityOpen) setCityOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cityOpen, importOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function openImporter() {
    if (!activeCityProfile) {
      setCityError('');
      setCityOpen(true);
      return;
    }
    setImportError('');
    setImportPreview(null);
    setImportCityOverride(activeCityProfile.name);
    setImportStateOverride(activeCityProfile.state);
    setImportDefaultStatus('Ativo');
    setImportOpen(true);
  }

  async function lookupCityProfile(name: string, state: string): Promise<CityProfile> {
    const response = await fetch('/api/city-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: name, state }),
    });
    const result = await response.json().catch(() => ({})) as Partial<CityProfile> & { message?: string };
    if (!response.ok || !result.name || !result.state || !result.center || !result.bounds) {
      throw new Error(result.message || 'Não foi possível confirmar essa cidade no Google.');
    }
    return {
      name: result.name,
      state: result.state,
      center: result.center,
      bounds: result.bounds,
    };
  }

  function rememberCity(profile: CityProfile) {
    setCityProfiles((current) => {
      const exists = current.some(
        (item) => normalizeKey(item.name) === normalizeKey(profile.name) && item.state === profile.state,
      );
      return exists
        ? current.map((item) => normalizeKey(item.name) === normalizeKey(profile.name) && item.state === profile.state ? profile : item)
        : [...current, profile];
    });
    setCity(profile.name);
    setImportCityOverride(profile.name);
    setImportStateOverride(profile.state);
  }

  async function addCity() {
    const cityName = normalizeText(newCity);
    if (!cityName || !newCityState) {
      setCityError('Informe o nome da cidade e a UF.');
      return;
    }
    setCityBusy(true);
    setCityError('');
    try {
      const profile = await lookupCityProfile(cityName, newCityState);
      rememberCity(profile);
      setCityOpen(false);
      setNewCity('');
      setToast(`${profile.name}/${profile.state} cadastrada e definida como cidade ativa.`);
    } catch (error) {
      setCityError(error instanceof Error ? error.message : 'Não foi possível cadastrar a cidade.');
    } finally {
      setCityBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${TEMPLATE_CSV}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-clientes-fibra.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function matrixFromFile(file: File): Promise<unknown[][]> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'csv') {
      const text = await file.text();
      const result = Papa.parse<unknown[]>(text, { skipEmptyLines: 'greedy' });
      if (result.errors.length) throw new Error(`Não foi possível ler o CSV: ${result.errors[0].message}`);
      return result.data;
    }
    if (extension === 'xlsx') return readSheet(file) as Promise<unknown[][]>;
    throw new Error('Use um arquivo .xlsx ou .csv. O formato antigo .xls não é aceito nesta versão.');
  }

  async function parseFile(file: File) {
    setImportError('');
    setImportBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('A planilha deve ter no máximo 5 MB nesta demonstração.');
      const matrix = await matrixFromFile(file);
      if (matrix.length < 2) throw new Error('A planilha precisa ter um cabeçalho e pelo menos uma linha de cliente.');
      if (matrix.length > 5001) throw new Error('Esta demonstração aceita até 5.000 clientes por arquivo.');

      const headerKeys = matrix[0].map(normalizeKey);
      const providerRegistryTemplate = [
        'codigo', 'cadastro', 'cliente', 'tipo_cadastro', 'classif',
        'documento', 'email', 'celular', 'cidade', 'bairro',
      ].every((header) => headerKeys.includes(header));
      const providerAddressTemplate = [
        'cliente', 'cidade', 'bairro', 'logradouro', 'numero',
      ].every((header) => headerKeys.includes(header));
      const providerTemplate = providerRegistryTemplate || providerAddressTemplate;
      const mapping = Object.fromEntries(
        Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
          field,
          headerKeys.findIndex((header) => (aliases as readonly string[]).includes(header)),
        ]),
      ) as Record<keyof typeof HEADER_ALIASES, number>;

      const existingIds = new Set(clients.map((client) => normalizeKey(client.id)));
      const fileIds = new Set<string>();
      const nonEmptyRows = matrix
        .slice(1)
        .map((row, index) => ({ row, sheetRow: index + 2 }))
        .filter(({ row }) => row.some((cell) => normalizeText(cell)));
      const sourceRows = providerTemplate
        ? nonEmptyRows.filter(({ row }) => {
            const id = mapping.id >= 0 ? normalizeText(row[mapping.id]) : '';
            const classification = mapping.classification >= 0 ? normalizeText(row[mapping.classification]) : '';
            const name = mapping.name >= 0 ? normalizeText(row[mapping.name]) : '';
            const street = mapping.street >= 0 ? normalizeText(row[mapping.street]) : '';
            const number = mapping.number >= 0 ? normalizeText(row[mapping.number]) : '';
            return mapping.classification >= 0
              ? Boolean(id && classification)
              : Boolean(name || street || number);
          })
        : nonEmptyRows;
      const cityColumn = mapping.city;
      const firstCity = cityColumn >= 0
        ? sourceRows.map(({ row }) => normalizeText(row[cityColumn])).find(Boolean) ?? ''
        : '';
      const stateColumn = mapping.state;
      const firstState = stateColumn >= 0
        ? sourceRows.map(({ row }) => normalizeText(row[stateColumn]).toUpperCase()).find(Boolean) ?? ''
        : '';
      const requestedCity = firstCity || activeCityProfile?.name || '';
      const requestedState = firstState
        || CITY_STATE_HINTS[normalizeKey(requestedCity)]
        || (activeCityProfile && normalizeKey(activeCityProfile.name) === normalizeKey(requestedCity)
          ? activeCityProfile.state
          : '');
      if (!requestedCity || !requestedState) {
        throw new Error('Cadastre a cidade e a UF antes de importar esta planilha.');
      }

      const storedProfile = cityProfiles.find(
        (profile) => normalizeKey(profile.name) === normalizeKey(requestedCity)
          && profile.state === requestedState
          && profile.bounds,
      );
      const importCityProfile = storedProfile ?? await lookupCityProfile(requestedCity, requestedState);
      rememberCity(importCityProfile);
      const fallbackCity = importCityProfile.name;
      const inferredState = importCityProfile.state;
      setImportCityOverride(fallbackCity);
      setImportStateOverride(inferredState);

      const rows = sourceRows.map(({ row: sourceRow, sheetRow }): ParsedClient => {
        const get = (field: keyof typeof HEADER_ALIASES) => {
          const column = mapping[field];
          return column >= 0 ? normalizeText(sourceRow[column]) : '';
        };

        const explicitId = get('id');
        const name = get('name');
        const street = get('street');
        const number = get('number');
        const sourceCity = get('city');
        const sourceState = get('state').toUpperCase();
        const cityValue = fallbackCity;
        const id = explicitId || generatedClientId(name, street, number, cityValue);
        const state = inferredState;
        const rawStatus = get('status');
        const classification = normalizeKey(get('classification'));
        const rawLat = get('lat');
        const rawLng = get('lng');
        const lat = asNumber(rawLat);
        const lng = asNumber(rawLng);
        const hasCoordinateInput = Boolean(rawLat || rawLng);
        const coordinatesValid = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        const coordinatesInsideCity = coordinatesValid
          && Boolean(importCityProfile.bounds)
          && lat <= importCityProfile.bounds!.north
          && lat >= importCityProfile.bounds!.south
          && lng <= importCityProfile.bounds!.east
          && lng >= importCityProfile.bounds!.west;
        const hasCoordinates = coordinatesValid && coordinatesInsideCity;
        const hasRequiredAddress = Boolean(name && street && number);
        const canGeocode = Boolean(hasRequiredAddress && cityValue && state);
        const issues: string[] = [];
        const normalizedId = normalizeKey(id);

        if (!name) issues.push('nome ausente');
        if (!street) issues.push('logradouro ausente');
        if (!number) issues.push('número ausente');
        if (sourceCity && normalizeKey(sourceCity) !== normalizeKey(fallbackCity)) {
          issues.push(`cidade diferente de ${fallbackCity}/${inferredState}`);
        }
        if (sourceState && sourceState !== inferredState) {
          issues.push(`UF diferente de ${inferredState}`);
        }
        if (normalizedId && (existingIds.has(normalizedId) || fileIds.has(normalizedId))) issues.push('registro duplicado');
        if (normalizedId) fileIds.add(normalizedId);
        if (providerTemplate && classification && classification !== 'cliente') issues.push('registro classificado como Fornecedor');
        if (hasCoordinateInput && !coordinatesValid) issues.push('latitude/longitude inválidas');
        if (coordinatesValid && !coordinatesInsideCity) issues.push('coordenadas fora da cidade ativa');

        return {
          id,
          name: name || `Linha ${sheetRow}`,
          street,
          number,
          complement: get('complement'),
          neighborhood: get('neighborhood'),
          city: cityValue,
          state,
          zip: get('zip'),
          status: rawStatus ? normalizeStatus(rawStatus) : importDefaultStatus,
          plan: get('plan') || 'Não informado',
          registeredAt: get('registeredAt') || undefined,
          customerType: get('customerType') || undefined,
          pendingReason: !hasCoordinates && hasRequiredAddress && !canGeocode
            ? 'Informe cidade e UF para localizar o endereço'
            : undefined,
          lat: hasCoordinates ? lat : undefined,
          lng: hasCoordinates ? lng : undefined,
          locationQuality: hasCoordinates ? 'informada' : 'pendente',
          source: 'importação',
          rowNumber: sheetRow,
          issues,
          needsGeocoding: !hasCoordinates && canGeocode,
        };
      });

      setImportPreview({
        fileName: file.name,
        rows,
        providerTemplate,
        missingCity: mapping.city < 0,
        missingState: mapping.state < 0,
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível processar a planilha.');
    } finally {
      setImportBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void parseFile(file);
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  }

  async function geocode(row: ParsedClient): Promise<ClientRecord> {
    const base = recordFromParsed(row);
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          street: row.street,
          number: row.number,
          neighborhood: row.neighborhood,
          city: row.city,
          state: row.state,
          zip: row.zip,
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        lat?: number;
        lng?: number;
        quality?: 'exata' | 'aproximada';
        message?: string;
      };
      if (
        !response.ok
        || typeof result.lat !== 'number'
        || typeof result.lng !== 'number'
        || !result.quality
      ) {
        return {
          ...base,
          pendingReason: result.message || 'Endereço não confirmado dentro da cidade ativa.',
          locationQuality: 'pendente',
        };
      }
      return {
        ...base,
        lat: result.lat,
        lng: result.lng,
        pendingReason: undefined,
        locationQuality: result.quality,
      };
    } catch {
      return {
        ...base,
        pendingReason: 'Falha temporária ao consultar o Google.',
        locationQuality: 'pendente',
      };
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    if (!activeCityProfile?.bounds) {
      setImportError('Cadastre e valide a cidade antes de iniciar a localização.');
      return;
    }
    setImportBusy(true);
    setImportError('');
    const valid = importPreview.rows
      .filter((row) => row.issues.length === 0)
      .map((row) => {
        const rowCity = activeCityProfile.name;
        const rowState = activeCityProfile.state;
        return {
          ...row,
          city: rowCity,
          state: rowState,
          status: importPreview.providerTemplate ? importDefaultStatus : row.status,
          needsGeocoding: row.lat === undefined && Boolean(row.name && row.street && row.number && rowCity && rowState),
        };
      });
    const resolved: ClientRecord[] = [];
    let geocoded = 0;

    for (let start = 0; start < valid.length; start += 5) {
      const batch = valid.slice(start, start + 5);
      const results = await Promise.all(batch.map(async (row) => {
        if (!row.needsGeocoding || geocoded >= 250) return recordFromParsed(row);
        geocoded += 1;
        return geocode(row);
      }));
      resolved.push(...results);
    }

    const mapped = resolved.filter((row) => row.lat !== undefined && row.lng !== undefined).length;
    const pending = resolved.length - mapped;
    const rejected = importPreview.rows.length - valid.length;
    setClients((current) => [...current, ...resolved]);
    setHistory((current) => [{
      id: crypto.randomUUID(),
      fileName: importPreview.fileName,
      importedAt: new Date(),
      total: importPreview.rows.length,
      mapped,
      pending,
      rejected,
    }, ...current]);

    const importedCity = resolved.find((row) => row.city)?.city;
    if (importedCity) setCity(importedCity);
    setStatus('Todos');
    setPlan('Todos');
    setSelectedId(resolved.find((row) => row.lat !== undefined)?.id ?? null);
    setImportBusy(false);
    setImportOpen(false);
    setImportPreview(null);
    setView('mapa');
    setToast(mapped
      ? `${mapped} cliente${mapped === 1 ? '' : 's'} confirmado${mapped === 1 ? '' : 's'} em ${activeCityProfile.name}/${activeCityProfile.state}${pending ? ` · ${pending} aguardando revisão` : ''}${rejected ? ` · ${rejected} com erro` : ''}.`
      : `Nenhum endereço foi confirmado em ${activeCityProfile.name}/${activeCityProfile.state}. Verifique a chave do Google e os registros pendentes.`);
  }

  function resetDemo() {
    setClients(DEMO_CLIENTS);
    setCityProfiles([DEFAULT_CITY_PROFILE]);
    setHistory([]);
    setCity('São Paulo');
    setStatus('Todos');
    setPlan('Todos');
    setQuery('');
    setSelectedId('CLI-001');
    setView('mapa');
    setToast('Demonstração restaurada.');
  }

  const previewReady = importPreview?.rows.filter((row) => row.issues.length === 0 && row.lat !== undefined && row.lng !== undefined).length ?? 0;
  const previewGeocode = importPreview?.rows.filter((row) => row.issues.length === 0 && row.needsGeocoding).length ?? 0;
  const previewPending = importPreview?.rows.filter((row) => row.issues.length === 0 && row.lat === undefined && !row.needsGeocoding).length ?? 0;
  const previewErrors = importPreview?.rows.filter((row) => row.issues.length > 0).length ?? 0;
  const previewImportable = previewReady + previewGeocode + previewPending;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true"><Wifi size={20} strokeWidth={2.6} /></span>
          <div><strong>FibraMapa</strong><span>Inteligência comercial</span></div>
        </div>

        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar cliente ou endereço"
            placeholder="Buscar ID, bairro, endereço ou CEP"
          />
          <kbd>Ctrl K</kbd>
        </label>

        <div className="top-actions">
          <span className="demo-badge">Dados fictícios</span>
          <button className="icon-button" aria-label="Notificações"><Bell size={16} /></button>
          <button className="profile-button"><span>SC</span><span className="profile-name">Stefani<br /><small>Comercial</small></span></button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="city-label">Cidade selecionada</div>
        <label className="city-picker">
          <MapPin size={17} aria-hidden="true" />
          <span><b>{city}</b><small>{activeCityProfile?.bounds ? `${activeCityProfile.state} · área validada` : 'Cidade ainda não validada'}</small></span>
          <select
            aria-label="Selecionar cidade"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setSelectedId(null);
            }}
          >
            {cities.map((item) => <option key={`${item.name}-${item.state}`} value={item.name}>{item.name}/{item.state}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <button
          className="add-city-button"
          onClick={() => {
            setCityError('');
            setCityOpen(true);
          }}
        >
          <Plus size={14} />Cadastrar nova cidade
        </button>

        <nav className="nav-list" aria-label="Navegação principal">
          <button className={view === 'mapa' ? 'active' : ''} onClick={() => setView('mapa')}><MapPinned size={18} />Mapa de clientes</button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}><List size={18} />Lista de clientes</button>
          <button className={view === 'importacoes' ? 'active' : ''} onClick={() => setView('importacoes')}><History size={18} />Importações</button>
        </nav>

        <section className="summary-card">
          <span className="eyebrow">Visão da cidade</span>
          <div className="total-line"><strong>{cityClients.length.toLocaleString('pt-BR')}</strong><span>clientes na base</span></div>
          <div className="summary-row"><span><i className="dot active-dot" />Ativos</span><b>{counts.Ativo ?? 0}</b></div>
          <div className="summary-row"><span><i className="dot install-dot" />Instalação</span><b>{counts['Instalação'] ?? 0}</b></div>
          <div className="summary-row"><span><i className="dot alert-dot" />Atenção</span><b>{counts['Atenção'] ?? 0}</b></div>
          <div className="summary-row"><span><i className="dot pending-dot" />Sem localização</span><b>{pendingCount}</b></div>
        </section>

        <button className="import-button" onClick={openImporter}><Upload size={16} />Importar planilha</button>
        <button className="reset-button" onClick={resetDemo}><RefreshCcw size={13} />Restaurar demonstração</button>
      </aside>

      <section className="content-stage">
        {view === 'mapa' && (
          <>
            <div className="map-toolbar">
              <label className="filter-button"><SlidersHorizontal size={14} /><span>{visibleClients.length} exibidos</span></label>
              <label className="filter-button">
                <span className="filter-label">Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as ClientStatus | 'Todos')}>
                  {STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="filter-button">
                <span className="filter-label">Plano</span>
                <select value={plan} onChange={(event) => setPlan(event.target.value)}>
                  <option>Todos</option>
                  {plans.map((option) => <option key={option}>{option}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
            </div>

            <ClientMap
              clients={visibleClients}
              cityProfile={activeCityProfile}
              selectedId={selectedId}
              onSelect={handleMapSelect}
            />

            {selected && selected.lat !== undefined && selected.lng !== undefined && (
              <article className="client-popover">
                <div className="popover-top">
                  <span>{initials(selected.name)}</span>
                  <div><b>{selected.name}</b><small>{selected.id} · {selected.source === 'demo' ? 'registro fictício' : 'importado'}</small></div>
                  <button onClick={() => setSelectedId(null)} aria-label="Fechar detalhes"><X size={15} /></button>
                </div>
                <div className="popover-meta">
                  <span>Plano atual<b>{selected.plan}</b></span>
                  <span>Status<b style={{ color: STATUS_COLORS[selected.status] }}>● {selected.status}</b></span>
                </div>
                <div className="popover-address"><MapPin size={17} /><p>{selected.street}, {selected.number}{selected.complement ? ` · ${selected.complement}` : ''}<br /><small>{selected.neighborhood} · {selected.city}, {selected.state}</small></p></div>
                <div className={`quality-tag quality-${selected.locationQuality}`}>{selected.locationQuality === 'aproximada' ? 'Localização aproximada — revisar' : 'Coordenada pronta para uso'}</div>
              </article>
            )}

            <div className="map-key">
              <span><i className="dot active-dot" />Ativo</span>
              <span><i className="dot install-dot" />Instalação</span>
              <span><i className="dot alert-dot" />Atenção</span>
              <span><i className="dot inactive-dot" />Inativo</span>
            </div>
            <div className="privacy-note"><ShieldCheck size={16} /><span><b>Demonstração segura</b> O arquivo fica somente nesta sessão. Com o Google ativo, apenas os componentes do endereço são enviados para localização.</span></div>
          </>
        )}

        {view === 'lista' && (
          <section className="panel-view">
            <div className="panel-heading"><div><span className="eyebrow">Base atual</span><h1>Lista de clientes</h1><p>{visibleClients.length} registros após os filtros.</p></div><button className="primary-small" onClick={openImporter}><Upload size={15} />Importar</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cliente</th><th>Endereço</th><th>Bairro</th><th>Plano</th><th>Status</th><th>Localização</th></tr></thead>
                <tbody>
                  {visibleClients.map((client) => (
                    <tr key={client.id} onClick={() => { setSelectedId(client.id); setView('mapa'); }}>
                      <td><b>{client.name}</b><small>{client.id}</small></td>
                      <td>{client.street ? `${client.street}, ${client.number}` : 'Não informado'}</td>
                      <td>{client.neighborhood || '—'}</td>
                      <td>{client.plan}</td>
                      <td><span className="status-pill" style={{ color: STATUS_COLORS[client.status] }}><i style={{ background: STATUS_COLORS[client.status] }} />{client.status}</span></td>
                      <td>{client.lat !== undefined ? <span className="mapped"><CheckCircle2 size={14} />Mapeado</span> : <span className="unmapped" title={client.pendingReason}><Clock3 size={14} />Revisar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleClients.length && <div className="empty-table">Nenhum cliente corresponde aos filtros.</div>}
            </div>
          </section>
        )}

        {view === 'importacoes' && (
          <section className="panel-view">
            <div className="panel-heading"><div><span className="eyebrow">Controle de qualidade</span><h1>Importações</h1><p>Acompanhe arquivos, registros mapeados e linhas que precisam de revisão.</p></div><button className="primary-small" onClick={openImporter}><FileUp size={15} />Nova importação</button></div>
            <div className="metric-grid">
              <div><MapPinned size={18} /><span>Mapeados</span><b>{locatedCount}</b></div>
              <div><Clock3 size={18} /><span>Sem localização</span><b>{pendingCount}</b></div>
              <div><FileSpreadsheet size={18} /><span>Arquivos nesta sessão</span><b>{history.length}</b></div>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <article key={item.id}>
                    <span className="history-icon"><FileSpreadsheet size={18} /></span>
                    <div><b>{item.fileName}</b><small>{item.importedAt.toLocaleString('pt-BR')}</small></div>
                    <span>{item.total} linhas</span><span className="history-good">{item.mapped} no mapa</span><span className="history-warn">{item.pending} pendentes</span><span className="history-bad">{item.rejected} erros</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state"><span><FileSpreadsheet size={27} /></span><h2>Nenhuma planilha importada</h2><p>A base exibida é fictícia. Importe um arquivo de teste ou baixe o modelo.</p><div><button className="primary-small" onClick={openImporter}>Escolher arquivo</button><button className="secondary-small" onClick={downloadTemplate}><Download size={14} />Baixar modelo</button></div></div>
            )}
          </section>
        )}
      </section>

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importBusy) setImportOpen(false); }}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <header><div><span className="eyebrow">Nova base de clientes</span><h2 id="import-title">Importar planilha</h2></div><button onClick={() => setImportOpen(false)} disabled={importBusy} aria-label="Fechar"><X size={18} /></button></header>
            <div className="modal-privacy"><ShieldCheck size={18} /><span><b>Use dados fictícios nesta demonstração.</b> Com o Google Maps configurado, só logradouro, número, bairro, CEP, cidade e UF são enviados; nome, ID, plano, documento e celular não saem do sistema.</span></div>

            {!importPreview ? (
              <>
                <div
                  className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
                  onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                >
                  <span className="upload-orb">{importBusy ? <LoaderCircle className="spin" size={24} /> : <FileUp size={24} />}</span>
                  <h3>{importBusy ? 'Lendo a planilha…' : 'Arraste o arquivo até aqui'}</h3>
                  <p>Excel .xlsx ou CSV, até 5 MB e 5.000 linhas.</p>
                  <button onClick={() => fileInputRef.current?.click()} disabled={importBusy}>Selecionar arquivo</button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={onFileChange} hidden />
                </div>
                {importError && <div className="error-box"><AlertTriangle size={16} />{importError}</div>}
                <div className="template-row"><div><FileSpreadsheet size={18} /><span><b>Não tem o modelo?</b><small>Inclui os cabeçalhos aceitos e uma linha de exemplo.</small></span></div><button onClick={downloadTemplate}><Download size={14} />Baixar modelo CSV</button></div>
              </>
            ) : (
              <>
                <div className="file-summary"><FileSpreadsheet size={20} /><div><b>{importPreview.fileName}</b><small>{importPreview.rows.length} linhas encontradas</small></div><button onClick={() => setImportPreview(null)} disabled={importBusy}>Trocar arquivo</button></div>
                {importPreview.providerTemplate && (
                  <div className="model-recognized">
                    <div><CheckCircle2 size={18} /><span><b>Modelo do provedor reconhecido</b>O sistema encontrou automaticamente as colunas disponíveis e ignora linhas de título e totalização.</span></div>
                    {previewGeocode > 0 ? (
                      <p className="model-address-ok"><CheckCircle2 size={16} /><span><b>Nome, logradouro e número encontrados.</b> Esses registros estão prontos para a etapa de localização no mapa.</span></p>
                    ) : (
                      <p><AlertTriangle size={16} /><span><b>Faltam campos obrigatórios neste arquivo.</b> Cada cliente precisa de nome, logradouro e número para ser importado.</span></p>
                    )}
                    <div className="model-settings">
                      <label><span>Cidade ativa e obrigatória</span><input value={importCityOverride} readOnly /></label>
                      <label><span>UF</span><input value={importStateOverride} readOnly /></label>
                      <label><span>Status padrão</span><select value={importDefaultStatus} onChange={(event) => setImportDefaultStatus(event.target.value as ClientStatus)}>{STATUS_OPTIONS.filter((item) => item !== 'Todos').map((item) => <option key={item}>{item}</option>)}</select></label>
                    </div>
                    <small>Código, contrato, bairro e demais campos são opcionais. Por privacidade, Documento, Email e Celular não são adicionados ao mapa.</small>
                  </div>
                )}
                <div className="preview-metrics">
                  <div className="preview-ready"><CheckCircle2 size={17} /><span>Prontos no mapa<b>{previewReady}</b></span></div>
                  <div className="preview-pending"><Clock3 size={17} /><span>Para geocodificar<b>{previewGeocode}</b></span></div>
                  <div className="preview-incomplete"><MapPin size={17} /><span>Sem endereço<b>{previewPending}</b></span></div>
                  <div className="preview-error"><AlertTriangle size={17} /><span>Com erro<b>{previewErrors}</b></span></div>
                </div>
                <div className="preview-table"><table><thead><tr><th>Linha</th><th>ID</th><th>Cidade</th><th>Endereço</th><th>Resultado</th></tr></thead><tbody>
                  {importPreview.rows.slice(0, 6).map((row) => (
                    <tr key={`${row.rowNumber}-${row.id}`}><td>{row.rowNumber}</td><td>{row.id || '—'}</td><td>{row.city || '—'}</td><td>{row.street ? `${row.street}${row.number ? `, ${row.number}` : ''}` : 'Não disponível no modelo'}</td><td>{row.issues.length ? <span className="row-error">{row.issues.join(' · ')}</span> : row.needsGeocoding ? <span className="row-pending">localizar endereço</span> : row.lat !== undefined ? <span className="row-ready">coordenadas válidas</span> : <span className="row-incomplete">aguardando endereço</span>}</td></tr>
                  ))}
                </tbody></table>{importPreview.rows.length > 6 && <div className="more-rows">Mais {importPreview.rows.length - 6} linhas não exibidas na prévia.</div>}</div>
                {importError && <div className="error-box"><AlertTriangle size={16} />{importError}</div>}
                <p className="geocode-note"><ShieldCheck size={15} />A busca está limitada a {importCityOverride}/{importStateOverride}. Resultados que não confirmem cidade, rua e número ficam pendentes e nunca são colocados no centro do estado.</p>
                <footer className="modal-actions"><button className="secondary-action" onClick={() => setImportPreview(null)} disabled={importBusy}>Voltar</button><button className="primary-action" onClick={() => void confirmImport()} disabled={importBusy || previewImportable === 0}>{importBusy ? <><LoaderCircle className="spin" size={15} />Processando…</> : <>Importar {previewImportable} clientes</>}</button></footer>
              </>
            )}
          </section>
        </div>
      )}

      {cityOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !cityBusy) setCityOpen(false); }}>
          <section className="import-modal city-modal" role="dialog" aria-modal="true" aria-labelledby="city-title">
            <header>
              <div><span className="eyebrow">Área de trabalho</span><h2 id="city-title">Cadastrar cidade</h2></div>
              <button onClick={() => setCityOpen(false)} disabled={cityBusy} aria-label="Fechar"><X size={18} /></button>
            </header>
            <p className="city-help">O Google validará a cidade e o mapa ficará restrito à área encontrada. Depois, toda importação será vinculada a essa cidade.</p>
            <div className="city-fields">
              <label><span>Cidade</span><input value={newCity} onChange={(event) => setNewCity(event.target.value)} placeholder="Ex.: Guaporema" autoFocus /></label>
              <label><span>UF</span><select value={newCityState} onChange={(event) => setNewCityState(event.target.value)}>{BRAZILIAN_STATES.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            {cityError && <div className="error-box"><AlertTriangle size={16} />{cityError}</div>}
            <footer className="modal-actions">
              <button className="secondary-action" onClick={() => setCityOpen(false)} disabled={cityBusy}>Cancelar</button>
              <button className="primary-action" onClick={() => void addCity()} disabled={cityBusy || !newCity.trim()}>
                {cityBusy ? <><LoaderCircle className="spin" size={15} />Validando…</> : <><MapPin size={15} />Validar e cadastrar</>}
              </button>
            </footer>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
    </main>
  );
}
