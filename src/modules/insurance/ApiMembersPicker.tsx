import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PatientCombobox } from '../_shared/patient-combobox';
import { useResourceItem } from '../_shared/use-resource';
import { patientService } from '../patients/data';

/** Nom d'un patient lu sur le serveur (« #id » tant qu'il n'est pas chargé ou s'il est introuvable). */
export function usePatientLabel(id: string): { label: string; found: boolean } {
  const item = useResourceItem('patients', patientService, /^\d+$/.test(id) ? id : undefined);
  const p = item.data?.item;
  return { label: p ? `${p.fullName} — ${p.fileNumber}` : `#${id}`, found: Boolean(p) };
}

function Chip({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { t } = useTranslation();
  const { label } = usePatientLabel(id);
  return (
    <li className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm">
      {label}
      <button type="button" className="rounded-full p-0.5 hover:bg-border" aria-label={`${t('module.remove')} ${label}`} onClick={onRemove}><X aria-hidden className="size-3.5" /></button>
    </li>
  );
}

/**
 * Choix de plusieurs patients avec la recherche du serveur. Un patient n'est ajouté qu'après un clic sur « Ajouter » :
 * le nom trouvé s'affiche d'abord, donc un identifiant tapé à la main ne s'ajoute jamais par erreur.
 */
export function ApiMembersPicker({ value, onChange, id, 'aria-label': ariaLabel }: { value: readonly string[]; onChange: (ids: string[]) => void; id?: string; 'aria-label'?: string }) {
  const { t } = useTranslation('finance');
  const [pending, setPending] = useState('');
  const [round, setRound] = useState(0);
  const candidate = /^\d+$/.test(pending) && !value.includes(pending) ? pending : '';
  const found = usePatientLabel(candidate);
  const add = (): void => { onChange([...value, candidate]); setPending(''); setRound(round + 1); };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1"><PatientCombobox key={round} id={id} aria-label={ariaLabel} onValueChange={setPending} /></div>
        <Button variant="outline" disabled={candidate === '' || !found.found} onClick={add}>{candidate !== '' && found.found ? t('apiInsurance.addMember', { defaultValue: 'Ajouter {{name}}', name: found.label }) : t('apiInsurance.add', { defaultValue: 'Ajouter' })}</Button>
      </div>
      {value.length > 0 && <ul className="flex flex-wrap gap-2">{value.map((v) => <Chip key={v} id={v} onRemove={() => onChange(value.filter((x) => x !== v))} />)}</ul>}
    </div>
  );
}
