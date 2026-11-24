import { useState } from 'react';
import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PractitionerCombobox } from '../_shared/practitioner-combobox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { DateField, Select, Textarea } from '@/components/forms/controls';
import { DraftNotice } from '@/components/feedback/draft-notice';
import { usePersistentState } from '@/core/drafts/use-persistent-state';
import { referenceFromApi } from '../_shared/reference-data';
import { wardLabel } from './ward';
import { hospital } from './hospital';
import { apiHospital } from './hospital-api';
import type { Admission } from './hospital-rules';
import type { BedView } from './hospital-service';
import { useAdmissionRequests, useHospRequests, useHospitalBoard, useHospitalMutation } from './use-hospital';

interface Props { bedId?: string; initialPatientId?: string; consultationId?: string; requestId?: string; onClose: () => void; onDone: (a: Admission) => void }

/** Mode API : une admission part TOUJOURS d'une décision médicale. Mode local (démonstration) : saisie libre. */
export function AdmitDialog(props: Props) {
  return referenceFromApi() ? <ApiAdmitDialog {...props} /> : <LocalAdmitDialog {...props} />;
}

function ApiAdmitDialog({ bedId, consultationId, requestId, onClose, onDone }: Props) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  const consults = useAdmissionRequests();
  const hosp = useHospRequests();
  const approved = (hosp.data ?? []).filter((r) => r.status === 'approved');
  const [source, setSource] = useState(requestId ? `h:${requestId}` : consultationId ? `c:${consultationId}` : '');
  const [bed, setBed] = useState(bedId ?? '');
  const [reason, setReason] = useState<string | null>(null);
  const [expected, setExpected] = useState('');
  const hr = source.startsWith('h:') ? approved.find((r) => r.id === source.slice(2)) : undefined;
  const cr = source.startsWith('c:') ? (consults.data ?? []).find((r) => r.consultationId === source.slice(2)) : undefined;
  const patientId = hr?.patientId ?? cr?.patientId ?? '';
  const reasonValue = reason ?? hr?.reason ?? '';
  // Une demande validée vaut pour UN service : seuls ses lits libres sont proposés.
  const free = (board.data?.beds ?? []).filter((b: BedView) => b.bed.status === 'free' && (!hr || String(b.room.ward) === hr.careUnitId));
  const ready = patientId !== '' && bed !== '' && reasonValue.trim() !== '';
  const admit = useHospitalMutation(apiHospital.admit, { successTitle: t('done.admit'), onDone });
  const none = approved.length === 0 && (consults.data ?? []).length === 0;
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('hospReq.admit.description')}
      footer={<>
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={admit.isPending} disabled={!ready} onClick={() => admit.mutate({ patientId, bedId: bed, reason: reasonValue, expectedDischarge: expected || undefined, consultationId: cr?.consultationId, requestId: hr?.id })}>{t('create.submit')}</Button>
      </>}>
      <div className="space-y-4">
        {none && source === '' && <p role="status" className="rounded-md bg-warning-soft p-3 text-sm text-warning-ink">{t('hospReq.admit.none')}</p>}
        <FormField label={t('hospReq.admit.pick')} required hint={t('hospReq.admit.pickHint')}>
          {(c) => (
            <Select {...c} value={source} onChange={(e) => { setSource(e.target.value); setReason(null); setBed(bedId ?? ''); }}>
              <option value="">{t('hospReq.admit.pickPlaceholder')}</option>
              {approved.length > 0 && <optgroup label={t('hospReq.admit.groupApproved')}>{approved.map((r) => <option key={r.id} value={`h:${r.id}`}>{r.patientName} — {wardLabel(t, r.careUnitId)}</option>)}</optgroup>}
              {(consults.data ?? []).length > 0 && <optgroup label={t('hospReq.admit.groupConsult')}>{(consults.data ?? []).map((r) => <option key={r.consultationId} value={`c:${r.consultationId}`}>{r.patientName}{r.target ? ` — ${r.target}` : ''}</option>)}</optgroup>}
            </Select>
          )}
        </FormField>
        {hr && <p className="text-xs text-muted-foreground">{t('hospReq.admit.wardOnly', { service: wardLabel(t, hr.careUnitId), doctor: hr.decidedBy })}</p>}
        <FormField label={t('columns.bed')} required hint={t('create.bedHint')}>
          {(c) => (
            <Select {...c} value={bed} onChange={(e) => setBed(e.target.value)} disabled={source === ''}>
              <option value="">{t('create.chooseBed')}</option>
              {free.map((b) => <option key={b.bed.id} value={b.bed.id}>{b.bed.label} — {wardLabel(t, b.room.ward)} · {t(`roomKind.${b.room.kind}`)}</option>)}
            </Select>
          )}
        </FormField>
        <FormField label={t('columns.expectedDischarge')}>{(c) => <DateField {...c} value={expected} onChange={(e) => setExpected(e.target.value)} />}</FormField>
        <FormField label={t('create.reason')} required>{(c) => <Textarea {...c} rows={2} value={reasonValue} onChange={(e) => setReason(e.target.value)} />}</FormField>
        <p className="text-xs text-muted-foreground">{t('hospReq.admit.attendingAuto')}</p>
      </div>
    </Dialog>
  );
}

