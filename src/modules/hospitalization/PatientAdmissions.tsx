import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { currentStay, type Admission } from './hospital-rules';
import { AdmissionStatusBadge } from './StatusBadges';
import { HOSPITAL_AVAILABLE, useHospitalBoard } from './use-hospital';

/** Historique des hospitalisations d'un patient (collection locale). */
export function PatientAdmissions({ patientId, caption }: { patientId: string; caption: string }) {
  const { t } = useTranslation('hospitalization');
  const f = useFormatters();
  const board = useHospitalBoard();
  const label = (id: string): string => board.data?.beds.find((b) => b.bed.id === id)?.bed.label ?? id;
  const rows = (board.data?.admissions ?? []).filter((a) => a.patientId === patientId);
  const columns: Column<Admission>[] = [
    { id: 'admittedAt', header: t('columns.admittedAt'), cell: (a) => f.date(a.admittedAt), primary: true },
    { id: 'ward', header: t('columns.ward'), cell: (a) => t(`services.${a.ward}`) },
    { id: 'bed', header: t('columns.bed'), cell: (a) => { const s = currentStay(a); return s ? label(s.bedId) : '—'; } },
    { id: 'status', header: t('columns.status'), cell: (a) => <AdmissionStatusBadge status={a.status} /> },
  ];
  if (!HOSPITAL_AVAILABLE) return null;
  return <DataTable caption={caption} columns={columns} rows={rows} getRowId={(a) => a.id} loading={board.isPending} error={board.error} onRetry={() => void board.refetch()} emptyTitle={t('empty')} />;
}
