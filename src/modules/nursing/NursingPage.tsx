import {
  Clock,
  CircleCheck,
  HeartPulse,
  Hourglass,
  Siren,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Column } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { HEALTH_ENDPOINTS } from '@/core/api/contracts/health-endpoints';
import { env } from '@/core/config/env';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { minutesSince } from '@/utils/dates';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import type { FieldDef } from '../_shared/dynamic-form';
import { FormDialog } from '../_shared/form-dialog';
import { createResourceService } from '../_shared/resource-service';
import { ResourcePage } from '../_shared/ResourcePage';
import { useResourceList } from '../_shared/use-resource';
import { buildVitals, type VitalsRecord } from './local-rules';
import { VitalsHistory, VITALS_COLLECTION } from './VitalsHistory';
import { vitalsApi } from './vitals-api';
import { referenceFromApi } from '../_shared/reference-data';
import { CommandButton } from '../_shared/command-button';
import { PRIORITIES, triageService, type TriageEntry, type TriagePriority, type TriageStatus } from './data';
import { PersonName } from '@/components/ui/avatar';
import { SendToDoctorButton } from './SendToDoctorButton';
import { ValidateCareButton } from './ValidateCareButton';

/** Étapes proposées depuis chaque statut (le service local refuse de toute façon une étape invalide). */
const TRIAGE_STEPS: Record<TriageStatus, readonly ('start-triage' | 'send-to-care' | 'transfer' | 'discharge')[]> = {
  waiting: ['start-triage'],
  inTriage: ['send-to-care'],
  inCare: ['transfer', 'discharge'],
  transferred: [],
  discharged: [],
};

const PRIORITY_STYLE: Record<TriagePriority, { tone: StatusTone; icon: typeof Siren }> = {
  immediate: { tone: 'danger', icon: Siren },
  veryUrgent: { tone: 'warning', icon: TriangleAlert },
  urgent: { tone: 'info', icon: Clock },
  standard: { tone: 'success', icon: CircleCheck },
  nonUrgent: { tone: 'neutral', icon: Hourglass },
};
const STATUSES: readonly TriageStatus[] = ['waiting', 'inTriage', 'inCare', 'transferred', 'discharged'];
const CATEGORIES = ['injury', 'fever', 'pregnancy', 'followUp', 'other'] as const;

/** Mode API : triage terminé mais soins pas encore validés par un médecin. */
const awaitingValidation = (e: TriageEntry): boolean => referenceFromApi() && e.status === 'inTriage' && !e.careValidated;

function QueueSummary() {
  const { t } = useTranslation('nursing');
  const all = useResourceList('triage', triageService, { page: 1, perPage: 200, search: '', filters: {}, sort: null });
  const waiting = (all.data?.rows ?? []).filter((e) => e.status === 'waiting' || e.status === 'inTriage');
  if (!all.data) return null;
  return (
    <StatGrid>
      <StatCard icon={HeartPulse} label={t('summary.queue')} value={waiting.length} />
      {(['immediate', 'veryUrgent', 'urgent'] as const).map((p) => (
        <StatCard
          key={p}
          icon={PRIORITY_STYLE[p].icon}
          tone={PRIORITY_STYLE[p].tone}
          label={t(`priority.${p}`)}
          value={waiting.filter((e) => e.priority === p).length}
        />
      ))}
    </StatGrid>
  );
}

