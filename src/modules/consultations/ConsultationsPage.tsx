import { CircleCheck, FilePen, Hourglass, Lock, PenLine, Stethoscope } from 'lucide-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { useFormatters } from '@/core/i18n/useFormatters';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { CommandButton } from '../_shared/command-button';
import { SERVICE_KEYS } from '../_shared/demo-people';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { ResourcePage } from '../_shared/ResourcePage';
import { consultationService, type Consultation, type ConsultationStatus } from './data';

const STATUS: Record<ConsultationStatus, { tone: StatusTone; icon: typeof Lock }> = {
  draft: { tone: 'neutral', icon: FilePen },
  inProgress: { tone: 'info', icon: Stethoscope },
  awaitingResults: { tone: 'warning', icon: Hourglass },
  toValidate: { tone: 'warning', icon: PenLine },
  signed: { tone: 'info', icon: PenLine },
  closed: { tone: 'success', icon: CircleCheck },
};
const REASONS = ['firstVisit', 'followUp', 'control', 'vaccination', 'prenatal'] as const;

export default function ConsultationsPage() {
  const { t } = useTranslation('consultations');
  const f = useFormatters();
  const serviceOptions = SERVICE_KEYS.map((key) => ({ value: key, label: t(`services.${key}`) }));
  const statusBadge = (s: ConsultationStatus) => (
    <StatusBadge tone={STATUS[s].tone} icon={STATUS[s].icon}>
      {t(`status.${s}`)}
    </StatusBadge>
  );

  const columns: Column<Consultation>[] = [
    { id: 'date', header: t('columns.date'), cell: (c) => f.dateTime(c.date), sortable: true },
    { id: 'patientName', header: t('columns.patient'), cell: (c) => <span className="font-medium">{c.patientName}</span>, sortable: true, primary: true },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (c) => c.practitioner },
    { id: 'service', header: t('columns.service'), cell: (c) => t(`services.${c.service}`) },
    { id: 'reason', header: t('columns.reason'), cell: (c) => t(`reason.${c.reason}`) },
    { id: 'status', header: t('columns.status'), cell: (c) => statusBadge(c.status) },
  ];

  return (
    <ResourcePage<Consultation>
      name="consultations"
      service={consultationService}
      title={t('title')}
      description={t('subtitle')}
      searchLabel={t('search')}
      columns={columns}
      defaultSort={{ columnId: 'date', direction: 'desc' }}
      filters={[
        { id: 'status', label: t('filters.status'), options: (Object.keys(STATUS) as ConsultationStatus[]).map((s) => ({ value: s, label: t(`status.${s}`) })) },
        { id: 'service', label: t('filters.service'), options: serviceOptions },
      ]}
      create={{
        permission: PERMISSIONS.consultations.create,
        buttonLabel: t('create.button'),
        title: t('create.title'),
        submitLabel: t('create.submit'),
        fields: [
          { name: 'patient', label: t('fields.patient'), type: 'patient', required: true, span: 2 },
          { name: 'service', label: t('fields.service'), type: 'select', required: true, options: serviceOptions },
          { name: 'practitioner', label: t('fields.practitioner'), type: 'practitioner', required: true },
          { name: 'reason', label: t('fields.reason'), type: 'select', required: true, options: REASONS.map((r) => ({ value: r, label: t(`reason.${r}`) })) },
        ],
      }}
      detailTitle={(c) => `${c.patientName} · ${f.date(c.date)}`}
      renderDetail={(c) => (
        <div className="space-y-5">
          <DetailSection title={t('detail.summary')}>
            <DescriptionList
              items={[
                { label: t('columns.patient'), value: `${c.patientName} (${c.patientId})` },
                { label: t('detail.reference'), value: c.id },
                { label: t('columns.date'), value: f.dateTime(c.date) },
                { label: t('columns.practitioner'), value: c.practitioner },
                { label: t('columns.service'), value: t(`services.${c.service}`) },
                { label: t('columns.reason'), value: t(`reason.${c.reason}`) },
                { label: t('columns.status'), value: statusBadge(c.status) },
              ]}
            />
          </DetailSection>
          <DetailSection title={t('detail.clinical')}>
            <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">
              {t('detail.clinicalBody')}
            </p>
            <Link to={`/consultations/${encodeURIComponent(c.id)}`} className={buttonVariants('primary')}>
              <Stethoscope aria-hidden className="size-4" />
              {t('clinical.open')}
            </Link>
          </DetailSection>
          <DetailSection title={t('detail.actions')}>
            <div className="flex flex-wrap gap-2">
              {c.status === 'signed' && (
                <CommandButton
                  name="consultations"
                  service={consultationService}
                  id={c.id}
                  action="close"
                  label={t('actions.close')}
                  permission={PERMISSIONS.consultations.close}
                  confirmTitle={t('actions.closeTitle')}
                  confirmDescription={t('actions.closeBody')}
                  icon={<Lock className="size-4" />}
                />
              )}
            </div>
          </DetailSection>
        </div>
      )}
    />
  );
}
