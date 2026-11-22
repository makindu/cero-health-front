import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { useCareUnits } from '../_shared/reference-data';
import { apiHospital } from './hospital-api';
import { useHospitalMutation } from './use-hospital';

/** Configuration (mode API) : ajouter une chambre et ses lits à un service. */
export function RoomSetupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('hospitalization');
  const units = useCareUnits();
  const [unit, setUnit] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'standard' | 'private'>('standard');
  const [count, setCount] = useState('1');
  const n = Number(count);
  const ready = unit !== '' && code.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 30;
  const save = useHospitalMutation(apiHospital.setupRoom, { successTitle: t('setup.done', { defaultValue: 'Chambre et lits ajoutés.' }), onDone: () => { setCode(''); setCount('1'); } });
  return (
    <Dialog open onClose={onClose} title={t('setup.title', { defaultValue: 'Ajouter une chambre et ses lits' })}
      description={t('setup.description', { defaultValue: 'Choisissez le service, donnez un code à la chambre et indiquez le nombre de lits.' })}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('setup.close', { defaultValue: 'Fermer' })}</Button>
        <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate({ careUnitId: unit, code, kind, beds: n })}>{t('setup.submit', { defaultValue: 'Ajouter' })}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.ward')} required hint={units.data?.length === 0 ? t('setup.noUnits', { defaultValue: 'Aucun service : créez d’abord une unité de soin dans Administration.' }) : undefined}>
          {(c) => (
            <Select {...c} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">{t('setup.chooseUnit', { defaultValue: 'Choisir un service' })}</option>
              {(units.data ?? []).filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('setup.code', { defaultValue: 'Code de la chambre' })} required>{(c) => <Input {...c} value={code} onChange={(e) => setCode(e.target.value)} placeholder="101" />}</FormField>
          <FormField label={t('setup.kind', { defaultValue: 'Type' })}>
            {(c) => (
              <Select {...c} value={kind} onChange={(e) => setKind(e.target.value as 'standard' | 'private')}>
                <option value="standard">{t('roomKind.standard')}</option>
                <option value="private">{t('roomKind.private')}</option>
              </Select>
            )}
          </FormField>
          <FormField label={t('setup.beds', { defaultValue: 'Nombre de lits' })} required>{(c) => <Input {...c} type="number" min={1} max={30} value={count} onChange={(e) => setCount(e.target.value)} />}</FormField>
        </div>
      </div>
    </Dialog>
  );
}
