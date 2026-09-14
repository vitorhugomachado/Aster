'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import * as Papa from 'papaparse';
import { cellToBoundary, latLngToCell } from 'h3-js';
import {
  CalendarClock, Check, ChevronDown, CircleDollarSign, FileUp, Flame, ListFilter, LoaderCircle,
  MapPin, MapPinned, Navigation, Phone, Plus, Route, Search, Sparkles, Target, Trash2, UserRound, X,
} from 'lucide-react';
import { ClientMap } from './ClientMap';
import type { CityProfile, ClientRecord, ClientStatus } from './client-data';
import { normalizeKey, normalizeText } from './client-data';
import { FloatingInput } from './floating-input';
import {
  WatermelonButton, WatermelonCard, WatermelonDialog, WatermelonInput, WatermelonSelect, WatermelonTextarea,
} from './watermelon-system';
import {
  calculateOpportunityScore, LEAD_STAGE_COLORS, LEAD_STAGES, leadTitle,
  type LeadRecord, type LeadStage,
} from '../lib/opportunities';

interface OpportunityWorkspaceProps {
  cityProfile: CityProfile | null;
  clients: ClientRecord[];
  cloudEnabled: boolean;
  onClientConverted: (client: ClientRecord) => void;
}

interface LeadDraft {
  name: string; street: string; number: string; neighborhood: string; zip: string;
  phone: string; email: string; stage: LeadStage; interestedPlan: string; notes: string;
  nextActionAt: string; lat: string; lng: string; locationQuality: LeadRecord['locationQuality'];
}

interface RouteResult {
  id: string; orderedLeadIds: string[]; distanceMeters: number; durationSeconds: number;
  encodedPolyline?: string; routeUrl: string; provider: string;
}

const LOCAL_LEADS_KEY = 'aster:leads:v1';
const emptyDraft = (): LeadDraft => ({
  name: '', street: '', number: '', neighborhood: '', zip: '', phone: '', email: '', stage: 'novo',
  interestedPlan: '', notes: '', nextActionAt: '', lat: '', lng: '', locationQuality: 'pendente',
});

function draftFromLead(lead: LeadRecord): LeadDraft {
  return {
    name: lead.name ?? '', street: lead.street, number: lead.number, neighborhood: lead.neighborhood, zip: lead.zip,
    phone: lead.phone, email: lead.email, stage: lead.stage, interestedPlan: lead.interestedPlan, notes: lead.notes,
    nextActionAt: lead.nextActionAt ? lead.nextActionAt.slice(0, 16) : '', lat: lead.lat?.toString() ?? '', lng: lead.lng?.toString() ?? '',
    locationQuality: lead.locationQuality,
  };
}

