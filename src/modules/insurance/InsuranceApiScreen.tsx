import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banknote, Ban, CircleCheck, Hourglass } from 'lucide-react';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { Tabs } from '@/components/ui/tabs';
import { PersonName } from '@/components/ui/avatar';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { ContractsApiTab, CoveragesApiTab, SubscriptionsApiTab } from './InsuranceApiTabs';
import { ActionDialog } from '../finance/ActionDialog';
import { ServicesCatalogTab } from './ServicesCatalogTab';
import { useMoney } from '../finance/use-finance';
import { checkAmount, dayOf } from '../billing/billing-rules';
import {
  ORG_KINDS, ORG_STATUSES, SETTLE_MODES, apiInsurance, isOpenDue,
  type ApiOrganization, type Due, type OrgKind, type OrgStatus, type SettleMode,
} from './insurance-api';

const SETTLE_CODE = 'health.insurance.settle';
const KIND_LABEL: Record<string, string> = { insurer: 'Assureur', mutuelle: 'Mutuelle', company: 'Entreprise', institution: 'Institution', other: 'Autre' };
const STATUS_LABEL: Record<string, string> = { active: 'Actif', suspended: 'Suspendu', inactive: 'Inactif' };
const MODE_LABEL: Record<string, string> = { oldest: 'Les plus anciennes d\'abord', member: 'Un adhérent précis', proportional: 'Proportionnel' };
const DUE_LABEL: Record<string, string> = { open: 'Ouverte', partial: 'Réglée en partie', settled: 'Réglée', rejected: 'Rejetée', closed: 'Clôturée', cancelled: 'Annulée' };
const DUE_TONE: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = { open: 'info', partial: 'warning', settled: 'success', rejected: 'danger', closed: 'neutral', cancelled: 'neutral' };

/** Assurance en mode API : organismes payeurs, créances sur les factures, règlements reçus et rejets. */
export function InsuranceApiScreen() {
  const { t } = useTranslation('finance');
  return (
    <>
      <PageHeader title={t('insurance.title')} description={t('apiInsurance.subtitle', { defaultValue: 'Organismes payeurs, créances sur les factures, règlements reçus et rejets' })} />
      <Tabs ariaLabel={t('insurance.title')} tabs={[
        { id: 'receivables', label: t('apiInsurance.receivables', { defaultValue: 'Créances et règlements' }), content: <Receivables /> },
        { id: 'coverages', label: t('insurance.tabs.coverages'), content: <Coverages /> },
        { id: 'organizations', label: t('insurance.tabs.organizations'), content: <Organizations /> },
        { id: 'contracts', label: t('insurance.tabs.contracts'), content: <Contracts /> },
        { id: 'subscriptions', label: t('insurance.tabs.subscriptions'), content: <SubscriptionsApiTab /> },
        { id: 'catalog', label: t('insurance.tabs.catalog'), content: <ServicesCatalogTab /> },
      ]} />
    </>
  );
}

function Coverages() {
  const orgs = useOrganizations();
  return <CoveragesApiTab organizations={orgs.data ?? []} />;
}

function Contracts() {
  const orgs = useOrganizations();
  return <ContractsApiTab organizations={orgs.data ?? []} />;
}

function useFail(): (error: unknown) => void {
  const { t } = useTranslation('finance');
  const toast = useToast();
  return (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('module.saveFailed'), description: error instanceof ApiError ? undefined : t('module.saveFailedHint') });
}

function useOrganizations() {
  const { activeFacilityId } = usePreferences();
  return useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'organizations'), queryFn: () => apiInsurance.organizations() });
}

// ------------------------------------------------------------------ organismes

