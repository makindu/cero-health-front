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
import type { AdmissionRequestRow } from './hospital-api';
import { referenceFromApi } from '../_shared/reference-data';
import { currentStay, type Admission, type AdmissionStatus } from './hospital-rules';
import { ADMISSION_STATUSES, AdmissionStatusBadge } from './StatusBadges';
import { HOSPITAL_AVAILABLE, useAdmissionRequests, useHospitalBoard } from './use-hospital';
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
  const [admitting, setAdmitting] = useState<{ bedId?: string; patientId?: string; consultationId?: string } | null>(null);
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
  const columns: Column<Admission>[] = [
    { id: 'number', header: t('columns.number'), cell: (a) => a.number },
    { id: 'patient', header: t('columns.patient'), cell: (a) => <PersonName name={a.patientName} />, primary: true },
    { id: 'ward', header: t('columns.ward'), cell: (a) => wardLabel(t, a.ward) },
    { id: 'bed', header: t('columns.bed'), cell: (a) => { const s = currentStay(a); return s ? bedLabel(s.bedId) : '—'; } },
    { id: 'admittedAt', header: t('columns.admittedAt'), cell: (a) => f.date(a.admittedAt) },
    { id: 'status', header: t('columns.status'), cell: (a) => <AdmissionStatusBadge status={a.status} /> },
    { id: 'open', header: '', cell: (a) => <Button size="sm" variant="outline" onClick={() => setOpenId(a.id)}>{t('beds.open')}</Button> },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Can permission={P.hospitalization.create}><Button leftIcon={<Plus className="size-4" />} onClick={() => setAdmitting({})}>{t('create.button')}</Button></Can>} />
      <Tabs ariaLabel={t('title')} tabs={[
        ...(referenceFromApi() && can(P.hospitalization.create) ? [{ id: 'requests', label: `${t('tabs.requests', { defaultValue: 'À admettre' })}${requests.data?.length ? ` (${requests.data.length})` : ''}`, content: (
          <Card>
            <p className="border-b border-border p-4 text-sm text-muted-foreground">{t('requests.hint', { defaultValue: 'Patients pour lesquels un médecin a demandé une hospitalisation. Choisissez le lit pour terminer l’admission.' })}</p>
            <DataTable caption={t('tabs.requests', { defaultValue: 'À admettre' })} getRowId={(r) => r.consultationId} loading={requests.isPending} error={requests.error} onRetry={() => void requests.refetch()}
              rows={requests.data ?? []} emptyTitle={t('requests.empty', { defaultValue: 'Aucune demande d’hospitalisation en attente.' })}
              columns={requestColumns} />
          </Card>
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
      {admitting && <AdmitDialog bedId={admitting.bedId} initialPatientId={admitting.patientId} consultationId={admitting.consultationId} onClose={() => setAdmitting(null)} onDone={(a) => { setAdmitting(null); setOpenId(a.id); }} />}
      {openId && <AdmissionDetail admission={board.data?.admissions.find((a) => a.id === openId)} onClose={() => setOpenId(null)} />}
    </>
  );
}
