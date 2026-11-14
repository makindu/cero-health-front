import { useState } from 'react';
import { MultiPatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select } from '@/components/forms/controls';
import { money as makeMoney } from '@/core/money/money';
import { SERVICE_CATEGORIES, type ServiceCategory, type Subscription } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useMoney } from '../finance/use-finance';
import { TabToolbar, fromMinor, toMinor } from './Shared';
import type { FinanceSnapshot } from './types';

export function SubscriptionsTab({ data, canManage }: { data: FinanceSnapshot; canManage: boolean }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const columns: Column<Subscription>[] = [
    { id: 'holder', header: t('insurance.sub.holder'), cell: (s) => s.holderName, primary: true },
    { id: 'type', header: t('insurance.sub.type'), cell: (s) => t(`insurance.subType.${s.type}`) },
    { id: 'members', header: t('insurance.sub.members'), cell: (s) => s.patientIds.length },
    { id: 'price', header: t('insurance.sub.price'), cell: (s) => money(s.price.minor, s.price.currency), className: 'text-end tabular-nums' },
    { id: 'period', header: t('insurance.contract.period'), cell: (s) => `${s.validFrom} → ${s.validTo}` },
    { id: 'free', header: t('insurance.sub.free'), cell: (s) => s.freeConsultations ?? 0 },
    { id: 'status', header: t('columns.status'), cell: (s) => <StatusBadge tone={s.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.subStatus.${s.status}`)}</StatusBadge> },
    ...(canManage ? [{ id: 'edit', header: '', cell: (s: Subscription) => <Button size="sm" variant="outline" onClick={() => setEditing(s)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <>
      {canManage && <TabToolbar><Button onClick={() => setEditing('new')}>{t('insurance.sub.add')}</Button></TabToolbar>}
      <DataTable caption={t('insurance.tabs.subscriptions')} columns={columns} rows={data.subscriptions} getRowId={(s) => s.id} />
      <p className="mt-2 text-xs text-muted-foreground">{t('insurance.sub.notFullCover')}</p>
      {editing && <SubscriptionForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} />}
    </>
  );
}

function SubscriptionForm({ initial, data, onClose }: { initial: Subscription | null; data: FinanceSnapshot; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const currency = data.catalog[0]?.price.currency ?? 'USD';
  const [v, setV] = useState({
    type: initial?.type ?? 'individual', holderName: initial?.holderName ?? '', patientIds: initial?.patientIds ?? ([] as string[]), price: fromMinor(initial?.price.minor),
    validFrom: initial?.validFrom ?? data.day, validTo: initial?.validTo ?? '', status: initial?.status ?? 'active', free: String(initial?.freeConsultations ?? 0),
    labDiscount: String((initial?.discounts.laboratory ?? 0) / 100), included: initial?.includedCategories ?? ([] as ServiceCategory[]),
  });
  const save = useFinanceMutation(finance.saveSubscription, { successTitle: t('done.saved'), onDone: onClose });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const ok = v.holderName.trim() && v.patientIds.length > 0 && v.validTo >= v.validFrom && v.validTo && Number(v.price.replace(',', '.')) >= 0;
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.sub.edit') : t('insurance.sub.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={Boolean(ok)}
      onSubmit={() => save.mutate({
        id: initial?.id ?? `sub-${globalThis.crypto.randomUUID().slice(0, 8)}`, type: v.type, holderName: v.holderName.trim(), patientIds: v.patientIds, price: makeMoney(toMinor(v.price || '0'), currency),
        validFrom: v.validFrom, validTo: v.validTo, status: v.status, freeConsultations: Number(v.free) || 0,
        discounts: Number(v.labDiscount) > 0 ? { laboratory: Math.round(Number(v.labDiscount.replace(',', '.')) * 100) } : {}, includedCategories: v.included,
      })}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.sub.holder')} required>{(c) => <Input {...c} value={v.holderName} onChange={(e) => set('holderName', e.target.value)} />}</FormField>
        <FormField label={t('insurance.sub.type')}>{(c) => <Select {...c} value={v.type} onChange={(e) => set('type', e.target.value as Subscription['type'])}>{(['individual', 'family', 'company'] as const).map((x) => <option key={x} value={x}>{t(`insurance.subType.${x}`)}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.sub.price')}>{(c) => <Input {...c} inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />}</FormField>
        <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value as Subscription['status'])}>{(['active', 'suspended', 'cancelled'] as const).map((x) => <option key={x} value={x}>{t(`insurance.subStatus.${x}`)}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.contract.from')} required>{(c) => <DateField {...c} value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <DateField {...c} value={v.validTo} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
        <FormField label={t('insurance.sub.free')}>{(c) => <Input {...c} inputMode="numeric" value={v.free} onChange={(e) => set('free', e.target.value)} />}</FormField>
        <FormField label={t('insurance.sub.labDiscount')}>{(c) => <Input {...c} inputMode="decimal" value={v.labDiscount} onChange={(e) => set('labDiscount', e.target.value)} />}</FormField>
      </div>
      <FormField label={t('insurance.sub.members')} required hint={t('insurance.sub.membersHint')}>
        {(c) => <MultiPatientPicker {...c} value={v.patientIds} onChange={(ids) => set('patientIds', ids)} />}
      </FormField>
      <fieldset><legend className="text-sm font-medium">{t('insurance.sub.included')}</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">{SERVICE_CATEGORIES.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={v.included.includes(c)} onChange={(e) => set('included', e.target.checked ? [...v.included, c] : v.included.filter((x) => x !== c))} />{t(`category.${c}`)}</label>)}</div>
      </fieldset>
    </ActionDialog>
  );
}
