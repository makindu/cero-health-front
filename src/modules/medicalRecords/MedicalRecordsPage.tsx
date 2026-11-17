import { useState } from 'react';
import { Ban, CircleCheck, Hourglass, KeyRound, Lock, Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { CommandButton } from '../_shared/command-button';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ResourcePage } from '../_shared/ResourcePage';
import { recordService, type Completeness, type MedicalRecord, type RecordStatus } from './data';
import { PersonName } from '@/components/ui/avatar';
import { RecordContentDialog, RecordCounts } from './RecordContentDialog';
import { actionsFor } from './record-rules';

const STATUS: Record<RecordStatus, { tone: StatusTone; icon: typeof Ban }> = {
  active: { tone: 'success', icon: CircleCheck },
  archived: { tone: 'neutral', icon: Archive },
  locked: { tone: 'warning', icon: Lock },
};
const COMPLETENESS: Record<Completeness, { tone: StatusTone; icon: typeof Ban }> = {
  complete: { tone: 'success', icon: CircleCheck },
  partial: { tone: 'warning', icon: Hourglass },
  incomplete: { tone: 'danger', icon: Ban },
};

export default function MedicalRecordsPage() {
  const { t } = useTranslation('medicalRecords');
  const f = useFormatters();
  const [params] = useSearchParams();
  const [viewing, setViewing] = useState<MedicalRecord | null>(null);
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));

  const columns: Column<MedicalRecord>[] = [
    { id: 'patientName', header: t('columns.patient'), cell: (r) => <PersonName name={r.patientName} />, sortable: true, primary: true },
    { id: 'id', header: t('columns.number'), cell: (r) => <code className="text-xs">{r.id}</code> },
    { id: 'service', header: t('columns.service'), cell: (r) => t(`services.${r.service}`) },
    { id: 'lastUpdate', header: t('columns.lastUpdate'), cell: (r) => f.date(r.lastUpdate), sortable: true },
    {
      id: 'completeness',
      header: t('columns.completeness'),
      cell: (r) => (
        <StatusBadge tone={COMPLETENESS[r.completeness].tone} icon={COMPLETENESS[r.completeness].icon}>
          {t(`completeness.${r.completeness}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (r) => (
        <StatusBadge tone={STATUS[r.status].tone} icon={STATUS[r.status].icon}>
          {t(`status.${r.status}`)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <>
    <ResourcePage<MedicalRecord>
      name="medicalRecords"
      service={recordService}
      title={t('title')}
      description={t('subtitle')}
      searchLabel={t('search')}
      columns={columns}
      initialSearch={params.get('search') ?? undefined}
      defaultSort={{ columnId: 'lastUpdate', direction: 'desc' }}
      create={{
        permission: PERMISSIONS.medicalRecords.manage,
        buttonLabel: t('create.button'),
        title: t('create.title'),
        submitLabel: t('create.submit'),
        fields: [{ name: 'patient', label: t('create.patient'), type: 'patient', required: true, hint: t('create.hint'), span: 2 }],
      }}
      filters={[
        { id: 'status', label: t('filters.status'), options: (Object.keys(STATUS) as RecordStatus[]).map((s) => ({ value: s, label: t(`status.${s}`) })) },
        { id: 'completeness', label: t('filters.completeness'), options: (Object.keys(COMPLETENESS) as Completeness[]).map((c) => ({ value: c, label: t(`completeness.${c}`) })) },
        { id: 'service', label: t('filters.service'), options: serviceOptions },
      ]}
      detailTitle={(r) => r.patientName}
      detailPerson={(r) => r.patientName}
      renderDetail={(r) => (
        <div className="space-y-5">
          <p role="note" className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('sensitive')}
          </p>
          <DetailSection title={t('detail.summary')}>
            <DescriptionList
              items={[
                { label: t('columns.number'), value: r.id },
                { label: t('columns.patient'), value: `${r.patientName} (${r.patientId})` },
                { label: t('columns.service'), value: t(`services.${r.service}`) },
                { label: t('detail.openedAt'), value: f.date(r.openedAt) },
                { label: t('columns.lastUpdate'), value: f.date(r.lastUpdate) },
                { label: t('columns.status'), value: t(`status.${r.status}`) },
              ]}
            />
          </DetailSection>
          <RecordCounts record={r} />
          <DetailSection title={t('detail.access')}>
            <p className="text-sm text-muted-foreground">{t('detail.accessBody')}</p>
            <CommandButton
              name="medicalRecords"
              service={recordService}
              id={r.id}
              action="access"
              label={t('detail.openContent')}
              permission={PERMISSIONS.medicalRecords.view}
              confirmTitle={t('detail.confirmTitle')}
              confirmDescription={t('detail.confirmBody')}
              icon={<KeyRound className="size-4" />}
              variant="primary"
              onDone={() => setViewing(r)}
            />
            <div className="flex flex-wrap gap-2 pt-2">
              {actionsFor(r.status).map((action) => (
                <CommandButton key={action} name="medicalRecords" service={recordService} id={r.id} action={action} label={t(`manage.${action}`)} permission={PERMISSIONS.medicalRecords.manage}
                  confirmTitle={t(`manage.${action}Title`)} confirmDescription={t(`manage.${action}Body`)} />
              ))}
            </div>
          </DetailSection>
        </div>
      )}
    />
    {viewing && <RecordContentDialog record={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
