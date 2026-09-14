'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { CityProfile, ClientRecord, ImportBatch, RuralClientGroup } from './client-data';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AsterAssistantProps {
  open: boolean;
  city: CityProfile | null;
  clients: ClientRecord[];
  groups: RuralClientGroup[];
  imports: ImportBatch[];
  onClose: () => void;
}

const STARTERS = [
  'Quantos clientes ativos existem nesta cidade?',
  'Liste os clientes que ainda precisam de localização.',
  'Resuma a importação mais recente.',
  'Quais planos aparecem mais na base?',
];

function buildContext(
  city: CityProfile | null,
  clients: ClientRecord[],
  groups: RuralClientGroup[],
  imports: ImportBatch[],
) {
  const groupByClient = new Map<string, RuralClientGroup>();
  groups.forEach((group) => group.clientIds.forEach((clientId) => groupByClient.set(clientId, group)));
  return {
    city: { name: city?.name ?? '', state: city?.state ?? '' },
    clients: clients.map((client) => {
      const ruralGroup = groupByClient.get(client.id);
      return {
      id: client.externalId ?? client.id,
      name: client.name,
      address: [client.street, client.number, client.complement, client.neighborhood, client.city, client.state, client.zip]
        .filter(Boolean).join(', '),
      status: client.status,
      plan: client.plan,
      phone: client.phone ?? '',
      email: client.email ?? '',
      contract: client.contract ?? '',
      customerType: client.customerType ?? '',
      registeredAt: client.registeredAt ?? '',
      location: client.lat !== undefined && client.lng !== undefined
        ? { status: client.locationQuality, lat: client.lat, lng: client.lng }
        : ruralGroup
          ? { status: 'grupo rural', lat: ruralGroup.lat, lng: ruralGroup.lng }
          : { status: 'sem localização' },
      reviewReason: ruralGroup
        ? ''
        : client.importIssues?.join(' · ') || client.pendingReason || '',
      ruralGroup: ruralGroup?.name ?? '',
      importId: client.importBatchId ?? '',
      };
    }),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      clientCount: group.clientIds.length,
      clientIds: group.clientIds,
      location: { lat: group.lat, lng: group.lng },
    })),
    imports: imports.map((batch) => ({
      id: batch.id,
      name: batch.name,
      fileName: batch.fileName,
      importedAt: batch.importedAt.toISOString(),
      total: batch.total,
      mapped: batch.mapped,
      pending: batch.pending,
      rejected: batch.rejected,
    })),
  };
}

export function AsterAssistant({ open, city, clients, groups, imports, onClose }: AsterAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [busy, messages]);

  async function ask(question: string) {
    const content = question.trim();
    if (!content || busy) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
          context: buildContext(city, clients, groups, imports),
        }),
      });
      const result = await response.json().catch(() => ({})) as { answer?: string; message?: string };
      if (!response.ok || !result.answer) throw new Error(result.message || 'O assistente não respondeu.');
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.answer!,
      }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível consultar o assistente.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  if (!open) return null;

  return (
    <div className="assistant-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="aster-assistant-title">
        <header className="assistant-header">
          <span className="assistant-orb"><Sparkles size={18} /></span>
          <div><small>Gemini · cidade ativa</small><h2 id="aster-assistant-title">Aster IA</h2></div>
          <button onClick={onClose} aria-label="Fechar assistente"><X size={19} /></button>
        </header>

        <div className="assistant-context">
          <span><b>{city?.name ?? 'Cidade não selecionada'}/{city?.state ?? '—'}</b><small>{clients.length} clientes · {groups.length} grupos · {imports.length} importações</small></span>
        </div>

        <div className="assistant-messages" aria-live="polite">
          {!messages.length && (
            <div className="assistant-welcome">
              <span><Bot size={22} /></span>
              <h3>Pesquise sua operação</h3>
              <p>Pergunte sobre clientes, endereços, planos, grupos rurais e histórico de importações desta cidade.</p>
              <div className="assistant-starters">
                {STARTERS.map((starter) => <button key={starter} onClick={() => void ask(starter)}>{starter}</button>)}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`assistant-message ${message.role}`}>
              {message.role === 'assistant' && <span className="assistant-message-icon"><Sparkles size={13} /></span>}
              <p>{message.content}</p>
            </div>
          ))}
          {busy && <div className="assistant-thinking"><LoaderCircle className="spin" size={15} />Analisando os dados da cidade…</div>}
          {error && <div className="assistant-error">{error}</div>}
          <div ref={endRef} />
        </div>

        <div className="assistant-privacy"><ShieldCheck size={13} />Os dados necessários desta cidade são enviados ao Gemini somente para responder à pergunta.</div>
        <form className="assistant-composer" onSubmit={submit}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (draft.trim()) void ask(draft);
              }
            }}
            placeholder="Pergunte ao Aster IA…"
            aria-label="Pergunta para o Aster IA"
            rows={1}
            maxLength={4000}
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Enviar pergunta"><Send size={17} /></button>
        </form>
      </aside>
    </div>
  );
}
