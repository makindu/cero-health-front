import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { useMoney } from '../finance/use-finance';
import { apiInsurance, type ApiCoverage } from '../insurance/insurance-api';
import { PAGE, apiBilling, type BillingLink } from './billing-api';
import { LinkDetail, SOURCES, StateBadge } from './BillingApiScreen';

/** Onglet « Facturation » de la fiche patient (API) : solde dû, factures du patient et couvertures d'assurance. */
export function PatientBillingApi({ patientId }: { patientId: string }) {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const canBilling = can(PERMISSIONS.billing.view);
  const canInsurance = can(PERMISSIONS.insurance.view);

  const links = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'patient', patientId, page),
    queryFn: () => apiBilling.list({ patientId, page }),
    enabled: canBilling,
    placeholderData: keepPreviousData,
  });
  const balance = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'billing', 'balance', patientId),
    queryFn: () => apiBilling.balance(patientId),
    enabled: canBilling,
  });
  const coverages = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'patient-coverages', patientId),
    queryFn: () => apiInsurance.coverages(patientId),
    enabled: canInsurance,
  });

  const columns: Column<BillingLink>[] = [
    { id: 'source', header: t('apiBilling.source', { defaultValue: 'Acte' }), cell: (l) => t(`apiBilling.sources.${l.sourceType}`, { defaultValue: SOURCES[l.sourceType] ?? l.sourceType }), primary: true },
    { id: 'date', header: t('columns.date'), cell: (l) => f.date(l.createdAt) },
    { id: 'total', header: t('detail.total'), cell: (l) => money(l.totalMinor, l.currency), className: 'text-end tabular-nums' },
    { id: 'remaining', header: t('apiBilling.remaining', { defaultValue: 'Reste à payer' }), cell: (l) => money(l.remainingMinor, l.currency), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (l) => <StateBadge link={l} /> },
    { id: 'open', header: '', cell: (l) => <Button size="sm" variant="outline" onClick={() => setOpenId(l.id)}>{t('actions.open')}</Button> },
  ];

  if (!canBilling && !canInsurance) return <p className="p-4 text-sm text-muted-foreground">{t('patientApi.noAccess')}</p>;

  return (
    <div className="space-y-5 p-4">
      {canBilling && (
        <>
          <section aria-label={t('patientApi.balance')}>
            <h3 className="mb-1 text-sm font-semibold">{t('patientApi.balance')}</h3>
            {balance.isPending ? <p className="text-sm text-muted-foreground">{t('apiBilling.loading', { defaultValue: 'Chargement…' })}</p>
              : (balance.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t('patientApi.nothingDue')}</p>
              : <ul className="text-lg font-semibold tabular-nums">{(balance.data ?? []).map((b) => <li key={b.currency}>{money(b.outstandingMinor, b.currency)}</li>)}</ul>}
          </section>
          <DataTable caption={t('patientApi.invoices')} columns={columns} rows={links.data?.rows ?? []} getRowId={(l) => l.id}
            loading={links.isPending} error={links.error} onRetry={() => void links.refetch()} emptyTitle={t('patientApi.noInvoice')}
            pagination={{ page, perPage: PAGE, total: links.data?.total ?? 0, onPageChange: setPage }} />
        </>
      )}
      {canInsurance && (
        <section aria-label={t('patientApi.coverages')}>
          <h3 className="mb-2 text-sm font-semibold">{t('patientApi.coverages')}</h3>
          {coverages.isPending ? <p className="text-sm text-muted-foreground">{t('apiBilling.loading', { defaultValue: 'Chargement…' })}</p>
            : coverages.error ? <p role="alert" className="text-sm text-danger-ink">{t('module.saveFailedHint')}</p>
            : (coverages.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t('patientApi.noCoverage')}</p>
            : <ul className="divide-y divide-border text-sm">{(coverages.data ?? []).map((c: ApiCoverage) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{[c.policyNumber, c.cardNumber, c.memberNumber].find((x) => x !== '') ?? `#${c.id}`}{c.validTo ? ` · ${t('patientApi.until', { date: f.date(c.validTo) })}` : ''}</span>
                <StatusBadge tone={c.status === 'active' || c.status === 'approved' ? 'success' : 'neutral'}>{t(`patientApi.coverageStatus.${c.status}`, { defaultValue: c.status })}</StatusBadge>
              </li>
            ))}</ul>}
        </section>
      )}
      {openId && <LinkDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
