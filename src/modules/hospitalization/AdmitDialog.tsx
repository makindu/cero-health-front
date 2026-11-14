import { useState } from 'react';
import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PractitionerCombobox } from '../_shared/practitioner-combobox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import { hospital } from './hospital';
import type { Admission } from './hospital-rules';
import type { BedView } from './hospital-service';
import { useHospitalBoard, useHospitalMutation } from './use-hospital';

export function AdmitDialog({ bedId, initialPatientId, consultationId, onClose, onDone }: { bedId?: string; initialPatientId?: string; consultationId?: string; onClose: () => void; onDone: (a: Admission) => void }) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  const [patientId, setPatientId] = useState(initialPatientId ?? '');
  const [bed, setBed] = useState(bedId ?? '');
  const [reason, setReason] = useState('');
  const [attending, setAttending] = useState('');
  const [expected, setExpected] = useState('');
  const [consult, setConsult] = useState(consultationId ?? '');
  const admit = useHospitalMutation(hospital.admit, { successTitle: t('done.admit'), onDone });
  const free = (board.data?.beds ?? []).filter((b: BedView) => b.bed.status === 'free');
  const ready = patientId !== '' && bed !== '' && reason.trim() !== '' && attending.trim() !== '';
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={admit.isPending} disabled={!ready} onClick={() => admit.mutate({ patientId, bedId: bed, reason, attending, expectedDischarge: expected || undefined, consultationId: consult.trim() || undefined })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        <FormField label={t('columns.patient')} required>
          {(c) => (
            <PatientPicker {...c} value={patientId} onChange={setPatientId} disabled={Boolean(initialPatientId)} />
          )}
        </FormField>
        <FormField label={t('columns.bed')} required hint={t('create.bedHint')}>
          {(c) => (
            <Select {...c} value={bed} onChange={(e) => setBed(e.target.value)}>
              <option value="">{t('create.chooseBed')}</option>
              {free.map((b) => <option key={b.bed.id} value={b.bed.id}>{b.bed.label} — {t(`services.${b.room.ward}`)} · {t(`roomKind.${b.room.kind}`)}</option>)}
            </Select>
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('create.attending')} required>{(c) => <PractitionerCombobox {...c} defaultValue={attending} onValueChange={setAttending} />}</FormField>
          <FormField label={t('columns.expectedDischarge')}>{(c) => <DateField {...c} value={expected} onChange={(e) => setExpected(e.target.value)} />}</FormField>
        </div>
        <FormField label={t('create.reason')} required>{(c) => <Textarea {...c} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
        <FormField label={t('create.consultation')} hint={t('create.consultationHint')}>{(c) => <Input {...c} value={consult} onChange={(e) => setConsult(e.target.value)} />}</FormField>
        <p className="text-xs text-muted-foreground">{t('create.notice')}</p>
      </div>
    </Dialog>
  );
}
