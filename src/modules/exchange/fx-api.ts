import { healthClient } from '@/core/api';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export interface FxRate { id: string; baseCurrency: string; currency: string; rate: string; date: string; setByName: string }
export interface FxOverview { base: string; rates: FxRate[]; history: FxRate[] }

export const fxRateFrom = (r: Row): FxRate => ({ id: text(r.id), baseCurrency: text(r.base_currency), currency: text(r.currency), rate: text(r.rate), date: text(r.date), setByName: text(r.set_by_name) });
export function fxOverviewFrom(v: unknown): FxOverview {
  const d = rec(v);
  return { base: text(d.base), rates: rows(d.rates).map(fxRateFrom), history: rows(d.history).map(fxRateFrom) };
}

export const apiFx = {
  overview: async (currency?: string): Promise<FxOverview> => fxOverviewFrom((await healthClient.get<Row>('/exchange-rates', { params: currency ? { currency } : {} })).data),
  /** Fixe le taux : « 1 devise par défaut = rate devise ». Sans date : aujourd'hui. */
  set: async (currency: string, rate: string, date?: string): Promise<FxRate> =>
    fxRateFrom(rec((await healthClient.post<Row>('/exchange-rates', { currency: currency.trim().toUpperCase(), rate: rate.trim(), ...(date ? { date } : {}) })).data)),
  /** Montant converti (unités mineures) au taux du jour. */
  convert: async (amountMinor: number, from: string, to: string, date?: string): Promise<number> => {
    const d = rec((await healthClient.get<Row>('/exchange-rates/convert', { params: { amount_minor: amountMinor, from, to, ...(date ? { date } : {}) } })).data);
    return Number(d.amount_minor) || 0;
  },
};
