import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { dayOf } from '../billing/billing-rules';
import { ActionDialog } from '../finance/ActionDialog';
import { useMoney } from '../finance/use-finance';
import { ApiMembersPicker, usePatientLabel } from './ApiMembersPicker';
import { apiInsurance, type ApiContract, type ApiCoverage, type ApiOrganization, type ApiRule, type ApiSubscription } from './insurance-api';
import { PatientCombobox } from '../_shared/patient-combobox';
import type { ValidationStatus } from '@/core/pricing/types';
import { ValidationBadge } from './Shared';
import {
  CATEGORIES, COVERAGE_KINDS, CONTRACT_STATUSES, allowedDecisions, authorizationCodeOk, coverageBody, decisionOk, SUB_STATUSES, SUB_TYPES, blankRule, bpToPercent, contractBody, minorToText, subscriptionBody,
  type ContractDraft, type CoverageDraft, type RuleDraft, type SubscriptionDraft,
} from './insurance-rules';

const CATEGORY_LABEL: Record<string, string> = {
  consultation: 'Consultation', laboratory: 'Laboratoire', pharmacy: 'Pharmacie', hospitalization: 'Hospitalisation', room: 'Chambre', procedure: 'Acte', nursing: 'Soins infirmiers', consumable: 'Consommable',
};
const STATUS_LABEL: Record<string, string> = { active: 'Actif', suspended: 'Suspendu', terminated: 'Résilié', cancelled: 'Résilié' };
const TYPE_LABEL: Record<string, string> = { individual: 'Individuel', family: 'Famille', company: 'Entreprise' };

