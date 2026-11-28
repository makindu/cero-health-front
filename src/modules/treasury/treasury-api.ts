import { healthClient } from '@/core/api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export type HandoverStatus = 'pending' | 'accepted' | 'disputed';
export interface Handover {
  id: string; fromUserId: string; fromUserName: string; date: string; currency: string; declaredMinor: number; status: HandoverStatus;
  receivedByName: string; receivedMinor: number | null; differenceMinor: number | null; note: string;
}
export interface TreasuryCurrency { pending: number; disputed: number; accepted: number; declaredMinor: number; receivedMinor: number; expectedMinor: number; closed: boolean }
export interface TreasurySummary { date: string; unsettled: number; currencies: Record<string, TreasuryCurrency> }
export interface TreasuryClosureRecord { id: string; userName: string; date: string; currency: string; handoversCount: number; handoversMinor: number; expectedMinor: number; countedMinor: number; differenceMinor: number; note: string }
export interface FundAssignment { id: string; userId: string; userName: string; currency: string; balanceMinor: number; description: string }
export interface UnclosedDay { userId: string; userName: string; date: string; isToday: boolean; currencies: { currency: string; cashMinor: number; expensesMinor: number; expectedMinor: number }[] }
export interface FundBalance { id: string; userId: string; userName: string; currency: string; balanceMinor: number; description: string }
export interface CashBookRow { id: string; date: string; type: 'entry' | 'exit'; amountMinor: number; motif: string; balanceMinor: number }
export interface CashBook {
  currency: string; openingMinor: number; closingMinor: number; entriesMinor: number; exitsMinor: number; total: number; rows: CashBookRow[];
  fund: { id: string; description: string; userId: string; userName: string };
}

const STATUSES: readonly HandoverStatus[] = ['pending', 'accepted', 'disputed'];
export function handoverFrom(r: Row): Handover {
  const s = text(r.status) as HandoverStatus;
  return {
    id: text(r.id), fromUserId: text(r.from_user_id), fromUserName: text(r.from_user_name), date: text(r.date), currency: text(r.currency), declaredMinor: num(r.declared_minor),
    status: STATUSES.includes(s) ? s : 'pending', receivedByName: text(r.received_by_name), receivedMinor: r.received_minor === null || r.received_minor === undefined ? null : num(r.received_minor),
    differenceMinor: r.difference_minor === null || r.difference_minor === undefined ? null : num(r.difference_minor), note: text(r.note),
  };
}
export function summaryFrom(r: Row): TreasurySummary {
  const cur: Record<string, TreasuryCurrency> = {};
  for (const [code, v] of Object.entries(rec(r.currencies))) {
    const c = rec(v);
    cur[code] = { pending: num(c.pending), disputed: num(c.disputed), accepted: num(c.accepted), declaredMinor: num(c.declared_minor), receivedMinor: num(c.received_minor), expectedMinor: num(c.expected_minor), closed: c.closed === true };
  }
  return { date: text(r.date), unsettled: num(r.unsettled), currencies: cur };
}
const closureFrom = (r: Row): TreasuryClosureRecord => ({
  id: text(r.id), userName: text(r.user_name), date: text(r.date), currency: text(r.currency), handoversCount: num(r.handovers_count), handoversMinor: num(r.handovers_minor),
  expectedMinor: num(r.expected_minor), countedMinor: num(r.counted_minor), differenceMinor: num(r.difference_minor), note: text(r.note),
});

const idem = (key: string) => ({ headers: { 'Idempotency-Key': key } });

