import { Banknote, CreditCard, Smartphone, Wallet } from 'lucide-react';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Select } from '@/components/forms/controls';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { PersonName } from '@/components/ui/avatar';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Tabs } from '@/components/ui/tabs';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { CashBookTab } from '../treasury/CashBookTab';
import { ExchangeRatesCard } from '../exchange/ExchangeRatesCard';
import { ClosuresTab, UnclosedTab } from '../treasury/CashTabs';
import { CloseTab, FundsTab, HandoversTab } from '../treasury/TreasuryDialog';
import { usePreferences } from '@/core/preferences/preferences-store';
import { dayOf } from '../billing/billing-rules';
import { CashFlow } from '../expenses/CashFlow';
import { useMoney } from '../finance/use-finance';
import { CASH_PAGE, apiCash, type CashPayment } from './cash-api';

const METHOD_LABEL: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile money', card: 'Carte', transfer: 'Virement' };

/** Caisse en mode API : les encaissements d'un jour, par mode de paiement et par caissier. */
export function CashApiScreen() {
  const { t } = useTranslation('finance');
  const { can } = usePermissions();
  if (!can(PERMISSIONS.treasury.manage)) {
    if (!can(PERMISSIONS.billing.pay)) return <CashPayments />;

    return (
      <>
        <PageHeader title={t('cash.title')} description={t('cash.subtitle')} />
        <Tabs
          ariaLabel={t('cash.title')}
          tabs={[
            { id: 'payments', label: t('treasury.tabPayments', { defaultValue: 'Encaissements' }), content: <CashPayments noHeader /> },
            { id: 'myBook', label: t('treasury.tabMyBook', { defaultValue: 'Mon livre de caisse' }), content: <CashBookTab mine /> },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('cash.title')} description={t('cash.subtitle')} />
      <Tabs
        ariaLabel={t('cash.title')}
        tabs={[
          { id: 'payments', label: t('treasury.tabPayments', { defaultValue: 'Encaissements' }), content: <CashPayments noHeader /> },
          { id: 'handovers', label: t('treasury.tabHandovers', { defaultValue: 'Versements' }), content: <HandoversTab /> },
          { id: 'unclosed', label: t('treasury.tabUnclosed', { defaultValue: 'Non clôturées' }), content: <UnclosedTab /> },
          { id: 'close', label: t('treasury.tabClose', { defaultValue: 'Clôture du jour' }), content: <CloseTab /> },
          { id: 'closures', label: t('treasury.tabClosures', { defaultValue: 'Clôtures' }), content: <ClosuresTab /> },
          { id: 'book', label: t('treasury.tabBook', { defaultValue: 'Livre de caisse' }), content: <CashBookTab /> },
          { id: 'fx', label: t('fx.tab', { defaultValue: 'Taux de change' }), content: <ExchangeRatesCard /> },
          { id: 'funds', label: t('treasury.tabFunds', { defaultValue: 'Caisses' }), content: <FundsTab /> },
        ]}
      />
    </>
  );
}

function CashPayments({ noHeader = false }: { noHeader?: boolean }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const { activeFacilityId } = usePreferences();
  const [day, setDay] = useState(() => dayOf(new Date()));
  const [cashier, setCashier] = useState('');
  const [page, setPage] = useState(1);

  const summary = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'cash', 'summary', day, cashier),
    queryFn: () => apiCash.summary(day, cashier),
    placeholderData: keepPreviousData,
  });
  const list = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'cash', 'payments', day, cashier, page),
    queryFn: () => apiCash.payments(day, cashier, page),
    placeholderData: keepPreviousData,
  });
  const label = (m: string): string => t(`apiBilling.methods.${m}`, { defaultValue: METHOD_LABEL[m] ?? m });

  const columns: Column<CashPayment>[] = [
    { id: 'at', header: t('columns.dateTime'), cell: (p) => f.dateTime(p.paidAt), primary: true },
    { id: 'patient', header: t('columns.patient'), cell: (p) => <PersonName name={p.patientName} strong={false} /> },
    { id: 'method', header: t('columns.method'), cell: (p) => label(p.method) },
    { id: 'amount', header: t('columns.amount'), cell: (p) => money(p.amountMinor, p.currency), className: 'text-end tabular-nums' },
    { id: 'group', header: t('columns.type'), cell: (p) => (p.groupId ? <StatusBadge tone="info">{t('apiBilling.groupPayment', { defaultValue: 'Règlement groupé' })}</StatusBadge> : '—') },
    { id: 'cashier', header: t('columns.cashier'), cell: (p) => p.cashierName || '—' },
  ];
  const cashiers = summary.data?.cashiers ?? [];
  const currencies = summary.data?.currencies ?? [];

  return (
    <>
      {!noHeader && <PageHeader title={t('cash.title')} description={t('cash.subtitle')} />}
      <div className="space-y-4">
        {currencies.map((c) => (
          <section key={c.currency} aria-label={c.currency}>
            <StatGrid>
              <StatCard icon={Banknote} tone="success" label={label('cash')} value={money(c.byMethod.cash, c.currency)} hint={t('cash.drawerHint')} />
              <StatCard icon={Smartphone} label={label('mobile_money')} value={money(c.byMethod.mobile_money, c.currency)} />
              <StatCard icon={CreditCard} label={`${label('card')} + ${label('transfer')}`} value={money(c.byMethod.card + c.byMethod.transfer, c.currency)} hint={t('cash.cardTransferHint')} />
              <StatCard icon={Wallet} tone="info" label={t('apiBilling.totalDay', { defaultValue: 'Total du jour' })} value={money(c.totalMinor, c.currency)} />
            </StatGrid>
          </section>
        ))}
        {cashier === '' && <CashFlow day={day} income={currencies} />}
        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <label className="text-sm">{t('cash.day')}
              <Input type="date" value={day} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setPage(1); } }} className="mt-1 w-44" />
            </label>
            <label className="text-sm">{t('columns.cashier')}
              <Select value={cashier} onChange={(e) => { setCashier(e.target.value); setPage(1); }} className="mt-1 w-56">
                <option value="">{t('cash.allCashiers')}</option>
                {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
          </div>
          <DataTable caption={t('cash.title')} columns={columns} rows={list.data?.rows ?? []} getRowId={(p) => p.id}
            loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} emptyTitle={t('cash.empty')} emptyDescription={t('cash.emptyHint')}
            pagination={{ page, perPage: CASH_PAGE, total: list.data?.total ?? 0, onPageChange: setPage }} />
        </Card>
      </div>
    </>
  );
}
