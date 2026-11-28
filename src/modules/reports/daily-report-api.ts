import { healthClient } from '@/core/api';
import { PDF_MIME, XLSX_MIME, downloadBytes } from '../_shared/export/download';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : {});
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Colonnes du rapport, dans l'ordre du classeur de l'hôpital. */
export const DAILY_COLUMNS = ['consultation', 'laboratory', 'care', 'medications', 'hospitalization'] as const;
export type DailyColumn = (typeof DAILY_COLUMNS)[number];

export interface DailyLine {
  date: string;
  /** Service (rapport « par service ») ; vide = sans service. */
  unit: string;
  amounts: Record<DailyColumn, number>;
  receiptsMinor: number;
  expensesMinor: number;
  balanceMinor: number;
  observations: string;
}
export interface DailyReport { currency: string; from: string; to: string; days: DailyLine[]; totals: DailyLine; byUnit: DailyLine[]; warnings: string[] }

const lineFrom = (r: Row): DailyLine => ({
  date: text(r.date), unit: text(r.unit),
  amounts: Object.fromEntries(DAILY_COLUMNS.map((c) => [c, num(r[c])])) as Record<DailyColumn, number>,
  receiptsMinor: num(r.receipts_minor), expensesMinor: num(r.expenses_minor), balanceMinor: num(r.balance_minor), observations: text(r.observations),
});

export function dailyFrom(v: unknown): DailyReport {
  const d = rec(v);
  return {
    currency: text(d.currency), from: text(d.from), to: text(d.to),
    days: rows(d.days).map(lineFrom), totals: lineFrom(rec(d.totals)), byUnit: rows(d.by_unit).map(lineFrom),
    warnings: Array.isArray(d.warnings) ? d.warnings.map(text) : [],
  };
}

/** Même limite que le serveur : 31 jours au plus. */
export function dailyPeriodError(from: string, to: string): 'missing' | 'order' | 'tooLong' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'missing';
  if (to < from) return 'order';
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 >= 31 ? 'tooLong' : null;
}

const params = (from: string, to: string, units: string[]) => ({ from, to, ...(units.length > 0 ? { care_unit_ids: units.map(Number) } : {}) });

export const apiDaily = {
  report: async (from: string, to: string, units: string[]): Promise<DailyReport> => dailyFrom((await healthClient.get<Row>('/reports/daily', { params: params(from, to, units) })).data),
  /** Télécharge le même rapport en Excel ou en PDF, généré par le serveur. */
  download: async (format: 'xlsx' | 'pdf', from: string, to: string, units: string[]): Promise<void> => {
    const res = await healthClient.raw.get<Blob>('/reports/daily/export', {
      params: { ...params(from, to, units), format }, responseType: 'blob', headers: { Accept: format === 'xlsx' ? XLSX_MIME : PDF_MIME },
    });
    const blob = res.data as Blob;
    downloadBytes(`rapport-journalier-${from}${from === to ? '' : `-au-${to}`}.${format}`, new Uint8Array(await blob.arrayBuffer()), format === 'xlsx' ? XLSX_MIME : PDF_MIME);
  },
};