function useSaveFeedback(): { done: () => void; fail: (e: unknown) => void } {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return {
    done: () => { toast({ tone: 'success', title: t('done.saved') }); void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance') }); },
    fail: (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') }),
  };
}

// ------------------------------------------------------------------ contrats

export function ContractsApiTab({ organizations }: { organizations: ApiOrganization[] }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [editing, setEditing] = useState<ApiContract | 'new' | null>(null);
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'contracts'), queryFn: () => apiInsurance.contracts() });
  const canManage = can(P.insurance.manage);
  const orgName = (id: string): string => organizations.find((o) => o.id === id)?.name ?? `#${id}`;
  const general = (c: ApiContract): ApiRule | undefined => c.rules.find((r) => !r.category && !r.itemCode);
  const columns: Column<ApiContract>[] = [
    { id: 'label', header: t('insurance.contract.label'), cell: (c) => c.label, primary: true },
    { id: 'org', header: t('insurance.contract.organization'), cell: (c) => orgName(c.organizationId) },
    { id: 'period', header: t('insurance.contract.period'), cell: (c) => `${c.validFrom} → ${c.validTo}` },
    { id: 'rate', header: t('insurance.contract.generalRate'), cell: (c) => { const g = general(c); return g ? `${bpToPercent(g.coverageBp)} %` : '—'; } },
    { id: 'limits', header: t('insurance.contract.limits'), cell: (c) => [c.franchiseMinor !== null ? `${t('insurance.contract.franchise')} ${money(c.franchiseMinor, c.currency)}` : '', c.ceilingMinor !== null ? `${t('insurance.contract.ceiling')} ${money(c.ceilingMinor, c.currency)}` : ''].filter(Boolean).join(' · ') || '—' },
    { id: 'status', header: t('columns.status'), cell: (c) => <StatusBadge tone={c.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.contractStatus.${c.status}`, { defaultValue: STATUS_LABEL[c.status] ?? c.status })}</StatusBadge> },
    ...(canManage ? [{ id: 'edit', header: '', cell: (c: ApiContract) => <Button size="sm" variant="outline" onClick={() => setEditing(c)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing('new')} disabled={organizations.length === 0}>{t('insurance.contract.add')}</Button></div>}
      <DataTable caption={t('insurance.tabs.contracts')} columns={columns} rows={list.data ?? []} getRowId={(c) => c.id} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} />
      <p className="text-xs text-muted-foreground">{t('insurance.contract.editHint')}</p>
      {editing && <ContractForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} organizations={organizations} onClose={() => setEditing(null)} />}
    </div>
  );
}

const draftOfRule = (r: ApiRule, currency: string): RuleDraft => ({
  category: r.category, itemCode: r.itemCode, rate: bpToPercent(r.coverageBp), negotiated: minorToText(r.negotiatedUnitMinor, currency), ceilingLine: minorToText(r.ceilingPerLineMinor, currency),
  quota: r.quota === null ? '' : String(r.quota), excluded: r.excluded, auth: r.requiresAuthorization,
});

function ContractForm({ initial, organizations, onClose }: { initial: ApiContract | null; organizations: ApiOrganization[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const fb = useSaveFeedback();
  const currency0 = initial?.currency ?? 'USD';
  const [v, setV] = useState<ContractDraft>({
    organizationId: initial?.organizationId ?? organizations[0]?.id ?? '', label: initial?.label ?? '', currency: currency0, validFrom: initial?.validFrom || dayOf(new Date()), validTo: initial?.validTo ?? '',
    status: initial?.status ?? 'active', franchise: minorToText(initial?.franchiseMinor ?? null, currency0), ceiling: minorToText(initial?.ceilingMinor ?? null, currency0),
    allowsComplementary: initial?.allowsComplementary ?? false, canBeComplementary: initial?.canBeComplementary ?? false, conditions: initial?.conditions ?? '',
  });
  const [rules, setRules] = useState<RuleDraft[]>(initial ? initial.rules.map((r) => draftOfRule(r, currency0)) : [blankRule()]);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof ContractDraft>(k: K, value: ContractDraft[K]) => setV({ ...v, [k]: value });
  const setRule = (i: number, patch: Partial<RuleDraft>) => { setTouched(true); setRules(rules.map((r, k) => (k === i ? { ...r, ...patch } : r))); };
  const body = contractBody(v, rules, touched, initial === null);
  const save = useMutation({ mutationFn: () => apiInsurance.saveContract(initial?.id ?? null, body ?? {}), onSuccess: () => { fb.done(); onClose(); }, onError: fb.fail });
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.contract.edit') : t('insurance.contract.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={body !== null} onSubmit={() => save.mutate()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.contract.organization')} required>
          {(c) => <Select {...c} value={v.organizationId} disabled={initial !== null} onChange={(e) => set('organizationId', e.target.value)}>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}
        </FormField>
        <FormField label={t('apiInsurance.currency', { defaultValue: 'Devise' })} required>
          {(c) => <Input {...c} value={v.currency} maxLength={3} disabled={initial !== null} onChange={(e) => set('currency', e.target.value.toUpperCase())} />}
        </FormField>
      </div>
      <FormField label={t('insurance.contract.label')} required>{(c) => <Input {...c} value={v.label} maxLength={120} onChange={(e) => set('label', e.target.value)} />}</FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label={t('insurance.contract.from')} required>{(c) => <Input {...c} type="date" value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <Input {...c} type="date" value={v.validTo} min={v.validFrom} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
        {initial && <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value)}>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{t(`insurance.contractStatus.${s}`, { defaultValue: STATUS_LABEL[s] })}</option>)}</Select>}</FormField>}
        <FormField label={t('insurance.contract.franchise')}>{(c) => <Input {...c} inputMode="decimal" value={v.franchise} onChange={(e) => set('franchise', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.ceiling')}>{(c) => <Input {...c} inputMode="decimal" value={v.ceiling} onChange={(e) => set('ceiling', e.target.value)} />}</FormField>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.allowsComplementary} onChange={(e) => set('allowsComplementary', e.target.checked)} />{t('insurance.contract.allowsComplementary')}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.canBeComplementary} onChange={(e) => set('canBeComplementary', e.target.checked)} />{t('insurance.contract.canBeComplementary')}</label>
      </div>
      <FormField label={t('apiInsurance.conditions', { defaultValue: 'Conditions' })}>{(c) => <Textarea {...c} value={v.conditions} maxLength={1000} onChange={(e) => set('conditions', e.target.value)} />}</FormField>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('insurance.contract.rules')}</legend>
        <p className="text-xs text-muted-foreground">{t('insurance.contract.rulesHint')}</p>
        {rules.map((r, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
              <FormField label={t('insurance.contract.scope')}>
                {(c) => <Select {...c} value={r.category} onChange={(e) => setRule(i, { category: e.target.value })}><option value="">{t('insurance.contract.scopeGeneral')}</option>{CATEGORIES.map((k) => <option key={k} value={k}>{t(`category.${k}`, { defaultValue: CATEGORY_LABEL[k] })}</option>)}</Select>}
              </FormField>
              <FormField label={t('apiInsurance.itemCode', { defaultValue: 'Code de prestation' })}>{(c) => <Input {...c} value={r.itemCode} maxLength={40} onChange={(e) => setRule(i, { itemCode: e.target.value })} />}</FormField>
              <FormField label={t('insurance.contract.rate')}>{(c) => <Input {...c} inputMode="decimal" disabled={r.excluded} value={r.rate} onChange={(e) => setRule(i, { rate: e.target.value })} />}</FormField>
              <Button variant="ghost" size="icon" aria-label={t('insurance.contract.removeRule')} disabled={rules.length === 1} className="self-end" onClick={() => { setTouched(true); setRules(rules.filter((_, k) => k !== i)); }}><Trash2 className="size-4" /></Button>
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
        <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => { setTouched(true); setRules([...rules, blankRule()]); }}>{t('insurance.contract.addRule')}</Button>
      </fieldset>
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ abonnements

export function SubscriptionsApiTab() {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [editing, setEditing] = useState<ApiSubscription | 'new' | null>(null);
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'subscriptions'), queryFn: () => apiInsurance.subscriptions() });
  const canManage = can(P.insurance.manage);
  const columns: Column<ApiSubscription>[] = [
    { id: 'holder', header: t('insurance.sub.holder'), cell: (s) => s.holderName, primary: true },
    { id: 'type', header: t('insurance.sub.type'), cell: (s) => t(`insurance.subType.${s.type}`, { defaultValue: TYPE_LABEL[s.type] ?? s.type }) },
    { id: 'members', header: t('insurance.sub.members'), cell: (s) => s.patientIds.length },
    { id: 'price', header: t('insurance.sub.price'), cell: (s) => money(s.priceMinor, s.currency), className: 'text-end tabular-nums' },
    { id: 'period', header: t('insurance.contract.period'), cell: (s) => `${s.validFrom} → ${s.validTo}` },
    { id: 'free', header: t('insurance.sub.free'), cell: (s) => s.freeConsultations ?? 0 },
    { id: 'status', header: t('columns.status'), cell: (s) => <StatusBadge tone={s.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.subStatus.${s.status}`, { defaultValue: STATUS_LABEL[s.status] ?? s.status })}</StatusBadge> },
    ...(canManage ? [{ id: 'edit', header: '', cell: (s: ApiSubscription) => <Button size="sm" variant="outline" onClick={() => setEditing(s)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing('new')}>{t('insurance.sub.add')}</Button></div>}
      <DataTable caption={t('insurance.tabs.subscriptions')} columns={columns} rows={list.data ?? []} getRowId={(s) => s.id} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} />
      <p className="text-xs text-muted-foreground">{t('insurance.sub.notFullCover')}</p>
      {editing && <SubscriptionForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SubscriptionForm({ initial, onClose }: { initial: ApiSubscription | null; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const fb = useSaveFeedback();
  const currency0 = initial?.currency ?? 'USD';
  const { laboratory, ...otherDiscounts } = initial?.discounts ?? {};
  const [v, setV] = useState<SubscriptionDraft>({
    type: initial?.type ?? 'individual', holderName: initial?.holderName ?? '', patientIds: initial?.patientIds ?? [], price: minorToText(initial?.priceMinor ?? null, currency0), currency: currency0,
    validFrom: initial?.validFrom || dayOf(new Date()), validTo: initial?.validTo ?? '', status: initial?.status ?? 'active', free: initial === null ? '0' : initial.freeConsultations === null ? '' : String(initial.freeConsultations),
    labDiscount: laboratory ? bpToPercent(laboratory) : '', included: initial?.includedCategories ?? [],
  });
  const set = <K extends keyof SubscriptionDraft>(k: K, value: SubscriptionDraft[K]) => setV({ ...v, [k]: value });
  const body = subscriptionBody(v, otherDiscounts, initial === null);
  const save = useMutation({ mutationFn: () => apiInsurance.saveSubscription(initial?.id ?? null, body ?? {}), onSuccess: () => { fb.done(); onClose(); }, onError: fb.fail });
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.sub.edit') : t('insurance.sub.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={body !== null} onSubmit={() => save.mutate()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.sub.holder')} required>{(c) => <Input {...c} value={v.holderName} maxLength={120} onChange={(e) => set('holderName', e.target.value)} />}</FormField>
        <FormField label={t('insurance.sub.type')}>{(c) => <Select {...c} value={v.type} disabled={initial !== null} onChange={(e) => set('type', e.target.value)}>{SUB_TYPES.map((x) => <option key={x} value={x}>{t(`insurance.subType.${x}`, { defaultValue: TYPE_LABEL[x] })}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.sub.price')} required>{(c) => <Input {...c} inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} />}</FormField>
        <FormField label={t('apiInsurance.currency', { defaultValue: 'Devise' })} required>{(c) => <Input {...c} value={v.currency} maxLength={3} disabled={initial !== null} onChange={(e) => set('currency', e.target.value.toUpperCase())} />}</FormField>
        <FormField label={t('insurance.contract.from')} required>{(c) => <Input {...c} type="date" value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <Input {...c} type="date" value={v.validTo} min={v.validFrom} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
        {initial && <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value)}>{SUB_STATUSES.map((x) => <option key={x} value={x}>{t(`insurance.subStatus.${x}`, { defaultValue: STATUS_LABEL[x] })}</option>)}</Select>}</FormField>}
        <FormField label={t('insurance.sub.free')}>{(c) => <Input {...c} inputMode="numeric" value={v.free} onChange={(e) => set('free', e.target.value)} />}</FormField>
        <FormField label={t('insurance.sub.labDiscount')}>{(c) => <Input {...c} inputMode="decimal" value={v.labDiscount} onChange={(e) => set('labDiscount', e.target.value)} />}</FormField>
      </div>
      <FormField label={t('insurance.sub.members')} required>{(c) => <ApiMembersPicker id={c.id} value={v.patientIds} onChange={(ids) => set('patientIds', ids)} />}</FormField>
      <fieldset><legend className="text-sm font-medium">{t('insurance.sub.included')}</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">{CATEGORIES.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={v.included.includes(c)} onChange={(e) => set('included', e.target.checked ? [...v.included, c] : v.included.filter((x) => x !== c))} />{t(`category.${c}`, { defaultValue: CATEGORY_LABEL[c] })}</label>)}</div>
      </fieldset>
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ couvertures des patients

const KIND_LABEL: Record<string, string> = { insurance: 'Assurance', mutuelle: 'Mutuelle' };
const DECISION_LABEL: Record<string, string> = { validated: 'Valider', rejected: 'Rejeter', suspended: 'Suspendre' };

export function CoveragesApiTab({ organizations }: { organizations: ApiOrganization[] }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const [typed, setTyped] = useState('');
  const patientId = /^\d+$/.test(typed) ? typed : '';
  const patient = usePatientLabel(patientId);
  const [editing, setEditing] = useState<ApiCoverage | 'new' | null>(null);
  const [deciding, setDeciding] = useState<ApiCoverage | null>(null);
  const [authFor, setAuthFor] = useState<ApiCoverage | null>(null);
  const enabled = patientId !== '' && patient.found;
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'coverages', patientId), queryFn: () => apiInsurance.coverages(patientId), enabled });
  const contracts = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'contracts'), queryFn: () => apiInsurance.contracts() });
  const canManage = can(P.insurance.manage);
  const canValidate = can(P.insurance.validate);
  const orgName = (id: string): string => organizations.find((o) => o.id === id)?.name ?? `#${id}`;
  const contractOf = (id: string): ApiContract | undefined => contracts.data?.find((c) => c.id === id);
  const columns: Column<ApiCoverage>[] = [
    { id: 'org', header: t('insurance.contract.organization'), cell: (c) => orgName(c.organizationId), primary: true },
    { id: 'contract', header: t('insurance.cov.contract'), cell: (c) => contractOf(c.contractId)?.label ?? `#${c.contractId}` },
    { id: 'kind', header: t('insurance.cov.kind'), cell: (c) => t(`insurance.covKind.${c.kind}`, { defaultValue: KIND_LABEL[c.kind] ?? c.kind }) },
    { id: 'card', header: t('insurance.cov.card'), cell: (c) => c.cardNumber || c.policyNumber || c.memberNumber || '—' },
    { id: 'period', header: t('insurance.contract.period'), cell: (c) => `${c.validFrom} → ${c.validTo}` },
    { id: 'ceiling', header: t('insurance.contract.ceiling'), cell: (c) => (c.ceilingRemainingMinor === null ? '—' : money(c.ceilingRemainingMinor, contractOf(c.contractId)?.currency ?? 'USD')), className: 'text-end tabular-nums' },
    { id: 'priority', header: t('insurance.cov.priority'), cell: (c) => c.priority },
    { id: 'status', header: t('columns.status'), cell: (c) => <ValidationBadge status={c.status as ValidationStatus} /> },
    { id: 'actions', header: '', cell: (c) => (
      <div className="flex flex-wrap justify-end gap-2">
        {canValidate && allowedDecisions(c.status).length > 0 && <Button size="sm" variant="outline" onClick={() => setDeciding(c)}>{t('apiInsurance.decide', { defaultValue: 'Décider…' })}</Button>}
        <Button size="sm" variant="outline" onClick={() => setAuthFor(c)}>{t('insurance.cov.authorize')}</Button>
        {canManage && <Button size="sm" variant="outline" onClick={() => setEditing(c)}>{t('common.edit')}</Button>}
      </div>
    ) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80 max-w-full">
          <FormField label={t('columns.patient')} hint={enabled ? patient.label : undefined}>
            {(c) => <PatientCombobox id={c.id} aria-describedby={c['aria-describedby']} onValueChange={setTyped} />}
          </FormField>
        </div>
        {canManage && <Button className="ms-auto" disabled={!enabled || organizations.length === 0} onClick={() => setEditing('new')}>{t('insurance.cov.add')}</Button>}
      </div>
      {!enabled && <p className="text-sm text-muted-foreground">{t('apiInsurance.pickPatient', { defaultValue: 'Choisissez un patient pour voir ses couvertures.' })}</p>}
      {enabled && <DataTable caption={t('insurance.tabs.coverages')} columns={columns} rows={list.data ?? []} getRowId={(c) => c.id} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}
        emptyTitle={t('apiInsurance.noCoverage', { defaultValue: 'Aucune couverture pour ce patient' })} />}
      <p className="text-xs text-muted-foreground">{t('insurance.cov.neverConfirmed')}</p>
      {editing && enabled && <CoverageForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} patientId={patientId} organizations={organizations} contracts={contracts.data ?? []} onClose={() => setEditing(null)} />}
      {deciding && <DecisionDialog coverage={deciding} onClose={() => setDeciding(null)} />}
      {authFor && <AuthorizationsDialog coverage={authFor} canGrant={can(P.insurance.authorize)} onClose={() => setAuthFor(null)} />}
    </div>
  );
}

