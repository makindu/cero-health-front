import { useState } from 'react';
import { DataTable } from '@/components/tables/data-table';
import { useResourceList } from '../_shared/use-resource';
import { useAppointmentColumns } from './columns';
import { appointmentService } from './data';

/** Tableau compact des rendez-vous d'un patient (utilisé dans sa fiche). */
export function PatientAppointmentsTable({ patientId, caption }: { patientId: string; caption: string }) {
  const [page, setPage] = useState(1);
  const columns = useAppointmentColumns({ withPatient: false });
  const list = useResourceList('appointments', appointmentService, {
    page,
    perPage: 5,
    search: '',
    filters: { patientId },
    sort: { columnId: 'startsAt', direction: 'desc' },
  });
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={list.data?.rows ?? []}
      getRowId={(row) => row.id}
      loading={list.isPending}
      error={list.error}
      onRetry={() => void list.refetch()}
      pagination={{ page, perPage: 5, total: list.data?.total ?? 0, onPageChange: setPage }}
    />
  );
}
