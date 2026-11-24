import { Banknote, Building2, CreditCard, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { Input, Select } from '@/components/forms/controls';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import type { LedgerEntry } from '@/core/billing/invoice';
import { useFormatters } from '@/core/i18n/useFormatters';
import { summarizeCash } from '../finance/cash-summary';
import { LocalOnly } from '../finance/LocalOnly';
import { FINANCE_AVAILABLE, useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { referenceFromApi } from '../_shared/reference-data';
import { CashApiScreen } from './CashApiScreen';

const PER_PAGE = 10;
const localDay = (iso: string): string => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function CashPage() {
  const { t } = useTranslation('finance');
  // Mode API : les encaissements du serveur. Mode local : l'ancien module de démonstration.
  if (!FINANCE_AVAILABLE) return referenceFromApi() ? <CashApiScreen /> : <LocalOnly title={t('cash.title')} />;
  return <CashScreen />;
}

function CashScreen() {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const snap = useFinanceSnapshot();
  const [dayFilter, setDayFilter] = useState('');
  const [cashier, setCashier] = useState('');
  const [page, setPage] = useState(1);
  const day = dayFilter || snap.data?.day || '';
  const all = useMemo(() => snap.data?.ledger ?? [], [snap.data]);
  const cashiers = useMemo(() => [...new Set(all.map((e) => e.cashier))].sort(), [all]);
  const rows = useMemo(() => all.filter((e) => localDay(e.at) === day && (!cashier || e.cashier === cashier)), [all, day, cashier]);
  const summary = useMemo(() => summarizeCash(rows, all), [rows, all]);
  const currency = all[0]?.currency ?? 'USD';

  const columns: Column<LedgerEntry>[] = [
    { id: 'at', header: t('columns.dateTime'), cell: (e) => f.dateTime(e.at), primary: true },
    { id: 'kind', header: t('columns.type'), cell: (e) => <StatusBadge tone={e.kind === 'payment' ? 'success' : e.kind === 'insurerSettlement' ? 'info' : 'warning'}>{t(`ledger.${e.kind}`)}</StatusBadge> },
    { id: 'invoice', header: t('columns.number'), cell: (e) => <code className="text-xs">{e.invoiceId}</code> },
    { id: 'method', header: t('columns.method'), cell: (e) => (e.method ? t(`methods.${e.method}`) : '—') },
    { id: 'amount', header: t('columns.amount'), cell: (e) => money(e.amount, e.currency), className: 'text-end tabular-nums' },
    { id: 'reference', header: t('detail.reference'), cell: (e) => e.reference ?? '—' },
    { id: 'cashier', header: t('columns.cashier'), cell: (e) => e.cashier },
  ];

  return (
    <>
      <PageHeader title={t('cash.title')} description={t('cash.subtitle')} />
      <div className="space-y-4">
        <StatGrid>
          <StatCard icon={Banknote} tone="success" label={t('methods.cash')} value={money(summary.byMethod.cash, currency)} hint={t('cash.drawerHint')} />
          <StatCard icon={Smartphone} label={t('methods.mobileMoney')} value={money(summary.byMethod.mobileMoney, currency)} />
          <StatCard icon={CreditCard} label={t('methods.card')} value={money(summary.byMethod.card + summary.byMethod.transfer, currency)} hint={t('cash.cardTransferHint')} />
          <StatCard icon={Building2} tone="info" label={t('cash.orgReceipts')} value={money(summary.organizationReceipts, currency)} hint={t('cash.orgReceiptsHint')} />
        </StatGrid>
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <label className="flex flex-col text-sm">{t('cash.day')}<Input type="date" value={day} onChange={(e) => { setDayFilter(e.target.value); setPage(1); }} className="mt-1 w-44" /></label>
            <label className="flex flex-col text-sm">{t('columns.cashier')}
              <Select value={cashier} onChange={(e) => { setCashier(e.target.value); setPage(1); }} className="mt-1 w-56"><option value="">{t('cash.allCashiers')}</option>{cashiers.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            </label>
            <p className="ms-auto text-sm font-semibold">{t('cash.patientNet')} : {money(summary.patientNet, currency)}</p>
          </div>
          <DataTable caption={t('cash.title')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(e) => e.id}
            loading={snap.isPending} error={snap.error} onRetry={() => void snap.refetch()} emptyTitle={t('cash.empty')} emptyDescription={t('cash.emptyHint')}
            pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
        </Card>
        <p className="text-xs text-muted-foreground">{t('cash.closureNotice')}</p>
      </div>
    </>
  );
}
