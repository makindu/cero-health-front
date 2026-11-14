import { useState } from 'react';
import { Autocomplete } from '@/components/forms/autocomplete';
import { PatientPicker } from '../_shared/pickers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/tables/data-table';
import { FormField } from '@/components/forms/form-field';
import { DateField, Input, Select, Textarea } from '@/components/forms/controls';
import { Can } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import type { CoverageKind, PatientCoverage, ValidationStatus } from '@/core/pricing/types';
import { ActionDialog } from '../finance/ActionDialog';
import { finance } from '../finance/finance';
import { useFinanceMutation, useMoney, usePatients } from '../finance/use-finance';
import { TabToolbar, ValidationBadge } from './Shared';
import type { FinanceSnapshot } from './types';

type Dlg = { kind: 'create' } | { kind: 'validate'; coverage: PatientCoverage; status: ValidationStatus } | { kind: 'authorize'; coverage: PatientCoverage };

export function CoveragesTab({ data, spent }: { data: FinanceSnapshot; spent: Record<string, number> }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const patients = usePatients();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const name = (id: string) => patients.data?.find((p) => p.id === id)?.fullName ?? id;
  const org = (id: string) => data.organizations.find((o) => o.id === id)?.name ?? id;
  const columns: Column<PatientCoverage>[] = [
    { id: 'patient', header: t('columns.patient'), cell: (c) => name(c.patientId), primary: true },
    { id: 'org', header: t('insurance.contract.organization'), cell: (c) => org(c.organizationId) },
    { id: 'kind', header: t('insurance.cov.kind'), cell: (c) => t(`insurance.covKind.${c.kind}`) },
    { id: 'policy', header: t('insurance.cov.policy'), cell: (c) => <code className="text-xs">{c.policyNumber}</code> },
    { id: 'period', header: t('insurance.contract.period'), cell: (c) => `${c.validFrom} → ${c.validTo}` },
    { id: 'spent', header: t('insurance.cov.spent'), cell: (c) => money(spent[c.id] ?? 0), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (c) => <ValidationBadge status={c.status} /> },
    { id: 'actions', header: '', cell: (c) => (
      <div className="flex flex-wrap gap-1">
        <Can permission={P.insurance.validate}>
          {c.status !== 'validated' && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'validate', coverage: c, status: 'validated' })}>{t('insurance.cov.validate')}</Button>}
          {c.status !== 'rejected' && <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: 'validate', coverage: c, status: 'rejected' })}>{t('insurance.cov.reject')}</Button>}
          {c.status === 'validated' && <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: 'validate', coverage: c, status: 'suspended' })}>{t('insurance.cov.suspend')}</Button>}
        </Can>
        <Can permission={P.insurance.authorize}>{c.status === 'validated' && <Button size="sm" variant="ghost" onClick={() => setDlg({ kind: 'authorize', coverage: c })}>{t('insurance.cov.authorize')}</Button>}</Can>
      </div>
    ) },
  ];
  return (
    <>
      <Can permission={P.insurance.manage}><TabToolbar><Button onClick={() => setDlg({ kind: 'create' })}>{t('insurance.cov.add')}</Button></TabToolbar></Can>
      <DataTable caption={t('insurance.tabs.coverages')} columns={columns} rows={data.coverages} getRowId={(c) => c.id} />
      <p className="mt-2 text-xs text-muted-foreground">{t('insurance.cov.neverConfirmed')}</p>
      {dlg?.kind === 'create' && <CreateCoverage data={data} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'validate' && <ValidateCoverage key={dlg.coverage.id + dlg.status} coverage={dlg.coverage} status={dlg.status} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'authorize' && <AuthorizeCoverage key={dlg.coverage.id} coverage={dlg.coverage} data={data} onClose={() => setDlg(null)} />}
    </>
  );
}

