import { Ban, CircleCheck, Hourglass, Plus, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Autocomplete } from '@/components/forms/autocomplete';
import { Input, Select, Textarea } from '@/components/forms/controls';
import { FormField } from '@/components/forms/form-field';
import { useToast } from '@/components/feedback/toast';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type Column } from '@/components/tables/data-table';
import { StatusBadge, type StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { ApiError } from '@/core/api';
import { queryKeys } from '@/core/api/query-client';
import { useFormatters } from '@/core/i18n/useFormatters';
import { usePermissions } from '@/core/permissions/PermissionsProvider';
import { PERMISSIONS } from '@/core/permissions/permissions';
import { usePreferences } from '@/core/preferences/preferences-store';
import { dayOf } from '../billing/billing-rules';
import { LocalOnly } from '../finance/LocalOnly';
import { useMoney } from '../finance/use-finance';
import { referenceFromApi, useCareUnits } from '../_shared/reference-data';
import {
  EXPENSE_PAGE, EXPENSE_STATES, apiExpenses, checkExpense, defaultCurrency,
  type Expense, type ExpenseState,
} from './expenses-api';

const STATE_STYLE: Record<ExpenseState, { tone: StatusTone; icon: typeof Ban; label: string }> = {
  pending: { tone: 'warning', icon: Hourglass, label: 'À valider' },
  validated: { tone: 'success', icon: CircleCheck, label: 'Validée' },
  cancelled: { tone: 'neutral', icon: Ban, label: 'Annulée' },
};

export function ExpenseStateBadge({ state }: { state: ExpenseState }) {
  const { t } = useTranslation('expenses');
  const s = STATE_STYLE[state];
  return <StatusBadge tone={s.tone} icon={s.icon}>{t(`state.${state}`, { defaultValue: s.label })}</StatusBadge>;
}

const firstOfMonth = (): string => { const d = new Date(); return dayOf(new Date(d.getFullYear(), d.getMonth(), 1)); };

export default function ExpensesPage() {
  const { t } = useTranslation('expenses');
  return referenceFromApi() ? <ExpensesScreen /> : <LocalOnly title={t('title')} />;
}

/** Dépenses de l'établissement : saisie, validation par un responsable, annulation motivée. Les montants et les totaux viennent du serveur. */
function ExpensesScreen() {
  const { t } = useTranslation('expenses');
  const f = useFormatters();
  const money = useMoney();
  const { can } = usePermissions();
  const { activeFacilityId } = usePreferences();
  const units = useCareUnits();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(() => dayOf(new Date()));
  const [state, setState] = useState<ExpenseState | ''>('');
  const [accountId, setAccountId] = useState('');
  const [careUnitId, setCareUnitId] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [toValidate, setToValidate] = useState<Expense | null>(null);
  const [toCancel, setToCancel] = useState<Expense | null>(null);
  const periodOk = from !== '' && to !== '' && from <= to;
  const reset = (): void => setPage(1);

  const accounts = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'accounts'), queryFn: apiExpenses.accounts, staleTime: 30_000 });
  const summary = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'summary', from, to, accountId, careUnitId),
    queryFn: () => apiExpenses.summary({ from, to, accountId, careUnitId }),
    enabled: periodOk,
    placeholderData: keepPreviousData,
  });
  const list = useQuery({
    queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'list', from, to, state, accountId, careUnitId, q, page),
    queryFn: () => apiExpenses.list({ from, to, state: state || undefined, accountId, careUnitId, q, page }),
    enabled: periodOk,
    placeholderData: keepPreviousData,
  });
  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);

  const canValidate = can(PERMISSIONS.expenses.validate);
  const canCancel = can(PERMISSIONS.expenses.cancel);
  const columns: Column<Expense>[] = [
    { id: 'date', header: t('columns.date'), cell: (e) => f.date(e.doneOn), primary: true },
    { id: 'account', header: t('columns.account'), cell: (e) => e.accountName },
    { id: 'unit', header: t('columns.unit'), cell: (e) => (e.careUnitId ? unitName.get(e.careUnitId) ?? `#${e.careUnitId}` : '—') },
    { id: 'motif', header: t('columns.motif'), cell: (e) => <span title={e.state === 'cancelled' ? t('cancelReason', { reason: e.cancelReason }) : undefined}>{e.motif}</span> },
    { id: 'amount', header: t('columns.amount'), cell: (e) => money(e.amountMinor, e.currency), className: 'text-end tabular-nums' },
    { id: 'state', header: t('columns.status'), cell: (e) => <ExpenseStateBadge state={e.state} /> },
    { id: 'by', header: t('columns.by'), cell: (e) => e.createdBy || '—' },
    {
      id: 'actions', header: '',
      cell: (e) => e.state === 'pending' && (canValidate || canCancel) ? (
        <div className="flex gap-2">
          {canValidate && <Button size="sm" variant="outline" onClick={() => setToValidate(e)}>{t('actions.validate')}</Button>}
          {canCancel && <Button size="sm" variant="ghost" onClick={() => setToCancel(e)}>{t('actions.cancel')}</Button>}
        </div>
      ) : null,
    },
  ];
  const currencies = summary.data?.currencies ?? [];

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')}
        actions={can(PERMISSIONS.expenses.create) ? <Button leftIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t('actions.new')}</Button> : undefined} />
      <div className="space-y-4">
        {currencies.map((c) => (
          <section key={c.currency} aria-label={c.currency}>
            <StatGrid>
              <StatCard icon={CircleCheck} tone="success" label={t('totals.validated')} value={money(c.validatedMinor, c.currency)} hint={t('totals.validatedHint')} />
              <StatCard icon={Hourglass} tone="warning" label={t('totals.pending')} value={money(c.pendingMinor, c.currency)} hint={t('totals.pendingHint')} />
              <StatCard icon={Wallet} tone="info" label={t('totals.total')} value={money(c.totalMinor, c.currency)} />
            </StatGrid>
          </section>
        ))}
        <Card>
          <div className="grid gap-x-4 gap-y-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label={t('filters.from')}>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); reset(); }} className="w-full" />
            </FilterField>
            <FilterField label={t('filters.to')}>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); reset(); }} className="w-full" />
            </FilterField>
            <FilterField label={t('columns.status')}>
              <Select value={state} onChange={(e) => { setState(e.target.value as ExpenseState | ''); reset(); }} className="w-full">
                <option value="">{t('filters.allStatuses')}</option>
                {EXPENSE_STATES.map((s) => <option key={s} value={s}>{t(`state.${s}`, { defaultValue: STATE_STYLE[s].label })}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('columns.account')}>
              <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); reset(); }} className="w-full">
                <option value="">{t('filters.allAccounts')}</option>
                {(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('columns.unit')}>
              <Select value={careUnitId} onChange={(e) => { setCareUnitId(e.target.value); reset(); }} className="w-full">
                <option value="">{t('filters.allUnits')}</option>
                {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('filters.search')} className="sm:col-span-2">
              <Input type="search" value={q} maxLength={60} onChange={(e) => { setQ(e.target.value); reset(); }} className="w-full" />
            </FilterField>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" disabled={state === '' && accountId === '' && careUnitId === '' && q === ''}
                onClick={() => { setState(''); setAccountId(''); setCareUnitId(''); setQ(''); reset(); }}>{t('filters.reset', { defaultValue: 'Réinitialiser' })}</Button>
            </div>
          </div>
          {!periodOk && <p role="alert" className="p-4 text-sm text-danger-ink">{t('filters.periodInvalid')}</p>}
          <DataTable caption={t('title')} columns={columns} rows={periodOk ? list.data?.rows ?? [] : []} getRowId={(e) => e.id}
            loading={periodOk && list.isPending} error={periodOk ? list.error : null} onRetry={() => void list.refetch()}
            emptyTitle={t('empty')} emptyDescription={t('emptyHint')}
            pagination={{ page, perPage: EXPENSE_PAGE, total: periodOk ? list.data?.total ?? 0 : 0, onPageChange: setPage }} />
        </Card>
      </div>
      {creating && <NewExpenseDialog accounts={accounts.data ?? []} accountsLoading={accounts.isPending} onClose={() => setCreating(false)} />}
      {toValidate && <ValidateDialog expense={toValidate} onClose={() => setToValidate(null)} />}
      {toCancel && <CancelDialog expense={toCancel} onClose={() => setToCancel(null)} />}
    </>
  );
}

