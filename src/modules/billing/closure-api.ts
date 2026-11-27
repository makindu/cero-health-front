import { healthClient } from '@/core/api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface DayCurrency {
  currency: string; entriesMinor: number; cashMinor: number; expensesMinor: number; expectedMinor: number; byMethod: Record<string, number>;
  /** Présent quand cette devise est déjà clôturée. */
  closure?: { countedMinor: number; differenceMinor: number; note: string };
}
export interface ClosureDay { date: string; isToday: boolean; currencies: DayCurrency[] }
export interface ClosureRecord {
  id: string; userId: string; userName: string; date: string; currency: string; entriesMinor: number; cashMinor: number; expensesMinor: number;
  expectedMinor: number; countedMinor: number; differenceMinor: number; note: string; createdAt: string;
}

export function dayCurrencyFrom(r: Row): DayCurrency {
  const k = rec(r.closure);
  const by: Record<string, number> = {};
  for (const [m, v] of Object.entries(rec(r.by_method))) by[m] = num(v);
  return {
    currency: text(r.currency), entriesMinor: num(r.entries_minor), cashMinor: num(r.cash_minor), expensesMinor: num(r.expenses_minor), expectedMinor: num(r.expected_minor), byMethod: by,
    ...(r.closure ? { closure: { countedMinor: num(k.counted_minor), differenceMinor: num(k.difference_minor), note: text(k.note) } } : {}),
  };
}
export const dayFrom = (r: Row): ClosureDay => ({ date: text(r.date), isToday: r.is_today === true, currencies: rows(r.currencies).map(dayCurrencyFrom) });
export function recordFrom(r: Row): ClosureRecord {
  return {
    id: text(r.id), userId: text(r.user_id), userName: text(r.user_name), date: text(r.date), currency: text(r.currency), entriesMinor: num(r.entries_minor), cashMinor: num(r.cash_minor),
    expensesMinor: num(r.expenses_minor), expectedMinor: num(r.expected_minor), countedMinor: num(r.counted_minor), differenceMinor: num(r.difference_minor), note: text(r.note), createdAt: text(r.created_at),
  };
}

export const apiClosure = {
  /** Journées du caissier connecté qui attendent encore leur clôture (tableau de bord). */
  pending: async (): Promise<ClosureDay[]> => rows((await healthClient.get<Row[]>('/cash-closures/pending')).data).map(dayFrom),

  /** Totaux d'une journée : encaissements par mode, dépenses, attendu en espèces. */
  preview: async (date: string): Promise<{ date: string; closed: boolean; currencies: DayCurrency[] }> => {
    const d = rec((await healthClient.get<Row>('/cash-closures/preview', { params: { date } })).data);
    return { date: text(d.date), closed: d.closed === true, currencies: rows(d.currencies).map(dayCurrencyFrom) };
  },

  /** La clé rend l'envoi sûr : un double clic ou un rejeu ne clôture jamais deux fois. */
  close: async (date: string, lines: { currency: string; countedMinor: number }[], note: string, key: string): Promise<ClosureRecord[]> =>
    rows((await healthClient.post<Row[]>('/cash-closures', { date, lines: lines.map((l) => ({ currency: l.currency, counted_minor: l.countedMinor })), ...(note.trim() ? { note: note.trim() } : {}) }, { headers: { 'Idempotency-Key': key } })).data).map(recordFrom),

  /** Historique : les siennes, ou toutes avec le droit « tout voir ». */
  list: async (q: { from?: string; to?: string; userId?: string }): Promise<ClosureRecord[]> => {
    const params: Record<string, string | number> = { per_page: 100 };
    if (q.from) params.from = q.from;
    if (q.to) params.to = q.to;
    if (q.userId) params.user_id = q.userId;
    return rows((await healthClient.get<Row[]>('/cash-closures', { params })).data).map(recordFrom);
  },
};
