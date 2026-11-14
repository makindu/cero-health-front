import { FolderOpen, Lock, Pencil, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { ageFromBirthDate } from '@/utils/dates';
import { PatientPosition } from '../patientFlow/PatientPosition';
import { PatientAppointmentsTable } from '../appointments/AppointmentsTable';
import { PatientFinance } from '../finance/PatientFinance';
import { PatientConsultations } from '../consultations/PatientConsultations';
import { PatientAdmissions } from '../hospitalization/PatientAdmissions';
import { PatientPrescriptions } from '../prescriptions/PatientPrescriptions';
import { DemoNotice } from '../_shared/demo-notice';
import { DescriptionList, DetailSection } from '../_shared/detail-view';
import { useResourceItem } from '../_shared/use-resource';
import { DuplicateWarning } from './DuplicateWarning';
import { PatientEditDialog } from './PatientFormDialogs';
import { PatientSheetExport } from './PatientSheetExport';
import { patientService } from './data';
import { usePatientDuplicates } from './use-duplicates';
import { Avatar } from '@/components/ui/avatar';

/** Onglet d'historique réservé à une permission : sans elle, un message explique pourquoi rien n'est affiché. */
function GatedHistory({ permission, children }: { permission: string; children: ReactNode }) {
  const { t } = useTranslation('patients');
  return (
    <Card className="[&>div]:p-0">
      <Can
        permission={permission}
        fallback={
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Lock aria-hidden className="size-4" />
            {t('detail.history.noAccess')}
          </p>
        }
      >
        {children}
      </Can>
    </Card>
  );
}

/** Fiche patient complète : identité, rendez-vous, facturation, accès au dossier médical (permission dédiée). */
export default function PatientDetailPage() {
  const { t } = useTranslation('patients');
  const f = useFormatters();
  const { id } = useParams();
  const query = useResourceItem('patients', patientService, id);
  const duplicates = usePatientDuplicates(query.data?.item);
  const [editing, setEditing] = useState(false);

  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { item: patient, isDemo } = query.data;
  const age = ageFromBirthDate(patient.birthDate);

  return (
    <>
      <PageHeader
        title={patient.fullName}
        leading={<Avatar name={patient.fullName} size="lg" />}
        description={`${patient.id} · ${t(`sex.${patient.sex}`)}${age === null ? '' : ` · ${t('age.years', { count: age })}`}`}
        breadcrumbs={[{ label: t('title'), to: '/patients' }, { label: patient.fullName }]}
        actions={
          <>
            <StatusBadge tone={patient.status === 'active' ? 'success' : 'neutral'}>
              {t(`status.${patient.status}`)}
            </StatusBadge>
            <PatientSheetExport patient={patient} isDemo={isDemo} />
            <Can permission={PERMISSIONS.patients.update}>
              <Button variant="outline" leftIcon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                {t('edit.button')}
              </Button>
            </Can>
          </>
        }
      />
      {isDemo && <DemoNotice endpoint={patientService.endpoint} />}
      {duplicates.data && duplicates.data.length > 0 && (
        <div role="alert" className="mb-4 flex gap-3 rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-warning-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <DuplicateWarning matches={duplicates.data} />
        </div>
      )}
      <PatientEditDialog patient={patient} open={editing} onClose={() => setEditing(false)} />

      <Tabs
        ariaLabel={patient.fullName}
        tabs={[
          {
            id: 'identity',
            label: t('detail.tabs.identity'),
            content: (
              <Card>
                <div className="space-y-5">
                  <p role="note" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
                    {t('detail.adminOnly')}
                  </p>
                  <DetailSection title={t('detail.section.civil')}>
                    <DescriptionList
                      items={[
                        { label: t('fields.fullName'), value: patient.fullName },
                        { label: t('fields.sex'), value: t(`sex.${patient.sex}`) },
                        { label: t('fields.birthDate'), value: f.date(patient.birthDate) },
                        { label: t('columns.age'), value: age === null ? '—' : t('age.years', { count: age }) },
                      ]}
                    />
                  </DetailSection>
                  <DetailSection title={t('detail.section.contact')}>
                    <DescriptionList
                      items={[
                        { label: t('fields.phone'), value: patient.phone },
                        { label: t('fields.address'), value: patient.address },
                        { label: t('fields.emergencyContact'), value: patient.emergencyContact },
                      ]}
                    />
                  </DetailSection>
                  <DetailSection title={t('detail.section.admin')}>
                    <DescriptionList
                      items={[
                        { label: t('columns.fileNumber'), value: <code className="text-xs">{patient.fileNumber}</code> },
                        { label: t('detail.techId'), value: <code className="text-xs">{patient.id}</code> },
                        { label: t('fields.service'), value: t(`services.${patient.service}`) },
                        { label: t('fields.insurer'), value: patient.insurer },
                        { label: t('detail.registeredAt'), value: f.date(patient.registeredAt) },
                        { label: t('columns.lastVisit'), value: patient.lastVisit ? f.date(patient.lastVisit) : t('noVisit') },
                      ]}
                    />
                  </DetailSection>
                </div>
              </Card>
            ),
          },
          {
            id: 'position',
            label: t('detail.tabs.position'),
            content: <PatientPosition patientId={patient.id} />,
          },
          {
            id: 'appointments',
            label: t('detail.tabs.appointments'),
            content: (
              <Card className="[&>div]:p-0">
                <PatientAppointmentsTable patientId={patient.id} caption={t('detail.tabs.appointments')} />
              </Card>
            ),
          },
          {
            id: 'consultations',
            label: t('detail.tabs.consultations'),
            content: (
              <GatedHistory permission={PERMISSIONS.consultations.view}>
                <PatientConsultations patientId={patient.id} caption={t('detail.tabs.consultations')} />
              </GatedHistory>
            ),
          },
          {
            id: 'prescriptions',
            label: t('detail.tabs.prescriptions'),
            content: (
              <GatedHistory permission={PERMISSIONS.prescriptions.view}>
                <PatientPrescriptions patientId={patient.id} caption={t('detail.tabs.prescriptions')} />
              </GatedHistory>
            ),
          },
          {
            id: 'hospitalizations',
            label: t('detail.tabs.hospitalizations'),
            content: (
              <GatedHistory permission={PERMISSIONS.hospitalization.view}>
                <PatientAdmissions patientId={patient.id} caption={t('detail.tabs.hospitalizations')} />
              </GatedHistory>
            ),
          },
          {
            id: 'billing',
            label: t('detail.tabs.billing'),
            content: (
              <Card className="[&>div]:p-0">
                <PatientFinance patientId={patient.id} />
              </Card>
            ),
          },
          {
            id: 'record',
            label: t('detail.tabs.record'),
            content: (
              <Card>
                <Can
                  permission={PERMISSIONS.medicalRecords.view}
                  fallback={
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Lock aria-hidden className="size-4" />
                      {t('detail.record.noAccess')}
                    </p>
                  }
                >
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t('detail.record.body')}</p>
                    <p role="note" className="rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink">
                      {t('detail.record.sensitive')}
                    </p>
                    <Link to={`/medical-records?search=${encodeURIComponent(patient.id)}`} className={buttonVariants('outline')}>
                      <FolderOpen aria-hidden className="size-4" />
                      {t('detail.record.open')}
                    </Link>
                  </div>
                </Can>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}
