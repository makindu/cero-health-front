import { useState } from 'react';
import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import type { FeePayment, ValidityConfig, ValidityMode } from '@/core/billing/validity';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, usePatients } from '../finance/use-finance';
import { TabToolbar } from './Shared';
import type { FinanceSnapshot } from './types';

export function ValidityTab({ data }: { data: FinanceSnapshot }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const patients = usePatients();
  const [dlg, setDlg] = useState<'config' | 'exempt' | null>(null);
  const name = (id: string) => patients.data?.find((p) => p.id === id)?.fullName ?? id;
  const history = [...data.feeHistory].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const current = history.find((h) => h.effectiveFrom <= data.day);
  const hCols: Column<ValidityConfig>[] = [
    { id: 'from', header: t('validity.effectiveFrom'), cell: (h) => h.effectiveFrom, primary: true },
    { id: 'months', header: t('validity.months'), cell: (h) => h.months },
    { id: 'mode', header: t('validity.mode'), cell: (h) => t(`validity.modes.${h.mode}`) },
    { id: 'by', header: t('validity.changedBy'), cell: (h) => h.changedBy ?? '—' },
    { id: 'reason', header: t('form.reason'), cell: (h) => h.reason ?? '—' },
  ];
  const pCols: Column<FeePayment>[] = [
    { id: 'patient', header: t('columns.patient'), cell: (p) => name(p.patientId), primary: true },
    { id: 'day', header: t('columns.date'), cell: (p) => f.date(p.paidDay) },
    { id: 'until', header: t('validity.until'), cell: (p) => f.date(p.validUntil) },
    { id: 'source', header: t('columns.type'), cell: (p) => t(`validity.source.${p.source}`) },
    { id: 'state', header: t('columns.status'), cell: (p) => (p.voided ? <StatusBadge tone="neutral">{t('validity.voided')}</StatusBadge> : p.validUntil >= data.day ? <StatusBadge tone="success">{t('fee.valid')}</StatusBadge> : <StatusBadge tone="warning">{t('fee.expired')}</StatusBadge>) },
    { id: 'reason', header: t('form.reason'), cell: (p) => p.exemption ? `${p.exemption.reason} (${p.exemption.by})` : '—' },
  ];
  const payments = [...data.feePayments].sort((a, b) => b.paidDay.localeCompare(a.paidDay));
  return (
    <div className="space-y-4">
      <Card title={t('validity.currentTitle')} description={t('validity.rule')}
        actions={<Can permission={P.billing.configure}><Button onClick={() => setDlg('config')}>{t('validity.change')}</Button></Can>}>
        <p className="p-4 text-sm">{current ? t('validity.currentLine', { months: current.months, mode: t(`validity.modes.${current.mode}`) }) : t('validity.noConfig')}</p>
        <DataTable caption={t('validity.history')} columns={hCols} rows={history} getRowId={(h) => h.effectiveFrom} />
      </Card>
      <Card title={t('validity.paymentsTitle')} actions={<Can permission={P.billing.exempt}><Button variant="outline" onClick={() => setDlg('exempt')}>{t('validity.exempt')}</Button></Can>}>
        <DataTable caption={t('validity.paymentsTitle')} columns={pCols} rows={payments} getRowId={(p) => p.id} emptyTitle={t('validity.noPayments')} />
      </Card>
      <TabToolbar><span className="text-xs text-muted-foreground">{t('validity.nonRetroactive')}</span></TabToolbar>
      {dlg === 'config' && <ConfigForm day={data.day} onClose={() => setDlg(null)} />}
      {dlg === 'exempt' && <ExemptForm onClose={() => setDlg(null)} />}
    </div>
  );
}

function ConfigForm({ day, onClose }: { day: string; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({ effectiveFrom: day, months: '1', mode: 'clamp' as ValidityMode, reason: '' });
  const save = useFinanceMutation(finance.setFeeConfig, { successTitle: t('done.saved'), onDone: onClose });
  const months = Number(v.months);
  return (
    <ActionDialog open onClose={onClose} title={t('validity.change')} description={t('validity.nonRetroactive')} submitLabel={t('common.save')} pending={save.isPending}
      canSubmit={Number.isInteger(months) && months >= 1 && months <= 120 && v.reason.trim().length > 0 && v.effectiveFrom >= day}
      onSubmit={() => save.mutate({ effectiveFrom: v.effectiveFrom, months, mode: v.mode, reason: v.reason })}>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('validity.effectiveFrom')} required>{(c) => <DateField {...c} min={day} value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />}</FormField>
        <FormField label={t('validity.months')} required>{(c) => <Input {...c} inputMode="numeric" value={v.months} onChange={(e) => setV({ ...v, months: e.target.value })} />}</FormField>
        <FormField label={t('validity.mode')}>{(c) => <Select {...c} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as ValidityMode })}><option value="clamp">{t('validity.modes.clamp')}</option><option value="endOfMonth">{t('validity.modes.endOfMonth')}</option></Select>}</FormField>
      </div>
      <p className="text-xs text-muted-foreground">{t('validity.modesHelp')}</p>
      <FormField label={t('form.reason')} required>{(c) => <Textarea {...c} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />}</FormField>
    </ActionDialog>
  );
}

function ExemptForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const save = useFinanceMutation(finance.exemptFee, { successTitle: t('done.exempted'), onDone: onClose });
  return (
    <ActionDialog open onClose={onClose} title={t('validity.exempt')} description={t('validity.exemptHint')} submitLabel={t('common.confirm')} pending={save.isPending} canSubmit={Boolean(patientId && reason.trim())}
      onSubmit={() => save.mutate({ patientId, reason })}>
      <FormField label={t('columns.patient')} required>{(c) => <PatientPicker {...c} value={patientId} onChange={setPatientId} />}</FormField>
      <FormField label={t('form.reason')} required>{(c) => <Textarea {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}
