import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/forms/form-field';
import { Select, Textarea } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { hospital } from './hospital';
import { currentStay, isActive, type Admission } from './hospital-rules';
import type { BedView } from './hospital-service';
import { AccountSection } from './AccountSection';
import { AdmissionStatusBadge } from './StatusBadges';
import { useHospitalBoard, useHospitalMutation } from './use-hospital';
import { Avatar } from '@/components/ui/avatar';

export function AdmissionDetail({ admission, onClose }: { admission: Admission | undefined; onClose: () => void }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const board = useHospitalBoard();
  const [action, setAction] = useState<'transfer' | 'cancel' | 'discharge' | null>(null);
  const [text, setText] = useState('');
  const [bedId, setBedId] = useState('');
  const done = (): void => { setAction(null); setText(''); setBedId(''); };
  const mTransfer = useHospitalMutation(hospital.transfer, { successTitle: t('done.transfer'), onDone: done });
  const mCancel = useHospitalMutation(hospital.cancel, { successTitle: t('done.cancel'), onDone: done });
  const mDischarge = useHospitalMutation(hospital.requestDischarge, { successTitle: t('done.dischargeRequest'), onDone: done });
  const mRevoke = useHospitalMutation(hospital.revokeDischarge, { successTitle: t('done.dischargeRevoke') });
  if (!admission) return <Dialog open={false} onClose={onClose} ariaLabel={t('detail.summary')} />;
  const a = admission;
  const beds: BedView[] = board.data?.beds ?? [];
  const label = (id: string): string => beds.find((b) => b.bed.id === id)?.bed.label ?? id;
  const free = beds.filter((b) => b.bed.status === 'free');
  const cur = currentStay(a);
  return (
    <Dialog open onClose={onClose} title={`${a.number} — ${a.patientName}`} leading={<Avatar name={a.patientName} size="lg" />} description={t('detail.description')}>
      <div className="space-y-5">
        <DetailSection title={t('detail.summary')}>
          <DescriptionList items={[
            { label: t('columns.status'), value: <AdmissionStatusBadge status={a.status} /> },
            { label: t('columns.ward'), value: t(`services.${a.ward}`) },
            { label: t('columns.bed'), value: cur ? label(cur.bedId) : '—' },
            { label: t('columns.admittedAt'), value: `${f.dateTime(a.admittedAt)} · ${a.admittedBy}` },
            { label: t('columns.expectedDischarge'), value: a.expectedDischarge ? f.date(a.expectedDischarge) : '' },
            { label: t('detail.attending'), value: a.attending },
            { label: t('create.reason'), value: a.reason },
            { label: t('create.consultation'), value: a.consultationId },
            { label: t('detail.dischargeRequest'), value: a.dischargeRequest ? `${a.dischargeRequest.by} · ${f.dateTime(a.dischargeRequest.at)}${a.dischargeRequest.note ? ` — ${a.dischargeRequest.note}` : ''}` : '' },
            { label: t('detail.cancelled'), value: a.cancellation ? `${a.cancellation.by} · ${a.cancellation.reason}` : '' },
          ]} />
        </DetailSection>
        <DetailSection title={t('detail.stays')}>
          <ol className="space-y-1 text-sm">
            {a.stays.map((s, i) => (
              <li key={i}>{label(s.bedId)} — {f.dateTime(s.from)} → {s.to ? f.dateTime(s.to) : t('detail.ongoing')}{s.reason ? ` · ${s.reason}` : ''}</li>
            ))}
          </ol>
        </DetailSection>
        {a.status !== 'cancelled' && <AccountSection admissionId={a.id} />}
        {a.discharge && (
          <DetailSection title={t('account.dischargeRecord')}>
            <DescriptionList items={[
              { label: t('account.outcome'), value: t(`outcome.${a.discharge.outcome}`) },
              { label: t('columns.admittedAt'), value: `${f.dateTime(a.discharge.at)} · ${a.discharge.by}` },
              { label: t('detail.note'), value: a.discharge.note },
              { label: t('account.exceptionReason'), value: a.discharge.exception?.reason ?? '' },
            ]} />
          </DetailSection>
        )}
        {isActive(a) && (
          <DetailSection title={t('detail.actions')}>
            <div className="flex flex-wrap gap-2">
              <Can permission={P.hospitalization.assignBed}><Button variant="outline" onClick={() => { setText(''); setBedId(''); setAction('transfer'); }}>{t('detail.transfer')}</Button></Can>
              {a.status === 'admitted' && <Can permission={P.hospitalization.discharge}><Button onClick={() => { setText(''); setAction('discharge'); }}>{t('detail.requestDischarge')}</Button></Can>}
              {a.status === 'dischargePending' && <Can permission={P.hospitalization.discharge}><Button variant="outline" loading={mRevoke.isPending} onClick={() => mRevoke.mutate({ admissionId: a.id })}>{t('detail.revokeDischarge')}</Button></Can>}
              <Can permission={P.hospitalization.create}><Button variant="outline" onClick={() => { setText(''); setAction('cancel'); }}>{t('detail.cancel')}</Button></Can>
            </div>
            <p className="text-xs text-muted-foreground">{t('detail.dischargeNotice')}</p>
          </DetailSection>
        )}
      </div>
      <ActionDialog open={action === 'transfer'} onClose={() => setAction(null)} title={t('detail.transferTitle')} submitLabel={t('detail.transfer')} pending={mTransfer.isPending} canSubmit={bedId !== '' && text.trim() !== ''}
        onSubmit={() => mTransfer.mutate({ admissionId: a.id, bedId, reason: text })}>
        <FormField label={t('detail.newBed')} required>
          {(c) => <Select {...c} value={bedId} onChange={(e) => setBedId(e.target.value)}><option value="">{t('create.chooseBed')}</option>{free.map((b) => <option key={b.bed.id} value={b.bed.id}>{b.bed.label} — {t(`services.${b.room.ward}`)} · {t(`roomKind.${b.room.kind}`)}</option>)}</Select>}
        </FormField>
        <FormField label={t('detail.reasonLabel')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'cancel'} onClose={() => setAction(null)} tone="danger" title={t('detail.cancelTitle')} description={t('detail.cancelBody')} submitLabel={t('detail.cancel')} pending={mCancel.isPending} canSubmit={text.trim() !== ''}
        onSubmit={() => mCancel.mutate({ admissionId: a.id, reason: text })}>
        <FormField label={t('detail.reasonLabel')} required>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
      <ActionDialog open={action === 'discharge'} onClose={() => setAction(null)} title={t('detail.dischargeTitle')} description={t('detail.dischargeBody')} submitLabel={t('detail.requestDischarge')} pending={mDischarge.isPending}
        onSubmit={() => mDischarge.mutate({ admissionId: a.id, note: text })}>
        <FormField label={t('detail.note')}>{(c) => <Textarea {...c} rows={2} value={text} onChange={(e) => setText(e.target.value)} />}</FormField>
      </ActionDialog>
    </Dialog>
  );
}