/** Un filtre : libellé au-dessus du champ, qui occupe toute la largeur de sa colonne. */
function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-medium text-foreground ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Après toute écriture : listes, totaux, caisse et rapports se relisent (les autres postes reçoivent le signal temps réel). */
function useRefresh(): () => void {
  const queryClient = useQueryClient();
  const { activeFacilityId } = usePreferences();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'expenses') });
    void queryClient.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'reports') });
  };
}

function useFail(): (error: unknown) => void {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  return (error) => toast({ tone: 'danger', title: error instanceof ApiError ? error.message : t('failed'), description: error instanceof ApiError ? undefined : t('failedHint') });
}

function NewExpenseDialog({ accounts, accountsLoading, onClose }: { accounts: { id: string; name: string }[]; accountsLoading: boolean; onClose: () => void }) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const refresh = useRefresh();
  const fail = useFail();
  const units = useCareUnits();
  const [accountId, setAccountId] = useState('');
  const [careUnitId, setCareUnitId] = useState('');
  const { activeFacilityId } = usePreferences();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canCreateAccount = can(PERMISSIONS.expenses.create);
  // Catégories créées depuis ce formulaire : choisies tout de suite, sans attendre la relecture de la liste.
  const [made, setMade] = useState<{ id: string; name: string }[]>([]);
  const allAccounts = [...accounts, ...made.filter((m) => !accounts.some((a) => a.id === m.id))];
  const addAccount = async (name: string): Promise<void> => {
    try {
      const a = await apiExpenses.createAccount(name);
      setMade((m) => [...m, a]);
      setAccountId(a.id);
      void qc.invalidateQueries({ queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'accounts') });
    } catch (error) {
      fail(error);
      throw error;
    }
  };
  const currencies = useQuery({ queryKey: queryKeys.scoped(activeFacilityId, 'expenses', 'currencies'), queryFn: apiExpenses.currencies, staleTime: 60_000 });
  const [picked, setPicked] = useState('');
  const currency = picked || defaultCurrency(currencies.data ?? []);
  const [amount, setAmount] = useState('');
  const [motif, setMotif] = useState('');
  const [doneOn, setDoneOn] = useState(() => dayOf(new Date()));
  const [touched, setTouched] = useState(false);
  // Une clé par tentative : tant qu'elle n'a pas réussi, un nouvel envoi la rejoue sans créer de doublon.
  const [attempt] = useState(() => globalThis.crypto.randomUUID());
  const check = currency === '' ? ({ ok: false, reason: 'currency' } as const) : checkExpense({ accountId, amount, currency, motif });
  const create = useMutation({
    mutationFn: (minor: number) => apiExpenses.create({ accountId, currency, amountMinor: minor, motif, doneOn, careUnitId }, attempt),
    onSuccess: () => { toast({ tone: 'success', title: t('created') }); refresh(); onClose(); },
    onError: fail,
  });
  const submit = (): void => { setTouched(true); if (check.ok && !create.isPending) create.mutate(check.minor); };
  const err = (reason: string): string | undefined => (touched && !check.ok && check.reason === reason ? t(`errors.${reason}`) : undefined);

  return (
    <Dialog open onClose={onClose} title={t('new.title')} description={t('new.description')}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={create.isPending}>{t('actions.close')}</Button>
        <Button onClick={submit} loading={create.isPending}>{t('new.submit')}</Button>
      </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <FormField label={t('columns.account')} required error={err('account')} hint={!accountsLoading && accounts.length === 0 ? t('new.noAccount') : undefined}>
          {(c) => (
            <Autocomplete<{ id: string; name: string }> {...c} items={allAccounts} value={accountId} onChange={setAccountId}
              getKey={(a) => a.id} getLabel={(a) => a.name} getSearch={(a) => a.name} emptyText={t('new.noAccount')} placeholder={t('new.chooseAccount')}
              onCreate={canCreateAccount ? addAccount : undefined} createLabel={(text) => t('new.addAccount', { defaultValue: 'Ajouter la catégorie « {{name}} »', name: text })} />
          )}
        </FormField>
        <FormField label={t('columns.unit')} hint={t('new.unitHint')}>
          {(c) => (
            <Select {...c} value={careUnitId} onChange={(e) => setCareUnitId(e.target.value)}>
              <option value="">{t('new.noUnit')}</option>
              {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
        </FormField>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <FormField label={t('columns.amount')} required error={err('amount') ?? err('amountUnreadable')}>
            {(c) => <Input {...c} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </FormField>
          <FormField label={t('new.currency')} required error={err('currency')}>
            {(c) => <Select {...c} value={currency} onChange={(e) => setPicked(e.target.value)}>{(currencies.data ?? []).map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}</Select>}
          </FormField>
        </div>
        <FormField label={t('columns.date')} required>
          {(c) => <Input {...c} type="date" value={doneOn} max={dayOf(new Date())} onChange={(e) => setDoneOn(e.target.value || dayOf(new Date()))} />}
        </FormField>
        <FormField label={t('columns.motif')} required error={err('motif')}>
          {(c) => <Textarea {...c} value={motif} maxLength={255} onChange={(e) => setMotif(e.target.value)} />}
        </FormField>
      </form>
    </Dialog>
  );
}

function ValidateDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { t } = useTranslation('expenses');
  const money = useMoney();
  const toast = useToast();
  const refresh = useRefresh();
  const fail = useFail();
  const validate = useMutation({
    mutationFn: () => apiExpenses.validate(expense.id),
    onSuccess: () => { toast({ tone: 'success', title: t('validated') }); refresh(); onClose(); },
    onError: (e) => { fail(e); refresh(); onClose(); },
  });
  return (
    <ConfirmDialog open title={t('validate.title')} description={t('validate.description', { amount: money(expense.amountMinor, expense.currency), account: expense.accountName })}
      confirmLabel={t('actions.validate')} cancelLabel={t('actions.close')} loading={validate.isPending} onConfirm={() => validate.mutate()} onCancel={onClose} />
  );
}

function CancelDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { t } = useTranslation('expenses');
  const money = useMoney();
  const toast = useToast();
  const refresh = useRefresh();
  const fail = useFail();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => apiExpenses.cancel(expense.id, reason),
    onSuccess: () => { toast({ tone: 'success', title: t('cancelled') }); refresh(); onClose(); },
    onError: (e) => { fail(e); refresh(); },
  });
  const ok = reason.trim() !== '';
  return (
    <Dialog open onClose={onClose} title={t('cancel.title')} description={t('cancel.description', { amount: money(expense.amountMinor, expense.currency), account: expense.accountName })}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>{t('actions.close')}</Button>
        <Button variant="danger" loading={cancel.isPending} disabled={!ok} onClick={() => { if (ok) cancel.mutate(); }}>{t('cancel.confirm')}</Button>
      </>}>
      <FormField label={t('cancel.reason')} required hint={t('cancel.hint')}>
        {(c) => <Textarea {...c} value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />}
      </FormField>
    </Dialog>
  );
}
