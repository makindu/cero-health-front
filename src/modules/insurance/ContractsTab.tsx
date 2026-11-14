import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select } from '@/components/forms/controls';
import { SERVICE_CATEGORIES, type Contract, type ContractRule } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useMoney } from '../finance/use-finance';
import { TabToolbar, fromMinor, pct, toMinor } from './Shared';
import type { FinanceSnapshot } from './types';

export function ContractsTab({ data, canManage }: { data: FinanceSnapshot; canManage: boolean }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const [editing, setEditing] = useState<Contract | 'new' | null>(null);
  const orgName = (id: string) => data.organizations.find((o) => o.id === id)?.name ?? id;
  const general = (c: Contract) => c.rules.find((r) => !r.category && !r.itemCode);
  const columns: Column<Contract>[] = [
    { id: 'label', header: t('insurance.contract.label'), cell: (c) => c.label, primary: true },
    { id: 'org', header: t('insurance.contract.organization'), cell: (c) => orgName(c.organizationId) },
    { id: 'period', header: t('insurance.contract.period'), cell: (c) => `${c.validFrom} → ${c.validTo}` },
    { id: 'rate', header: t('insurance.contract.generalRate'), cell: (c) => (general(c) ? pct(general(c)!.coverageBp) : '—') },
    { id: 'limits', header: t('insurance.contract.limits'), cell: (c) => [c.franchisePerEpisode ? `${t('insurance.contract.franchise')} ${money(c.franchisePerEpisode)}` : '', c.ceilingPerEpisode ? `${t('insurance.contract.ceiling')} ${money(c.ceilingPerEpisode)}` : ''].filter(Boolean).join(' · ') || '—' },
    { id: 'coord', header: t('insurance.contract.coordination'), cell: (c) => [c.allowsComplementary ? t('insurance.contract.allowsComplementary') : '', c.canBeComplementary ? t('insurance.contract.canBeComplementary') : ''].filter(Boolean).join(' · ') || t('insurance.contract.exclusive') },
    { id: 'status', header: t('columns.status'), cell: (c) => <StatusBadge tone={c.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.contractStatus.${c.status}`)}</StatusBadge> },
    ...(canManage ? [{ id: 'edit', header: '', cell: (c: Contract) => <Button size="sm" variant="outline" onClick={() => setEditing(c)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <>
      {canManage && <TabToolbar><Button onClick={() => setEditing('new')}>{t('insurance.contract.add')}</Button></TabToolbar>}
      <DataTable caption={t('insurance.tabs.contracts')} columns={columns} rows={data.contracts} getRowId={(c) => c.id} />
      <p className="mt-2 text-xs text-muted-foreground">{t('insurance.contract.editHint')}</p>
      {editing && <ContractForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} data={data} onClose={() => setEditing(null)} />}
    </>
  );
}

interface RuleDraft { scope: string; rate: string; negotiated: string; excluded: boolean; auth: boolean; ceilingLine: string; quota: string }

const ruleToDraft = (r: ContractRule): RuleDraft => ({
  scope: r.itemCode ? `item:${r.itemCode}` : r.category ? `cat:${r.category}` : 'general', rate: String(r.coverageBp / 100), negotiated: fromMinor(r.negotiatedUnit),
  excluded: Boolean(r.excluded), auth: Boolean(r.requiresAuthorization), ceilingLine: fromMinor(r.ceilingPerLine), quota: r.quota === undefined ? '' : String(r.quota),
});
const draftToRule = (d: RuleDraft): ContractRule => ({
  ...(d.scope.startsWith('item:') ? { itemCode: d.scope.slice(5) } : d.scope.startsWith('cat:') ? { category: d.scope.slice(4) as ContractRule['category'] } : {}),
  coverageBp: d.excluded ? 0 : Math.round(Number(d.rate.replace(',', '.')) * 100),
  excluded: d.excluded || undefined, requiresAuthorization: d.auth || undefined,
  negotiatedUnit: d.negotiated.trim() ? toMinor(d.negotiated) : undefined, ceilingPerLine: d.ceilingLine.trim() ? toMinor(d.ceilingLine) : undefined,
  quota: d.quota.trim() ? Number(d.quota) : undefined,
});

function ContractForm({ initial, data, onClose }: { initial: Contract | null; data: FinanceSnapshot; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({
    organizationId: initial?.organizationId ?? data.organizations[0]?.id ?? '', label: initial?.label ?? '', validFrom: initial?.validFrom ?? data.day, validTo: initial?.validTo ?? '',
    status: initial?.status ?? 'active', franchise: fromMinor(initial?.franchisePerEpisode), ceiling: fromMinor(initial?.ceilingPerEpisode),
    allowsComplementary: initial?.allowsComplementary ?? false, canBeComplementary: initial?.canBeComplementary ?? false, conditions: initial?.conditions ?? '',
  });
  const [rules, setRules] = useState<RuleDraft[]>(initial ? initial.rules.map(ruleToDraft) : [{ scope: 'general', rate: '80', negotiated: '', excluded: false, auth: false, ceilingLine: '', quota: '' }]);
  const save = useFinanceMutation(finance.saveContract, { successTitle: t('done.saved'), onDone: onClose });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const setRule = (i: number, patch: Partial<RuleDraft>) => setRules(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const ok = v.label.trim().length > 1 && v.organizationId && v.validTo >= v.validFrom && v.validTo !== '' && rules.every((r) => r.excluded || (Number(r.rate.replace(',', '.')) >= 0 && Number(r.rate.replace(',', '.')) <= 100));
  const scopes = [{ value: 'general', label: t('insurance.contract.scopeGeneral') }, ...SERVICE_CATEGORIES.map((c) => ({ value: `cat:${c}`, label: t(`category.${c}`) })), ...data.catalog.map((i) => ({ value: `item:${i.code}`, label: i.label }))];
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.contract.edit') : t('insurance.contract.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={Boolean(ok)}
      onSubmit={() => save.mutate({
        id: initial?.id ?? `ctr-${globalThis.crypto.randomUUID().slice(0, 8)}`, organizationId: v.organizationId, label: v.label.trim(), currency: initial?.currency ?? data.catalog[0]?.price.currency ?? 'USD',
        validFrom: v.validFrom, validTo: v.validTo, status: v.status, rules: rules.map(draftToRule), franchisePerEpisode: v.franchise.trim() ? toMinor(v.franchise) : undefined,
        ceilingPerEpisode: v.ceiling.trim() ? toMinor(v.ceiling) : undefined, allowsComplementary: v.allowsComplementary, canBeComplementary: v.canBeComplementary, conditions: v.conditions.trim() || undefined,
      })}>
      <FormField label={t('insurance.contract.organization')} required>{(c) => <Select {...c} value={v.organizationId} onChange={(e) => set('organizationId', e.target.value)}>{data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</FormField>
      <FormField label={t('insurance.contract.label')} required>{(c) => <Input {...c} value={v.label} onChange={(e) => set('label', e.target.value)} />}</FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('insurance.contract.from')} required>{(c) => <DateField {...c} value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <DateField {...c} value={v.validTo} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
        <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value as Contract['status'])}>{(['active', 'suspended', 'terminated'] as const).map((s) => <option key={s} value={s}>{t(`insurance.contractStatus.${s}`)}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.contract.franchise')}>{(c) => <Input {...c} inputMode="decimal" value={v.franchise} onChange={(e) => set('franchise', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.ceiling')}>{(c) => <Input {...c} inputMode="decimal" value={v.ceiling} onChange={(e) => set('ceiling', e.target.value)} />}</FormField>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.allowsComplementary} onChange={(e) => set('allowsComplementary', e.target.checked)} />{t('insurance.contract.allowsComplementary')}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.canBeComplementary} onChange={(e) => set('canBeComplementary', e.target.checked)} />{t('insurance.contract.canBeComplementary')}</label>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('insurance.contract.rules')}</legend>
        <p className="text-xs text-muted-foreground">{t('insurance.contract.rulesHint')}</p>
        {rules.map((r, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
              <FormField label={t('insurance.contract.scope')}>{(c) => <Select {...c} value={r.scope} onChange={(e) => setRule(i, { scope: e.target.value })}>{scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select>}</FormField>
              <FormField label={t('insurance.contract.rate')}>{(c) => <Input {...c} inputMode="decimal" disabled={r.excluded} value={r.rate} onChange={(e) => setRule(i, { rate: e.target.value })} />}</FormField>
              <Button variant="ghost" size="icon" aria-label={t('insurance.contract.removeRule')} disabled={rules.length === 1} className="self-end" onClick={() => setRules(rules.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField label={t('insurance.contract.negotiated')}>{(c) => <Input {...c} inputMode="decimal" value={r.negotiated} onChange={(e) => setRule(i, { negotiated: e.target.value })} />}</FormField>
              <FormField label={t('insurance.contract.ceilingLine')}>{(c) => <Input {...c} inputMode="decimal" value={r.ceilingLine} onChange={(e) => setRule(i, { ceilingLine: e.target.value })} />}</FormField>
              <FormField label={t('insurance.contract.quota')}>{(c) => <Input {...c} inputMode="numeric" value={r.quota} onChange={(e) => setRule(i, { quota: e.target.value })} />}</FormField>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={r.excluded} onChange={(e) => setRule(i, { excluded: e.target.checked })} />{t('insurance.contract.excluded')}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={r.auth} onChange={(e) => setRule(i, { auth: e.target.checked })} />{t('insurance.contract.requiresAuth')}</label>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setRules([...rules, { scope: 'general', rate: '80', negotiated: '', excluded: false, auth: false, ceilingLine: '', quota: '' }])}>{t('insurance.contract.addRule')}</Button>
      </fieldset>
    </ActionDialog>
  );
}
