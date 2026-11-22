import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
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
  /**
   * Ajout à la volée : quand la saisie ne correspond à aucun élément, une dernière ligne « Ajouter … » propose de la créer
   * sans quitter le champ. Le parent crée l'élément (et signale lui-même une erreur) ; une exception laisse la saisie intacte.
   */
  onCreate?: (text: string) => void | Promise<void>;
  createLabel?: (text: string) => string;
  /** Texte comparé à la saisie pour savoir si l'élément existe déjà (par défaut : getLabel). */
  getExact?: (item: T) => string;
  /** Éléments déjà connus, y compris ceux déjà choisis (absents de `items`) : une saisie identique n'est jamais proposée à la création. */
  knownItems?: readonly T[];
  /** Texte saisi, à chaque frappe : permet au parent de chercher côté serveur. */
  onQueryChange?: (text: string) => void;
  /** Message affiché quand la saisie correspond à un élément déjà choisi. */
  duplicateText?: string;
}

/**
 * Champ de saisie avec suggestions instantanées (patron ARIA « combobox ») pour choisir UN élément parmi une longue liste
 * (patients, prestations, produits…). Remplace les listes déroulantes qui se figent au-delà de quelques centaines d'options.
 * Une saisie sans choix n'est jamais retenue : la valeur reste '' et le champ se vide en quittant.
 */
export function Autocomplete<T>({ items, value, onChange, getKey, getLabel, getSearch, renderOption, emptyText, maxResults = 8, onCreate, createLabel, getExact, knownItems, duplicateText, onQueryChange, id, disabled, ...rest }: AutocompleteProps<T>) {
  const listId = useId();
  const selected = useMemo(() => (value ? items.find((i) => getKey(i) === value) : undefined), [items, value, getKey]);
  const [text, setText] = useState(selected ? getLabel(selected) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
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

  const needle = fold(text);
  const exists = needle.length >= 2 && (knownItems ?? items).some((i) => fold((getExact ?? getLabel)(i)) === needle);
  const canCreate = Boolean(onCreate) && !disabled && !selected && needle.length >= 2 && !exists;
  const duplicate = Boolean(duplicateText) && exists && matches.length === 0;
  const total = matches.length + (canCreate ? 1 : 0);
  const create = async (): Promise<void> => {
    if (!onCreate || creating) return;
    setCreating(true);
    try {
      await onCreate(text.trim().replace(/\s+/g, ' '));
      setText('');
      setOpen(false);
    } catch {
      /* l'appelant a déjà informé l'utilisateur : la saisie reste en place */
    } finally {
      setCreating(false);
    }
  };
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
        aria-activedescendant={showList && active < total ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); onQueryChange?.(e.target.value); if (value !== '') onChange(''); setOpen(true); setActive(0); }}
        onFocus={(e) => { setOpen(true); if (selected) e.currentTarget.select(); }}
        onBlur={() => { if (value === '') setTimeout(() => setText(''), 150); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(total - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && showList && matches[active]) { e.preventDefault(); choose(matches[active] as T); }
          else if (e.key === 'Enter' && showList && canCreate && active === matches.length) { e.preventDefault(); void create(); }
          else if (e.key === 'Escape' && showList) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
          {matches.length === 0 && !canCreate && !duplicate && <li className="px-3 py-2 text-muted-foreground">{emptyText}</li>}
          {matches.map((item, i) => (
            <li key={getKey(item)} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary-soft' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(item); }} onMouseEnter={() => setActive(i)}>
              {renderOption ? renderOption(item) : getLabel(item)}
            </li>
          ))}
          {duplicate && <li className="px-3 py-2 text-muted-foreground">{duplicateText}</li>}
          {canCreate && (
            <li id={`${listId}-${matches.length}`} role="option" aria-selected={active === matches.length} aria-disabled={creating}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 font-medium text-primary ${active === matches.length ? 'bg-primary-soft' : ''} ${creating ? 'opacity-60' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); void create(); }} onMouseEnter={() => setActive(matches.length)}>
              <Plus aria-hidden className="size-4" />{createLabel ? createLabel(text.trim()) : text.trim()}
            </li>
          )}
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
  /** Crée un élément absent de la liste depuis la barre de recherche ; renvoie l'élément créé, qui est aussitôt ajouté. */
  onCreate?: (text: string) => Promise<T>;
  createLabel?: (text: string) => string;
  /** Message quand la saisie correspond à un élément déjà choisi. */
  alreadyText?: string;
}

/** Choix de PLUSIEURS éléments parmi une longue liste : recherche instantanée + pastilles retirables. */
export function MultiPicker<T>({ items, value, onChange, getKey, getLabel, getSearch, renderOption, emptyText, placeholder, removeLabel, maxResults, id, disabled, 'aria-label': ariaLabel, onCreate, createLabel, alreadyText }: MultiPickerProps<T>) {
  // Éléments créés à la volée : affichés tout de suite, avant que la liste du parent ne soit rechargée.
  const [extra, setExtra] = useState<T[]>([]);
  const all = useMemo(() => [...items, ...extra.filter((e) => !items.some((i) => getKey(i) === getKey(e)))], [items, extra, getKey]);
  const available = useMemo(() => all.filter((i) => !value.includes(getKey(i))), [all, value, getKey]);
  const byKey = useMemo(() => new Map(all.map((i) => [getKey(i), i])), [all, getKey]);
  return (
    <div className="space-y-2">
      <Autocomplete<T> id={id} disabled={disabled} aria-label={ariaLabel} placeholder={placeholder} maxResults={maxResults} items={available} value="" getKey={getKey} getLabel={() => ''} getExact={getLabel} knownItems={all} duplicateText={alreadyText} getSearch={getSearch} emptyText={emptyText}
        createLabel={createLabel}
        onCreate={onCreate ? async (text) => { const made = await onCreate(text); setExtra((e) => [...e, made]); const key = getKey(made); if (!value.includes(key)) onChange([...value, key]); } : undefined}
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
