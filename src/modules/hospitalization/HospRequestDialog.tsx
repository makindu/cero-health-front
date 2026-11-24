import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Select, Textarea } from '@/components/forms/controls';
import { PatientPicker } from '../_shared/pickers';
import { useCareUnits } from '../_shared/reference-data';
import { apiHospital } from './hospital-api';
import { useHospitalMutation } from './use-hospital';

/** Le service des admissions adresse une demande d'hospitalisation : un médecin du service d'accueil devra la valider. */
export function HospRequestDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('hospitalization');
  const units = useCareUnits();
  const [patientId, setPatientId] = useState('');
  const [unit, setUnit] = useState('');
  const [reason, setReason] = useState('');
  const ready = patientId !== '' && unit !== '' && reason.trim().length >= 5;
  const create = useHospitalMutation(apiHospital.createRequest, { successTitle: t('hospReq.done.created'), onDone: onClose });
  const active = (units.data ?? []).filter((u) => u.active);
  return (
    <Dialog open onClose={onClose} title={t('hospReq.dialogTitle')} description={t('hospReq.dialogDescription')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate({ patientId, careUnitId: unit, reason })}>{t('hospReq.submit')}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.patient')} required>{(c) => <PatientPicker {...c} value={patientId} onChange={setPatientId} />}</FormField>
        <FormField label={t('hospReq.service')} required hint={active.length === 0 ? t('hospReq.noUnits') : t('hospReq.serviceHint')}>
          {(c) => (
            <Select {...c} value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">{t('hospReq.servicePlaceholder')}</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </FormField>
        <FormField label={t('hospReq.reason')} required hint={t('hospReq.reasonHint')}>{(c) => <Textarea {...c} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
      </div>
    </Dialog>
  );
}
