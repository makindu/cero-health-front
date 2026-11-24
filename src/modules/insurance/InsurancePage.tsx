import { Ban, Building2, ClipboardCheck, FileWarning, ShieldCheck, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs } from '@/components/ui/tabs';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { LocalOnly } from '../finance/LocalOnly';
import { FINANCE_AVAILABLE, useFinanceSnapshot, useMoney } from '../finance/use-finance';
import { CatalogTab } from './CatalogTab';
import { ContractsTab } from './ContractsTab';
import { CoveragesTab } from './CoveragesTab';
import { InsurerStatementTab } from './InsurerStatementTab';
import { OrganizationsTab } from './OrganizationsTab';
import { SubscriptionsTab } from './SubscriptionsTab';
import { ValidityTab } from './ValidityTab';
import { InsuranceApiScreen } from './InsuranceApiScreen';
import { insuranceIndicators } from './indicators';
import { referenceFromApi } from '../_shared/reference-data';

export default function InsurancePage() {
  const { t } = useTranslation('finance');
  if (referenceFromApi()) return <InsuranceApiScreen />;
  if (!FINANCE_AVAILABLE) return <LocalOnly title={t('insurance.title')} />;
  return <InsuranceScreen />;
}

function InsuranceScreen() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { can } = usePermissions();
  const snap = useFinanceSnapshot();
  const data = snap.data;
  const ind = useMemo(() => (data ? insuranceIndicators(data) : null), [data]);
  const currency = data?.invoices[0]?.invoice.currency ?? 'USD';
  const manage = can(P.insurance.manage);

  return (
    <>
      <PageHeader title={t('insurance.title')} description={t('insurance.subtitle')} />
      {ind && (
        <div className="space-y-4">
          <StatGrid>
            <StatCard icon={ShieldCheck} tone="success" label={t('insurance.kpi.insured')} value={ind.activeInsured} />
            <StatCard icon={Users} label={t('insurance.kpi.mutuelle')} value={ind.mutuelleMembers} />
            <StatCard icon={ClipboardCheck} label={t('insurance.kpi.subscriptions')} value={ind.activeSubscriptions} />
            <StatCard icon={FileWarning} tone="warning" label={t('insurance.kpi.pending')} value={ind.pendingValidations} />
            <StatCard icon={Ban} tone="danger" label={t('insurance.kpi.rejections')} value={money(ind.rejectedTotal, currency)} hint={t('insurance.kpi.rejectionsHint', { count: ind.rejectedCount })} />
            <StatCard icon={Building2} tone="info" label={t('insurance.kpi.receivables')} value={money(ind.receivableTotal, currency)} />
          </StatGrid>
          <Card title={t('insurance.receivablesTitle')} description={t('insurance.receivablesHint')}>
            {ind.byOrganization.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t('insurance.noReceivables')}</p> : (
              <ul className="divide-y divide-border text-sm">
                {ind.byOrganization.map((o) => (
                  <li key={o.organizationId} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                    <span className="font-medium">{o.name}</span>
                    <span className="tabular-nums">{t('insurance.orgLine', { due: money(o.due, currency), settled: money(o.settled, currency), outstanding: money(o.outstanding, currency), disputed: money(o.disputed, currency) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Tabs ariaLabel={t('insurance.title')} tabs={[
            { id: 'coverages', label: t('insurance.tabs.coverages'), content: <CoveragesTab data={data!} spent={ind.spentByCoverage} /> },
            { id: 'statement', label: t('insurance.tabs.statement'), content: <InsurerStatementTab data={data!} /> },
            { id: 'organizations', label: t('insurance.tabs.organizations'), content: <OrganizationsTab data={data!} canManage={manage} /> },
            { id: 'contracts', label: t('insurance.tabs.contracts'), content: <ContractsTab data={data!} canManage={manage} /> },
            { id: 'subscriptions', label: t('insurance.tabs.subscriptions'), content: <SubscriptionsTab data={data!} canManage={manage} /> },
            { id: 'catalog', label: t('insurance.tabs.catalog'), content: <CatalogTab data={data!} /> },
            { id: 'validity', label: t('insurance.tabs.validity'), content: <ValidityTab data={data!} /> },
          ]} />
        </div>
      )}
      {snap.isPending && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
    </>
  );
}
