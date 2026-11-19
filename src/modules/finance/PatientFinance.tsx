import { useState } from 'react';
import { unpaidDues } from '@/core/billing/group-payment';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { ValidationBadge } from '../insurance/Shared';
import { FeeStatusLine } from './FeeStatusLine';
import { GroupPaymentDialog } from './GroupPaymentDialog';
import { InvoiceDetail } from './InvoiceDetail';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { NewInvoiceDialog } from './NewInvoiceDialog';
import type { InvoiceView } from './finance-service';
import { FINANCE_AVAILABLE, useFinanceSnapshot, useMoney } from './use-finance';

/** Onglet « Facturation » de la fiche patient : validité des frais, couvertures, factures. */
export function PatientFinance({ patientId }: { patientId: string }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const snap = useFinanceSnapshot();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState(false);
  if (!FINANCE_AVAILABLE) return <EmptyState title={t('localOnly.title')} description={t('localOnly.description')} />;
  const invoices = (snap.data?.invoices ?? []).filter((v) => v.invoice.patientId === patientId);
  const coverages = (snap.data?.coverages ?? []).filter((c) => c.patientId === patientId || c.beneficiaryIds.includes(patientId));
  const owing = unpaidDues(invoices.map((v) => v.invoice), invoices.flatMap((v) => v.ledger));
  const owed = owing.reduce((s, d) => s + d.due, 0);
  const orgNames = Object.fromEntries((snap.data?.organizations ?? []).map((o) => [o.id, o.name]));
  const columns: Column<InvoiceView>[] = [
    { id: 'number', header: t('columns.number'), cell: (v) => <code className="text-xs">{v.invoice.number}</code>, primary: true },
    { id: 'date', header: t('columns.date'), cell: (v) => f.date(v.invoice.createdAt) },
    { id: 'total', header: t('detail.total'), cell: (v) => money(v.invoice.totals.billable, v.invoice.currency), className: 'text-end tabular-nums' },
    { id: 'balance', header: t('columns.patientBalance'), cell: (v) => money(v.balances.patientBalance, v.invoice.currency), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (v) => <InvoiceStatusBadge status={v.status} /> },
    { id: 'open', header: '', cell: (v) => <Button size="sm" variant="outline" onClick={() => setOpenId(v.invoice.id)}>{t('actions.open')}</Button> },
  ];
  return (
    <div className="space-y-4 p-4">
      <FeeStatusLine patientId={patientId} />
      <section>
        <h3 className="mb-1 text-sm font-semibold">{t('patient.coverages')}</h3>
        {coverages.length === 0 ? <p className="text-sm text-muted-foreground">{t('patient.noCoverage')}</p> : (
          <ul className="space-y-1 text-sm">{coverages.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2">{orgNames[c.organizationId] ?? c.organizationId} · {t(`insurance.covKind.${c.kind}`)} · {c.validFrom} → {c.validTo} <ValidationBadge status={c.status} /></li>)}</ul>
        )}
      </section>
      {owing.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <span>{t('group.summary', { count: owing.length, amount: money(owed, invoices[0]?.invoice.currency ?? '') })}</span>
          <Can permission={P.billing.pay}><Button onClick={() => setGrouping(true)}>{t('group.open')}</Button></Can>
        </div>
      )}
      <Can permission={P.billing.create}><Button onClick={() => setCreating(true)}>{t('new.button')}</Button></Can>
      <DataTable caption={t('billing.title')} columns={columns} rows={invoices} getRowId={(v) => v.invoice.id} loading={snap.isPending} emptyTitle={t('billing.empty')} />
      {grouping && <GroupPaymentDialog invoices={invoices} onClose={() => setGrouping(false)} />}
      {creating && <NewInvoiceDialog initialPatientId={patientId} onClose={() => setCreating(false)} onCreated={(v) => { setCreating(false); setOpenId(v.invoice.id); }} />}
      {openId && <InvoiceDetail view={snap.data?.invoices.find((v) => v.invoice.id === openId)} orgNames={orgNames} onClose={() => setOpenId(null)} />}
    </div>
  );
}
