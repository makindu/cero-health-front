import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/forms/search-input';
import { Select } from '@/components/forms/controls';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { LocalOnly } from '../finance/LocalOnly';
import type { Rx, RxStatus } from './rx-rules';
import { NewRxDialog } from './NewRxDialog';
import { RxDetail } from './RxDetail';
import { RX_STATUSES, RxStatusBadge } from './RxStatusBadge';
import { RX_AVAILABLE, useRxList } from './use-rx';

const PER_PAGE = 10;

export default function PrescriptionsPage() {
  const { t } = useTranslation('prescriptions');
  if (!RX_AVAILABLE) return <LocalOnly title={t('title')} />;
  return <PrescriptionsScreen />;
}

function PrescriptionsScreen() {
  const { t } = useTranslation('prescriptions');
  const f = useFormatters();
  const list = useRxList();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | RxStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((r) => (!status || r.status === status) && (!q || `${r.patientName} ${r.number} ${r.prescriber}`.toLowerCase().includes(q)));
  }, [list.data, search, status]);
  const columns: Column<Rx>[] = [
    { id: 'number', header: t('columns.number'), cell: (r) => r.number },
    { id: 'date', header: t('columns.date'), cell: (r) => f.dateTime(r.prescribedAt) },
    { id: 'patientName', header: t('columns.patient'), cell: (r) => <span className="font-medium">{r.patientName}</span>, primary: true },
    { id: 'practitioner', header: t('columns.practitioner'), cell: (r) => r.prescriber },
    { id: 'items', header: t('columns.items'), cell: (r) => t('itemsCount', { count: r.items.length }) },
    { id: 'status', header: t('columns.status'), cell: (r) => <RxStatusBadge status={r.status} /> },
    { id: 'open', header: '', cell: (r) => <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>{t('actions.open')}</Button> },
  ];
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} actions={<Can permission={P.prescriptions.create}><Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t('create.button')}</Button></Can>} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <SearchInput label={t('search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
          <Select aria-label={t('filters.status')} value={status} onChange={(e) => { setStatus(e.target.value as '' | RxStatus); setPage(1); }} className="w-56">
            <option value="">{t('filters.allStatuses')}</option>
            {RX_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </Select>
        </div>
        <DataTable caption={t('title')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(r) => r.id}
          loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}
          pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
      </Card>
      {creating && <NewRxDialog onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setOpenId(r.id); }} />}
      {openId && <RxDetail prescription={list.data?.find((r) => r.id === openId)} onClose={() => setOpenId(null)} />}
    </>
  );
}
