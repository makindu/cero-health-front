import { CircleCheck, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ResourcePage } from '../_shared/ResourcePage';
import { AUDIT_ACTIONS, AUDIT_RESOURCES, auditService, type AuditEntry } from './data';

/** Journal d'audit : lecture seule (aucune création ni suppression depuis l'interface). */
export default function AuditPage() {
  const { t } = useTranslation('audit');
  const f = useFormatters();
  const outcome = (e: AuditEntry) => (
    <StatusBadge tone={e.outcome === 'success' ? 'success' : 'danger'} icon={e.outcome === 'success' ? CircleCheck : ShieldX}>
      {t(`outcome.${e.outcome}`)}
    </StatusBadge>
  );

  const columns: Column<AuditEntry>[] = [
    { id: 'at', header: t('columns.date'), cell: (e) => f.dateTime(e.at), sortable: true, primary: true },
    { id: 'user', header: t('columns.user'), cell: (e) => e.user, sortable: true },
    { id: 'action', header: t('columns.action'), cell: (e) => t(`action.${e.action}`) },
    { id: 'resource', header: t('columns.resource'), cell: (e) => t(`resource.${e.resource}`) },
    { id: 'reference', header: t('columns.reference'), cell: (e) => <code className="text-xs">{e.reference}</code> },
    { id: 'outcome', header: t('columns.outcome'), cell: outcome },
  ];

  return (
    <ResourcePage<AuditEntry>
      name="audit"
      service={auditService}
      title={t('title')}
      description={t('subtitle')}
      searchLabel={t('search')}
      columns={columns}
      defaultSort={{ columnId: 'at', direction: 'desc' }}
      filters={[
        { id: 'action', label: t('columns.action'), options: AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`) })) },
        { id: 'resource', label: t('columns.resource'), options: AUDIT_RESOURCES.map((r) => ({ value: r, label: t(`resource.${r}`) })) },
        { id: 'outcome', label: t('columns.outcome'), options: [{ value: 'success', label: t('outcome.success') }, { value: 'denied', label: t('outcome.denied') }] },
      ]}
      detailTitle={(e) => e.id}
      renderDetail={(e) => (
        <>
          <DetailSection title={t('detail.summary')}>
            <DescriptionList
              items={[
                { label: t('columns.date'), value: f.dateTime(e.at) },
                { label: t('columns.user'), value: e.user },
                { label: t('columns.action'), value: t(`action.${e.action}`) },
                { label: t('columns.resource'), value: t(`resource.${e.resource}`) },
                { label: t('columns.reference'), value: e.reference },
                { label: t('columns.outcome'), value: outcome(e) },
              ]}
            />
          </DetailSection>
          <p className="mt-4 text-xs text-muted-foreground">{t('detail.immutable')}</p>
        </>
      )}
    />
  );
}
