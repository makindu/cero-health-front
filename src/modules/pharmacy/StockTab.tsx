import { useState } from 'react';
import { Autocomplete } from '@/components/forms/autocomplete';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { DateField, Input, Select } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { DataTable, type Column } from '@/components/tables/data-table';
import { useFormatters } from '@/core/i18n/useFormatters';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { ActionDialog } from '../finance/ActionDialog';
import { pharmacy } from './pharmacy';
import type { StockItemView } from './pharmacy-service';
import { usePharmacyMutation, usePharmacyStock } from './use-pharmacy';
import { NumberInput } from '@/components/forms/number-input';
import { SearchInput } from '@/components/forms/search-input';
import { matchesQuery } from '../catalog/catalog-rules';
import { formatStock } from './packaging';
import { StockExportMenu } from './StockExportMenu';
import { StockImportDialog } from './StockImportDialog';

const PER_PAGE = 15;
type StockFilter = '' | 'out' | 'expired';

export function StockTab() {
  const { t } = useTranslation('pharmacy');
  const f = useFormatters();
  const stock = usePharmacyStock();
  const [receiving, setReceiving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('');
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [itemId, setItemId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [qty, setQty] = useState('');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const close = (): void => { setReceiving(false); setAdjusting(null); setItemId(''); setLotNumber(''); setQty(''); setExpiry(''); setReason(''); };
  const receive = usePharmacyMutation(pharmacy.receiveLot, { successTitle: t('done.receive'), onDone: close });
  const adjust = usePharmacyMutation(pharmacy.adjust, { successTitle: t('done.adjust'), onDone: close });
  const items = (stock.data?.items ?? []).filter((i) => !i.derivedOf);
  const fmt = (i: StockItemView, qty: number): string => (i.packaging ? formatStock(qty, i.packaging) : f.number(qty));
  const chosen = items.find((i) => i.itemId === itemId);
  const day = stock.data?.day ?? '';
  const rows = items.filter((i) => (filter === '' || (filter === 'out' ? i.usable === 0 : i.lots.some((l) => l.expiresAt !== null && l.expiresAt < day))) && matchesQuery(search, i.label, i.code, ...i.lots.map((l) => l.lotNumber)));
  const columns: Column<StockItemView>[] = [
    { id: 'label', header: t('stock.item'), cell: (i) => <span className="font-medium">{i.label}</span>, primary: true },
    { id: 'total', header: t('stock.total'), cell: (i) => fmt(i, i.total), className: 'text-end tabular-nums' },
    { id: 'usable', header: t('stock.usable'), cell: (i) => <StatusBadge tone={i.usable === 0 ? 'danger' : i.usable < i.total ? 'warning' : 'success'}>{fmt(i, i.usable)}</StatusBadge>, className: 'text-end' },
    {
      id: 'lots', header: t('stock.lots'),
      cell: (i) => (
        <ul className="space-y-1 text-xs">
          {i.lots.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <span>{l.lotNumber} · {fmt(i, l.quantity)} · {l.expiresAt ? f.date(l.expiresAt) : '—'}</span>
              {l.expiresAt && l.expiresAt < day && <StatusBadge tone="danger">{t('stock.expired')}</StatusBadge>}
              <Can permission={P.inventory.adjust}><Button size="sm" variant="ghost" onClick={() => setAdjusting(l.id)}>{t('stock.adjust')}</Button></Can>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <StockExportMenu items={rows} day={day} />
        <Can permission={P.inventory.receive}><Button variant="outline" onClick={() => setImporting(true)}>{t('stock.import.button')}</Button></Can>
        <Can permission={P.inventory.receive}><Button onClick={() => setReceiving(true)}>{t('stock.receive')}</Button></Can>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <SearchInput label={t('stock.search')} placeholder={t('stock.search')} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
        <Select aria-label={t('stock.filter.label')} value={filter} onChange={(e) => { setFilter(e.target.value as StockFilter); setPage(1); }}>
          <option value="">{t('stock.filter.all')}</option>
          <option value="out">{t('stock.filter.out')}</option>
          <option value="expired">{t('stock.filter.expired')}</option>
        </Select>
      </div>
      <Card>
        <DataTable caption={t('tabs.stock')} columns={columns} rows={rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)} getRowId={(i) => i.itemId} loading={stock.isPending} error={stock.error} onRetry={() => void stock.refetch()} emptyTitle={t('stock.empty')}
          pagination={{ page, perPage: PER_PAGE, total: rows.length, onPageChange: setPage }} />
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">{t('stock.notice')}</p>
      {stock.data && stock.data.movements.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer">{t('stock.movements', { count: stock.data.movements.length })}</summary>
          <ul className="mt-1 space-y-0.5">
            {stock.data.movements.slice(0, 50).map((m) => <li key={m.id}>{f.dateTime(m.at)} · {t(`movementKind.${m.kind}`)} · {m.delta > 0 ? '+' : ''}{m.delta} · {items.flatMap((i) => i.lots).find((l) => l.id === m.lotId)?.lotNumber ?? m.lotId} · {m.by}{m.reason ? ` — ${m.reason}` : ''}</li>)}
          </ul>
        </details>
      )}
      {importing && <StockImportDialog items={items} day={day} onClose={() => setImporting(false)} />}
      <ActionDialog open={receiving} onClose={close} title={t('stock.receiveTitle')} submitLabel={t('stock.receive')} pending={receive.isPending} canSubmit={itemId !== '' && lotNumber.trim() !== '' && Number(qty) > 0}
        onSubmit={() => receive.mutate({ itemId, lotNumber, quantity: Number(qty), expiresAt: expiry || null })}>
        <FormField label={t('stock.item')} required>
          {(c) => <Autocomplete<(typeof items)[number]> {...c} items={items} value={itemId} onChange={setItemId} getKey={(i) => i.itemId} getLabel={(i) => i.label} getSearch={(i) => i.label} emptyText={t('module.itemNoMatch')} placeholder={t('module.itemSearchPlaceholder')} />}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('stock.lotNumber')} required>{(c) => <Input {...c} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />}</FormField>
          <FormField label={chosen?.packaging ? t('stock.quantityIn', { unit: chosen.packaging.unit }) : t('stock.quantity')} required>{(c) => <NumberInput {...c} value={qty} onValueChange={setQty} />}</FormField>
          <FormField label={t('stock.expiry')}>{(c) => <DateField {...c} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</FormField>
        </div>
      </ActionDialog>
      <ActionDialog open={adjusting !== null} onClose={close} title={t('stock.adjustTitle')} description={t('stock.adjustBody')} submitLabel={t('stock.adjust')} pending={adjust.isPending} canSubmit={Number.isInteger(Number(qty)) && Number(qty) !== 0 && reason.trim() !== ''}
        onSubmit={() => adjusting && adjust.mutate({ lotId: adjusting, delta: Number(qty), reason })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('stock.delta')} hint={t('stock.deltaHint')} required>{(c) => <Input {...c} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />}</FormField>
          <FormField label={t('common.reason')} required>{(c) => <Input {...c} value={reason} onChange={(e) => setReason(e.target.value)} />}</FormField>
        </div>
      </ActionDialog>
    </>
  );
}
