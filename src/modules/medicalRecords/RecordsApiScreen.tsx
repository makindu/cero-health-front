import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, CircleCheck, FileText, KeyRound, Lock, Plus } from 'lucide-react';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ActionDialog } from '../finance/ActionDialog';
import { usePatientLabel } from '../insurance/ApiMembersPicker';
import { RecordContentApiDialog } from './RecordContentApiDialog';
import { RecordSynthesisDialog } from './RecordSynthesisDialog';
import { PatientCombobox } from '../_shared/patient-combobox';
import type { RecordStatus } from './data';
import { actionsFor, type RecordAction } from './record-rules';
import { NO_RECORD_FILTER, RECORDS_PAGE, RECORD_STATUSES, REASON_MAX, apiRecords, type ApiRecord, type RecordCounts, type RecordFilters } from './records-api';

const STATUS: Record<RecordStatus, { tone: StatusTone; icon: typeof Lock }> = {
  active: { tone: 'success', icon: CircleCheck },
  archived: { tone: 'neutral', icon: Archive },
  locked: { tone: 'warning', icon: Lock },
};
const STATUS_LABEL: Record<RecordStatus, string> = { active: 'Actif', archived: 'Archivé', locked: 'Verrouillé' };
const ACTION_LABEL: Record<RecordAction, string> = { archive: 'Archiver', lock: 'Verrouiller', reopen: 'Rouvrir' };

function useFeedback(): { fail: (e: unknown) => void; refresh: () => void } {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return {
    refresh: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'medical-records') }); },
    fail: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  };
}