function CreateCoverage({ data, onClose }: { data: FinanceSnapshot; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [v, setV] = useState({ patientId: '', organizationId: data.organizations[0]?.id ?? '', contractId: '', kind: 'insurance' as CoverageKind, policyNumber: '', cardNumber: '', memberNumber: '', validFrom: data.day, validTo: '', priority: '1' });
  const save = useFinanceMutation(finance.createCoverage, { successTitle: t('done.coverageCreated'), onDone: onClose });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const contracts = data.contracts.filter((c) => c.organizationId === v.organizationId);
  const ok = v.patientId && v.contractId && v.policyNumber.trim() && v.validTo >= v.validFrom && v.validTo;
  return (
    <ActionDialog open onClose={onClose} title={t('insurance.cov.add')} description={t('insurance.cov.createHint')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={Boolean(ok)}
      onSubmit={() => save.mutate({ patientId: v.patientId, organizationId: v.organizationId, contractId: v.contractId, kind: v.kind, policyNumber: v.policyNumber.trim(), cardNumber: v.cardNumber.trim(), memberNumber: v.memberNumber.trim(), coverageType: 'standard', validFrom: v.validFrom, validTo: v.validTo, beneficiaryIds: [], documents: [], priority: Number(v.priority) || 1 })}>
      <FormField label={t('columns.patient')} required>{(c) => <PatientPicker {...c} value={v.patientId} onChange={(id) => set('patientId', id)} />}</FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.contract.organization')} required>{(c) => <Select {...c} value={v.organizationId} onChange={(e) => setV({ ...v, organizationId: e.target.value, contractId: '' })}>{data.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.cov.contract')} required>{(c) => <Select {...c} value={v.contractId} onChange={(e) => set('contractId', e.target.value)}><option value="">—</option>{contracts.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.cov.kind')}>{(c) => <Select {...c} value={v.kind} onChange={(e) => set('kind', e.target.value as CoverageKind)}><option value="insurance">{t('insurance.covKind.insurance')}</option><option value="mutuelle">{t('insurance.covKind.mutuelle')}</option></Select>}</FormField>
        <FormField label={t('insurance.cov.priority')} hint={t('insurance.cov.priorityHint')}>{(c) => <Input {...c} inputMode="numeric" value={v.priority} onChange={(e) => set('priority', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.policy')} required>{(c) => <Input {...c} value={v.policyNumber} onChange={(e) => set('policyNumber', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.card')}>{(c) => <Input {...c} value={v.cardNumber} onChange={(e) => set('cardNumber', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.member')}>{(c) => <Input {...c} value={v.memberNumber} onChange={(e) => set('memberNumber', e.target.value)} />}</FormField>
        <span />
        <FormField label={t('insurance.contract.from')} required>{(c) => <DateField {...c} value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <DateField {...c} value={v.validTo} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
      </div>
    </ActionDialog>
  );
}

function ValidateCoverage({ coverage, status, onClose }: { coverage: PatientCoverage; status: ValidationStatus; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const [note, setNote] = useState('');
  const save = useFinanceMutation(finance.validateCoverage, { successTitle: t('done.coverageUpdated'), onDone: onClose });
  const needsNote = status !== 'validated';
  return (
    <ActionDialog open onClose={onClose} title={t(`insurance.cov.${status === 'validated' ? 'validate' : status === 'rejected' ? 'reject' : 'suspend'}`)} description={coverage.policyNumber} submitLabel={t('common.confirm')}
      pending={save.isPending} canSubmit={!needsNote || note.trim().length > 0} onSubmit={() => save.mutate({ coverageId: coverage.id, status, note })}>
      <p className="text-sm text-muted-foreground">{t('insurance.cov.validateHint')}</p>
      <FormField label={t('form.reason')} required={needsNote}>{(c) => <Textarea {...c} value={note} onChange={(e) => setNote(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}

function AuthorizeCoverage({ coverage, data, onClose }: { coverage: PatientCoverage; data: FinanceSnapshot; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const contract = data.contracts.find((c) => c.id === coverage.contractId);
  const codes = [...new Set((contract?.rules ?? []).filter((r) => r.requiresAuthorization && r.itemCode).map((r) => r.itemCode as string))];
  const [itemCode, setItemCode] = useState(codes[0] ?? '');
  const [reference, setReference] = useState('');
  const save = useFinanceMutation(finance.grantAuthorization, { successTitle: t('done.authorization'), onDone: onClose });
  return (
    <ActionDialog open onClose={onClose} title={t('insurance.cov.authorize')} description={coverage.policyNumber} submitLabel={t('common.confirm')} pending={save.isPending} canSubmit={Boolean(itemCode && reference.trim())}
      onSubmit={() => save.mutate({ coverageId: coverage.id, itemCode, patientId: coverage.patientId, reference })}>
      {codes.length === 0 ? <p className="text-sm text-muted-foreground">{t('insurance.cov.noAuthItems')}</p> : (
        <FormField label={t('detail.item')} required>{(c) => <Autocomplete<string> {...c} items={codes} value={itemCode} onChange={setItemCode} getKey={(x) => x} getLabel={(x) => x} getSearch={(x) => x} emptyText={t('module.itemNoMatch')} placeholder={t('module.itemSearchPlaceholder')} />}</FormField>
      )}
      <FormField label={t('insurance.cov.authReference')} required hint={t('insurance.cov.authHint')}>{(c) => <Input {...c} value={reference} onChange={(e) => setReference(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}
