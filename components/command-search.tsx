'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CornerDownLeft, Search, X } from 'lucide-react';
import { WatermelonButton, WatermelonInput } from './watermelon-system';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  section: string;
  icon: ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

interface Props {
  items: CommandItem[];
  triggerLabel?: string;
  placeholder?: string;
  shortcutLabel?: string;
  hotkey?: string;
  emptyLabel?: string;
  className?: string;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function itemText(item: CommandItem) {
  return normalizeSearch([item.title, item.subtitle, item.section, ...(item.keywords ?? [])].filter(Boolean).join(' '));
}

export function CommandSearch({
  items,
  triggerLabel = 'Buscar no Aster',
  placeholder = 'Busque clientes, endereços ou ações',
  shortcutLabel = 'Ctrl K',
  hotkey = 'k',
  emptyLabel = 'Nenhum resultado encontrado',
  className = '',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const searchState = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
      const primaryItems = items.filter((item) => !item.section.startsWith('Clientes em '));
      const clientPreview = items.filter((item) => item.section.startsWith('Clientes em ')).slice(0, 6);
      const preview = [...primaryItems, ...clientPreview];
      return { items: preview, total: preview.length };
    }
    const matches = items
      .filter((item) => itemText(item).includes(normalizedQuery))
      .sort((left, right) => {
        const leftTitle = normalizeSearch(left.title);
        const rightTitle = normalizeSearch(right.title);
        const leftRank = leftTitle === normalizedQuery ? 0 : leftTitle.startsWith(normalizedQuery) ? 1 : leftTitle.includes(normalizedQuery) ? 2 : 3;
        const rightRank = rightTitle === normalizedQuery ? 0 : rightTitle.startsWith(normalizedQuery) ? 1 : rightTitle.includes(normalizedQuery) ? 2 : 3;
        return leftRank - rightRank || left.title.localeCompare(right.title, 'pt-BR');
      });
    return { items: matches.slice(0, 80), total: matches.length };
  }, [items, query]);
  const filteredItems = searchState.items;

  const sections = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    filteredItems.forEach((item) => groups.set(item.section, [...(groups.get(item.section) ?? []), item]));
    return Array.from(groups, ([name, sectionItems]) => ({ name, items: sectionItems }));
  }, [filteredItems]);

  function openSearch() {
    setQuery('');
    setActiveIndex(0);
    setIsOpen(true);
  }

  function closeSearch(returnFocus = true) {
    setIsOpen(false);
    if (returnFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function runItem(item: CommandItem) {
    item.action();
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    const handleGlobalKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === hotkey.toLowerCase() && !isTyping) {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalKey, true);
    return () => window.removeEventListener('keydown', handleGlobalKey, true);
  }, [hotkey, isOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setActiveIndex(0));
    return () => cancelAnimationFrame(frame);
  }, [query]);

  function handleInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!filteredItems.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % filteredItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + filteredItems.length) % filteredItems.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filteredItems[activeIndex];
      if (item) runItem(item);
    }
  }

  return (
    <div data-watermelon="command-search" className={`aster-global-search ${className}`}>
      <WatermelonButton ref={triggerRef} className="search-trigger" onClick={openSearch} aria-haspopup="dialog" aria-expanded={isOpen}>
        <span className="search-trigger-icon"><Search size={17} /></span>
        <span className="search-trigger-copy"><b>{triggerLabel}</b><small>Clientes, endereços e ações</small></span>
        <kbd>{shortcutLabel}</kbd>
      </WatermelonButton>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div className="command-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => closeSearch()} />
            <motion.section
              className="command-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Busca global do Aster"
              initial={{ opacity: 0, y: -12, scale: .985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: .99 }}
              transition={{ type: 'spring', stiffness: 460, damping: 38 }}
            >
              <header className="command-header">
                <span className="command-search-icon"><Search size={20} /></span>
                <WatermelonInput
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleInputKey}
                  placeholder={placeholder}
                  aria-label={placeholder}
                  role="combobox"
                  aria-controls="aster-command-results"
                  aria-expanded="true"
                  aria-activedescendant={filteredItems[activeIndex] ? `command-item-${filteredItems[activeIndex].id}` : undefined}
                />
                {query && <WatermelonButton className="command-clear" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={16} /></WatermelonButton>}
                <WatermelonButton className="command-close" onClick={() => closeSearch()} aria-label="Fechar busca"><span>Esc</span><X size={15} /></WatermelonButton>
              </header>

              <div className="command-meta">
                <span>{query ? `${searchState.total} ${searchState.total === 1 ? 'resultado' : 'resultados'}` : 'Acesso rápido'}</span>
                <small>Pesquise também por rua, número, plano ou status</small>
              </div>

              <div className="command-results" id="aster-command-results" role="listbox">
                {!filteredItems.length ? (
                  <div className="command-empty">
                    <span><Search size={22} /></span>
                    <b>{emptyLabel}</b>
                    <p>Tente somente o nome, a rua ou o número do cliente.</p>
                  </div>
                ) : sections.map((section) => (
                  <section className="command-section" key={section.name}>
                    <header><span>{section.name}</span><small>{section.items.length}</small></header>
                    <div>
                      {section.items.map((item) => {
                        const globalIndex = filteredItems.findIndex((candidate) => candidate.id === item.id);
                        const active = globalIndex === activeIndex;
                        return (
                          <WatermelonButton
                            id={`command-item-${item.id}`}
                            key={item.id}
                            role="option"
                            aria-selected={active}
                            className={`command-result ${active ? 'active' : ''}`}
                            onMouseEnter={() => setActiveIndex(globalIndex)}
                            onClick={() => runItem(item)}
                          >
                            <span className="command-result-icon">{item.icon}</span>
                            <span className="command-result-copy"><b>{item.title}</b>{item.subtitle && <small>{item.subtitle}</small>}</span>
                            {item.shortcut ? <kbd>{item.shortcut}</kbd> : <ArrowRight className="command-result-arrow" size={16} />}
                          </WatermelonButton>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <footer className="command-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
                <span><kbd><CornerDownLeft size={11} /></kbd> abrir</span>
                <span>Busca global Aster</span>
              </footer>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