export const apiTreasury = {
  /** Versements : tous ceux de l'établissement pour la financière, les siens pour un caissier. */
  handovers: async (q: { status?: HandoverStatus } = {}): Promise<Handover[]> =>
    rows((await healthClient.get<Row[]>('/treasury/handovers', { params: { per_page: 100, ...(q.status ? { status: q.status } : {}) } })).data).map(handoverFrom),
  accept: async (id: string, receivedMinor: number, note: string, key: string): Promise<Handover> =>
    handoverFrom(rec((await healthClient.post<Row>(`/treasury/handovers/${id}/accept`, { received_minor: receivedMinor, ...(note.trim() ? { note: note.trim() } : {}) }, idem(key))).data)),
  dispute: async (id: string, note: string, key: string): Promise<Handover> =>
    handoverFrom(rec((await healthClient.post<Row>(`/treasury/handovers/${id}/dispute`, { note: note.trim() }, idem(key))).data)),
  summary: async (date: string): Promise<TreasurySummary> => summaryFrom(rec((await healthClient.get<Row>('/treasury/summary', { params: { date } })).data)),
  close: async (date: string, lines: { currency: string; countedMinor: number }[], note: string, key: string): Promise<TreasuryClosureRecord[]> =>
    rows((await healthClient.post<Row[]>('/treasury/closures', { date, lines: lines.map((l) => ({ currency: l.currency, counted_minor: l.countedMinor })), ...(note.trim() ? { note: note.trim() } : {}) }, idem(key))).data).map(closureFrom),
  closures: async (): Promise<TreasuryClosureRecord[]> => rows((await healthClient.get<Row[]>('/treasury/closures', { params: { per_page: 30 } })).data).map(closureFrom),
  funds: async (): Promise<FundBalance[]> =>
    rows((await healthClient.get<Row[]>('/treasury/funds')).data).map((r) => ({ id: text(r.id), userId: text(r.user_id), userName: text(r.user_name), currency: text(r.currency), balanceMinor: num(r.balance_minor), description: text(r.description) })),
  /** Administration : toutes les caisses avec leur titulaire. */
  assignments: async (): Promise<FundAssignment[]> =>
    rows((await healthClient.get<Row[]>('/cash/funds')).data).map((r) => ({ id: text(r.id), userId: text(r.user_id), userName: text(r.user_name), currency: text(r.currency), balanceMinor: num(r.balance_minor), description: text(r.description) })),
  openFund: async (userId: string, currency: string, description = ''): Promise<void> => { await healthClient.post('/cash/funds', { user_id: Number(userId), currency, ...(description.trim() ? { description: description.trim() } : {}) }); },
  updateFund: async (fundId: string, p: { userId?: string; description?: string }): Promise<void> => {
    await healthClient.put(`/cash/funds/${fundId}`, { ...(p.userId ? { user_id: Number(p.userId) } : {}), ...(p.description !== undefined ? { description: p.description.trim() } : {}) });
  },
  reassignFund: async (fundId: string, userId: string): Promise<void> => { await healthClient.put(`/cash/funds/${fundId}`, { user_id: Number(userId) }); },
  /** Caisses non clôturées : caissiers avec activité sans clôture (31 derniers jours). */
  unclosed: async (): Promise<UnclosedDay[]> =>
    rows((await healthClient.get<Row[]>('/treasury/unclosed')).data).map((r) => ({
      userId: text(r.user_id), userName: text(r.user_name), date: text(r.date), isToday: r.is_today === true,
      currencies: rows(r.currencies).map((c) => ({ currency: text(c.currency), cashMinor: num(c.cash_minor), expensesMinor: num(c.expenses_minor), expectedMinor: num(c.expected_minor) })),
    })),
  /** Mes caisses (caissier). */
  myFunds: async (): Promise<FundBalance[]> =>
    rows((await healthClient.get<Row[]>('/cash/my-funds')).data).map((r) => ({ id: text(r.id), userId: text(r.user_id), userName: text(r.user_name), currency: text(r.currency), balanceMinor: num(r.balance_minor), description: text(r.description) })),
  /** Livre de caisse : mouvements d'une caisse (du plus récent au plus ancien) avec le solde après chacun. */
  cashBook: async (fundId: string, q: { from?: string; to?: string; page?: number }): Promise<CashBook> => {
    const d = rec((await healthClient.get<Row>(`/cash/funds/${fundId}/ledger`, { params: { ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}), page: q.page ?? 1, per_page: 25 } })).data);
    const f = rec(d.fund);
    return {
      currency: text(d.currency), openingMinor: num(d.opening_minor), closingMinor: num(d.closing_minor), entriesMinor: num(d.entries_minor), exitsMinor: num(d.exits_minor), total: num(d.total),
      rows: rows(d.rows).map((r) => ({ id: text(r.id), date: text(r.date), type: text(r.type) === 'entry' ? 'entry' : 'exit', amountMinor: num(r.amount_minor), motif: text(r.motif), balanceMinor: num(r.balance_minor) })),
      fund: { id: text(f.id), description: text(f.description), userId: text(f.user_id), userName: text(f.user_name) },
    };
  },
};