function CoverageForm({ initial, patientId, organizations, contracts, onClose }: { initial: ApiCoverage | null; patientId: string; organizations: ApiOrganization[]; contracts: ApiContract[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const fb = useSaveFeedback();
  const [v, setV] = useState<CoverageDraft>(() => {
    const org = initial?.organizationId ?? organizations[0]?.id ?? '';
    const cur = contracts.find((c) => c.id === initial?.contractId)?.currency ?? 'USD';
    return {
      organizationId: org, contractId: initial?.contractId ?? contracts.find((c) => c.organizationId === org && c.status === 'active')?.id ?? '', kind: initial?.kind ?? 'insurance',
      validFrom: initial?.validFrom || dayOf(new Date()), validTo: initial?.validTo ?? '', policy: initial?.policyNumber ?? '', card: initial?.cardNumber ?? '', member: initial?.memberNumber ?? '',
      coverageType: initial?.coverageType ?? '', ceilingRemaining: minorToText(initial?.ceilingRemainingMinor ?? null, cur), priority: String(initial?.priority ?? 1), beneficiaryIds: initial?.beneficiaryIds ?? [patientId],
    };
  });
  const set = <K extends keyof CoverageDraft>(k: K, value: CoverageDraft[K]) => setV({ ...v, [k]: value });
  const orgContracts = contracts.filter((c) => c.organizationId === v.organizationId && (c.status === 'active' || c.id === initial?.contractId));
  const currency = contracts.find((c) => c.id === v.contractId)?.currency ?? 'USD';
  const body = coverageBody(v, currency, initial === null);
  const save = useMutation({ mutationFn: () => apiInsurance.saveCoverage(patientId, initial?.id ?? null, body ?? {}), onSuccess: () => { fb.done(); onClose(); }, onError: fb.fail });
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('apiInsurance.editCoverage', { defaultValue: 'Modifier la couverture' }) : t('insurance.cov.add')} description={initial ? undefined : t('insurance.cov.createHint')}
      submitLabel={t('common.save')} pending={save.isPending} canSubmit={body !== null} onSubmit={() => save.mutate()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.contract.organization')} required>
          {(c) => <Select {...c} value={v.organizationId} disabled={initial !== null} onChange={(e) => setV({ ...v, organizationId: e.target.value, contractId: contracts.find((k) => k.organizationId === e.target.value && k.status === 'active')?.id ?? '' })}>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}
        </FormField>
        <FormField label={t('insurance.cov.contract')} required>
          {(c) => <Select {...c} value={v.contractId} disabled={initial !== null} onChange={(e) => set('contractId', e.target.value)}><option value="">—</option>{orgContracts.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}
        </FormField>
        <FormField label={t('insurance.cov.kind')}>{(c) => <Select {...c} value={v.kind} disabled={initial !== null} onChange={(e) => set('kind', e.target.value)}>{COVERAGE_KINDS.map((k) => <option key={k} value={k}>{t(`insurance.covKind.${k}`, { defaultValue: KIND_LABEL[k] })}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.cov.priority')} hint={t('insurance.cov.priorityHint')}>{(c) => <Input {...c} inputMode="numeric" value={v.priority} onChange={(e) => set('priority', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.from')} required>{(c) => <Input {...c} type="date" value={v.validFrom} disabled={initial !== null} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.to')} required>{(c) => <Input {...c} type="date" value={v.validTo} min={v.validFrom} disabled={initial !== null} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.policy')}>{(c) => <Input {...c} value={v.policy} maxLength={40} onChange={(e) => set('policy', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.card')}>{(c) => <Input {...c} value={v.card} maxLength={40} onChange={(e) => set('card', e.target.value)} />}</FormField>
        <FormField label={t('insurance.cov.member')}>{(c) => <Input {...c} value={v.member} maxLength={40} onChange={(e) => set('member', e.target.value)} />}</FormField>
        <FormField label={t('insurance.contract.ceiling')}>{(c) => <Input {...c} inputMode="decimal" value={v.ceilingRemaining} onChange={(e) => set('ceilingRemaining', e.target.value)} />}</FormField>
      </div>
      <FormField label={t('insurance.sub.members')}>{(c) => <ApiMembersPicker id={c.id} value={v.beneficiaryIds} onChange={(ids) => set('beneficiaryIds', ids)} />}</FormField>
    </ActionDialog>
  );
}

function DecisionDialog({ coverage, onClose }: { coverage: ApiCoverage; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const fb = useSaveFeedback();
  const options = allowedDecisions(coverage.status);
  const [status, setStatus] = useState(options[0] ?? '');
  const [note, setNote] = useState('');
  const ok = status !== '' && decisionOk(status, note);
  const decide = useMutation({ mutationFn: () => apiInsurance.decideCoverage(coverage.id, status, note), onSuccess: () => { fb.done(); onClose(); }, onError: fb.fail });
  return (
    <ActionDialog open onClose={onClose} tone={status === 'validated' ? 'primary' : 'danger'} title={t('apiInsurance.decide', { defaultValue: 'Décider…' })} description={t('insurance.cov.validateHint')}
      submitLabel={t(`insurance.cov.${status === 'validated' ? 'validate' : status === 'rejected' ? 'reject' : 'suspend'}`, { defaultValue: DECISION_LABEL[status] ?? status })} pending={decide.isPending} canSubmit={ok} onSubmit={() => decide.mutate()}>
      <FormField label={t('columns.status')}>{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}>{options.map((o) => <option key={o} value={o}>{t(`validation.${o}`, { defaultValue: DECISION_LABEL[o] ?? o })}</option>)}</Select>}</FormField>
      <FormField label={t('form.reason')} required={status === 'rejected' || status === 'suspended'}>{(c) => <Textarea {...c} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}

function AuthorizationsDialog({ coverage, canGrant, onClose }: { coverage: ApiCoverage; canGrant: boolean; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const fb = useSaveFeedback();
  const { activeFacilityId } = usePreferences();
  const list = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'authorizations', coverage.id), queryFn: () => apiInsurance.authorizations(coverage.id) });
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const grant = useMutation({
    mutationFn: () => apiInsurance.grantAuthorization(coverage.id, code, note),
    onSuccess: () => { fb.done(); setCode(''); setNote(''); },
    onError: fb.fail,
  });
  const usable = coverage.status === 'validated';
  return (
    <ActionDialog open onClose={onClose} title={t('insurance.cov.authorize')} submitLabel={t('apiInsurance.grant', { defaultValue: 'Accorder' })} pending={grant.isPending}
      canSubmit={canGrant && usable && authorizationCodeOk(code)} onSubmit={() => grant.mutate()}>
      {list.isPending && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {list.error && <p role="alert" className="text-sm text-danger-ink">{list.error instanceof ApiError ? list.error.message : t('module.saveFailed')}</p>}
      {list.data && (list.data.length === 0
        ? <p className="text-sm text-muted-foreground">{t('apiInsurance.noAuthorization', { defaultValue: 'Aucune autorisation accordée.' })}</p>
        : <ul className="divide-y divide-border text-sm">{list.data.map((a) => <li key={a.id} className="flex justify-between gap-2 py-1.5"><span className="font-medium">{a.itemCode}</span><span className="text-muted-foreground">{a.note}</span></li>)}</ul>)}
      {canGrant && !usable && <p className="text-sm text-muted-foreground">{t('apiInsurance.authNeedsValidated', { defaultValue: 'Seule une couverture validée peut recevoir une autorisation.' })}</p>}
      {canGrant && usable && (
        <>
          <FormField label={t('apiInsurance.itemCode', { defaultValue: 'Code de prestation' })} required hint={t('insurance.cov.authHint')}>{(c) => <Input {...c} value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />}</FormField>
          <FormField label={t('apiInsurance.note', { defaultValue: 'Note' })}>{(c) => <Input {...c} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />}</FormField>
        </>
      )}
    </ActionDialog>
  );
}