function Organizations() {
  const { t } = useTranslation('finance');
  const { can } = usePermissions();
  const orgs = useOrganizations();
  const [editing, setEditing] = useState<ApiOrganization | 'new' | null>(null);
  const canManage = can(P.insurance.manage);
  const columns: Column<ApiOrganization>[] = [
    { id: 'name', header: t('insurance.org.name'), cell: (o) => o.name, primary: true },
    { id: 'code', header: t('insurance.org.code'), cell: (o) => o.code },
    { id: 'kind', header: t('insurance.org.kind'), cell: (o) => t(`insurance.orgKind.${o.kind}`, { defaultValue: KIND_LABEL[o.kind] ?? o.kind }) },
    { id: 'status', header: t('columns.status'), cell: (o) => <StatusBadge tone={o.status === 'active' ? 'success' : 'neutral'}>{t(`insurance.orgStatus.${o.status}`, { defaultValue: STATUS_LABEL[o.status] ?? o.status })}</StatusBadge> },
    { id: 'contact', header: t('insurance.org.contact'), cell: (o) => o.contactPerson },
    ...(canManage ? [{ id: 'edit', header: '', cell: (o: ApiOrganization) => <Button size="sm" variant="outline" onClick={() => setEditing(o)}>{t('common.edit')}</Button> }] : []),
  ];
  return (
    <div className="space-y-3">
      {canManage && <div className="flex justify-end"><Button onClick={() => setEditing('new')}>{t('insurance.org.add')}</Button></div>}
      <DataTable caption={t('insurance.tabs.organizations')} columns={columns} rows={orgs.data ?? []} getRowId={(o) => o.id}
        loading={orgs.isPending} error={orgs.error} onRetry={() => void orgs.refetch()} />
      {editing && <OrgForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OrgForm({ initial, onClose }: { initial: ApiOrganization | null; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const toast = useToast();
  const fail = useFail();
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  const [v, setV] = useState({
    code: initial?.code ?? '', name: initial?.name ?? '', kind: (initial?.kind ?? 'insurer') as OrgKind, contactPerson: initial?.contactPerson ?? '', phone: initial?.phone ?? '',
    email: initial?.email ?? '', status: (initial?.status ?? 'active') as OrgStatus, validFrom: initial?.validFrom || dayOf(new Date()), validTo: initial?.validTo ?? '', conditions: initial?.conditions ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const save = useMutation({
    mutationFn: () => apiInsurance.saveOrganization(initial?.id ?? null, v),
    onSuccess: () => { toast({ tone: 'success', title: t('done.saved') }); void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance') }); onClose(); },
    onError: fail,
  });
  const codeOk = initial !== null || /^[A-Za-z0-9-]{2,20}$/.test(v.code.trim());
  const ok = v.name.trim().length >= 2 && codeOk && /^\d{4}-\d{2}-\d{2}$/.test(v.validFrom);
  return (
    <ActionDialog open onClose={onClose} title={initial ? t('insurance.org.edit') : t('insurance.org.add')} submitLabel={t('common.save')} pending={save.isPending} canSubmit={ok} onSubmit={() => save.mutate()}>
      <FormField label={t('insurance.org.name')} required>{(c) => <Input {...c} value={v.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />}</FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('insurance.org.code')} required hint={initial ? t('apiInsurance.codeFixed', { defaultValue: 'Le code ne change plus après la création.' }) : undefined}>
          {(c) => <Input {...c} value={v.code} maxLength={20} disabled={initial !== null} onChange={(e) => set('code', e.target.value)} />}
        </FormField>
        <FormField label={t('insurance.org.kind')}>{(c) => <Select {...c} value={v.kind} onChange={(e) => set('kind', e.target.value as OrgKind)}>{ORG_KINDS.map((k) => <option key={k} value={k}>{t(`insurance.orgKind.${k}`, { defaultValue: KIND_LABEL[k] })}</option>)}</Select>}</FormField>
        <FormField label={t('insurance.org.contact')}>{(c) => <Input {...c} value={v.contactPerson} maxLength={120} onChange={(e) => set('contactPerson', e.target.value)} />}</FormField>
        <FormField label={t('insurance.org.phone')}>{(c) => <Input {...c} value={v.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} />}</FormField>
        <FormField label={t('apiInsurance.email', { defaultValue: 'E-mail' })}>{(c) => <Input {...c} type="email" value={v.email} maxLength={120} onChange={(e) => set('email', e.target.value)} />}</FormField>
        {initial && <FormField label={t('columns.status')}>{(c) => <Select {...c} value={v.status} onChange={(e) => set('status', e.target.value as OrgStatus)}>{ORG_STATUSES.map((k) => <option key={k} value={k}>{t(`insurance.orgStatus.${k}`, { defaultValue: STATUS_LABEL[k] })}</option>)}</Select>}</FormField>}
        <FormField label={t('apiInsurance.validFrom', { defaultValue: 'Valable depuis' })} required>{(c) => <Input {...c} type="date" value={v.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</FormField>
        <FormField label={t('apiInsurance.validTo', { defaultValue: 'Valable jusqu\'au' })}>{(c) => <Input {...c} type="date" value={v.validTo} onChange={(e) => set('validTo', e.target.value)} />}</FormField>
      </div>
      <FormField label={t('apiInsurance.conditions', { defaultValue: 'Conditions' })}>{(c) => <Textarea {...c} value={v.conditions} maxLength={1000} onChange={(e) => set('conditions', e.target.value)} />}</FormField>
    </ActionDialog>
  );
}

// ------------------------------------------------------------------ créances

function Receivables() {
  const { t } = useTranslation('finance');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const orgs = useOrganizations();
  const [orgId, setOrgId] = useState('');
  const [to, setTo] = useState(() => dayOf(new Date()));
  const [from, setFrom] = useState(() => dayOf(new Date(Date.now() - 30 * 86_400_000)));
  const [settling, setSettling] = useState(false);
  const [rejecting, setRejecting] = useState<Due | null>(null);
  const canSettle = can(SETTLE_CODE);
  const selected = orgId || orgs.data?.[0]?.id || '';
  const periodOk = from !== '' && to !== '' && from <= to;

  const statement = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'insurance', 'statement', selected, from, to),
    queryFn: () => apiInsurance.statement(selected, from, to),
    enabled: selected !== '' && periodOk,
    placeholderData: keepPreviousData,
  });
  const st = statement.data;
  const columns: Column<Due>[] = [
    { id: 'date', header: t('columns.date', { defaultValue: 'Date' }), cell: (d) => f.dateTime(d.createdAt.includes('T') ? d.createdAt : `${d.createdAt.replace(' ', 'T')}Z`), primary: true },
    { id: 'patient', header: t('columns.patient'), cell: (d) => <PersonName name={d.patientName} strong={false} /> },
    { id: 'amount', header: t('apiInsurance.due', { defaultValue: 'Dû' }), cell: (d) => money(d.amountMinor, d.currency), className: 'text-end tabular-nums' },
    { id: 'settled', header: t('apiInsurance.settled', { defaultValue: 'Réglé' }), cell: (d) => money(d.settledMinor, d.currency), className: 'text-end tabular-nums' },
    { id: 'rejected', header: t('apiInsurance.rejected', { defaultValue: 'Rejeté' }), cell: (d) => money(d.rejectedMinor, d.currency), className: 'text-end tabular-nums' },
    { id: 'outstanding', header: t('apiInsurance.outstanding', { defaultValue: 'Reste dû' }), cell: (d) => money(d.outstandingMinor, d.currency), className: 'text-end tabular-nums' },
    { id: 'status', header: t('columns.status'), cell: (d) => <StatusBadge tone={DUE_TONE[d.status] ?? 'neutral'}>{t(`apiInsurance.dueState.${d.status}`, { defaultValue: DUE_LABEL[d.status] ?? d.status })}</StatusBadge> },
    ...(canSettle ? [{ id: 'reject', header: '', cell: (d: Due) => isOpenDue(d) ? <Button size="sm" variant="outline" onClick={() => setRejecting(d)}>{t('apiInsurance.reject', { defaultValue: 'Rejeter…' })}</Button> : null }] : []),
  ];
  const openDues = useMemo(() => (st?.dues ?? []).filter(isOpenDue), [st]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">{t('apiInsurance.organization', { defaultValue: 'Organisme' })}
          <Select aria-label={t('apiInsurance.organization', { defaultValue: 'Organisme' })} value={selected} onChange={(e) => setOrgId(e.target.value)} className="mt-1 w-64">
            {(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col text-sm">{t('apiInsurance.from', { defaultValue: 'Du' })}<Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></label>
        <label className="flex flex-col text-sm">{t('apiInsurance.to', { defaultValue: 'Au' })}<Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1" /></label>
        {canSettle && <Button className="ms-auto" disabled={openDues.length === 0} onClick={() => setSettling(true)}>{t('apiInsurance.settle', { defaultValue: 'Enregistrer un règlement' })}</Button>}
      </div>
      {!periodOk && <p role="alert" className="text-sm text-danger-ink">{t('apiInsurance.badPeriod', { defaultValue: 'La date de début doit précéder la date de fin.' })}</p>}
      {orgs.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('apiInsurance.noOrg', { defaultValue: 'Aucun organisme : créez-en un dans l\'onglet Organismes.' })}</p>}

      {st?.totals.map((c) => (
        <section key={c.currency} aria-label={c.currency}>
          <StatGrid>
            <StatCard icon={Banknote} label={t('apiInsurance.billed', { defaultValue: 'Facturé' })} value={money(c.billedMinor, c.currency)} />
            <StatCard icon={CircleCheck} tone="success" label={t('apiInsurance.settled', { defaultValue: 'Réglé' })} value={money(c.settledMinor, c.currency)} />
            <StatCard icon={Ban} tone="danger" label={t('apiInsurance.rejected', { defaultValue: 'Rejeté' })} value={money(c.rejectedMinor, c.currency)} />
            <StatCard icon={Hourglass} tone="warning" label={t('apiInsurance.outstanding', { defaultValue: 'Reste dû' })} value={money(c.outstandingMinor, c.currency)} hint={t('apiInsurance.outstandingHint', { defaultValue: 'À ce jour, toutes périodes' })} />
          </StatGrid>
        </section>
      ))}

      <DataTable caption={t('apiInsurance.duesTitle', { defaultValue: 'Créances de la période' })} columns={columns} rows={st?.dues ?? []} getRowId={(d) => d.id}
        loading={statement.isPending && selected !== '' && periodOk} error={statement.error} onRetry={() => void statement.refetch()}
        emptyTitle={t('apiInsurance.noDues', { defaultValue: 'Aucune créance sur cette période' })} emptyDescription={t('apiInsurance.noDuesHint', { defaultValue: 'Élargissez les dates pour voir les créances plus anciennes.' })} />

      {st && st.settlements.length > 0 && (
        <Card title={t('apiInsurance.settlementsTitle', { defaultValue: 'Règlements reçus' })}>
          <ul className="divide-y divide-border text-sm">
            {st.settlements.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>{s.paidOn} · {t(`apiInsurance.modes.${s.mode}`, { defaultValue: MODE_LABEL[s.mode] ?? s.mode })}{s.reference ? ` · ${s.reference}` : ''}</span>
                <span className="tabular-nums">{money(s.amountMinor, s.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {settling && st && <SettleDialog orgId={selected} dues={openDues} totals={st.totals} onClose={() => setSettling(false)} />}
      {rejecting && <RejectDialog due={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function useRefreshInsurance(): () => void {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'insurance') });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'billing') });
  };
}

function SettleDialog({ orgId, dues, totals, onClose }: { orgId: string; dues: Due[]; totals: { currency: string; outstandingMinor: number }[]; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const fail = useFail();
  const refresh = useRefreshInsurance();
  const currencies = totals.filter((c) => c.outstandingMinor > 0);
  const [currency, setCurrency] = useState(currencies[0]?.currency ?? 'USD');
  const [mode, setMode] = useState<SettleMode>('oldest');
  const [patientId, setPatientId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(() => dayOf(new Date()));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [attempt, setAttempt] = useState(() => globalThis.crypto.randomUUID());

  const ofCurrency = dues.filter((d) => d.currency === currency);
  const patients = useMemo(() => {
    const m = new Map<string, { name: string; due: number }>();
    for (const d of ofCurrency) m.set(d.patientId, { name: d.patientName, due: (m.get(d.patientId)?.due ?? 0) + d.outstandingMinor });
    return [...m.entries()].map(([id, p]) => ({ id, ...p }));
  }, [ofCurrency]);
  const patient = patients.find((p) => p.id === patientId);
  const due = mode === 'member' ? (patient?.due ?? 0) : (currencies.find((c) => c.currency === currency)?.outstandingMinor ?? 0);
  const check = checkAmount(amount, currency, due);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) && paidOn <= dayOf(new Date());
  const ok = check.ok && dateOk && (mode !== 'member' || patient !== undefined);

  const settle = useMutation({
    mutationFn: () => apiInsurance.settle(orgId, { amountMinor: check.ok ? check.minor : 0, currency, mode, patientId, reference, paidOn, note }, attempt),
    onSuccess: (r) => { toast({ tone: 'success', title: t('apiInsurance.settleDone', { defaultValue: 'Règlement enregistré' }), description: t('apiInsurance.settleCount', { defaultValue: '{{count}} créance(s) mise(s) à jour', count: r.allocations.length }) }); setAttempt(globalThis.crypto.randomUUID()); refresh(); onClose(); },
    onError: fail,
  });

  return (
    <ActionDialog open onClose={onClose} title={t('apiInsurance.settle', { defaultValue: 'Enregistrer un règlement' })} submitLabel={t('common.save')} pending={settle.isPending} canSubmit={ok} onSubmit={() => settle.mutate()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('apiInsurance.currency', { defaultValue: 'Devise' })}>{(c) => <Select {...c} value={currency} onChange={(e) => { setCurrency(e.target.value); setPatientId(''); setAmount(''); }}>{currencies.map((x) => <option key={x.currency} value={x.currency}>{x.currency}</option>)}</Select>}</FormField>
        <FormField label={t('apiInsurance.mode', { defaultValue: 'Répartition' })}>{(c) => <Select {...c} value={mode} onChange={(e) => setMode(e.target.value as SettleMode)}>{SETTLE_MODES.map((m) => <option key={m} value={m}>{t(`apiInsurance.modes.${m}`, { defaultValue: MODE_LABEL[m] })}</option>)}</Select>}</FormField>
      </div>
      {mode === 'member' && (
        <FormField label={t('columns.patient')} required>{(c) => <Select {...c} value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">—</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</FormField>
      )}
      <FormField label={t('form.amount', { currency })} required hint={t('apiInsurance.amountHint', { defaultValue: 'Au plus {{max}}', max: money(due, currency) })}>
        {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t('apiInsurance.paidOn', { defaultValue: 'Reçu le' })} required>{(c) => <Input {...c} type="date" value={paidOn} max={dayOf(new Date())} onChange={(e) => setPaidOn(e.target.value)} />}</FormField>
        <FormField label={t('apiInsurance.reference', { defaultValue: 'Référence' })}>{(c) => <Input {...c} value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />}</FormField>
      </div>
      <FormField label={t('apiInsurance.note', { defaultValue: 'Note' })}>{(c) => <Input {...c} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />}</FormField>
    </ActionDialog>
  );
}

function RejectDialog({ due, onClose }: { due: Due; onClose: () => void }) {
  const { t } = useTranslation('finance');
  const money = useMoney();
  const toast = useToast();
  const fail = useFail();
  const refresh = useRefreshInsurance();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const check = amount.trim() === '' ? null : checkAmount(amount, due.currency, due.outstandingMinor);
  const ok = reason.trim().length >= 3 && (check === null || check.ok);
  const reject = useMutation({
    mutationFn: () => apiInsurance.reject(due.id, reason, check?.ok ? check.minor : undefined),
    onSuccess: () => { toast({ tone: 'success', title: t('apiInsurance.rejectDone', { defaultValue: 'Créance rejetée' }) }); refresh(); onClose(); },
    onError: fail,
  });
  return (
    <ActionDialog open onClose={onClose} tone="danger" title={t('apiInsurance.rejectTitle', { defaultValue: 'Rejeter la créance' })} description={`${due.patientName} · ${money(due.outstandingMinor, due.currency)}`}
      submitLabel={t('apiInsurance.reject', { defaultValue: 'Rejeter…' })} pending={reject.isPending} canSubmit={ok} onSubmit={() => reject.mutate()}>
      <FormField label={t('form.reason')} required>{(c) => <Textarea {...c} value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />}</FormField>
      <FormField label={t('form.amount', { currency: due.currency })} hint={t('apiInsurance.rejectHint', { defaultValue: 'Laissez vide pour rejeter tout le reste dû.' })}>
        {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </FormField>
    </ActionDialog>
  );
}
