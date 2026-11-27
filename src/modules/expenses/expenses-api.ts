import { healthClient } from '@/core/api';
import { MoneyError, parseMoney } from '@/core/money/money';

/**
 * Dépenses sur l'API HEALTH. La ligne comptable est écrite dans UZISHA par le serveur ; l'interface montre et envoie,
 * elle ne calcule aucun total : les sommes viennent de /expenses/summary (annulées exclues).
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const EXPENSE_PAGE = 25;
export type ExpenseState = 'pending' | 'validated' | 'cancelled';
export const EXPENSE_STATES: readonly ExpenseState[] = ['pending', 'validated', 'cancelled'];

export interface Expense {
  id: string; accountId: string; accountName: string; careUnitId: string | null; currency: string; amountMinor: number;
  motif: string; doneOn: string; state: ExpenseState; validatedAt: string | null; cancelReason: string; createdBy: string; createdAt: string;
}
export interface ExpenseAccount { id: string; name: string }
export interface ExpenseCurrency { code: string; isDefault: boolean }
export interface ExpenseTotals { currency: string; pendingMinor: number; validatedMinor: number; totalMinor: number }
export interface ExpenseSummary { from: string; to: string; count: number; currencies: ExpenseTotals[] }

const stateOf = (v: unknown): ExpenseState => (v === 'validated' || v === 'cancelled' ? v : 'pending');

export function expenseFrom(r: Row): Expense {
  return {
    id: text(r.id), accountId: text(r.account_id), accountName: text(r.account_name), careUnitId: r.care_unit_id === null || r.care_unit_id === undefined ? null : text(r.care_unit_id),
    currency: text(r.currency) || 'USD', amountMinor: num(r.amount_minor), motif: text(r.motif), doneOn: text(r.done_on), state: stateOf(r.state),
    validatedAt: r.validated_at ? text(r.validated_at) : null, cancelReason: text(r.cancel_reason), createdBy: text(r.created_by), createdAt: text(r.created_at),
  };
}

export function accountFrom(r: Row): ExpenseAccount { return { id: text(r.id), name: text(r.name) }; }
export function currencyFrom(r: Row): ExpenseCurrency { return { code: text(r.code).toUpperCase(), isDefault: r.is_default === true }; }
/** Devise proposée d'office : la principale de la comptabilité, sinon la première. */
export function defaultCurrency(list: readonly ExpenseCurrency[]): string { return (list.find((c) => c.isDefault) ?? list[0])?.code ?? ''; }

export function summaryFrom(raw: unknown): ExpenseSummary {
  const d = rec(raw);
  return {
    from: text(d.from), to: text(d.to), count: num(d.count),
    currencies: rows(d.currencies).map((c) => ({ currency: text(c.currency), pendingMinor: num(c.pending_minor), validatedMinor: num(c.validated_minor), totalMinor: num(c.total_minor) })),
  };
}

