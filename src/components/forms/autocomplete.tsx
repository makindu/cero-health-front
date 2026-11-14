import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Input } from './controls';

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface AutocompleteProps<T> extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue' | 'type'> {
  /** Liste complète en mémoire : seuls `maxResults` éléments sont affichés, quel que soit le nombre (milliers sans problème). */
  items: readonly T[];
  /** Clé de l'élément choisi ('' = aucun). */
  value: string;
  onChange: (key: string, item?: T) => void;
  getKey: (item: T) => string;
  /** Texte affiché dans le champ une fois l'élément choisi. */
  getLabel: (item: T) => string;
  /** Texte interrogé par la recherche (tous les mots saisis doivent s'y trouver, accents et casse ignorés). */
  getSearch: (item: T) => string;
  renderOption?: (item: T) => ReactNode;
  emptyText: string;
  maxResults?: number;
}

/**
 * Champ de saisie avec suggestions instantanées (patron ARIA « combobox ») pour choisir UN élément parmi une longue liste
 * (patients, prestations, produits…). Remplace les listes déroulantes qui se figent au-delà de quelques centaines d'options.
 * Une saisie sans choix n'est jamais retenue : la valeur reste '' et le champ se vide en quittant.
 */
export function Autocomplete<T>({ items, value, onChange, getKey, getLabel, getSearch, renderOption, emptyText, maxResults = 8, id, disabled, ...rest }: AutocompleteProps<T>) {
  const listId = useId();
  const selected = useMemo(() => (value ? items.find((i) => getKey(i) === value) : undefined), [items, value, getKey]);
  const [text, setText] = useState(selected ? getLabel(selected) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Le champ suit la valeur externe (choix programmatique, remise à zéro du formulaire).
  useEffect(() => {
    if (selected) setText(getLabel(selected));
    else if (value === '') setText((t) => (open ? t : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, value]);

  const matches = useMemo(() => {
    const needle = fold(text);
    if (!needle || selected) return [];
    const tokens = needle.split(/\s+/);
    const out: { item: T; starts: boolean; label: string }[] = [];
    for (const item of items) {
      if (!tokens.every((tok) => fold(getSearch(item)).includes(tok))) continue;
      const label = getLabel(item);
      out.push({ item, starts: fold(label).startsWith(needle), label });
      if (out.length >= 400) break; // borne de travail : le tri ne porte que sur les premiers correspondants
    }
    return out.sort((a, b) => Number(b.starts) - Number(a.starts) || a.label.localeCompare(b.label)).slice(0, maxResults).map((m) => m.item);
  }, [text, selected, items, getSearch, getLabel, maxResults]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (item: T) => { onChange(getKey(item), item); setText(getLabel(item)); setOpen(false); };
  const showList = open && !disabled && text.trim() !== '' && !selected;

  return (
    <div ref={box} className="relative">
      <Input
        {...rest}
        id={id}
        disabled={disabled}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); if (value !== '') onChange(''); setOpen(true); setActive(0); }}
        onFocus={(e) => { setOpen(true); if (selected) e.currentTarget.select(); }}
        onBlur={() => { if (value === '') setTimeout(() => setText(''), 150); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && showList && matches[active]) { e.preventDefault(); choose(matches[active] as T); }
          else if (e.key === 'Escape' && showList) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-muted-foreground">{emptyText}</li>}
          {matches.map((item, i) => (
            <li key={getKey(item)} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary-soft' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(item); }} onMouseEnter={() => setActive(i)}>
              {renderOption ? renderOption(item) : getLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface MultiPickerProps<T> {
  items: readonly T[];
  value: readonly string[];
  onChange: (keys: string[]) => void;
  getKey: (item: T) => string;
  /** Libellé d'un élément (pastille et suggestion). */
  getLabel: (item: T) => string;
  getSearch: (item: T) => string;
  renderOption?: (item: T) => ReactNode;
  emptyText: string;
  placeholder?: string;
  removeLabel: string;
  maxResults?: number;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Choix de PLUSIEURS éléments parmi une longue liste : recherche instantanée + pastilles retirables. */
export function MultiPicker<T>({ items, value, onChange, getKey, getLabel, getSearch, renderOption, emptyText, placeholder, removeLabel, maxResults, id, disabled, 'aria-label': ariaLabel }: MultiPickerProps<T>) {
  const available = useMemo(() => items.filter((i) => !value.includes(getKey(i))), [items, value, getKey]);
  const byKey = useMemo(() => new Map(items.map((i) => [getKey(i), i])), [items, getKey]);
  return (
    <div className="space-y-2">
      <Autocomplete<T> id={id} disabled={disabled} aria-label={ariaLabel} placeholder={placeholder} maxResults={maxResults} items={available} value="" getKey={getKey} getLabel={() => ''} getSearch={getSearch} emptyText={emptyText}
        onChange={(key) => { if (key) onChange([...value, key]); }} renderOption={renderOption ?? ((i) => getLabel(i))} />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((key) => {
            const label = byKey.has(key) ? getLabel(byKey.get(key) as T) : key;
            return (
              <li key={key} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm">
                {label}
                <button type="button" className="rounded-full p-0.5 hover:bg-border" aria-label={`${removeLabel} ${label}`} onClick={() => onChange(value.filter((x) => x !== key))}><X aria-hidden className="size-3.5" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
