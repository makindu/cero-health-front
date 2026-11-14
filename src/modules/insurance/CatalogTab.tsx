import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { money as makeMoney } from '@/core/money/money';
import { SERVICE_CATEGORIES, type CatalogItem, type ServiceCategory } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useMoney } from '../finance/use-finance';
import { TabToolbar, fromMinor, toMinor } from './Shared';
import type { FinanceSnapshot } from './types';

export function CatalogTab({ data }: { data: FinanceSnapshot }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const columns: Column<CatalogItem>[] = [
    { id: 'code', header: t('insurance.catalog.code'), cell: (i) => <code className="text-xs">{i.code}</code> },
    { id: 'label', header: t('detail.item'), cell: (i) => i.label, primary: true },
    { id: 'category', header: t('insurance.catalog.category'), cell: (i) => t(`category.${i.category}`) },
    { id: 'price', header: t('insurance.catalog.price'), cell: (i) => money(i.price.minor, i.price.currency), className: 'text-end tabular-nums' },
    { id: 'active', header: t('columns.status'), cell: (i) => <StatusBadge tone={i.active ? 'success' : 'neutral'}>{i.active ? t('insurance.catalog.active') : t('insurance.catalog.inactive')}</StatusBadge> },
    { id: 'edit', header: '', cell: (i) => <Can permission={P.billing.configure}><Button size="sm" variant="outline" onClick={() => setEditing(i)}>{t('common.edit')}</Button></Can> },
  ];
  return (
    <>
      <Can permission={P.billing.configure}><TabToolbar><Button onClick={() => setEditing('new')}>{t('insurance.catalog.add')}</Button></TabToolbar></Can>
      <DataTable caption={t('insurance.tabs.catalog')} columns={columns} rows={data.catalog} getRowId={(i) => i.id} />
      <p className="mt-2 text-xs text-muted-foreground">{t('insurance.catalog.hint')}</p>
      {editing && <CatalogForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} currency={data.catalog[0]?.price.currency ?? 'USD'} onClose={() => setEditing(null)} />}
    </>
  );
}

function CatalogForm({ initial, currency, onClose }: { initial: CatalogItem | null; currency: string; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({ code: initial?.code ?? '', label: initial?.label ?? '', category: initial?.category ?? ('consultation' as ServiceCategory), price: fromMinor(initial?.price.minor), active: initial?.active ?? true });
  const save = useFinanceMutation(finance.saveCatalogItem, { successTitle: t('done.saved'), onDone: onClose });
  const ok = v.code.trim().length >= 2 && v.label.trim().length >= 2 && Number(v.price.replace(',', '.')) >= 0 && v.price.trim() !== '';
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.catalog.edit') : t('insurance.catalog.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={ok}
      onSubmit={() => save.mutate({ id: initial?.id ?? `cat-${globalThis.crypto.randomUUID().slice(0, 8)}`, code: v.code.trim().toUpperCase(), label: v.label.trim(), category: v.category, price: makeMoney(toMinor(v.price), currency), active: v.active })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.catalog.code')} required hint={initial ? t('insurance.catalog.codeHint') : undefined}>{(c) => <Input {...c} disabled={Boolean(initial)} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />}</FormField>
        <FormField label={t('insurance.catalog.category')}>{(c) => <Select {...c} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as ServiceCategory })}>{SERVICE_CATEGORIES.map((x) => <option key={x} value={x}>{t(`category.${x}`)}</option>)}</Select>}</FormField>
      </div>
      <FormField label={t('detail.item')} required>{(c) => <Input {...c} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />}</FormField>
      <FormField label={t('insurance.catalog.price')} required>{(c) => <Input {...c} inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />}</FormField>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('insurance.catalog.active')}</label>
    </ActionDialog>
  );
}
