import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CircleCheck, ShieldX, TriangleAlert } from 'lucide-react';
import { Input, Select } from '@/components/forms/controls';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePreferences } from '@/core/preferences/preferences-store';
import { AUDIT_OUTCOMES, AUDIT_PAGE, NO_AUDIT_FILTER, actionLabel, actorLabel, apiAudit, periodInvalid, type AuditFilters, type AuditOutcome, type AuditRow } from './audit-api';

const OUTCOME_LABEL: Record<AuditOutcome, string> = { success: 'Réussi', denied: 'Refusé', failed: 'Échoué' };
const OUTCOME_TONE: Record<AuditOutcome, 'success' | 'danger' | 'warning'> = { success: 'success', denied: 'danger', failed: 'warning' };
const OUTCOME_ICON = { success: CircleCheck, denied: ShieldX, failed: TriangleAlert } as const;

/** Journal d'audit branché au serveur : lecture seule, filtres et pages côté serveur, rafraîchi tout seul. */
export function AuditApiScreen() {
  const { t } = useTranslation('audit');
  const f = useFormatters();
  const { activeFacilityId } = usePreferences();
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTER);
  const [page, setPage] = useState(1);
  const bad = periodInvalid(filters);
  const set = (patch: Partial<AuditFilters>) => { setFilters((x) => ({ ...x, ...patch })); setPage(1); };
  const list = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'audit', filters, page),
    queryFn: () => apiAudit.list(filters, page),
    placeholderData: keepPreviousData,
    enabled: !bad,
    refetchInterval: 30_000,
  });
  const columns: Column<AuditRow>[] = [
    { id: 'at', header: t('columns.date'), cell: (e) => f.dateTime(e.at), primary: true },
    { id: 'user', header: t('columns.user'), cell: (e) => actorLabel(e, (id) => t('apiAudit.user', { defaultValue: 'Utilisateur n° {{id}}', id })) },
    { id: 'action', header: t('columns.action'), cell: (e) => <code className="text-xs">{actionLabel(e.action)}</code> },
    { id: 'resource', header: t('columns.reference'), cell: (e) => (e.entityType ? `${actionLabel(e.entityType)}${e.entityId ? ` n° ${e.entityId}` : ''}` : '—') },
    { id: 'outcome', header: t('columns.outcome'), cell: (e) => <StatusBadge tone={OUTCOME_TONE[e.outcome]} icon={OUTCOME_ICON[e.outcome]}>{t(`outcome.${e.outcome}`, { defaultValue: OUTCOME_LABEL[e.outcome] })}</StatusBadge> },
    { id: 'reason', header: t('apiAudit.reason', { defaultValue: 'Motif' }), cell: (e) => e.reason || '—' },
  ];
  const filtered = filters.outcome !== '' || filters.action !== '' || filters.from !== '' || filters.to !== '';
  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">{t('columns.outcome')}
            <Select value={filters.outcome} onChange={(e) => set({ outcome: e.target.value as AuditFilters['outcome'] })} className="mt-1 w-40">
              <option value="">{t('apiAudit.all', { defaultValue: 'Tous' })}</option>
              {AUDIT_OUTCOMES.map((o) => <option key={o} value={o}>{t(`outcome.${o}`, { defaultValue: OUTCOME_LABEL[o] })}</option>)}
            </Select>
          </label>
          <label className="flex flex-col text-sm">{t('columns.action')}
            <Input value={filters.action} maxLength={80} placeholder={t('apiAudit.actionHint', { defaultValue: 'ex. login' })} onChange={(e) => set({ action: e.target.value })} className="mt-1 w-48" />
          </label>
          <label className="flex flex-col text-sm">{t('apiAudit.from', { defaultValue: 'Du' })}<Input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} className="mt-1" /></label>
          <label className="flex flex-col text-sm">{t('apiAudit.to', { defaultValue: 'Au' })}<Input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} className="mt-1" /></label>
          {filtered && <Button variant="outline" size="sm" onClick={() => set(NO_AUDIT_FILTER)}>{t('apiAudit.reset', { defaultValue: 'Effacer les filtres' })}</Button>}
        </div>
        {bad && <p role="alert" className="mt-2 text-sm text-danger-ink">{t('apiAudit.badPeriod', { defaultValue: 'La date de fin doit suivre la date de début.' })}</p>}
      </Card>
      <DataTable caption={t('title')} columns={columns} rows={bad ? [] : list.data?.rows ?? []} getRowId={(e) => e.id}
        loading={!bad && list.isPending} error={bad ? null : list.error} onRetry={() => void list.refetch()}
        emptyTitle={t('apiAudit.empty', { defaultValue: 'Aucun événement' })}
        emptyDescription={filtered ? t('apiAudit.emptyFiltered', { defaultValue: 'Aucun événement ne correspond à ces filtres.' }) : undefined}
        pagination={{ page, perPage: AUDIT_PAGE, total: bad ? 0 : list.data?.total ?? 0, onPageChange: setPage }} />
      <p className="text-xs text-muted-foreground">{t('detail.immutable')}</p>
    </div>
  );
}
