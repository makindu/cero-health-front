import { X } from 'lucide-react';
import { useMemo, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Autocomplete } from '@/components/forms/autocomplete';
import { usePatients } from '../finance/use-finance';
import type { Patient } from '../patients/data';
import { PersonName } from '@/components/ui/avatar';

type InputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'defaultValue' | 'type'>;

const getKey = (p: Patient): string => p.id;
const getLabel = (p: Patient): string => `${p.fullName} — ${p.fileNumber}`;
const getSearch = (p: Patient): string => `${p.fullName} ${p.fileNumber} ${p.id} ${p.phone}`;
const renderPatient = (p: Patient) => (
  <PersonName name={p.fullName} size="sm" sub={p.fileNumber} />
);

/** Patients actifs (ni inactifs ni fusionnés). */
function useActivePatients(): Patient[] {
  const patients = usePatients();
  return useMemo(() => (patients.data ?? []).filter((p) => !p.mergedInto && p.status !== 'inactive'), [patients.data]);
}

/** Choix d'UN patient avec recherche instantanée (nom, numéro de dossier, identifiant, téléphone). Valeur = identifiant. */
export function PatientPicker({ value, onChange, ...rest }: InputProps & { value: string; onChange: (patientId: string) => void }) {
  const { t } = useTranslation();
  const items = useActivePatients();
  return (
    <Autocomplete<Patient> {...rest} items={items} value={value} onChange={(key) => onChange(key)} getKey={getKey} getLabel={getLabel} getSearch={getSearch}
      renderOption={renderPatient} emptyText={t('module.patientNoMatch')} placeholder={rest.placeholder ?? t('module.patientSearchPlaceholder')} />
  );
}

/** Choix de PLUSIEURS patients (ex. membres d'un abonnement) : recherche + pastilles retirables. */
export function MultiPatientPicker({ value, onChange, ...rest }: InputProps & { value: readonly string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const items = useActivePatients();
  const available = useMemo(() => items.filter((p) => !value.includes(p.id)), [items, value]);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  return (
    <div className="space-y-2">
      <Autocomplete<Patient> {...rest} items={available} value="" onChange={(key) => { if (key) onChange([...value, key]); }} getKey={getKey} getLabel={() => ''} getSearch={getSearch}
        renderOption={renderPatient} emptyText={t('module.patientNoMatch')} placeholder={rest.placeholder ?? t('module.patientSearchPlaceholder')} />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={rest['aria-label']}>
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-sm">
              {byId.get(id)?.fullName ?? id}
              <button type="button" className="rounded-full p-0.5 hover:bg-border" aria-label={`${t('module.remove')} ${byId.get(id)?.fullName ?? id}`} onClick={() => onChange(value.filter((x) => x !== id))}><X aria-hidden className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
