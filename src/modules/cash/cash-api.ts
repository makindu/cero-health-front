import { healthClient } from '@/core/api';
import { dayRange } from '../billing/billing-rules';

/**
 * Caisse sur l'API HEALTH : les encaissements (paiements de factures) d'un jour, avec qui a encaissé et comment.
 * Les totaux viennent du serveur, calculés sur TOUS les encaissements du jour et pas seulement sur la page affichée.
 */
type Row = Record<string, unknown>;
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);

export const CASH_PAGE = 50;
export const METHOD_KEYS = ['cash', 'mobile_money', 'card', 'transfer'] as const;

export interface CashPayment {
  id: string; linkId: string; patientName: string; currency: string; amountMinor: number; method: string; groupId: string | null;
  paidAt: string; cashierId: string; cashierName: string;
}
export interface CurrencyTotals { currency: string; byMethod: Record<(typeof METHOD_KEYS)[number], number>; totalMinor: number }
export interface CashSummary { currencies: CurrencyTotals[]; cashiers: { id: string; name: string }[]; count: number }

export function paymentFrom(r: Row): CashPayment {
  return {
    id: text(r.id), linkId: text(r.link_id), patientName: text(r.patient_name) || (r.patient_id ? `#${text(r.patient_id)}` : ''), currency: text(r.currency) || 'USD',
    amountMinor: num(r.amount_minor), method: text(r.method), groupId: r.group_id ? text(r.group_id) : null, paidAt: text(r.paid_at),
    cashierId: text(r.paid_by_user_id), cashierName: text(r.cashier_name) || (r.paid_by_user_id ? `#${text(r.paid_by_user_id)}` : ''),
  };
}

export function summaryFrom(raw: unknown): CashSummary {
  const d = rec(raw);
  return {
    currencies: rows(d.currencies).map((c) => {
      const m = rec(c.by_method);
      return { currency: text(c.currency), byMethod: { cash: num(m.cash), mobile_money: num(m.mobile_money), card: num(m.card), transfer: num(m.transfer) }, totalMinor: num(c.total_minor) };
    }),
    cashiers: rows(d.cashiers).map((c) => ({ id: text(c.user_id), name: text(c.name) })),
    count: num(d.count),
  };
}

function paramsFor(day: string, cashierId: string): Record<string, string> | null {
  const range = dayRange(day);
  if (!range) return null;
  return { from: range.from, to: range.to, ...(cashierId ? { cashier_user_id: cashierId } : {}) };
}

export const apiCash = {
  payments: async (day: string, cashierId: string, page: number): Promise<{ rows: CashPayment[]; total: number }> => {
    const p = paramsFor(day, cashierId);
    if (!p) return { rows: [], total: 0 };
    const res = await healthClient.get<Row[]>('/billing/payments', { params: { ...p, per_page: CASH_PAGE, page } });
    const list = rows(res.data).map(paymentFrom);
    return { rows: list, total: res.meta?.total ?? list.length };
  },

  summary: async (day: string, cashierId: string): Promise<CashSummary> => {
    const p = paramsFor(day, cashierId);
    if (!p) return { currencies: [], cashiers: [], count: 0 };
    return summaryFrom((await healthClient.get<Row>('/billing/payments/summary', { params: p })).data);
  },
};
