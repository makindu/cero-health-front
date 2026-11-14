import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import type { Rx } from './rx-rules';
import { RxStatusBadge } from './RxStatusBadge';
import { RX_AVAILABLE, useRxList } from './use-rx';

/** Historique des prescriptions d'un patient (lecture de la collection locale). */
export function PatientPrescriptions({ patientId, caption }: { patientId: string; caption: string }) {
  const { t } = useTranslation('prescriptions');
  const f = useFormatters();
  const list = useRxList();
  const rows = (list.data ?? []).filter((r) => r.patientId === patientId);
  const columns: Column<Rx>[] = [
    { id: 'date', header: t('columns.date'), cell: (r) => f.dateTime(r.prescribedAt), primary: true },
    { id: 'number', header: t('columns.number'), cell: (r) => r.number },
    { id: 'items', header: t('columns.items'), cell: (r) => r.items.map((i) => i.label).join(', ') },
    { id: 'status', header: t('columns.status'), cell: (r) => <RxStatusBadge status={r.status} /> },
  ];
  if (!RX_AVAILABLE) return null;
  return <DataTable caption={caption} columns={columns} rows={rows} getRowId={(r) => r.id} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} emptyTitle={t('empty')} />;
}