/** Entrées, sorties et solde d'une période, par devise : le solde ne compte que les dépenses VALIDÉES ; les dépenses en attente sont montrées à part. */
export interface Flow { currency: string; incomeMinor: number; validatedMinor: number; pendingMinor: number; balanceMinor: number }
export function flowOf(income: readonly { currency: string; totalMinor: number }[], expenses: readonly ExpenseTotals[]): Flow[] {
  const by = new Map<string, Flow>();
  const get = (currency: string): Flow => {
    let f = by.get(currency);
    if (!f) { f = { currency, incomeMinor: 0, validatedMinor: 0, pendingMinor: 0, balanceMinor: 0 }; by.set(currency, f); }
    return f;
  };
  for (const i of income) get(i.currency).incomeMinor += i.totalMinor;
  for (const e of expenses) { const f = get(e.currency); f.validatedMinor += e.validatedMinor; f.pendingMinor += e.pendingMinor; }
  return [...by.values()].map((f) => ({ ...f, balanceMinor: f.incomeMinor - f.validatedMinor })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export type ExpenseCheck = { ok: true; minor: number } | { ok: false; reason: 'account' | 'amount' | 'amountUnreadable' | 'motif' };
/** Vérification avant envoi (le serveur refait les mêmes contrôles) : compte choisi, montant lisible et positif, motif non vide. */
export function checkExpense(input: { accountId: string; amount: string; currency: string; motif: string }): ExpenseCheck {
  if (input.accountId === '') return { ok: false, reason: 'account' };
  if (input.amount.trim() === '') return { ok: false, reason: 'amount' };
  let minor: number;
  try { minor = parseMoney(input.amount, input.currency).minor; } catch (e) {
    if (e instanceof MoneyError) return { ok: false, reason: 'amountUnreadable' };
    throw e;
  }
  if (minor <= 0) return { ok: false, reason: 'amount' };
  if (input.motif.trim() === '') return { ok: false, reason: 'motif' };
  return { ok: true, minor };
}

export interface ExpenseQuery { state?: ExpenseState; accountId?: string; careUnitId?: string; from?: string; to?: string; q?: string; page: number }
export interface NewExpense { accountId: string; currency: string; amountMinor: number; motif: string; doneOn: string; careUnitId: string }

function paramsOf(q: Omit<ExpenseQuery, 'page' | 'state' | 'q'>): Record<string, string> {
  const p: Record<string, string> = {};
  if (q.accountId) p.account_id = q.accountId;
  if (q.careUnitId) p.care_unit_id = q.careUnitId;
  if (q.from) p.from = q.from;
  if (q.to) p.to = q.to;
  return p;
}

export const apiExpenses = {
  accounts: async (): Promise<ExpenseAccount[]> => rows((await healthClient.get<Row[]>('/expense-accounts')).data).map(accountFrom),

  /** Devises de l'établissement, lues dans la comptabilité (table des monnaies) : on ne propose que celles qu'elle connaît. */
  currencies: async (): Promise<ExpenseCurrency[]> => rows((await healthClient.get<Row[]>('/expense-currencies')).data).map(currencyFrom).filter((c) => c.code !== ''),

  list: async (q: ExpenseQuery): Promise<{ rows: Expense[]; total: number }> => {
    const params: Record<string, string | number> = { ...paramsOf(q), per_page: EXPENSE_PAGE, page: q.page };
    if (q.state) params.status = q.state;
    if (q.q?.trim()) params.q = q.q.trim();
    const res = await healthClient.get<Row[]>('/expenses', { params });
    const list = rows(res.data).map(expenseFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },

  summary: async (q: { from?: string; to?: string; accountId?: string; careUnitId?: string }): Promise<ExpenseSummary> =>
    summaryFrom((await healthClient.get<Row>('/expenses/summary', { params: paramsOf(q) })).data),

  /** La clé d'idempotence rend l'envoi sûr : un double clic ou un rejeu après coupure ne crée jamais une seconde dépense. */
  /** Crée une catégorie de dépense (un compte de l'établissement dans UZISHA) ; le serveur refuse un nom déjà pris. */
  createAccount: async (name: string): Promise<ExpenseAccount> => accountFrom(rec((await healthClient.post<Row>('/expense-accounts', { name })).data)),

  create: async (n: NewExpense, key: string): Promise<Expense> => {
    const body: Record<string, unknown> = { account_id: Number(n.accountId), currency: n.currency, amount_minor: n.amountMinor, motif: n.motif.trim(), done_on: n.doneOn };
    if (n.careUnitId) body.care_unit_id = Number(n.careUnitId);
    return expenseFrom(rec((await healthClient.post<Row>('/expenses', body, { headers: { 'Idempotency-Key': key } })).data));
  },

  validate: async (id: string): Promise<Expense> => expenseFrom(rec((await healthClient.post<Row>(`/expenses/${id}/validate`)).data)),
  cancel: async (id: string, reason: string): Promise<Expense> => expenseFrom(rec((await healthClient.post<Row>(`/expenses/${id}/cancel`, { reason: reason.trim() })).data)),
};
