'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LocateFixed,
  MapPin,
  MapPinned,
  Pencil,
  Save,
  Sparkles,
  UserRoundPlus,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { CityProfile, ClientRecord, ClientStatus, STATUS_COLORS } from './client-data';
import { FloatingInput } from './floating-input';
import { StatusPicker } from './status-picker';
import { WatermelonButton, WatermelonSelect, WatermelonSheet } from './watermelon-system';

export type ClientPanelMode = 'view' | 'create' | 'edit';

export interface ClientDraft {
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
  registeredAt: string;
  customerType: string;
  phone: string;
  email: string;
  document: string;
  contract: string;
  lat: string;
  lng: string;
}

interface ClientPanelProps {
  mode: ClientPanelMode;
  client: ClientRecord | null;
  draft: ClientDraft;
  cities: CityProfile[];
  busy: boolean;
  error: string;
  anchor?: { x: number; y: number } | null;
  onChange: (field: keyof ClientDraft, value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRelocate: () => void;
  onChooseOnMap: () => void;
}

const statuses: ClientStatus[] = ['Ativo', 'Instalação', 'Atenção', 'Inativo', 'Pendente'];
const statusItems = statuses.map((status, index) => ({
  id: index + 1,
  emoji: status === 'Ativo' ? '●' : status === 'Instalação' ? '◐' : status === 'Atenção' ? '!' : status === 'Inativo' ? '○' : '…',
  name: status,
}));

function shown(value?: string) {
  return value?.trim() || 'Não informado';
}

function Field({
  label,
  field,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  field: keyof ClientDraft;
  value: string;
  onChange: ClientPanelProps['onChange'];
  type?: string;
  placeholder?: string;
}) {
  return (
    <FloatingInput
      label={label}
      className="client-floating-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(field, event.target.value)}
    />
  );
}

export function ClientPanel({
  mode,
  client,
  draft,
  cities,
  busy,
  error,
  anchor,
  onChange,
  onClose,
  onEdit,
  onCancel,
  onSave,
  onRelocate,
  onChooseOnMap,
}: ClientPanelProps) {
  const editing = mode === 'create' || mode === 'edit';
  const locationReady = client?.lat !== undefined && client?.lng !== undefined;

  return (
    <WatermelonSheet
      className={`client-panel ${anchor && mode === 'view' ? 'client-panel-bubble' : ''}`}
      style={anchor && mode === 'view' ? ({
        '--client-anchor-x': `${anchor.x}px`,
        '--client-anchor-y': `${anchor.y}px`,
      } as CSSProperties) : undefined}
      aria-label={mode === 'create' ? 'Cadastrar cliente' : 'Detalhes do cliente'}
    >
      <div className="mobile-sheet-handle" aria-hidden="true"><span /></div>
      <header className="client-panel-header">
        <div className="client-panel-title">
          <span className="client-avatar" aria-hidden="true">
            {mode === 'create' ? <UserRoundPlus size={18} /> : client?.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <small>{mode === 'create' ? 'Novo registro' : client?.externalId ?? client?.id}</small>
            <h2>{mode === 'create' ? 'Adicionar cliente' : client?.name}</h2>
          </div>
        </div>
        <WatermelonButton className="panel-icon-button" onClick={onClose} aria-label="Fechar painel"><X size={18} /></WatermelonButton>
      </header>

      {!editing && client ? (
        <>
          <div className="client-quick-body">
            <div className="client-quick-state">
              <span className="quick-status" style={{ color: STATUS_COLORS[client.status] }}>
                <i style={{ background: STATUS_COLORS[client.status] }} />{client.status}
              </span>
              <span className={locationReady ? 'quick-location-ready' : 'quick-location-pending'}>
                {locationReady ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
                {locationReady ? 'No mapa' : 'Revisar localização'}
              </span>
            </div>

            <div className="client-quick-address">
              <MapPin size={17} />
              <p>
                <b>{shown(client.street)}, {shown(client.number)}</b>
                <span>{[client.neighborhood, `${client.city}/${client.state}`].filter(Boolean).join(' · ')}</span>
              </p>
            </div>

            {!locationReady && client.pendingReason && (
              <div className="client-quick-warning" role="status">
                <AlertTriangle size={14} /><span><b>Motivo da não localização</b><small>{client.pendingReason}</small></span>
              </div>
            )}
            {client.originalStreet && !client.addressAdjustedByAi && client.originalStreet !== client.street && (
              <div className="client-ai-adjustment"><span><b>Grafia corrigida pelo cadastro do IBGE</b><small>{client.originalStreet} → {client.street}</small></span></div>
            )}
            {client.addressAdjustedByAi && (
              <div className="client-ai-adjustment">
                <Sparkles size={14} />
                <span><b>Ortografia revisada pelo Gemini</b><small>{client.addressAiNote || 'Endereço corrigido e depois confirmado pelo geocodificador.'}</small></span>
              </div>
            )}

            <div className="client-quick-facts">
              <span><small>Plano</small><b>{shown(client.plan)}</b></span>
              <span><small>Contato</small><b>{shown(client.phone || client.email)}</b></span>
              <span><small>Contrato</small><b>{shown(client.contract)}</b></span>
            </div>

            {client.importIssues?.length ? (
              <WatermelonButton className="client-quick-warning" onClick={onEdit}>
                <AlertTriangle size={14} /><span><b>Corrigir dados importados</b><small>{client.importIssues.join(' · ')}</small></span>
              </WatermelonButton>
            ) : null}
          </div>

          <footer className="client-panel-actions">
            <WatermelonButton className="panel-secondary" onClick={onRelocate} disabled={busy}><LocateFixed size={16} />{busy ? 'Localizando…' : 'Relocalizar'}</WatermelonButton>
            <WatermelonButton className="panel-primary" onClick={onEdit} disabled={busy}><Pencil size={16} />Editar</WatermelonButton>
          </footer>
        </>
      ) : (
        <form className="client-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          <section className="client-panel-section">
            <div className="section-caption">Identificação</div>
            <div className="client-form-grid">
              <Field label="Nome *" field="name" value={draft.name} onChange={onChange} placeholder="Nome do cliente" />
              <Field label="Código / ID" field="id" value={draft.id} onChange={onChange} placeholder="Gerado se ficar vazio" />
              <Field label="Documento" field="document" value={draft.document} onChange={onChange} />
              <Field label="Contrato" field="contract" value={draft.contract} onChange={onChange} />
            </div>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Endereço</div>
            <div className="client-form-grid address-grid">
              <Field label="Logradouro *" field="street" value={draft.street} onChange={onChange} placeholder="Rua, avenida ou estrada" />
              <Field label="Número *" field="number" value={draft.number} onChange={onChange} />
              <Field label="Complemento" field="complement" value={draft.complement} onChange={onChange} />
              <Field label="Bairro" field="neighborhood" value={draft.neighborhood} onChange={onChange} />
              <label className="client-field">
                <span>Cidade *</span>
                <WatermelonSelect value={draft.city} onChange={(event) => onChange('city', event.target.value)}>
                  {cities.map((city) => <option key={`${city.name}-${city.state}`} value={city.name}>{city.name}/{city.state}</option>)}
                </WatermelonSelect>
              </label>
              <Field label="CEP" field="zip" value={draft.zip} onChange={onChange} />
            </div>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Comercial e contato</div>
            <div className="client-form-grid">
              <Field label="Plano" field="plan" value={draft.plan} onChange={onChange} />
              <label className="client-field client-status-field">
                <span>Status</span>
                <StatusPicker
                  items={statusItems}
                  value={statuses.indexOf(draft.status) + 1}
                  onChange={(id) => {
                    const nextStatus = statuses[id - 1];
                    if (nextStatus) onChange('status', nextStatus);
                  }}
                />
              </label>
              <Field label="Telefone" field="phone" value={draft.phone} onChange={onChange} />
              <Field label="E-mail" field="email" value={draft.email} onChange={onChange} type="email" />
              <Field label="Data de cadastro" field="registeredAt" value={draft.registeredAt} onChange={onChange} />
              <Field label="Tipo de cliente" field="customerType" value={draft.customerType} onChange={onChange} />
            </div>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Posição manual — opcional</div>
            <p className="section-help">Preencha as duas coordenadas somente quando souber a posição correta. Sem elas, o sistema tentará localizar o endereço automaticamente.</p>
            {mode === 'edit' && (
              <WatermelonButton type="button" className="choose-map-position" onClick={onChooseOnMap}>
                <MapPinned size={16} />Escolher no mapa
              </WatermelonButton>
            )}
            <div className="client-form-grid">
              <Field label="Latitude" field="lat" value={draft.lat} onChange={onChange} placeholder="-23.3402" />
              <Field label="Longitude" field="lng" value={draft.lng} onChange={onChange} placeholder="-52.7786" />
            </div>
          </section>

          {error && <div className="client-form-error">{error}</div>}

          <footer className="client-panel-actions">
            <WatermelonButton type="button" className="panel-secondary" onClick={onCancel} disabled={busy}>Cancelar</WatermelonButton>
            <WatermelonButton type="submit" className="panel-primary" disabled={busy}>
              {busy ? <><span className="button-spinner" />Localizando…</> : <><Save size={16} />Salvar e localizar</>}
            </WatermelonButton>
          </footer>
        </form>
      )}
    </WatermelonSheet>
  );
}