export default function NursingPage() {
  const { t } = useTranslation('nursing');
  const f = useFormatters();
  const [vitalsFor, setVitalsFor] = useState<TriageEntry | null>(null);

  // Contrat cible : POST /health/triage/{id}/vitals (voir docs/API_CONTRACTS_NEEDED.md).
  const vitalsService = useMemo(
    () =>
      createResourceService<VitalsRecord>({
        source: 'health',
        endpoint: vitalsFor ? HEALTH_ENDPOINTS.triage.vitals(vitalsFor.id) : undefined,
        demoRows: [],
        api: vitalsFor ? vitalsApi(vitalsFor.patientId, vitalsFor.id) : undefined,
        local: {
          collection: VITALS_COLLECTION,
          create: (input, ctx) => buildVitals(input, vitalsFor?.id ?? '', ctx, `VIT-LOC-${globalThis.crypto.randomUUID().slice(0, 8).toUpperCase()}`),
          permissions: { create: PERMISSIONS.nursing.record },
        },
      }),
    [vitalsFor],
  );
  const vitalsFields: FieldDef[] = [
    { name: 'temperature', label: t('vitals.temperature'), type: 'number', hint: t('vitals.unit.temperature') },
    { name: 'pulse', label: t('vitals.pulse'), type: 'number', hint: t('vitals.unit.pulse') },
    { name: 'systolic', label: t('vitals.systolic'), type: 'number', hint: t('vitals.unit.pressure') },
    { name: 'diastolic', label: t('vitals.diastolic'), type: 'number', hint: t('vitals.unit.pressure') },
    { name: 'respiratoryRate', label: t('vitals.respiratoryRate'), type: 'number', hint: t('vitals.unit.respiratory') },
    { name: 'spo2', label: t('vitals.spo2'), type: 'number', hint: t('vitals.unit.spo2') },
    { name: 'weight', label: t('vitals.weight'), type: 'number', hint: t('vitals.unit.weight') },
    { name: 'note', label: t('vitals.note'), type: 'textarea', span: 2 },
  ];

  const columns: Column<TriageEntry>[] = [
    {
      id: 'priority',
      header: t('columns.priority'),
      sortable: true,
      cell: (e) => (
        <StatusBadge tone={PRIORITY_STYLE[e.priority].tone} icon={PRIORITY_STYLE[e.priority].icon}>
          {t(`priority.${e.priority}`)}
        </StatusBadge>
      ),
    },
    { id: 'patientName', header: t('columns.patient'), cell: (e) => <PersonName name={e.patientName} />, sortable: true, primary: true },
    { id: 'category', header: t('columns.category'), cell: (e) => t(`category.${e.category}`) },
    { id: 'arrivedAt', header: t('columns.arrival'), cell: (e) => f.time(e.arrivedAt), sortable: true },
    { id: 'wait', header: t('columns.wait'), cell: (e) => t('minutes', { count: minutesSince(e.arrivedAt) }) },
    { id: 'status', header: t('columns.status'), cell: (e) => (awaitingValidation(e) ? t('status.awaitingValidation', { defaultValue: 'Triage — à valider par le médecin' }) : t(`status.${e.status}`)) },
  ];

  return (
    <>
      <ResourcePage<TriageEntry>
        name="triage"
        service={triageService}
        title={t('title')}
        description={t('subtitle')}
        searchLabel={t('search')}
        columns={columns}
        summary={<QueueSummary />}
        defaultSort={{ columnId: 'priority', direction: 'asc' }}
        filters={[
          { id: 'priority', label: t('filters.priority'), options: PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })) },
          { id: 'status', label: t('filters.status'), options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
        ]}
        create={{
          permission: PERMISSIONS.nursing.record,
          buttonLabel: t('create.button'),
          title: t('create.title'),
          submitLabel: t('create.submit'),
          fields: [
            { name: 'patient', label: t('fields.patient'), type: 'patient', required: true, span: 2 },
            { name: 'priority', label: t('fields.priority'), type: 'select', required: true, options: PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })) },
            { name: 'category', label: t('fields.category'), type: 'select', required: true, options: CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) })) },
          ],
        }}
        detailTitle={(e) => e.patientName}
        detailPerson={(e) => e.patientName}
        renderDetail={(e) => (
          <div className="space-y-5">
            <DetailSection title={t('detail.summary')}>
              <DescriptionList
                items={[
                  { label: t('columns.patient'), value: `${e.patientName} (${e.patientId})` },
                  { label: t('columns.priority'), value: t(`priority.${e.priority}`) },
                  { label: t('columns.category'), value: t(`category.${e.category}`) },
                  { label: t('columns.arrival'), value: f.dateTime(e.arrivedAt) },
                  { label: t('columns.wait'), value: t('minutes', { count: minutesSince(e.arrivedAt) }) },
                  { label: t('columns.status'), value: t(`status.${e.status}`) },
                  { label: t('detail.nurse'), value: e.nurse },
                  ...(e.careValidated ? [
                    { label: t('detail.careValidated', { defaultValue: 'Soins validés par' }), value: `${e.careValidated.by} · ${f.dateTime(e.careValidated.at)}` },
                    ...(e.careValidated.instructions ? [{ label: t('detail.careInstructions', { defaultValue: 'Consigne du médecin' }), value: e.careValidated.instructions }] : []),
                  ] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title={t('detail.care')}>
              <div className="flex flex-wrap gap-2">
                {awaitingValidation(e) && (
                  <div className="w-full space-y-2 rounded-md bg-warning-soft p-3 text-sm">
                    <p>{t('detail.awaitingValidation', { defaultValue: 'En attente de la validation du médecin : les soins ne peuvent pas commencer.' })}</p>
                    <ValidateCareButton entry={e} />
                  </div>
                )}
                {TRIAGE_STEPS[e.status].filter((action) => !(action === 'send-to-care' && awaitingValidation(e))).map((action) => (
                  <CommandButton
                    key={action}
                    name="triage"
                    service={triageService}
                    id={e.id}
                    action={action}
                    label={t(`actions.${action}`)}
                    permission={PERMISSIONS.nursing.record}
                    confirmTitle={t(`confirmTitles.${action}`)}
                  />
                ))}
                {(e.status === 'inTriage' || e.status === 'inCare') && <SendToDoctorButton entry={e} />}
                {TRIAGE_STEPS[e.status].length === 0 && e.status !== 'inTriage' && e.status !== 'inCare' && <p className="text-sm text-muted-foreground">{t('detail.noActions')}</p>}
              </div>
            </DetailSection>
            <DetailSection title={t('detail.vitals')}>
              {(env.localMode || referenceFromApi()) && <VitalsHistory entryId={e.id} patientId={e.patientId} />}
              {!referenceFromApi() && <p className="text-sm text-muted-foreground">{env.localMode ? t('detail.vitalsBodyLocal') : t('detail.vitalsBody')}</p>}
              <Can permission={PERMISSIONS.nursing.record}>
                <Button size="sm" leftIcon={<HeartPulse className="size-4" />} onClick={() => setVitalsFor(e)}>
                  {t('detail.enterVitals')}
                </Button>
              </Can>
            </DetailSection>
          </div>
        )}
      />
      <FormDialog
        open={vitalsFor !== null}
        onClose={() => setVitalsFor(null)}
        name="triage"
        service={vitalsService}
        title={t('vitals.title')}
        submitLabel={t('vitals.submit')}
        fields={vitalsFields}
      />
    </>
  );
}
