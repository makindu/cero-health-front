import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/forms/controls';
import { useDoctors } from '../administration/use-doctors';
import { PersonName } from '@/components/ui/avatar';

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

interface Props extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  defaultValue?: string;
  onValueChange: (value: string) => void;
}

/**
 * Saisie de praticien avec suggestions : uniquement les MÉDECINS actifs de l'annuaire du personnel (Administration → Personnel).
 * Le service refuse un nom qui ne correspond pas à un médecin actif.
 */
export function PractitionerCombobox({ defaultValue = '', onValueChange, id, ...rest }: Props) {
  const doctors = useDoctors();
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const tokens = fold(text).split(/\s+/).filter(Boolean);
    return (doctors.data ?? []).filter((s) => tokens.every((tok) => fold(`${s.name} ${s.specialty ?? ''} ${s.registrationNumber ?? ''}`).includes(tok)));
  }, [text, doctors.data]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (name: string) => { setText(name); onValueChange(name); setOpen(false); };
  const showList = open && matches.length > 0;
  return (
    <div ref={box} className="relative">
      <Input {...rest} id={id} value={text} autoComplete="off" role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); onValueChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && showList && matches[active]) { e.preventDefault(); choose(matches[active].name); }
          else if (e.key === 'Escape' && showList) { e.stopPropagation(); setOpen(false); }
        }} />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg">
          {matches.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active} className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary-soft' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(s.name); }} onMouseEnter={() => setActive(i)}>
              <PersonName name={s.name} size="sm" sub={[s.specialty, s.registrationNumber].filter(Boolean).join(' · ') || undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
