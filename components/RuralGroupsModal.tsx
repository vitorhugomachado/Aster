'use client';

import { Check, ChevronLeft, MapPin, Pencil, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { ClientRecord, RuralClientGroup } from './client-data';

export interface RuralGroupDraft {
  id?: string;
  name: string;
  clientIds: string[];
  lat?: number;
  lng?: number;
  createdAt?: string;
}

interface RuralGroupsModalProps {
  groups: RuralClientGroup[];
  clients: ClientRecord[];
  draft: RuralGroupDraft | null;
  search: string;
  error: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (group: RuralClientGroup) => void;
  onView: (group: RuralClientGroup) => void;
  onDelete: (group: RuralClientGroup) => void;
  onBack: () => void;
  onDraftChange: (patch: Partial<RuralGroupDraft>) => void;
  onToggleClient: (clientId: string) => void;
  onChooseLocation: () => void;
  onSave: () => void;
}

export function RuralGroupsModal({
  groups,
  clients,
  draft,
  search,
  error,
  onSearchChange,
  onClose,
  onCreate,
  onEdit,
  onView,
  onDelete,
  onBack,
  onDraftChange,
  onToggleClient,
  onChooseLocation,
  onSave,
}: RuralGroupsModalProps) {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const filteredClients = clients.filter((client) => [
    client.name,
    client.externalId,
    client.id,
    client.street,
    client.neighborhood,
  ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalizedSearch));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="import-modal rural-groups-modal" role="dialog" aria-modal="true" aria-labelledby="rural-groups-title">
        <header>
          <div>
            <span className="eyebrow">Cobertura compartilhada</span>
            <h2 id="rural-groups-title">{draft ? (draft.id ? 'Editar grupo rural' : 'Novo grupo rural') : 'Grupos rurais'}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        {!draft ? (
          <>
            <div className="rural-intro">
              <span><UsersRound size={19} /></span>
              <p><b>Um ponto, vários clientes.</b><small>Crie vilas, comunidades ou propriedades e represente todos os integrantes em um único marcador no mapa.</small></p>
              <button className="primary-small" onClick={onCreate}><Plus size={15} />Novo grupo</button>
            </div>

            <div className="rural-group-list">
              {groups.map((group) => (
                <article key={group.id}>
                  <button className="rural-group-main" onClick={() => onView(group)}>
                    <span className="rural-group-pin"><MapPin size={18} /><b>{group.clientIds.length}</b></span>
                    <span><b>{group.name}</b><small>{group.clientIds.length} cliente{group.clientIds.length === 1 ? '' : 's'} · {group.lat.toFixed(5)}, {group.lng.toFixed(5)}</small></span>
                  </button>
                  <div className="rural-group-actions">
                    <button onClick={() => onEdit(group)} aria-label={`Editar ${group.name}`}><Pencil size={15} /></button>
                    <button className="danger" onClick={() => onDelete(group)} aria-label={`Excluir ${group.name}`}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
              {!groups.length && (
                <div className="rural-empty"><MapPin size={25} /><b>Nenhum grupo nesta cidade</b><span>Crie o primeiro para reunir clientes de uma mesma área rural.</span></div>
              )}
            </div>
          </>
        ) : (
          <form className="rural-group-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
            <button type="button" className="rural-back" onClick={onBack}><ChevronLeft size={15} />Todos os grupos</button>

            <label className="client-field rural-name-field">
              <span>Nome do grupo *</span>
              <input value={draft.name} onChange={(event) => onDraftChange({ name: event.target.value })} placeholder="Ex.: Vila Rural de Guaporema" autoFocus />
            </label>

            <section className="rural-location-card">
              <span className="rural-location-icon"><MapPin size={19} /></span>
              <div>
                <b>Local do marcador *</b>
                <small>{draft.lat !== undefined && draft.lng !== undefined ? `${draft.lat.toFixed(7)}, ${draft.lng.toFixed(7)}` : 'Escolha o ponto central ou a entrada da comunidade.'}</small>
              </div>
              <button type="button" onClick={onChooseLocation}>{draft.lat !== undefined ? 'Alterar no mapa' : 'Escolher no mapa'}</button>
            </section>

            <section className="rural-members-section">
              <div className="rural-members-heading">
                <div><b>Clientes do grupo</b><small>{draft.clientIds.length} selecionado{draft.clientIds.length === 1 ? '' : 's'}</small></div>
                <label><Search size={14} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar cliente" /></label>
              </div>
              <div className="rural-client-options">
                {filteredClients.map((client) => {
                  const selected = draft.clientIds.includes(client.id);
                  const otherGroup = groups.find((group) => group.id !== draft.id && group.clientIds.includes(client.id));
                  return (
                    <button type="button" key={client.id} className={selected ? 'selected' : ''} onClick={() => onToggleClient(client.id)}>
                      <span className="rural-check">{selected && <Check size={13} />}</span>
                      <span><b>{client.name}</b><small>{client.street ? `${client.street}, ${client.number}` : client.externalId ?? client.id}{otherGroup ? ` · atualmente em ${otherGroup.name}` : ''}</small></span>
                    </button>
                  );
                })}
                {!filteredClients.length && <div className="rural-no-results">Nenhum cliente corresponde à busca.</div>}
              </div>
            </section>

            {error && <div className="client-form-error">{error}</div>}

            <footer className="modal-actions">
              <button type="button" className="secondary-action" onClick={onBack}>Cancelar</button>
              <button type="submit" className="primary-action"><Check size={15} />Salvar grupo</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
