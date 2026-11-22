import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PractitionerCombobox } from '../_shared/practitioner-combobox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';
import { referenceFromApi } from '../_shared/reference-data';
import { wardLabel } from './ward';
import { hospital } from './hospital';
import type { Admission } from './hospital-rules';
import type { BedView } from './hospital-service';
import { useHospitalBoard, useHospitalMutation } from './use-hospital';

export function AdmitDialog({ bedId, initialPatientId, consultationId, onClose, onDone }: { bedId?: string; initialPatientId?: string; consultationId?: string; onClose: () => void; onDone: (a: Admission) => void }) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  // Brouillon automatique : la saisie d'admission survit à une fermeture involontaire ou à une coupure.
  const [form, setForm, draft] = usePersistentState(`admit:${bedId ?? ''}:${initialPatientId ?? ''}:${consultationId ?? ''}`, {
    patientId: initialPatientId ?? '', bed: bedId ?? '', reason: '', attending: '', expected: '', consult: consultationId ?? '',
  });
  const { patientId, bed, reason, attending, expected, consult } = form;
  const setPatientId = (patientId: string): void => setForm((f) => ({ ...f, patientId }));
  const setBed = (bed: string): void => setForm((f) => ({ ...f, bed }));
  const setReason = (reason: string): void => setForm((f) => ({ ...f, reason }));
  const setAttending = (attending: string): void => setForm((f) => ({ ...f, attending }));
  const setExpected = (expected: string): void => setForm((f) => ({ ...f, expected }));
  const setConsult = (consult: string): void => setForm((f) => ({ ...f, consult }));
  const admit = useHospitalMutation(hospital.admit, { successTitle: t('done.admit'), onDone: (a) => { draft.clear(); onDone(a); } });
  const free = (board.data?.beds ?? []).filter((b: BedView) => b.bed.status === 'free');
  const ready = patientId !== '' && bed !== '' && reason.trim() !== '' && (!referenceFromApi() || attending.trim() !== '');
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={() => { draft.clear(); onClose(); }}>{t('common.cancel')}</Button>
        <Button loading={admit.isPending} disabled={!ready} onClick={() => admit.mutate({ patientId, bedId: bed, reason, attending, expectedDischarge: expected || undefined, consultationId: consult.trim() || undefined })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        {draft.restored && <DraftNotice onDiscard={draft.discard} />}
        <FormField label={t('columns.patient')} required>
          {(c) => (
            <PatientPicker {...c} value={patientId} onChange={setPatientId} disabled={Boolean(initialPatientId)} />
          )}
        </FormField>
        <FormField label={t('columns.bed')} required hint={t('create.bedHint')}>
          {(c) => (
            <Select {...c} value={bed} onChange={(e) => setBed(e.target.value)}>
              <option value="">{t('create.chooseBed')}</option>
              {free.map((b) => <option key={b.bed.id} value={b.bed.id}>{b.bed.label} — {wardLabel(t, b.room.ward)} · {t(`roomKind.${b.room.kind}`)}</option>)}
            </Select>
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('create.attending')} hint={referenceFromApi() ? t('create.attendingRequired', { defaultValue: 'Choisissez un médecin dans la liste.' }) : t('create.attendingOptional')} required={referenceFromApi()}>{(c) => <PractitionerCombobox {...c} defaultValue={attending} onValueChange={setAttending} />}</FormField>
          <FormField label={t('columns.expectedDischarge')}>{(c) => <DateField {...c} value={expected} onChange={(e) => setExpected(e.target.value)} />}</FormField>
        </div>
        <FormField label={t('create.reason')} required>{(c) => <Textarea {...c} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
        <FormField label={t('create.consultation')} hint={t('create.consultationHint')}>{(c) => <Input {...c} value={consult} onChange={(e) => setConsult(e.target.value)} />}</FormField>
        <p className="text-xs text-muted-foreground">{t('create.notice')}</p>
      </div>
    </Dialog>
  );
}
