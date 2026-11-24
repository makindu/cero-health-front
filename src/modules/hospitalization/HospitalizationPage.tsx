import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/forms/search-input';
import { Select } from '@/components/forms/controls';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can, usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { wardLabel } from './ward';
import { LocalOnly } from '../finance/LocalOnly';
import { AdmissionDetail } from './AdmissionDetail';
import { AdmitDialog } from './AdmitDialog';
import { BedBoard } from './BedBoard';
import { RoomsConfig } from './RoomsConfig';
import { apiHospital, type AdmissionRequestRow, type HospRequestRow } from './hospital-api';
import { HospRequestDialog } from './HospRequestDialog';
import { ActionDialog } from '../finance/ActionDialog';
import { FormField } from '@/components/forms/form-field';
import { Textarea } from '@/components/forms/controls';
import { referenceFromApi } from '../_shared/reference-data';
import { currentStay, type Admission, type AdmissionStatus } from './hospital-rules';
import { ADMISSION_STATUSES, AdmissionStatusBadge, RequestStatusBadge } from './StatusBadges';
import { HOSPITAL_AVAILABLE, useAdmissionRequests, useHospRequests, useHospitalBoard, useHospitalMutation } from './use-hospital';
import { PersonName } from '@/components/ui/avatar';

const PER_PAGE = 10;

export default function HospitalizationPage() {
  const { t } = useTranslation('hospitalization');
  if (!HOSPITAL_AVAILABLE) return <LocalOnly title={t('title')} />;
  return <HospitalizationScreen />;
}

