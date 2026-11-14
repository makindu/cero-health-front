import { useState } from 'react';
import { DataTable, type Column } from '@/components/tables/data-table';
import { DemoNotice } from './demo-notice';
import type { ResourceService } from './resource-service';
import { useResourceList } from './use-resource';

interface PatientHistoryTableProps<T extends { id: string }> {
  /** Nom de la ressource dans le cache. */
  name: string;
  service: ResourceService<T>;
  patientId: string;
  caption: string;
  columns: readonly Column<T>[];
  /** Colonne de tri par défaut (la plus récente d'abord). */
  sortColumn: string;
}

/** Historique compact d'un patient pour une ressource (consultations, prescriptions, hospitalisations…), filtré par `patientId`. */
export function PatientHistoryTable<T extends { id: string }>({
  name,
  service,
  patientId,
  caption,
  columns,
  sortColumn,
}: PatientHistoryTableProps<T>) {
  const [page, setPage] = useState(1);
  const list = useResourceList(name, service, {
    page,
    perPage: 5,
    search: '',
    filters: { patientId },
    sort: { columnId: sortColumn, direction: 'desc' },
  });
  return (
    <>
      {list.data?.isDemo && (
        <div className="p-3">
          <DemoNotice endpoint={service.endpoint} />
        </div>
      )}
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
    </>
  );
}
