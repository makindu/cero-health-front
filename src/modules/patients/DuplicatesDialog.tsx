import { GitMerge } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/feedback/spinner';
import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { queryKeys } from '@/core/api';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ActionFormDialog } from '../_shared/action-form-dialog';
import { DemoNotice } from '../_shared/demo-notice';
import { fetchAll } from '../_shared/export/fetch-all';
import { patientService, type Patient } from './data';
import { findDuplicateGroups, findFileNumberIssues, type DuplicateGroup } from './duplicates';

function MergeButton({ group }: { group: DuplicateGroup }) {
  const { t } = useTranslation('patients');
  const [open, setOpen] = useState(false);
  const oldest = [...group.patients].sort((a, b) => a.registeredAt.localeCompare(b.registeredAt))[0];
  return (
    <Can permission={PERMISSIONS.patients.merge}>
      <Button size="sm" variant="outline" leftIcon={<GitMerge className="size-4" />} onClick={() => setOpen(true)}>
        {t('duplicates.merge')}
      </Button>
      <ActionFormDialog
        open={open}
        onClose={() => setOpen(false)}
        invalidate={['patients']}
        title={t('duplicates.mergeTitle')}
        description={t('duplicates.mergeHint')}
        submitLabel={t('duplicates.mergeSubmit')}
        fields={[
          {
            name: 'keep',
            label: t('duplicates.keep'),
            type: 'select',
            required: true,
            options: group.patients.map((p) => ({ value: p.id, label: `${p.fullName} · ${p.fileNumber}` })),
          },
          { name: 'reason', label: t('duplicates.reason.label'), type: 'textarea', required: true, span: 2 },
        ]}
        defaultValues={{ keep: oldest?.id ?? '' }}
        // Contrat cible proposé : POST /health/patients/{conservé}/merge { duplicateIds, reason }.
        execute={(values) =>
          patientService.command(values.keep ?? '', 'merge', {
            duplicateIds: group.patients.filter((p) => p.id !== values.keep).map((p) => p.id).join(','),
            reason: values.reason ?? '',
          })
        }
      />
    </Can>
  );
}

function PatientLine({ patient }: { patient: Patient }) {
  const { t } = useTranslation('patients');
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        <Link to={`/patients/${encodeURIComponent(patient.id)}`} className="font-medium underline">
          {patient.fullName}
        </Link>{' '}
        <span className="text-muted-foreground">
          · {patient.fileNumber} · {patient.phone} · {t(`status.${patient.status}`)}
        </span>
      </span>
    </li>
  );
}

/** Détection des doublons probables : même numéro de dossier ou même téléphone. La fusion est réservée (patients.merge). */
export function DuplicatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('patients');
  const { activeFacilityId } = usePreferences();
  const query = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'patients', 'all'),
    queryFn: () => fetchAll(patientService, { search: '', filters: {}, sort: null }),
    enabled: open,
  });
  const groups = query.data ? findDuplicateGroups(query.data.rows) : [];
  const issues = query.data ? findFileNumberIssues(query.data.rows) : [];

  return (
    <Dialog open={open} onClose={onClose} variant="detail" title={t('duplicates.title')} description={t('duplicates.subtitle')}>
      <div className="space-y-4">
        {query.data?.isDemo && <DemoNotice endpoint={patientService.endpoint} />}
        {query.data?.truncated && (
          <p role="note" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-ink">
            {t('duplicates.truncated', { count: query.data.rows.length })}
          </p>
        )}
        {query.isPending && <Skeleton className="h-32" />}
        {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
        {query.data && groups.length === 0 && <EmptyState title={t('duplicates.none')} />}
        {groups.map((group) => (
          <section key={`${group.reason}-${group.key}`} className="space-y-2 rounded-card border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t(`duplicates.reason.${group.reason}`)}</h3>
              <MergeButton group={group} />
            </div>
            <ul className="space-y-1">
              {group.patients.map((patient) => (
                <PatientLine key={patient.id} patient={patient} />
              ))}
            </ul>
          </section>
        ))}
        {issues.length > 0 && (
          <section className="space-y-2 rounded-card border border-border p-3">
            <h3 className="text-sm font-semibold">{t('duplicates.fileIssues', { count: issues.length })}</h3>
            <ul className="space-y-1">
              {issues.map(({ patient, issue }) => (
                <li key={patient.id} className="text-sm">
                  <Link to={`/patients/${encodeURIComponent(patient.id)}`} className="font-medium underline">
                    {patient.fullName}
                  </Link>{' '}
                  <span className="text-muted-foreground">· {t(`duplicates.issue.${issue}`)}{patient.fileNumber ? ` (${patient.fileNumber})` : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
