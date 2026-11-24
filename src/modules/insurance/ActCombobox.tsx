import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/forms/controls';
import { queryKeys } from '@/core/api/query-client';
import { usePreferences } from '@/core/preferences/preferences-store';
import { apiInsurance, type ApiCatalogHit } from './insurance-api';

const KIND_LABEL: Record<string, string> = { service: 'Prestation', lab: 'Examen', pharmacy: 'Médicament' };

/** Libellés d'actes connus par leur identifiant (règles et accords déjà enregistrés) : une requête pour toute la liste. */
export function useActLabels(ids: string[]): Map<string, ApiCatalogHit> {
  const { activeFacilityId } = usePreferences();
  const wanted = [...new Set(ids.filter((i) => /^\d+$/.test(i)))].sort();
  const q = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'acts', wanted.join(',')),
    queryFn: () => apiInsurance.actsByIds(wanted),
    enabled: wanted.length > 0,
    staleTime: 60_000,
  });
  return new Map((q.data ?? []).map((h) => [h.id, h]));
}

interface Props {
  /** Identifiant de l'acte choisi dans le catalogue, ou '' */
  value: string;
  onChange: (catalogItemId: string) => void;
  /** Ancien code saisi à la main (règle créée avant le choix par catalogue) : affiché tant qu'aucun acte n'est choisi. */
  legacyCode?: string;
  id?: string;
  'aria-describedby'?: string;
}

/**
 * Choix d'un acte du catalogue avec suggestions : le serveur cherche (nom ou code d'examen), 15 résultats au plus,
 * donc fluide même avec des milliers d'actes. L'identifiant retenu ne change jamais, même si l'acte est renommé.
 */
export function ActCombobox({ value, onChange, legacyCode = '', id, 'aria-describedby': describedBy }: Props) {
  const { t } = useTranslation('finance');
  const { activeFacilityId } = usePreferences();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(handle);
  }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const hits = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'acts-search', query),
    queryFn: () => apiInsurance.searchActs(query),
    enabled: value === '' && query.length >= 2,
  });
  const chosen = useActLabels(value ? [value] : []).get(value);

  if (value !== '') {
    return (
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm" id={id} aria-describedby={describedBy}>
        <span className="truncate">{chosen ? <>{chosen.label}{chosen.code ? <span className="text-muted-foreground"> · {chosen.code}</span> : null}</> : `#${value}`}</span>
        <button type="button" className="rounded-full p-0.5 hover:bg-border" aria-label={t('apiInsurance.actChange', { defaultValue: "Changer d'acte" })} onClick={() => { onChange(''); setText(''); setQuery(''); }}><X aria-hidden className="size-4" /></button>
      </div>
    );
  }
  const list = hits.data ?? [];
  const showList = open && query.length >= 2 && hits.data !== undefined;
  const choose = (h: ApiCatalogHit) => { onChange(h.id); setOpen(false); setText(''); };
  return (
    <div ref={box} className="relative">
      <Input
        id={id} aria-describedby={describedBy} value={text} autoComplete="off" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={showList && list[active] ? `${listId}-${active}` : undefined}
        placeholder={legacyCode ? `${t('apiInsurance.legacyCode', { defaultValue: 'Ancien code' })} : ${legacyCode}` : t('apiInsurance.actSearch', { defaultValue: 'Rechercher un acte (nom ou code)…' })}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(list.length - 1, 0))); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && showList && list[active]) { e.preventDefault(); choose(list[active]); }
          else if (e.key === 'Escape' && showList) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-muted-foreground">{t('apiInsurance.actNone', { defaultValue: 'Aucun acte trouvé.' })}</li>}
          {list.map((h, i) => (
            <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary-soft' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(h); }} onMouseEnter={() => setActive(i)}>
              <span className="font-medium">{h.label}</span>
              <span className="text-muted-foreground"> · {t(`apiInsurance.actKind.${h.kind}`, { defaultValue: KIND_LABEL[h.kind] ?? h.kind })}{h.code ? ` · ${h.code}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Plusieurs actes dans une même règle : puces des actes choisis + recherche pour en ajouter. */
export function ActsPicker({ value, onChange, legacyCode = '', id, 'aria-describedby': describedBy }: {
  value: readonly string[]; onChange: (ids: string[]) => void; legacyCode?: string; id?: string; 'aria-describedby'?: string;
}) {
  const { t } = useTranslation('finance');
  const labels = useActLabels([...value]);
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const hit = labels.get(v);
            return (
              <li key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm">
                {hit ? hit.label : `#${v}`}
                <button type="button" className="rounded-full p-0.5 hover:bg-border" aria-label={`${t('apiInsurance.actRemove', { defaultValue: 'Retirer' })} ${hit?.label ?? v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X aria-hidden className="size-3.5" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <ActCombobox id={id} aria-describedby={describedBy} value="" legacyCode={value.length === 0 ? legacyCode : ''} onChange={(added) => { if (added !== '' && !value.includes(added)) onChange([...value, added]); }} />
    </div>
  );
}