/** Démonstration locale : saisie libre, sans circuit de validation. */
function LocalAdmitDialog({ bedId, initialPatientId, consultationId, onClose, onDone }: Props) {
  const { t } = useTranslation('hospitalization');
  const board = useHospitalBoard();
  // Brouillon automatique : la saisie d'admission survit à une fermeture involontaire ou à une coupure.
  const [form, setForm, draft] = usePersistentState(`admit:${bedId ?? ''}:${initialPatientId ?? ''}:${consultationId ?? ''}`, {
    patientId: initialPatientId ?? '', bed: bedId ?? '', reason: '', attending: '', expected: '', consult: consultationId ?? '',
  });
  const { patientId, bed, reason, attending, expected } = form;
  const setPatientId = (patientId: string): void => setForm((f) => ({ ...f, patientId }));
  const setBed = (bed: string): void => setForm((f) => ({ ...f, bed }));
  const setReason = (reason: string): void => setForm((f) => ({ ...f, reason }));
  const setAttending = (attending: string): void => setForm((f) => ({ ...f, attending }));
  const setExpected = (expected: string): void => setForm((f) => ({ ...f, expected }));
  const admit = useHospitalMutation(hospital.admit, { successTitle: t('done.admit'), onDone: (a) => { draft.clear(); onDone(a); } });
  const free = (board.data?.beds ?? []).filter((b: BedView) => b.bed.status === 'free');
  const ready = patientId !== '' && bed !== '' && reason.trim() !== '';
  return (
    <Dialog open onClose={onClose} title={t('create.title')} description={t('create.description')}
      footer={<>
        <Button variant="outline" onClick={() => { draft.clear(); onClose(); }}>{t('common.cancel')}</Button>
        <Button loading={admit.isPending} disabled={!ready} onClick={() => admit.mutate({ patientId, bedId: bed, reason, attending, expectedDischarge: expected || undefined })}>{t('create.submit')}</Button>
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
          <FormField label={t('create.attending')} hint={t('create.attendingOptional')}>{(c) => <PractitionerCombobox {...c} defaultValue={attending} onValueChange={setAttending} />}</FormField>
          <FormField label={t('columns.expectedDischarge')}>{(c) => <DateField {...c} value={expected} onChange={(e) => setExpected(e.target.value)} />}</FormField>
        </div>
        <FormField label={t('create.reason')} required>{(c) => <Textarea {...c} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
        <p className="text-xs text-muted-foreground">{t('create.notice')}</p>
      </div>
    </Dialog>
  );
}
