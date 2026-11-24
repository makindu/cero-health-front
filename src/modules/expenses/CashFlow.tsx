import { ArrowDownToLine, ArrowUpFromLine, Hourglass, Scale } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { apiExpenses, flowOf } from './expenses-api';

/**
 * Caisse du jour : entrées encaissées − dépenses validées = solde, par devise. Les dépenses en attente sont montrées à part (elles ne pèsent pas encore).
 * Visible seulement pour qui peut lire les dépenses ; sans filtre par caissier (un solde par caissier n'aurait pas de sens).
 */
export function CashFlow({ day, income }: { day: string; income: readonly { currency: string; totalMinor: number }[] }) {
  const { t } = useTranslation('expenses');
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const allowed = can(PERMISSIONS.expenses.view);
  const summary = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'cash', day),
    queryFn: () => apiExpenses.summary({ from: day, to: day }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!allowed || !summary.data) return null;
  const flows = flowOf(income, summary.data.currencies);
  if (flows.length === 0) return null;
  return (
    <>
      {flows.map((x) => (
        <section key={x.currency} aria-label={t('cash.title', { currency: x.currency })}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('cash.title', { currency: x.currency })}</h2>
          <StatGrid>
            <StatCard icon={ArrowDownToLine} tone="success" label={t('cash.income')} value={money(x.incomeMinor, x.currency)} />
            <StatCard icon={ArrowUpFromLine} tone="danger" label={t('cash.out')} value={money(x.validatedMinor, x.currency)} hint={t('cash.outHint')} />
            <StatCard icon={Hourglass} tone="warning" label={t('cash.pending')} value={money(x.pendingMinor, x.currency)} hint={t('cash.pendingHint')} />
            <StatCard icon={Scale} tone={x.balanceMinor < 0 ? 'danger' : 'info'} label={t('cash.balance')} value={money(x.balanceMinor, x.currency)} />
          </StatGrid>
        </section>
      ))}
    </>
  );
}