function decodePolyline(encoded: string) {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0; let lat = 0; let lng = 0;
  while (index < encoded.length) {
    let result = 0; let shift = 0; let byte: number;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function dateLabel(value?: string) {
  return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem retorno agendado';
}

export function OpportunityWorkspace({ cityProfile, clients, cloudEnabled, onClientConverted }: OpportunityWorkspaceProps) {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<LeadStage | 'todos'>('todos');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft);
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [routeMode, setRouteMode] = useState(false);
  const [routeSelection, setRouteSelection] = useState<Set<string>>(new Set());
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = leads.find((lead) => lead.id === selectedId) ?? null;
  const scored = useMemo(() => leads.map((lead) => ({ lead, ...calculateOpportunityScore(lead, clients) })), [clients, leads]);
  const visible = useMemo(() => scored
    .filter(({ lead }) => !cityProfile || normalizeKey(lead.city) === normalizeKey(cityProfile.name))
    .filter(({ lead }) => stage === 'todos' || lead.stage === stage)
    .filter(({ lead }) => !query || normalizeKey([lead.name, lead.street, lead.number, lead.neighborhood, lead.phone].join(' ')).includes(normalizeKey(query)))
    .sort((a, b) => b.score - a.score), [cityProfile, query, scored, stage]);

  const zones = useMemo(() => {
    const groups = new Map<string, LeadRecord[]>();
    visible.forEach(({ lead }) => {
      if (lead.lat === undefined || lead.lng === undefined || ['ganho', 'perdido'].includes(lead.stage)) return;
      const cell = latLngToCell(lead.lat, lead.lng, 9);
      groups.set(cell, [...(groups.get(cell) ?? []), lead]);
    });
    return [...groups.entries()].filter(([, records]) => records.length >= 2).map(([id, records]) => ({
      id, intensity: Math.min(6, records.length), label: `${records.length} oportunidades`,
      boundary: cellToBoundary(id).map(([lat, lng]) => ({ lat, lng })),
    }));
  }, [visible]);

  const mapRecords = useMemo<ClientRecord[]>(() => {
    const contextClients = clients
      .filter((client) => client.lat !== undefined && client.lng !== undefined && client.status === 'Ativo')
      .map((client) => ({ ...client, id: `context:${client.id}`, name: `Cliente · ${client.name}` }));
    const leadMarkers = visible.map(({ lead }) => ({
      id: `lead:${lead.id}`, name: leadTitle(lead), street: lead.street, number: lead.number, complement: '',
      neighborhood: lead.neighborhood, city: lead.city, state: lead.state, zip: lead.zip,
      status: 'Pendente' as ClientStatus, plan: lead.interestedPlan || 'Lead', lat: lead.lat, lng: lead.lng,
      locationQuality: lead.locationQuality, source: 'manual' as const, mapKind: 'lead' as const, markerColor: LEAD_STAGE_COLORS[lead.stage],
    }));
    if (placing) leadMarkers.push({
      id: 'lead:draft', name: 'Nova oportunidade', street: draft.street, number: draft.number, complement: '', neighborhood: draft.neighborhood,
      city: cityProfile?.name ?? '', state: cityProfile?.state ?? 'PR', zip: draft.zip, status: 'Pendente', plan: draft.interestedPlan || 'Lead',
      lat: Number(draft.lat) || cityProfile?.center?.lat, lng: Number(draft.lng) || cityProfile?.center?.lng,
      locationQuality: 'informada', source: 'manual', mapKind: 'lead', markerColor: '#17161b',
    });
    return [...contextClients, ...leadMarkers];
  }, [cityProfile, clients, draft, placing, visible]);

  const routePath = useMemo(() => routeResult?.encodedPolyline ? decodePolyline(routeResult.encodedPolyline) : [], [routeResult]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!cloudEnabled) {
        try { setLeads(JSON.parse(localStorage.getItem(LOCAL_LEADS_KEY) || '[]') as LeadRecord[]); } catch { setLeads([]); }
        return;
      }
      const response = await fetch(`/api/leads?city=${encodeURIComponent(cityProfile?.name ?? '')}`, { cache: 'no-store' });
      if (response.ok && !cancelled) setLeads(((await response.json()) as { leads: LeadRecord[] }).leads);
    }
    void load();
    return () => { cancelled = true; };
  }, [cityProfile?.name, cloudEnabled]);

  useEffect(() => { if (!cloudEnabled) localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads)); }, [cloudEnabled, leads]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);

  function updateDraft(field: keyof LeadDraft, value: string) { setDraft((current) => ({ ...current, [field]: value })); setError(''); }
  function openCreate() { setEditingId(null); setDraft(emptyDraft()); setError(''); setPlacing(false); setEditorOpen(true); }
  function openEdit(lead: LeadRecord) { setEditingId(lead.id); setDraft(draftFromLead(lead)); setError(''); setPlacing(false); setEditorOpen(true); }

  async function saveLead() {
    if (!draft.name.trim() && !(draft.street.trim() && draft.number.trim())) { setError('Informe o nome ou um endereço completo.'); return; }
    setBusy(true); setError('');
    try {
      let lat = Number(draft.lat); let lng = Number(draft.lng); let quality = draft.locationQuality;
      if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && draft.street && draft.number && cityProfile?.ibgeId) {
        const geocode = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          street: draft.street, number: draft.number, neighborhood: draft.neighborhood, zip: draft.zip, city: cityProfile.name, state: cityProfile.state, ibgeId: cityProfile.ibgeId,
        }) });
        const location = await geocode.json().catch(() => ({})) as { lat?: number; lng?: number; quality?: LeadRecord['locationQuality'] };
        if (geocode.ok && typeof location.lat === 'number' && typeof location.lng === 'number') { lat = location.lat; lng = location.lng; quality = location.quality ?? 'exata'; }
      }
      const payload = {
        ...(editingId ? { id: editingId } : {}), ...draft,
        city: cityProfile?.name ?? '', state: cityProfile?.state ?? 'PR',
        lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
        locationQuality: Number.isFinite(lat) && Number.isFinite(lng) ? quality : 'pendente', source: editingId ? undefined : placing ? 'mapa' : 'manual',
      };
      if (cloudEnabled) {
        const response = await fetch('/api/leads', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({})) as { lead?: LeadRecord; message?: string };
        if (!response.ok || !result.lead) throw new Error(result.message || 'Não foi possível salvar.');
        setLeads((current) => editingId ? current.map((lead) => lead.id === editingId ? result.lead! : lead) : [result.lead!, ...current]);
        setSelectedId(result.lead.id);
      } else {
        const now = new Date().toISOString();
        const lead: LeadRecord = { id: editingId || crypto.randomUUID(), ...payload, source: editingId ? (selected?.source ?? 'manual') : placing ? 'mapa' : 'manual', createdAt: selected?.createdAt ?? now, updatedAt: now } as LeadRecord;
        setLeads((current) => editingId ? current.map((item) => item.id === editingId ? lead : item) : [lead, ...current]);
        setSelectedId(lead.id);
      }
      setEditorOpen(false); setPlacing(false); setToast('Oportunidade salva no mapa.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  async function deleteLead(lead: LeadRecord) {
    if (!window.confirm(`Excluir ${leadTitle(lead)}?`)) return;
    if (cloudEnabled) await fetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: 'DELETE' });
    setLeads((current) => current.filter((item) => item.id !== lead.id)); setSelectedId(null); setToast('Lead removido.');
  }

  async function convertLead(lead: LeadRecord) {
    if (!cloudEnabled) { setToast('A conversão para cliente requer a base sincronizada.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/leads/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lead.id, plan: lead.interestedPlan }) });
      const result = await response.json().catch(() => ({})) as { client?: ClientRecord; message?: string };
      if (!response.ok || !result.client) throw new Error(result.message || 'Falha na conversão.');
      onClientConverted(result.client);
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, stage: 'ganho', convertedClientId: result.client!.id } : item));
      setToast('Lead convertido em cliente e adicionado à base.');
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Falha na conversão.'); }
    finally { setBusy(false); }
  }

  function toggleRoute(id: string) { setRouteSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else if (next.size < 10) next.add(id); return next; }); }
  async function createRoute() {
    if (routeSelection.size < 2 || !cityProfile?.center) { setToast('Selecione entre 2 e 10 leads localizados.'); return; }
    setBusy(true);
    const origin = await new Promise<{ lat: number; lng: number }>((resolve) => {
      if (!navigator.geolocation) return resolve(cityProfile.center!);
      navigator.geolocation.getCurrentPosition((position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }), () => resolve(cityProfile.center!), { timeout: 7000, maximumAge: 60_000 });
    });
    try {
      if (!cloudEnabled) throw new Error('Conecte a base ao Railway para otimizar e salvar rotas.');
      const response = await fetch('/api/routes/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadIds: [...routeSelection], origin, city: cityProfile.name, returnToOrigin: false }) });
      const result = await response.json().catch(() => ({})) as RouteResult & { message?: string };
      if (!response.ok) throw new Error(result.message || 'Não foi possível criar a rota.');
      setRouteResult(result); setRouteMode(false); setToast(`Rota criada com ${result.orderedLeadIds.length} visitas.`);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Não foi possível criar a rota.'); }
    finally { setBusy(false); }
  }

  async function importLeads(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !cityProfile) return;
    setBusy(true); setImportProgress({ done: 0, total: 0 });
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let rows: unknown[][] = [];
      if (extension === 'xlsx') rows = await readSheet(file);
      else if (extension === 'csv') rows = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true }).data;
      else throw new Error('Use um arquivo XLSX ou CSV.');
      const headers = (rows[0] ?? []).map((value) => normalizeKey(value));
      const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const indexes = { name: index('nome', 'cliente', 'nome_cliente'), street: index('logradouro', 'rua', 'endereco'), number: index('numero', 'n', 'nr'), neighborhood: index('bairro'), zip: index('cep'), phone: index('telefone', 'celular', 'whatsapp'), email: index('email'), plan: index('plano', 'plano_atual', 'velocidade'), notes: index('observacao', 'observacoes', 'notas') };
      const source = rows.slice(1).filter((row) => row.some((value) => normalizeText(value))).slice(0, 5000);
      setImportProgress({ done: 0, total: source.length });
      for (let start = 0; start < source.length; start += 5) {
        await Promise.all(source.slice(start, start + 5).map(async (row) => {
          const get = (field: keyof typeof indexes) => indexes[field] >= 0 ? normalizeText(row[indexes[field]]) : '';
          const street = get('street'); const number = get('number'); const name = get('name');
          if (!name && !(street && number)) return;
          let location: { lat?: number; lng?: number; quality?: string } = {};
          if (street && number && cityProfile.ibgeId) {
            const response = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ street, number, neighborhood: get('neighborhood'), zip: get('zip'), city: cityProfile.name, state: cityProfile.state, ibgeId: cityProfile.ibgeId }) });
            if (response.ok) location = await response.json();
          }
          const payload = { name, street, number, neighborhood: get('neighborhood'), zip: get('zip'), phone: get('phone'), email: get('email'), interestedPlan: get('plan'), notes: get('notes'), city: cityProfile.name, state: cityProfile.state, source: 'importação', stage: 'novo', lat: location.lat, lng: location.lng, locationQuality: location.quality || 'pendente' };
          if (cloudEnabled) {
            const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) { const result = await response.json() as { lead: LeadRecord }; setLeads((current) => [result.lead, ...current]); }
          } else {
            const now = new Date().toISOString(); setLeads((current) => [{ id: crypto.randomUUID(), ...payload, createdAt: now, updatedAt: now } as LeadRecord, ...current]);
          }
        }));
        setImportProgress({ done: Math.min(start + 5, source.length), total: source.length });
      }
      setToast(`${source.length} linhas processadas como oportunidades.`);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Falha ao importar leads.'); }
    finally { setBusy(false); event.target.value = ''; }
  }

  const activeCount = scored.filter(({ lead }) => !['ganho', 'perdido'].includes(lead.stage)).length;
  const overdueCount = scored.filter(({ lead }) => lead.nextActionAt && new Date(lead.nextActionAt) <= new Date() && !['ganho', 'perdido'].includes(lead.stage)).length;
  const highCount = scored.filter((item) => item.score >= 60).length;

  return (
    <div className="opportunity-workspace">
      <div className="opportunity-map">
        <ClientMap
          clients={mapRecords} cityProfile={cityProfile} selectedId={selectedId ? `lead:${selectedId}` : null}
          positioningId={placing ? 'lead:draft' : null}
          onSelect={(id) => { if (id.startsWith('lead:') && id !== 'lead:draft') setSelectedId(id.slice(5)); }}
          onStartPositioning={() => undefined}
          onPositionChange={(_, lat, lng) => setDraft((current) => ({ ...current, lat: lat.toFixed(7), lng: lng.toFixed(7), locationQuality: 'informada' }))}
          onMarkerPressStart={() => undefined} onMarkerRelease={() => undefined} onMarkerAnchorChange={() => undefined}
          opportunityZones={zones} routePath={routePath}
        />
        <div className="opportunity-topbar">
          <div><span className="eyebrow">Inteligência comercial</span><h1>Mapa de oportunidades</h1></div>
          <div className="opportunity-actions">
            <input ref={fileRef} hidden type="file" accept=".xlsx,.csv" onChange={(event) => void importLeads(event)} />
            <WatermelonButton className="secondary-small" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={15} />Importar leads</WatermelonButton>
            <WatermelonButton className="secondary-small" onClick={() => setRouteMode(true)}><Route size={15} />Planejar visitas</WatermelonButton>
            <WatermelonButton className="primary-small" onClick={openCreate}><Plus size={15} />Novo lead</WatermelonButton>
          </div>
        </div>
        <div className="opportunity-metrics">
          <WatermelonCard><Target size={17} /><span>Em aberto</span><b>{activeCount}</b></WatermelonCard>
          <WatermelonCard><Flame size={17} /><span>Alta prioridade</span><b>{highCount}</b></WatermelonCard>
          <WatermelonCard><CalendarClock size={17} /><span>Retornos vencidos</span><b>{overdueCount}</b></WatermelonCard>
          <WatermelonCard><MapPinned size={17} /><span>Zonas quentes</span><b>{zones.length}</b></WatermelonCard>
        </div>
        <aside className="opportunity-list-panel">
          <label className="opportunity-search"><Search size={15} /><WatermelonInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, rua ou telefone" /><ListFilter size={14} /></label>
          <div className="opportunity-stage-filter">
            <WatermelonSelect value={stage} onChange={(event) => setStage(event.target.value as LeadStage | 'todos')}><option value="todos">Todas as etapas</option>{LEAD_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</WatermelonSelect><ChevronDown size={14} />
          </div>
          <div className="opportunity-list">
            {visible.map(({ lead, score, reasons }) => (
              <WatermelonButton key={lead.id} className={`opportunity-row ${selectedId === lead.id ? 'active' : ''}`} onClick={() => setSelectedId(lead.id)}>
                <span className="opportunity-row-dot" style={{ background: LEAD_STAGE_COLORS[lead.stage] }} />
                <span><b>{leadTitle(lead)}</b><small>{lead.street ? `${lead.street}, ${lead.number}` : 'Aguardando endereço'} · {dateLabel(lead.nextActionAt)}</small></span>
                <strong title={reasons.join('\n')}>{score}</strong>
              </WatermelonButton>
            ))}
            {!visible.length && <div className="opportunity-empty"><Sparkles size={20} /><b>Nenhuma oportunidade</b><span>Cadastre pelo mapa, formulário ou planilha.</span></div>}
          </div>
        </aside>

        {selected && !placing && (
          <WatermelonCard className="opportunity-detail">
            <header><span style={{ background: LEAD_STAGE_COLORS[selected.stage] }}><UserRound size={18} /></span><div><small>{LEAD_STAGES.find((item) => item.id === selected.stage)?.label}</small><h2>{leadTitle(selected)}</h2></div><WatermelonButton onClick={() => setSelectedId(null)}><X size={17} /></WatermelonButton></header>
            <div className="opportunity-score"><strong>{calculateOpportunityScore(selected, clients).score}</strong><span><b>Índice de oportunidade</b><small>{calculateOpportunityScore(selected, clients).reasons.slice(0, 2).join(' · ') || 'Sem sinais de prioridade'}</small></span></div>
            <div className="opportunity-detail-grid"><span><MapPin size={14} /><small>Endereço</small><b>{selected.street ? `${selected.street}, ${selected.number}` : 'Não informado'}</b></span><span><Phone size={14} /><small>Contato</small><b>{selected.phone || 'Não informado'}</b></span><span><CircleDollarSign size={14} /><small>Interesse</small><b>{selected.interestedPlan || 'Não informado'}</b></span><span><CalendarClock size={14} /><small>Próxima ação</small><b>{dateLabel(selected.nextActionAt)}</b></span></div>
            {selected.notes && <p>{selected.notes}</p>}
            <footer><WatermelonButton className="lead-delete" onClick={() => void deleteLead(selected)}><Trash2 size={15} /></WatermelonButton><WatermelonButton className="secondary-small" onClick={() => openEdit(selected)}>Editar</WatermelonButton><WatermelonButton className="primary-small" onClick={() => void convertLead(selected)} disabled={busy || selected.stage === 'ganho'}><Check size={15} />Converter</WatermelonButton></footer>
          </WatermelonCard>
        )}

        {placing && (
          <div className="map-position-toolbar"><span className="position-pulse" /><div><b>Posicione a oportunidade</b><small>Toque ou arraste o marcador até o imóvel.</small><code>{draft.lat || '—'}, {draft.lng || '—'}</code></div><WatermelonButton className="position-cancel" onClick={() => setPlacing(false)}>Cancelar</WatermelonButton><WatermelonButton className="position-confirm" onClick={() => { setPlacing(false); setEditorOpen(true); }}>Confirmar local</WatermelonButton></div>
        )}

        {routeResult && (
          <WatermelonCard className="route-summary"><header><span><Navigation size={18} /></span><div><small>{routeResult.provider === 'google' ? 'Rota otimizada pelo Google' : 'Ordem aproximada'}</small><h2>{routeResult.orderedLeadIds.length} visitas</h2></div><WatermelonButton onClick={() => setRouteResult(null)}><X size={16} /></WatermelonButton></header><div><b>{(routeResult.distanceMeters / 1000).toFixed(1)} km</b><span>aprox. {Math.max(1, Math.round(routeResult.durationSeconds / 60))} min</span></div><ol>{routeResult.orderedLeadIds.map((id, index) => <li key={id}><i>{index + 1}</i>{leadTitle(leads.find((lead) => lead.id === id)!)}</li>)}</ol><a href={routeResult.routeUrl} target="_blank" rel="noreferrer"><Navigation size={15} />Iniciar no Google Maps</a></WatermelonCard>
        )}
      </div>

      {editorOpen && (
        <div className="modal-backdrop"><WatermelonDialog className="import-modal lead-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Pipeline comercial</span><h2>{editingId ? 'Editar oportunidade' : 'Novo lead'}</h2></div><WatermelonButton onClick={() => setEditorOpen(false)}><X size={18} /></WatermelonButton></header><div className="lead-form-grid">
          <FloatingInput label="Nome (opcional)" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
          <label className="lead-stage-field"><span>Etapa</span><WatermelonSelect value={draft.stage} onChange={(event) => updateDraft('stage', event.target.value)}>{LEAD_STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</WatermelonSelect></label>
          <FloatingInput label="Logradouro" value={draft.street} onChange={(event) => updateDraft('street', event.target.value)} />
          <FloatingInput label="Número" value={draft.number} onChange={(event) => updateDraft('number', event.target.value)} />
          <FloatingInput label="Bairro" value={draft.neighborhood} onChange={(event) => updateDraft('neighborhood', event.target.value)} />
          <FloatingInput label="CEP" value={draft.zip} onChange={(event) => updateDraft('zip', event.target.value)} />
          <FloatingInput label="Telefone / WhatsApp" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
          <FloatingInput label="E-mail" type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
          <FloatingInput label="Plano de interesse" value={draft.interestedPlan} onChange={(event) => updateDraft('interestedPlan', event.target.value)} />
          <FloatingInput label="Próxima ação" type="datetime-local" value={draft.nextActionAt} onChange={(event) => updateDraft('nextActionAt', event.target.value)} />
          <label className="lead-notes"><span>Observações</span><WatermelonTextarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Contexto da conversa, objeções e próximos passos" /></label>
        </div>{error && <div className="error-box">{error}</div>}<footer className="modal-actions"><WatermelonButton className="secondary-action" onClick={() => { setEditorOpen(false); setPlacing(true); if (!draft.lat && cityProfile?.center) setDraft((current) => ({ ...current, lat: cityProfile.center!.lat.toString(), lng: cityProfile.center!.lng.toString() })); }}><MapPinned size={15} />Escolher no mapa</WatermelonButton><WatermelonButton className="primary-action" onClick={() => void saveLead()} disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={16} /> : <Check size={16} />}Salvar oportunidade</WatermelonButton></footer></WatermelonDialog></div>
      )}

      {routeMode && (
        <div className="modal-backdrop"><WatermelonDialog className="import-modal route-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Trabalho de campo</span><h2>Planejar visitas</h2><p>Escolha entre 2 e 10 oportunidades localizadas.</p></div><WatermelonButton onClick={() => setRouteMode(false)}><X size={18} /></WatermelonButton></header><div className="route-lead-list">{visible.filter(({ lead }) => lead.lat !== undefined && lead.lng !== undefined && !['ganho', 'perdido'].includes(lead.stage)).map(({ lead, score }) => <WatermelonButton key={lead.id} className={routeSelection.has(lead.id) ? 'selected' : ''} onClick={() => toggleRoute(lead.id)}><span>{routeSelection.has(lead.id) && <Check size={13} />}</span><div><b>{leadTitle(lead)}</b><small>{lead.street}, {lead.number}</small></div><strong>{score}</strong></WatermelonButton>)}</div><footer className="modal-actions"><span>{routeSelection.size}/10 selecionados</span><WatermelonButton className="primary-action" onClick={() => void createRoute()} disabled={busy || routeSelection.size < 2}>{busy ? <LoaderCircle className="auth-spinner" size={16} /> : <Route size={16} />}Otimizar rota</WatermelonButton></footer></WatermelonDialog></div>
      )}
      {importProgress.total > 0 && busy && <div className="toast"><LoaderCircle className="auth-spinner" size={16} />Importando {importProgress.done}/{importProgress.total}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
