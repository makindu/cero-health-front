import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/forms/controls';
import { usePatients } from '../finance/use-finance';
import { PersonName } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { patientService } from '../patients/data';
import { referenceFromApi } from './reference-data';

/** Minuscules sans accents : « Éloïse » se trouve en tapant « eloi ». */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const MAX = 8;

interface Props extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  defaultValue?: string;
  /** Valeur retenue : l'identifiant du patient choisi, ou le texte tapé tant qu'aucun choix n'a été fait. */
  onValueChange: (value: string) => void;
}

/**
 * Saisie de patient avec suggestions instantanées (nom, numéro de dossier ou identifiant), à la manière d'un moteur de recherche.
 * Patron ARIA « combobox » : flèches, Entrée, Échap. Sans liste de patients locale (autre mode), reste un champ texte simple.
 */
export function PatientCombobox({ defaultValue = '', onValueChange, id, ...rest }: Props) {
  const { t } = useTranslation();
  const localPatients = usePatients();
  const fromApi = referenceFromApi();
  const { activeFacilityId } = usePreferences();
  const [text, setText] = useState(defaultValue);
  // API réelle : le serveur cherche (nom, numéro, téléphone) ; on n'envoie rien avant 2 caractères et on attend la fin de la frappe.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(handle);
  }, [text]);
  const apiSearch = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'patients', 'combobox', query),
    queryFn: async () => (await patientService.list({ page: 1, perPage: MAX, search: query, filters: {}, sort: null })).rows,
    enabled: fromApi && query.length >= 2,
  });
  const patients = fromApi ? apiSearch : localPatients;
  // Brouillon restauré : la valeur retenue est un identifiant ; on remet le NOM du patient dans le champ (tant que rien n'est tapé).
  const idLike = /^\d+$/.test(defaultValue.trim());
  const resolved = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'patients', 'combobox-name', defaultValue),
    queryFn: async () => (await patientService.get(defaultValue.trim())).item.fullName,
    enabled: fromApi && idLike,
    staleTime: 60_000,
    retry: false,
  });
  const resolvedName = fromApi ? resolved.data : localPatients.data?.find((p) => p.id === defaultValue)?.fullName;
  useEffect(() => {
    if (resolvedName && idLike) setText((current) => (current === defaultValue ? resolvedName : current));
  }, [resolvedName, idLike, defaultValue]);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = fold(text);
    if (!needle || !patients.data) return [];
    if (fromApi) return patients.data.filter((p) => !p.mergedInto && p.status !== 'inactive').slice(0, MAX);
    const tokens = needle.split(/\s+/);
    return patients.data
      .filter((p) => !p.mergedInto && p.status !== 'inactive')
      .map((p) => ({ p, hay: fold(`${p.fullName} ${p.fileNumber} ${p.id} ${p.phone}`) }))
      .filter(({ hay }) => tokens.every((tok) => hay.includes(tok)))
      .sort((a, b) => Number(fold(b.p.fullName).startsWith(needle)) - Number(fold(a.p.fullName).startsWith(needle)) || a.p.fullName.localeCompare(b.p.fullName))
      .slice(0, MAX)
      .map(({ p }) => p);
  }, [text, patients.data, fromApi]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (p: (typeof matches)[number]) => { setText(p.fullName); onValueChange(p.id); setOpen(false); };
  const showList = open && text.trim() !== '' && Boolean(patients.data);

  return (
    <div ref={box} className="relative">
      <Input
        {...rest}
        id={id}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => { setText(e.target.value); onValueChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && showList && matches[active]) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === 'Escape' && showList) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-muted-foreground">{t('module.patientNoMatch')}</li>}
          {matches.map((p, i) => (
            <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary-soft' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setActive(i)}>
              <PersonName name={p.fullName} size="sm" sub={`${p.fileNumber} · ${p.id}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
