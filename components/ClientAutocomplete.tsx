'use client';

import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ClientRecord } from './client-data';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function ClientAutocomplete({ clients, value, onChange, onSelect }: {
  clients: ClientRecord[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (client: ClientRecord) => void;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => {
    const terms = normalize(value.trim()).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return clients.filter((client) => {
      const text = normalize([client.name, client.street, client.number, client.neighborhood, client.city, client.zip, client.phone, client.email, client.id, client.externalId].filter(Boolean).join(' '));
      return terms.every((term) => text.includes(term));
    }).slice(0, 8);
  }, [clients, value]);
  const open = focused && value.trim().length > 0;
  const select = (client: ClientRecord) => {
    setFocused(false);
    setActive(-1);
    onSelect(client);
  };

  return (
    <div className="client-autocomplete" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
      <label className="client-search-field">
        <Search size={18} aria-hidden="true" />
        <input aria-label="Pesquisar clientes por nome ou endereço" role="combobox" aria-autocomplete="list"
          aria-expanded={open} aria-controls={`${id}-results`}
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          placeholder="Buscar nome, endereço…" value={value} autoComplete="off"
          onFocus={() => setFocused(true)}
          onChange={(event) => { onChange(event.target.value); setActive(-1); setFocused(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.stopPropagation(); setFocused(false); setActive(-1); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setFocused(true);
              if (matches.length) setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (open && active >= 0 && matches[active]) select(matches[active]);
              else setFocused(false);
            }
          }} />
      </label>
      {open && <div className="client-search-results" id={`${id}-results`} role="listbox" aria-label="Clientes encontrados">
        {matches.map((client, index) => <button type="button" role="option" aria-selected={active === index}
          id={`${id}-${index}`} key={client.id} onMouseDown={(event) => event.preventDefault()} onClick={() => select(client)}>
          <strong>{client.name}</strong>
          <small>{client.street || 'Endereço não informado'}, {client.number || 's/n'}{client.neighborhood ? ` · ${client.neighborhood}` : ''}</small>
        </button>)}
        {!matches.length && <p role="status">Nenhum cliente encontrado.</p>}
      </div>}
    </div>
  );
}
