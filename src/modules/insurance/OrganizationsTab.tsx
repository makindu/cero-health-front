import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { Input, Select } from '@/components/forms/controls';
import type { Organization, OrganizationKind } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation } from '../finance/use-finance';
import { TabToolbar } from './Shared';
import type { FinanceSnapshot } from './types';

const KINDS: OrganizationKind[] = ['insurer', 'mutuelle', 'company', 'institution', 'other'];
const STATUSES: Organization['status'][] = ['active', 'suspended', 'inactive'];

export function OrganizationsTab({ data, canManage }: { data: FinanceSnapshot; canManage: boolean }) {
  const { t } = useTranslation('finance');
  const [editing, setEditing] = useState<Organization | 'new' | null>(null);
  const columns: Column<Organization>[] = [
    { id: 'name', header: t('insurance.org.name'), cell: (o) => o.name, primary: true },
    { id: 'code', header: t('insurance.org.code'), cell: (o) => o.code },
    { id: 'kind', header: t('insurance.org.kind'), cell: (o) => t(`insurance.orgKind.${o.kind}`) },
    { id: 'status', header: t('columns.status'), cell: (o) => <StatusBadge tone={o.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.orgStatus.${o.status}`)}</StatusBadge> },
    { id: 'contact', header: t('insurance.org.contact'), cell: (o) => o.contactPerson },
    ...(canManage ? [{ id: 'edit', header: '', cell: (o: Organization) => <Button size="sm" variant="outline" onClick={() => setEditing(o)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <>
      {canManage && <TabToolbar><Button onClick={() => setEditing('new')}>{t('insurance.org.add')}</Button></TabToolbar>}
      <DataTable caption={t('insurance.tabs.organizations')} columns={columns} rows={data.organizations} getRowId={(o) => o.id} />
      {editing && <OrgForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function OrgForm({ initial, onClose }: { initial: Organization | null; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({ name: initial?.name ?? '', code: initial?.code ?? '', kind: initial?.kind ?? 'insurer', contactPerson: initial?.contactPerson ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '', status: initial?.status ?? 'active', conditions: initial?.conditions ?? '' });
  const save = useFinanceMutation(finance.saveOrganization, { successTitle: t('done.saved'), onDone: onClose });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const ok = v.name.trim().length >= 2 && v.code.trim().length >= 2;
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.org.edit') : t('insurance.org.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={ok}
      onSubmit={() => save.mutate({ id: initial?.id ?? `org-${globalThis.crypto.randomUUID().slice(0, 8)}`, validFrom: initial?.validFrom ?? '2020-01-01', validTo: initial?.validTo, ...v, name: v.name.trim(), code: v.code.trim().toUpperCase() })}>
      <FormField label={t('insurance.org.name')} required>{(c) => <Input {...c} value={v.name} onChange={(e) => set('name', e.target.value)} />}</FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.org.code')} required>{(c) => <Input {...c} value={v.code} onChange={(e) => set('code', e.target.value)} />}</FormField>
        <FormField label={t('insurance.org.kind')}>{(c) => <Select {...c} value={v.kind} onChange={(e) => set('kind', e.target.value as OrganizationKind)}>{KINDS.map((k) => <option key={k} value={k}>{t(`insurance.orgKind.${k}`)}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.org.contact')}>{(c) => <Input {...c} value={v.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />}</FormField>
        <FormField label={t('insurance.org.phone')}>{(c) => <Input {...c} value={v.phone} onChange={(e) => set('phone', e.target.value)} />}</FormField>
        <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value as Organization['status'])}>{STATUSES.map((k) => <option key={k} value={k}>{t(`insurance.orgStatus.${k}`)}</option>)}</Select>}</FormField>
      </div>
    </ActionDialog>
  );
}