/** Dossiers médicaux branchés au serveur : liste, ouverture, archivage, verrouillage et réouverture. Le contenu clinique n'est jamais dans la liste. */
export function RecordsApiScreen() {
  const { t } = useTranslation('medicalRecords');
  const f = useFormatters();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [filters, setFilters] = useState<RecordFilters>(NO_RECORD_FILTER);
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const set = (patch: Partial<RecordFilters>) => { setFilters((x) => ({ ...x, ...patch })); setPage(1); };
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'medical-records', 'list', filters, page), queryFn: () => apiRecords.list(filters, page), placeholderData: keepPreviousData });
  const columns: Column<ApiRecord>[] = [
    { id: 'patient', header: t('columns.patient'), cell: (r) => r.patientName || `#${r.patientId}`, primary: true },
    { id: 'number', header: t('columns.number'), cell: (r) => <code className="text-xs">{r.number}</code> },
    { id: 'opened', header: t('detail.openedAt'), cell: (r) => f.date(r.openedAt) },
    { id: 'status', header: t('columns.status'), cell: (r) => <StatusBadge tone={STATUS[r.status].tone} icon={STATUS[r.status].icon}>{t(`status.${r.status}`, { defaultValue: STATUS_LABEL[r.status] })}</StatusBadge> },
    { id: 'open', header: '', cell: (r) => <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setSelected(r.id)}>{t('apiRecords.details', { defaultValue: 'Détails' })}</Button></div> },
  ];
  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} description={t('subtitle')}
        actions={can(PERMISSIONS.medicalRecords.manage) ? <Button onClick={() => setOpening(true)}><Plus aria-hidden className="size-4" />{t('create.button')}</Button> : undefined} />
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">{t('search')}<Input value={filters.q} maxLength={60} onChange={(e) => set({ q: e.target.value })} className="mt-1 w-64" /></label>
          <label className="flex flex-col text-sm">{t('filters.status')}
            <Select value={filters.status} onChange={(e) => set({ status: e.target.value as RecordFilters['status'] })} className="mt-1 w-44">
              <option value="">{t('apiRecords.all', { defaultValue: 'Tous' })}</option>
              {RECORD_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`, { defaultValue: STATUS_LABEL[s] })}</option>)}
            </Select>
          </label>
        </div>
      </Card>
      <DataTable caption={t('title')} columns={columns} rows={list.data?.rows ?? []} getRowId={(r) => r.id}
        loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}
        emptyTitle={t('apiRecords.empty', { defaultValue: 'Aucun dossier' })}
        pagination={{ page, perPage: RECORDS_PAGE, total: list.data?.total ?? 0, onPageChange: setPage }} />
      {opening && <OpenRecordDialog onClose={() => setOpening(false)} />}
      {selected && <RecordDetail key={selected} id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function OpenRecordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('medicalRecords');
  const fb = useFeedback();
  const toast = useToast();
  const [patientId, setPatientId] = useState('');
  const candidate = /^\d+$/.test(patientId) ? patientId : '';
  const found = usePatientLabel(candidate);
  const open = useMutation({
    mutationFn: () => apiRecords.open(candidate),
    onSuccess: () => { toast({ tone: 'success', title: t('apiRecords.opened', { defaultValue: 'Dossier ouvert' }) }); fb.refresh(); onClose(); },
    onError: fb.fail,
  });
  return (
    <ActionDialog open onClose={onClose} title={t('create.title')} description={t('create.hint')} submitLabel={t('create.submit')} pending={open.isPending} canSubmit={candidate !== '' && found.found} onSubmit={() => open.mutate()}>
      <FormField label={t('create.patient')} required hint={candidate !== '' && found.found ? found.label : undefined}>
        {(c) => <PatientCombobox {...c} onValueChange={setPatientId} />}
      </FormField>
    </ActionDialog>
  );
}

const countRows = (c: RecordCounts): { key: string; fallback: string; value: number | null }[] => [
  { key: 'consultations', fallback: 'Consultations', value: c.consultations },
  { key: 'prescriptions', fallback: 'Ordonnances', value: c.prescriptions },
  { key: 'labOrders', fallback: 'Analyses', value: c.labOrders },
  { key: 'admissions', fallback: 'Hospitalisations', value: c.admissions },
  { key: 'documents', fallback: 'Documents', value: c.documents },
];

function RecordDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation('medicalRecords');
  const f = useFormatters();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [acting, setActing] = useState<RecordAction | null>(null);
  const [reading, setReading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const q = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'medical-records', 'item', id), queryFn: () => apiRecords.get(id) });
  const r = q.data;
  return (
    <Dialog open onClose={onClose} variant="detail" title={r ? (r.patientName || `#${r.patientId}`) : t('title')}>
      {q.isPending && <p className="text-sm text-muted-foreground">{t('apiRecords.loading', { defaultValue: 'Chargement…' })}</p>}
      {q.isError && <div className="space-y-2"><p role="alert" className="text-sm text-danger-ink">{q.error instanceof ApiError ? q.error.message : t('apiRecords.failed', { defaultValue: 'Impossible de charger ce dossier' })}</p><Button variant="outline" size="sm" onClick={() => void q.refetch()}>{t('apiRecords.retry', { defaultValue: 'Réessayer' })}</Button></div>}
      {r && (
        <div className="space-y-5">
          <p role="note" className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info-ink"><Lock aria-hidden className="mt-0.5 size-4 shrink-0" />{t('sensitive')}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('columns.number')}</dt><dd>{r.number}</dd>
            <dt className="text-muted-foreground">{t('columns.patient')}</dt><dd>{r.patientName}{r.patientNumber ? ` (${r.patientNumber})` : ''}</dd>
            <dt className="text-muted-foreground">{t('detail.openedAt')}</dt><dd>{f.date(r.openedAt)}</dd>
            <dt className="text-muted-foreground">{t('columns.status')}</dt><dd>{t(`status.${r.status}`, { defaultValue: STATUS_LABEL[r.status] })}{r.statusReason ? ` — ${r.statusReason}` : ''}</dd>
            {r.lastAccessAt && <><dt className="text-muted-foreground">{t('apiRecords.lastAccess', { defaultValue: 'Dernier accès' })}</dt><dd>{f.dateTime(r.lastAccessAt)}</dd></>}
            {r.lastExportAt && <><dt className="text-muted-foreground">{t('apiRecords.lastExport', { defaultValue: 'Dernier export' })}</dt><dd>{f.dateTime(r.lastExportAt)}</dd></>}
          </dl>
          <section aria-label={t('apiRecords.counts', { defaultValue: 'Contenu du dossier' })}>
            <h3 className="text-sm font-semibold">{t('apiRecords.counts', { defaultValue: 'Contenu du dossier' })}</h3>
            <ul className="mt-1 grid grid-cols-2 gap-1 text-sm">
              {countRows(r.counts).map((c) => <li key={c.key} className="flex justify-between"><span className="text-muted-foreground">{t(`counts.${c.key}`, { defaultValue: c.fallback })}</span><span className="tabular-nums">{c.value === null ? '—' : c.value}</span></li>)}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">{t('apiRecords.countsHint', { defaultValue: '« — » : section que vos droits ne permettent pas de voir.' })}</p>
          </section>
          {r.events.length > 0 && (
            <section aria-label={t('apiRecords.history', { defaultValue: 'Historique' })}>
              <h3 className="text-sm font-semibold">{t('apiRecords.history', { defaultValue: 'Historique' })}</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {r.events.map((e, i) => <li key={i}>{f.dateTime(e.at)} — {t(`apiRecords.event.${e.action}`, { defaultValue: e.action === 'open' ? 'Ouverture' : ACTION_LABEL[e.action as RecordAction] ?? e.action })}{e.reason ? ` (${e.reason})` : ''}</li>)}
              </ul>
            </section>
          )}
          {can(PERMISSIONS.medicalRecords.view) && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('detail.accessBody')}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setReading(true)}><KeyRound aria-hidden className="size-4" />{t('detail.openContent')}</Button>
                {can(PERMISSIONS.medicalRecords.export) && <Button variant="outline" onClick={() => setSummarizing(true)}><FileText aria-hidden className="size-4" />{t('synthesis.open', { defaultValue: 'Synthèse (PDF / Word)' })}</Button>}
              </div>
            </div>
          )}
          {can(PERMISSIONS.medicalRecords.manage) && (
            <div className="flex flex-wrap gap-2">
              {actionsFor(r.status).map((a) => <Button key={a} variant="outline" onClick={() => setActing(a)}>{t(`manage.${a}`, { defaultValue: ACTION_LABEL[a] })}</Button>)}
            </div>
          )}
        </div>
      )}
      {r && summarizing && <RecordSynthesisDialog record={r} onClose={() => setSummarizing(false)} />}
      {r && reading && <RecordContentApiDialog record={r} onClose={() => setReading(false)} />}
      {r && acting && <ActDialog record={r} action={acting} onClose={() => setActing(null)} />}
    </Dialog>
  );
}

function ActDialog({ record, action, onClose }: { record: ApiRecord; action: RecordAction; onClose: () => void }) {
  const { t } = useTranslation('medicalRecords');
  const fb = useFeedback();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: () => apiRecords.act(record.id, action, reason),
    onSuccess: () => { toast({ tone: 'success', title: t(`manage.${action}Done`, { defaultValue: 'Dossier mis à jour' }) }); fb.refresh(); onClose(); },
    onError: (e) => { fb.fail(e); fb.refresh(); },
  });
  return (
    <ActionDialog open onClose={onClose} title={t(`manage.${action}Title`)} description={t(`manage.${action}Body`)} submitLabel={t(`manage.${action}`, { defaultValue: ACTION_LABEL[action] })} pending={run.isPending} canSubmit onSubmit={() => run.mutate()}>
      <FormField label={t('apiRecords.reason', { defaultValue: 'Motif (facultatif)' })}>{(c) => <Textarea {...c} value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}
