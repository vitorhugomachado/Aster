'use client';

import {
  CheckCircle2,
  Clock3,
  LocateFixed,
  MapPin,
  Pencil,
  Save,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { CityProfile, ClientRecord, ClientStatus, STATUS_COLORS } from './client-data';

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
  onChange: (field: keyof ClientDraft, value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRelocate: () => void;
}

const statuses: ClientStatus[] = ['Ativo', 'Instalação', 'Atenção', 'Inativo', 'Pendente'];

function shown(value?: string) {
  return value?.trim() || 'Não informado';
}

function Detail({ label, value }: { label: string; value?: string }) {
  return <div className="client-detail"><dt>{label}</dt><dd>{shown(value)}</dd></div>;
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
    <label className="client-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
}

export function ClientPanel({
  mode,
  client,
  draft,
  cities,
  busy,
  error,
  onChange,
  onClose,
  onEdit,
  onCancel,
  onSave,
  onRelocate,
}: ClientPanelProps) {
  const editing = mode === 'create' || mode === 'edit';
  const locationReady = client?.lat !== undefined && client?.lng !== undefined;

  return (
    <aside className="client-panel" aria-label={mode === 'create' ? 'Cadastrar cliente' : 'Detalhes do cliente'}>
      <div className="mobile-sheet-handle" aria-hidden="true"><span /></div>
      <header className="client-panel-header">
        <div className="client-panel-title">
          <span className="client-avatar" aria-hidden="true">
            {mode === 'create' ? <UserRoundPlus size={18} /> : client?.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <small>{mode === 'create' ? 'Novo registro' : client?.id}</small>
            <h2>{mode === 'create' ? 'Adicionar cliente' : client?.name}</h2>
          </div>
        </div>
        <button className="panel-icon-button" onClick={onClose} aria-label="Fechar painel"><X size={18} /></button>
      </header>

      {!editing && client ? (
        <>
          <div className={`location-banner ${locationReady ? 'location-ready' : 'location-pending'}`}>
            {locationReady ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
            <div>
              <b>{locationReady ? 'Cliente localizado' : 'Localização pendente'}</b>
              <span>{locationReady
                ? `${client.locationQuality === 'aproximada' ? 'Posição aproximada' : 'Posição confirmada'} no mapa`
                : client.pendingReason || 'Revise o endereço ou informe as coordenadas.'}</span>
            </div>
          </div>

          <section className="client-panel-section">
            <div className="section-caption">Endereço</div>
            <div className="address-feature"><MapPin size={18} /><p><b>{shown(client.street)}, {shown(client.number)}</b><span>{[client.complement, client.neighborhood, `${client.city}/${client.state}`, client.zip].filter(Boolean).join(' · ')}</span></p></div>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Comercial</div>
            <dl className="client-detail-grid">
              <Detail label="Plano" value={client.plan} />
              <div className="client-detail"><dt>Status</dt><dd style={{ color: STATUS_COLORS[client.status] }}>● {client.status}</dd></div>
              <Detail label="Contrato" value={client.contract} />
              <Detail label="Tipo" value={client.customerType} />
              <Detail label="Cadastro" value={client.registeredAt} />
              <Detail label="Origem" value={client.source === 'manual' ? 'Cadastro manual' : client.source === 'demo' ? 'Exemplo' : 'Planilha'} />
            </dl>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Contato e identificação</div>
            <dl className="client-detail-grid">
              <Detail label="Telefone" value={client.phone} />
              <Detail label="E-mail" value={client.email} />
              <Detail label="Documento" value={client.document} />
              <Detail label="CEP" value={client.zip} />
            </dl>
          </section>

          <footer className="client-panel-actions">
            <button className="panel-secondary" onClick={onRelocate} disabled={busy}><LocateFixed size={16} />{busy ? 'Localizando…' : 'Localizar novamente'}</button>
            <button className="panel-primary" onClick={onEdit} disabled={busy}><Pencil size={16} />Editar cliente</button>
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
                <select value={draft.city} onChange={(event) => onChange('city', event.target.value)}>
                  {cities.map((city) => <option key={`${city.name}-${city.state}`} value={city.name}>{city.name}/{city.state}</option>)}
                </select>
              </label>
              <Field label="CEP" field="zip" value={draft.zip} onChange={onChange} />
            </div>
          </section>

          <section className="client-panel-section">
            <div className="section-caption">Comercial e contato</div>
            <div className="client-form-grid">
              <Field label="Plano" field="plan" value={draft.plan} onChange={onChange} />
              <label className="client-field">
                <span>Status</span>
                <select value={draft.status} onChange={(event) => onChange('status', event.target.value)}>
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
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
            <div className="client-form-grid">
              <Field label="Latitude" field="lat" value={draft.lat} onChange={onChange} placeholder="-23.3402" />
              <Field label="Longitude" field="lng" value={draft.lng} onChange={onChange} placeholder="-52.7786" />
            </div>
          </section>

          {error && <div className="client-form-error">{error}</div>}

          <footer className="client-panel-actions">
            <button type="button" className="panel-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button type="submit" className="panel-primary" disabled={busy}>
              {busy ? <><span className="button-spinner" />Localizando…</> : <><Save size={16} />Salvar e localizar</>}
            </button>
          </footer>
        </form>
      )}
    </aside>
  );
}
