import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/forms/controls';
import { usePatients } from '../finance/use-finance';

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
  const patients = usePatients();
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = fold(text);
    if (!needle || !patients.data) return [];
    const tokens = needle.split(/\s+/);
    return patients.data
      .filter((p) => !p.mergedInto && p.status !== 'inactive')
      .map((p) => ({ p, hay: fold(`${p.fullName} ${p.fileNumber} ${p.id} ${p.phone}`) }))
      .filter(({ hay }) => tokens.every((tok) => hay.includes(tok)))
      .sort((a, b) => Number(fold(b.p.fullName).startsWith(needle)) - Number(fold(a.p.fullName).startsWith(needle)) || a.p.fullName.localeCompare(b.p.fullName))
      .slice(0, MAX)
      .map(({ p }) => p);
  }, [text, patients.data]);

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
              <span className="font-medium">{p.fullName}</span>
              <span className="ms-2 text-xs text-muted-foreground">{p.fileNumber} · {p.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