function HospitalizationScreen() {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const board = useHospitalBoard();
  const { can } = usePermissions();
  const requests = useAdmissionRequests();
  const hospReqs = useHospRequests();
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<{ req: HospRequestRow; mode: 'approve' | 'reject' | 'cancel' } | null>(null);
  const [note, setNote] = useState('');
  const closeDecision = (): void => { setDeciding(null); setNote(''); };
  const decide = useHospitalMutation(apiHospital.decideRequest, { successTitle: t('hospReq.done.decided'), onDone: closeDecision });
  const cancelReq = useHospitalMutation(apiHospital.cancelRequest, { successTitle: t('hospReq.done.cancelled'), onDone: closeDecision });
  const [admitting, setAdmitting] = useState<{ bedId?: string; patientId?: string; consultationId?: string; requestId?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | AdmissionStatus>('');
  const [page, setPage] = useState(1);
  const bedLabel = (id: string): string => board.data?.beds.find((b) => b.bed.id === id)?.bed.label ?? id;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (board.data?.admissions ?? []).filter((a) => (!status || a.status === status) && (!q || `${a.patientName} ${a.number}`.toLowerCase().includes(q)));
  }, [board.data, search, status]);
  const requestColumns: Column<AdmissionRequestRow>[] = [
                { id: 'patient', header: t('columns.patient'), cell: (r) => <PersonName name={r.patientName} />, primary: true },
                { id: 'doctor', header: t('requests.doctor', { defaultValue: 'Médecin' }), cell: (r) => r.practitioner || '—' },
                { id: 'target', header: t('requests.target', { defaultValue: 'Service souhaité' }), cell: (r) => r.target || '—' },
                { id: 'at', header: t('requests.at', { defaultValue: 'Demandée le' }), cell: (r) => (r.at ? f.dateTime(r.at) : '—') },
                { id: 'go', header: '', cell: (r) => <Button size="sm" onClick={() => setAdmitting({ patientId: r.patientId, consultationId: r.consultationId })}>{t('requests.admit', { defaultValue: 'Admettre' })}</Button> },
  ];
  // L'admission et le retrait d'une demande reviennent au service des admissions ; celui qui valide les demandes (médecin) ne fait que décider.
  const mayAdmit = can(P.hospitalization.create) && !can(P.hospitalization.decide);
  const hospReqColumns: Column<HospRequestRow>[] = [
    { id: 'patient', header: t('columns.patient'), cell: (r) => <PersonName name={r.patientName} />, primary: true },
    { id: 'service', header: t('hospReq.service'), cell: (r) => wardLabel(t, r.careUnitId) },
    { id: 'reason', header: t('hospReq.reason'), cell: (r) => <span title={r.decisionNote}>{r.reason}{r.decisionNote ? ` — ${r.decisionNote}` : ''}</span> },
    { id: 'status', header: t('columns.status'), cell: (r) => <RequestStatusBadge status={r.status} /> },
    { id: 'at', header: t('hospReq.requestedAt'), cell: (r) => (r.requestedAt ? f.dateTime(r.requestedAt) : '—') },
    { id: 'go', header: '', cell: (r) => (
      <div className="flex flex-wrap justify-end gap-2">
        {r.status === 'pending' && r.canDecide && <>
          <Button size="sm" onClick={() => { setNote(''); setDeciding({ req: r, mode: 'approve' }); }}>{t('hospReq.actions.approve')}</Button>
          <Button size="sm" variant="outline" onClick={() => { setNote(''); setDeciding({ req: r, mode: 'reject' }); }}>{t('hospReq.actions.reject')}</Button>
        </>}
        {r.status === 'pending' && !r.canDecide && <span className="self-center text-xs text-muted-foreground">{t('hospReq.waiting', { service: wardLabel(t, r.careUnitId) })}</span>}
        {r.status === 'approved' && mayAdmit && <Button size="sm" onClick={() => setAdmitting({ patientId: r.patientId, requestId: r.id })}>{t('hospReq.actions.admit')}</Button>}
        {r.status === 'pending' && mayAdmit && <Can permission={P.hospitalization.create}><Button size="sm" variant="outline" onClick={() => { setNote(''); setDeciding({ req: r, mode: 'cancel' }); }}>{t('hospReq.actions.cancel')}</Button></Can>}
      </div>
    ) },
  ];
  const columns: Column<Admission>[] = [
    { id: 'number', header: t('columns.number'), cell: (a) => a.number },
    { id: 'patient', header: t('columns.patient'), cell: (a) => <PersonName name={a.patientName} />, primary: true },
    { id: 'ward', header: t('columns.ward'), cell: (a) => a.wardName ?? wardLabel(t, a.ward) },
    { id: 'bed', header: t('columns.bed'), cell: (a) => { const s = currentStay(a); return s ? bedLabel(s.bedId) : '—'; } },
    { id: 'admittedAt', header: t('columns.admittedAt'), cell: (a) => f.date(a.admittedAt) },
    { id: 'status', header: t('columns.status'), cell: (a) => <AdmissionStatusBadge status={a.status} /> },
    { id: 'open', header: '', cell: (a) => <Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>{t('beds.open')}</Button> },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Can permission={P.hospitalization.create}>{referenceFromApi() ? <Button leftIcon={<Plus className="size-4" />} onClick={() => setAsking(true)}>{t('hospReq.button')}</Button> : <Button leftIcon={<Plus className="size-4" />} onClick={() => setAdmitting({})}>{t('create.button')}</Button>}</Can>} />
      <Tabs ariaLabel={t('title')} tabs={[
        ...(referenceFromApi() && can(P.hospitalization.create) ? [{ id: 'requests', label: `${t('tabs.requests', { defaultValue: 'À admettre' })}${(requests.data?.length ?? 0) + (hospReqs.data?.filter((r) => r.status === 'approved' || r.canDecide).length ?? 0) ? ` (${(requests.data?.length ?? 0) + (hospReqs.data?.filter((r) => r.status === 'approved' || r.canDecide).length ?? 0)})` : ''}`, content: (
          <>
          <Card>
            <p className="border-b border-border p-4 text-sm text-muted-foreground">{t('hospReq.hint')}</p>
            <DataTable caption={t('hospReq.title')} getRowId={(r) => r.id} loading={hospReqs.isPending} error={hospReqs.error} onRetry={() => void hospReqs.refetch()}
              rows={hospReqs.data ?? []} emptyTitle={t('hospReq.empty')} columns={hospReqColumns} />
          </Card>
          <Card className="mt-4">
            <p className="border-b border-border p-4 text-sm text-muted-foreground">{t('requests.hint', { defaultValue: 'Patients pour lesquels un médecin a demandé une hospitalisation. Choisissez le lit pour terminer l’admission.' })}</p>
            <DataTable caption={t('tabs.requests', { defaultValue: 'À admettre' })} getRowId={(r) => r.consultationId} loading={requests.isPending} error={requests.error} onRetry={() => void requests.refetch()}
              rows={requests.data ?? []} emptyTitle={t('requests.empty', { defaultValue: 'Aucune demande d’hospitalisation en attente.' })}
              columns={requestColumns} />
          </Card>
          </>
        ) }] : []),
        { id: 'beds', label: t('tabs.beds'), content: <BedBoard onAdmit={(bedId) => setAdmitting({ bedId })} onOpen={setOpenId} /> },
        { id: 'admissions', label: t('tabs.admissions'), content: (
          <Card>
            <div className="flex flex-wrap gap-3 border-b border-border p-4">
              <SearchInput label={t('search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
              <Select aria-label={t('columns.status')} value={status} onChange={(e) => { setStatus(e.target.value as '' | AdmissionStatus); setPage(1); }} className="w-56">
                <option value="">{t('filters.allStatuses')}</option>
                {ADMISSION_STATUSES.map((s) => <option key={s} value={s}>{t(`admissionStatus.${s}`)}</option>)}
              </Select>
            </div>
            <DataTable caption={t('tabs.admissions')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(a) => a.id} loading={board.isPending} error={board.error} onRetry={() => void board.refetch()}
              emptyTitle={t('empty')} emptyDescription={t('emptyHint')} pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
          </Card>
        ) },
        ...(referenceFromApi() && can(P.hospitalization.assignBed) ? [{ id: 'config', label: t('tabs.config', { defaultValue: 'Configuration' }), content: <RoomsConfig /> }] : []),
      ]} />
      {asking && <HospRequestDialog onClose={() => setAsking(false)} />}
      {deciding && (
        <ActionDialog open onClose={closeDecision} tone={deciding.mode === 'approve' ? 'primary' : 'danger'} title={t(`hospReq.${deciding.mode}Title`)} description={t(`hospReq.${deciding.mode}Body`, { patient: deciding.req.patientName, service: wardLabel(t, deciding.req.careUnitId) })}
          submitLabel={t(`hospReq.actions.${deciding.mode}`)} pending={decide.isPending || cancelReq.isPending} canSubmit={note.trim().length >= 5}
          onSubmit={() => (deciding.mode === 'cancel' ? cancelReq.mutate({ id: deciding.req.id, note }) : decide.mutate({ id: deciding.req.id, approve: deciding.mode === 'approve', note }))}>
          <FormField label={t('hospReq.noteLabel')} required hint={t('hospReq.noteHint')}>{(c) => <Textarea {...c} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
        </ActionDialog>
      )}
      {admitting && <AdmitDialog bedId={admitting.bedId} initialPatientId={admitting.patientId} consultationId={admitting.consultationId} requestId={admitting.requestId} onClose={() => setAdmitting(null)} onDone={(a) => { setAdmitting(null); setOpenId(a.id); }} />}
      {openId && <AdmissionDetail admission={board.data?.admissions.find((a) => a.id === openId)} onClose={() => setOpenId(null)} />}
    </>
  );
}
