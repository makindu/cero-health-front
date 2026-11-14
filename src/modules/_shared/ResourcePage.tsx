import { Eye, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DateField, Select } from '@/components/forms/controls';
import { SearchInput } from '@/components/forms/search-input';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column, type SortState } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Can } from '@/core/permissions/PermissionsProvider';
import { DemoNotice } from './demo-notice';
import type { FieldDef } from './dynamic-form';
import { FormDialog } from './form-dialog';
import type { ListParams, ResourceService } from './resource-service';
import { useResourceList } from './use-resource';
import { Avatar } from '@/components/ui/avatar';

export interface FilterDef {
  id: string;
  label: string;
  /** « select » (par défaut) ou « date » (valeur AAAA-MM-JJ, transmise telle quelle à l'API). */
  type?: 'select' | 'date';
  options?: readonly { value: string; label: string }[];
}

export interface CreateFormDef {
  /** Permission requise pour voir le bouton (l'API revérifie). */
  permission: string;
  buttonLabel: string;
  title: string;
  submitLabel: string;
  fields: readonly FieldDef[];
}

interface ResourcePageProps<T extends { id: string }> {
  /** Nom de la ressource dans le cache (ex. « patients »). */
  name: string;
  service: ResourceService<T>;
  title: string;
  description?: string;
  columns: readonly Column<T>[];
  searchLabel: string;
  filters?: readonly FilterDef[];
  create?: CreateFormDef;
  /** Contenu du volet de détail. Absent = pas de bouton « Consulter ». */
  renderDetail?: (item: T) => ReactNode;
  detailTitle?: (item: T) => string;
  /** Nom de la personne concernée par la ligne ouverte : affiche son avatar dans l'en-tête du détail. */
  detailPerson?: (item: T) => string | undefined;
  /** Remplace l'ouverture du volet (ex. navigation vers une page de fiche). */
  onOpen?: (item: T) => void;
  /** Bloc affiché entre l'en-tête et le tableau (indicateurs…). */
  summary?: ReactNode;
  /** Boutons de l'en-tête ; une fonction reçoit la recherche/les filtres courants (ex. menu d'export). */
  actions?: ReactNode | ((current: Omit<ListParams, 'page' | 'perPage'>) => ReactNode);
  defaultSort?: SortState;
  initialFilters?: Record<string, string>;
  /** Recherche préremplie (ex. lien depuis la fiche patient). */
  initialSearch?: string;
  perPage?: number;
  /** Sans en-tête de page (utilisée dans un onglet d'une autre page). */
  embedded?: boolean;
}

/**
 * Page de liste générique : recherche, filtres, tri et pagination côté serveur, fiche en volet latéral,
 * formulaire de création, états chargement / vide / erreur, bandeau « Démo » quand les données sont fictives.
 */
export function ResourcePage<T extends { id: string }>({
  name,
  service,
  title,
  description,
  columns,
  searchLabel,
  filters = [],
  create,
  renderDetail,
  detailTitle,
  detailPerson,
  onOpen,
  summary,
  actions,
  defaultSort,
  initialFilters,
  initialSearch,
  perPage = 10,
  embedded = false,
}: ResourcePageProps<T>) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters ?? {});
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [selected, setSelected] = useState<T | null>(null);
  const [creating, setCreating] = useState(false);

  const params: ListParams = { page, perPage, search, filters: filterValues, sort };
  const list = useResourceList(name, service, params);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const hasActiveFilters = search !== '' || Object.values(filterValues).some(Boolean);
  const canOpen = Boolean(renderDetail) || Boolean(onOpen);

  const allColumns: readonly Column<T>[] = canOpen
    ? [
        ...columns,
        {
          id: 'open',
          header: t('module.actions'),
          className: 'w-px whitespace-nowrap text-end',
          cell: (row) => (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Eye className="size-4" />}
              onClick={() => (onOpen ? onOpen(row) : setSelected(row))}
            >
              {t('actions.view')}
            </Button>
          ),
        },
      ]
    : columns;

  const headerActions = (
    <>
      {typeof actions === 'function' ? actions({ search, filters: filterValues, sort }) : actions}
      {create && (
        <Can permission={create.permission}>
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {create.buttonLabel}
          </Button>
        </Can>
      )}
    </>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
      ) : (
        <PageHeader title={title} description={description} actions={headerActions} />
      )}

      {list.data?.isDemo && <DemoNotice endpoint={service.endpoint} />}
      {summary}

      <div className="rounded-card border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <SearchInput value={search} onChange={handleSearch} label={searchLabel} placeholder={searchLabel} />
          {filters.map((filter) => (
            <label key={filter.id} className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
              {filter.label}
              {filter.type === 'date' ? (
                <DateField
                  value={filterValues[filter.id] ?? ''}
                  onChange={(event) => {
                    setFilterValues((current) => ({ ...current, [filter.id]: event.target.value }));
                    setPage(1);
                  }}
                />
              ) : (
                <Select
                  value={filterValues[filter.id] ?? ''}
                  onChange={(event) => {
                    setFilterValues((current) => ({ ...current, [filter.id]: event.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="">{t('module.all')}</option>
                  {(filter.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </label>
          ))}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw className="size-4" />}
              onClick={() => {
                setSearch('');
                setFilterValues({});
                setPage(1);
              }}
            >
              {t('actions.reset')}
            </Button>
          )}
        </div>

        <DataTable
          caption={title}
          columns={allColumns}
          rows={list.data?.rows ?? []}
          getRowId={(row) => row.id}
          loading={list.isPending}
          error={list.error}
          onRetry={() => void list.refetch()}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          pagination={{
            page,
            perPage,
            total: list.data?.total ?? 0,
            onPageChange: setPage,
          }}
        />
      </div>

      {renderDetail && (
        <Dialog
          open={selected !== null}
          onClose={() => setSelected(null)}
          variant="detail"
          title={selected && detailTitle ? detailTitle(selected) : title}
          leading={selected && detailPerson && detailPerson(selected) ? <Avatar name={detailPerson(selected)!} size="lg" /> : undefined}
        >
          {selected && renderDetail(selected)}
        </Dialog>
      )}

      {create && (
        <FormDialog
          open={creating}
          onClose={() => setCreating(false)}
          name={name}
          service={service}
          title={create.title}
          submitLabel={create.submitLabel}
          fields={create.fields}
        />
      )}
    </>
  );
}
