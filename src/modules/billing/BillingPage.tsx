import { Banknote, CircleDollarSign, Landmark, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/forms/search-input';
import { Select } from '@/components/forms/controls';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import type { InvoiceStatus } from '@/core/billing/invoice';
import { InvoiceDetail } from '../finance/InvoiceDetail';
import { INVOICE_STATUSES, InvoiceStatusBadge } from '../finance/InvoiceStatusBadge';
import { LocalOnly } from '../finance/LocalOnly';
import { NewInvoiceDialog } from '../finance/NewInvoiceDialog';
import type { InvoiceView } from '../finance/finance-service';
import { FINANCE_AVAILABLE, useFinanceSnapshot, useMoney } from '../finance/use-finance';

const PER_PAGE = 10;

export default function BillingPage() {
  const { t } = useTranslation('finance');
  if (!FINANCE_AVAILABLE) return <LocalOnly title={t('billing.title')} />;
  return <BillingScreen />;
}

function BillingScreen() {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const snap = useFinanceSnapshot();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => snap.data?.invoices ?? [], [snap.data]);
  const orgNames = useMemo(() => Object.fromEntries((snap.data?.organizations ?? []).map((o) => [o.id, o.name])), [snap.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((v) => (!status || v.status === status) && (!q || `${v.invoice.number} ${v.invoice.patientName}`.toLowerCase().includes(q)));
  }, [all, search, status]);
  const live = all.filter((v) => v.status !== 'cancelled' && v.status !== 'draft');
  const currency = live[0]?.invoice.currency ?? 'USD';
  const billed = live.reduce((s, v) => s + v.invoice.totals.billable, 0);
  const patientDue = live.reduce((s, v) => s + Math.max(0, v.balances.patientBalance), 0);
  const orgDue = live.reduce((s, v) => s + v.balances.organizationsOutstanding, 0);
  const collected = live.reduce((s, v) => s + v.balances.patientPaid, 0);

  const columns: Column<InvoiceView>[] = [
    { id: 'number', header: t('columns.number'), cell: (v) => <code className="text-xs">{v.invoice.number}</code> },
    { id: 'patient', header: t('columns.patient'), cell: (v) => v.invoice.patientName, primary: true },
    { id: 'date', header: t('columns.date'), cell: (v) => f.date(v.invoice.createdAt) },
    { id: 'total', header: t('detail.total'), cell: (v) => money(v.invoice.totals.billable, v.invoice.currency), className: 'text-end tabular-nums' },
    { id: 'patientBalance', header: t('columns.patientBalance'), cell: (v) => money(v.balances.patientBalance, v.invoice.currency), className: 'text-end tabular-nums' },
    { id: 'orgBalance', header: t('columns.orgBalance'), cell: (v) => money(v.balances.organizationsOutstanding, v.invoice.currency), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (v) => <InvoiceStatusBadge status={v.status} /> },
    { id: 'open', header: '', cell: (v) => <Button size="sm" variant="outline" onClick={() => setOpenId(v.invoice.id)}>{t('actions.open')}</Button> },
  ];

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('billing.subtitle')}
        actions={<Can permission={P.billing.create}><Button onClick={() => setCreating(true)}>{t('new.button')}</Button></Can>} />
      <div className="space-y-4">
        <StatGrid>
          <StatCard icon={Receipt} label={t('summary.invoices')} value={f.number(live.length)} />
          <StatCard icon={CircleDollarSign} label={t('summary.billed')} value={money(billed, currency)} />
          <StatCard icon={Banknote} tone="success" label={t('summary.collected')} value={money(collected, currency)} />
          <StatCard icon={Landmark} tone="warning" label={t('summary.receivables')} value={money(patientDue + orgDue, currency)} hint={t('summary.receivablesHint', { patient: money(patientDue, currency), orgs: money(orgDue, currency) })} />
        </StatGrid>
        <Card>
          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <SearchInput label={t('billing.search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
            <Select aria-label={t('columns.status')} value={status} onChange={(e) => { setStatus(e.target.value as '' | InvoiceStatus); setPage(1); }} className="w-56">
              <option value="">{t('filters.allStatuses')}</option>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </div>
          <DataTable caption={t('billing.title')} columns={columns} rows={filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(v) => v.invoice.id}
            loading={snap.isPending} error={snap.error} onRetry={() => void snap.refetch()} emptyTitle={t('billing.empty')} emptyDescription={t('billing.emptyHint')}
            pagination={{ page, perPage: PER_PAGE, total: filtered.length, onPageChange: setPage }} />
        </Card>
      </div>
      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} onCreated={(v) => { setCreating(false); setOpenId(v.invoice.id); }} />}
      {openId && <InvoiceDetail view={all.find((v) => v.invoice.id === openId)} orgNames={orgNames} onClose={() => setOpenId(null)} />}
    </>
  );
}
