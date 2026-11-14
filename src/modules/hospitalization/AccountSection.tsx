import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { Select, Textarea, Input } from '@/components/forms/controls';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ActionDialog } from '../finance/ActionDialog';
import { InvoiceDetail } from '../finance/InvoiceDetail';
import { InvoiceStatusBadge } from '../finance/InvoiceStatusBadge';
import { useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { hospitalAccount } from './hospital';
import { DISCHARGE_OUTCOMES, isActive, type DischargeOutcome } from './hospital-rules';
import { useAdmissionAccount, useHospitalMutation } from './use-hospital';

/** Compte hospitalier d'une admission : factures du séjour, jours de chambre, sortie effective conditionnée au solde. */
export function AccountSection({ admissionId }: { admissionId: string }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const account = useAdmissionAccount(admissionId);
  const snap = useFinanceSnapshot();
  const orgNames = useMemo(() => Object.fromEntries((snap.data?.organizations ?? []).map((o) => [o.id, o.name])), [snap.data]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [outcome, setOutcome] = useState<DischargeOutcome>('normal');
  const [note, setNote] = useState('');
  const [exception, setException] = useState('');
  const mPost = useHospitalMutation(hospitalAccount.postRoomDays, { successTitle: t('done.roomDays') });
  const mOut = useHospitalMutation(hospitalAccount.discharge, { successTitle: t('done.discharged'), onDone: () => { setDialog(false); setNote(''); setException(''); } });

  const v = account.data;
  if (account.isPending) return <DetailSection title={t('account.title')}><p className="text-sm text-muted-foreground">{t('account.loading')}</p></DetailSection>;
  if (!v) return <DetailSection title={t('account.title')}><p className="text-sm text-danger">{t('account.loadFailed')}</p></DetailSection>;
  const m = (n: number) => money(n, v.currency);
  const active = isActive(v.admission);
  const needsException = !v.patientCleared;
  const canException = can(P.hospitalization.dischargeException);
  const blockedByDays = v.unbilledForDischarge.length > 0;
  const submitOk = !blockedByDays && (!needsException || (canException && exception.trim() !== ''));

  return (
    <DetailSection title={t('account.title')}>
      <DescriptionList items={[
        { label: t('account.billed'), value: m(v.totals.billable) },
        { label: t('account.patientShare'), value: m(v.totals.patientShare) },
        { label: t('account.paid'), value: m(v.totals.patientPaid) },
        { label: t('account.patientDue'), value: <strong>{m(v.totals.patientDue)}</strong> },
        { label: t('account.orgDue'), value: m(v.totals.organizationsOutstanding) },
        { label: t('account.roomDaysBilled'), value: String(v.billedDayCount) },
        { label: t('account.roomDaysPending'), value: active ? String(v.unbilledNow.length) : '' },
      ]} />
      {v.invoices.length === 0 ? <p className="text-sm text-muted-foreground">{t('account.noInvoices')}</p> : (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {v.invoices.map((i) => (
            <li key={i.invoice.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <span>{i.invoice.number} · {f.dateTime(i.invoice.createdAt)} · {m(i.invoice.totals.billable)}</span>
              <span className="flex items-center gap-2"><InvoiceStatusBadge status={i.status} /><Button size="sm" variant="outline" onClick={() => setOpenId(i.invoice.id)}>{t('beds.open')}</Button></span>
            </li>
          ))}
        </ul>
      )}
      {active && (
        <div className="flex flex-wrap gap-2 pt-2">
          <Can permission={P.hospitalization.discharge}>
            <Button variant="outline" loading={mPost.isPending} disabled={v.unbilledNow.length === 0} onClick={() => mPost.mutate({ admissionId })}>{t('account.postDays')}</Button>
            <Button onClick={() => setDialog(true)}>{t('account.discharge')}</Button>
          </Can>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('account.convention')}</p>
      <ActionDialog open={dialog} onClose={() => setDialog(false)} title={t('account.dischargeTitle')} description={t('account.dischargeBody')} submitLabel={t('account.discharge')} pending={mOut.isPending || mPost.isPending} canSubmit={submitOk}
        onSubmit={() => mOut.mutate({ admissionId, outcome, note, exceptionReason: needsException ? exception : undefined })}>
        <FormField label={t('account.outcome')} required>
          {(c) => <Select {...c} value={outcome} onChange={(e) => setOutcome(e.target.value as DischargeOutcome)}>{DISCHARGE_OUTCOMES.map((o) => <option key={o} value={o}>{t(`outcome.${o}`)}</option>)}</Select>}
        </FormField>
        <FormField label={t('detail.note')}>{(c) => <Textarea {...c} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        {blockedByDays && (
          <div className="space-y-2 rounded-md border border-warning/40 p-3 text-sm">
            <p>{t('account.blockDays', { count: v.unbilledForDischarge.length })}</p>
            <Button size="sm" variant="outline" loading={mPost.isPending} onClick={() => mPost.mutate({ admissionId, forDischarge: true })}>{t('account.postDaysDischarge')}</Button>
          </div>
        )}
        {needsException && (
          <div className="space-y-2 rounded-md border border-warning/40 p-3 text-sm">
            <p>{t('account.blockBalance', { due: m(v.totals.patientDue) })}</p>
            {canException ? (
              <FormField label={t('account.exceptionReason')} required>{(c) => <Input {...c} value={exception} onChange={(e) => setException(e.target.value)} />}</FormField>
            ) : <p className="text-muted-foreground">{t('account.noException')}</p>}
          </div>
        )}
      </ActionDialog>
      {openId && <InvoiceDetail view={v.invoices.find((i) => i.invoice.id === openId)} orgNames={orgNames} onClose={() => setOpenId(null)} />}
    </DetailSection>
  );
}
