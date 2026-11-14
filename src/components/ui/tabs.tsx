import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: readonly TabItem[];
  defaultTabId?: string;
  /** Libellé accessible de la liste d'onglets. */
  ariaLabel: string;
  className?: string;
}

/** Onglets accessibles : flèches, Début et Fin pour naviguer (modèle ARIA « tabs »). */
export function Tabs({ tabs, defaultTabId, ariaLabel, className }: TabsProps) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusTab(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    setActiveId(tab.id);
    buttons.current[tab.id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight') focusTab(index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[tab.id] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary text-primary-ink'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== activeId}
          className="pt-4"
        >
          {tab.id === activeId && tab.content}
        </div>
      ))}
    </div>
  );
}
