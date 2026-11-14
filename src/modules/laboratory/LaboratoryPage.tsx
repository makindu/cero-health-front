import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/forms/search-input';
import { Select } from '@/components/forms/controls';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { LocalOnly } from '../finance/LocalOnly';
import type { LabStatus } from './lab-rules';
import type { LabOrderView } from './lab-service';
import { LabOrderDetail } from './LabOrderDetail';
import { LAB_STATUSES, LabStatusBadge } from './LabStatusBadge';
import { NewLabOrderDialog } from './NewLabOrderDialog';
import { LAB_AVAILABLE, useLabOrders } from './use-lab';
import { PersonName } from '@/components/ui/avatar';

const PER_PAGE = 10;

export default function LaboratoryPage() {
  const { t } = useTranslation('laboratory');
  if (!LAB_AVAILABLE) return <LocalOnly title={t('title')} />;
  return <LaboratoryScreen />;
}

function LaboratoryScreen() {
  const { t } = useTranslation('laboratory');
  const f = useFormatters();
  const orders = useLabOrders();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | LabStatus>('');
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders.data ?? []).filter((v) => (!status || v.order.status === status) && (!q || `${v.order.patientName} ${v.order.number}`.toLowerCase().includes(q)));
  }, [orders.data, search, status]);

  const columns: Column<LabOrderView>[] = [
    { id: 'number', header: t('columns.number'), cell: (v) => v.order.number },
    { id: 'requestedAt', header: t('columns.requestedAt'), cell: (v) => f.dateTime(v.order.requestedAt) },
    { id: 'patientName', header: t('columns.patient'), cell: (v) => <PersonName name={v.order.patientName} />, primary: true },
    { id: 'tests', header: t('columns.tests'), cell: (v) => v.order.tests.map((x) => x.label).join(', ') },
    { id: 'priority', header: t('columns.priority'), cell: (v) => <StatusBadge tone={v.order.priority === 'urgent' ? 'danger' : 'neutral'}>{t(`priority.${v.order.priority}`)}</StatusBadge> },
    { id: 'payment', header: t('columns.payment'), cell: (v) => <StatusBadge tone={v.paymentCleared ? 'success' : 'warning'}>{t(`payment.${v.paymentState}`)}</StatusBadge> },
    { id: 'status', header: t('columns.status'), cell: (v) => <LabStatusBadge status={v.order.status} /> },
    { id: 'open', header: '', cell: (v) => <Button size="sm" variant="outline" onClick={() => setOpenId(v.order.id)}>{t('actions.open')}</Button> },
  ];

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}
        actions={<Can permission={P.laboratory.order}><Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t('create.button')}</Button></Can>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput label={t('search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
        <Select aria-label={t('filters.status')} value={status} onChange={(e) => { setStatus(e.target.value as '' | LabStatus); setPage(1); }}>
          <option value="">{t('filters.allStatuses')}</option>
          {LAB_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </Select>
      </div>
      <DataTable caption={t('title')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(v) => v.order.id}
        loading={orders.isPending} error={orders.error} onRetry={() => void orders.refetch()} emptyTitle={t('empty')} emptyDescription={t('emptyHint')}
        pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
      {creating && <NewLabOrderDialog onClose={() => setCreating(false)} onCreated={(v) => { setCreating(false); setOpenId(v.order.id); }} />}
      {openId && <LabOrderDetail view={orders.data?.find((v) => v.order.id === openId)} onClose={() => setOpenId(null)} />}
    </>
  );
}
