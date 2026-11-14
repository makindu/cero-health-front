import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { StatusBadge } from '@/components/ui/badge';
import { LocalOnly } from '../finance/LocalOnly';
import { DispensationDetail } from './DispensationDetail';
import type { DispensationView, QueueRow } from './pharmacy-service';
import { PrepareDialog } from './PrepareDialog';
import { DispensationStatusBadge } from './StatusBadges';
import { StockTab } from './StockTab';
import { PHARMACY_AVAILABLE, useDispensations, usePharmacyQueue, usePharmacyStock } from './use-pharmacy';
import { PersonName } from '@/components/ui/avatar';

export default function PharmacyPage() {
  const { t } = useTranslation('pharmacy');
  if (!PHARMACY_AVAILABLE) return <LocalOnly title={t('title')} />;
  return <PharmacyScreen />;
}

function PharmacyScreen() {
  const { t } = useTranslation('pharmacy');
  const f = useFormatters();
  const queue = usePharmacyQueue();
  const disp = useDispensations();
  const stock = usePharmacyStock();
  const [preparing, setPreparing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = useMemo(() => (queue.data ?? []).filter((r) => r.remaining.some((n) => n > 0)), [queue.data]);

  const queueColumns: Column<QueueRow>[] = [
    { id: 'number', header: t('columns.prescription'), cell: (r) => r.prescription.number },
    { id: 'patient', header: t('columns.patient'), cell: (r) => <PersonName name={r.prescription.patientName} />, primary: true },
    { id: 'items', header: t('columns.items'), cell: (r) => r.prescription.items.map((i, k) => `${i.label} (${r.remaining[k]}/${i.quantity})`).join(', ') },
    { id: 'date', header: t('columns.date'), cell: (r) => f.dateTime(r.prescription.prescribedAt) },
    { id: 'open', header: '', cell: (r) => <Can permission={P.pharmacy.dispense}><Button size="sm" onClick={() => setPreparing(r.prescription.id)}>{t('queue.prepare')}</Button></Can> },
  ];
  const dispColumns: Column<DispensationView>[] = [
    { id: 'number', header: t('columns.number'), cell: (v) => v.dispensation.number },
    { id: 'patient', header: t('columns.patient'), cell: (v) => <PersonName name={v.dispensation.patientName} />, primary: true },
    { id: 'rx', header: t('columns.prescription'), cell: (v) => v.dispensation.rxNumber },
    { id: 'payment', header: t('columns.payment'), cell: (v) => <StatusBadge tone={v.paymentCleared ? 'success' : 'warning'}>{t(`payment.${v.paymentState}`)}</StatusBadge> },
    { id: 'status', header: t('columns.status'), cell: (v) => <DispensationStatusBadge status={v.dispensation.status} /> },
    { id: 'open', header: '', cell: (v) => <Button size="sm" variant="outline" onClick={() => setOpenId(v.dispensation.id)}>{t('actions.open')}</Button> },
  ];
  const row = preparing ? queue.data?.find((r) => r.prescription.id === preparing) : undefined;
  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs ariaLabel={t('title')} tabs={[
        { id: 'queue', label: t('tabs.queue'), content: (
          <Card><DataTable caption={t('tabs.queue')} columns={queueColumns} rows={pending} getRowId={(r) => r.prescription.id} loading={queue.isPending} error={queue.error} onRetry={() => void queue.refetch()} emptyTitle={t('queue.empty')} emptyDescription={t('queue.emptyHint')} /></Card>
        ) },
        { id: 'dispensations', label: t('tabs.dispensations'), content: (
          <Card><DataTable caption={t('tabs.dispensations')} columns={dispColumns} rows={disp.data ?? []} getRowId={(v) => v.dispensation.id} loading={disp.isPending} error={disp.error} onRetry={() => void disp.refetch()} emptyTitle={t('dispensation.empty')} /></Card>
        ) },
        { id: 'stock', label: t('tabs.stock'), content: <StockTab /> },
      ]} />
      {row && stock.data && <PrepareDialog row={row} items={stock.data.items} onClose={() => setPreparing(null)} onDone={(v) => { setPreparing(null); setOpenId(v.dispensation.id); }} />}
      {openId && <DispensationDetail view={disp.data?.find((v) => v.dispensation.id === openId)} onClose={() => setOpenId(null)} />}
    </>
  );
}
