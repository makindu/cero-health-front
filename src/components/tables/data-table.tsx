import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { OfflineState } from '@/components/feedback/offline-state';
import { Skeleton } from '@/components/feedback/spinner';
import { useDataUnavailable } from '@/core/connectivity/connectivity';
import { cn } from '@/utils/cn';
import { Pagination } from './pagination';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Tri géré côté serveur : la colonne devient cliquable. */
  sortable?: boolean;
  /** Colonne principale : sert de titre à la carte en affichage mobile. */
  primary?: boolean;
  className?: string;
}

export interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Classe ajoutée à une ligne (ex. surbrillance d'un élément arrivé en direct). */
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  pagination?: { page: number; perPage: number; total: number; onPageChange: (page: number) => void };
}

/**
 * Tableau responsive : vrai <table> dès md, liste de cartes sur mobile.
 * Tri et pagination sont pilotés par le parent (côté serveur) ; états chargement / vide / erreur intégrés.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  rowClassName,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  sort,
  onSortChange,
  pagination,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const unavailable = useDataUnavailable();

  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && unavailable) return <OfflineState />;
  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t('states.loading')}
        </span>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle ?? t('table.noResults')} description={emptyDescription} />;
  }

  const primary = columns.find((column) => column.primary) ?? columns[0];

  function nextSort(column: Column<T>): SortState {
    const same = sort?.columnId === column.id;
    return { columnId: column.id, direction: same && sort?.direction === 'asc' ? 'desc' : 'asc' };
  }

  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-muted text-start text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => {
                const active = sort?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('px-4 py-[var(--cell-py)] text-start font-medium', column.className)}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(nextSort(column))}
                        aria-label={t('table.sortBy', { column: column.header })}
                        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                      >
                        {column.header}
                        {active ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp aria-hidden className="size-3.5" />
                          ) : (
                            <ArrowDown aria-hidden className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3.5" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={getRowId(row)} data-row-id={getRowId(row)} className={cn('hover:bg-surface-muted/60', rowClassName?.(row))}>
                {columns.map((column) => (
                  <td key={column.id} className={cn('px-4 py-[var(--cell-py)]', column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={getRowId(row)} data-row-id={getRowId(row)} className={cn('space-y-2 px-4 py-3', rowClassName?.(row))}>
            {primary && <div className="font-medium text-foreground">{primary.cell(row)}</div>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns
                .filter((column) => column !== primary)
                .map((column) => (
                  <div key={column.id} className="contents">
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd className="text-end text-foreground">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
