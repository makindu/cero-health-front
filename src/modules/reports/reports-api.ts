import { healthClient } from '@/core/api';
import type { DocBlock } from '../_shared/export/document-model';
import type { Cell } from '../_shared/export/xlsx';

export const API_REPORTS = ['activity', 'appointments', 'laboratory', 'hospitalization', 'finance'] as const;
export type ApiReportId = (typeof API_REPORTS)[number];

export interface ReportSection {
  key: string;
  columns: string[];
  rows: Record<string, string | number>[];
}

export interface ReportResult {
  report: string;
  from: string;
  to: string;
  sections: ReportSection[];
}

/** Décalage de l'heure locale par rapport à UTC, en minutes (ex. UTC+2 → 120) : le serveur en déduit les bornes des jours. */
export const tzOffsetMinutes = (date: Date = new Date()): number => -date.getTimezoneOffset();

const pad = (n: number): string => String(n).padStart(2, '0');
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Les 30 derniers jours, aujourd'hui compris. */
export function defaultPeriod(today: Date = new Date()): { from: string; to: string } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return { from: dayKey(start), to: dayKey(today) };
}

export function periodError(from: string, to: string): 'missing' | 'order' | 'tooLong' | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'missing';
  if (to < from) return 'order';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days > 366 ? 'tooLong' : null;
}

export async function fetchReport(report: ApiReportId, from: string, to: string, careUnitIds: string[] = []): Promise<ReportResult> {
  const res = await healthClient.get<{ report: string; from: string; to: string; sections: ReportSection[] }>(`/reports/${report}`, {
    params: { from, to, tz: tzOffsetMinutes(), ...(careUnitIds.length > 0 ? { care_unit_ids: careUnitIds.map(Number) } : {}) },
  });
  const data = res.data;
  return { report: data.report, from: data.from, to: data.to, sections: cashflowFirst(Array.isArray(data.sections) ? data.sections : []) };
}

/** Le patron voit d'abord « entrées, sorties et solde » ; les autres sections gardent leur ordre. */
export function cashflowFirst(sections: ReportSection[]): ReportSection[] {
  return [...sections.filter((s) => s.key === 'cashflow'), ...sections.filter((s) => s.key !== 'cashflow')];
}

export interface GridLabels {
  title: string;
  section: (key: string) => string;
  column: (col: string) => string;
  /** Texte d'une cellule (déjà traduit / formaté). */
  cell: (sectionKey: string, col: string, row: Record<string, string | number>) => string;
}

/** Tableur : un titre, puis chaque section (titre, en-têtes, lignes) séparée par une ligne vide. Les comptages restent des nombres. */
export function reportGrid(result: ReportResult, labels: GridLabels): Cell[][] {
  const grid: Cell[][] = [[labels.title], [`${result.from} → ${result.to}`], []];
  for (const section of result.sections) {
    grid.push([labels.section(section.key)]);
    grid.push(section.columns.map((c) => labels.column(c)));
    for (const row of section.rows) {
      grid.push(section.columns.map((c) => (c === 'count' && typeof row[c] === 'number' && !(section.key === 'summary' && row.key === 'avgMinutes') ? (row[c] as number) : labels.cell(section.key, c, row))));
    }
    grid.push([]);
  }
  return grid;
}

/** Document (PDF) : titre, période, puis un tableau par section non vide. Les colonnes de texte sont à gauche, les chiffres à droite. */
export function reportBlocks(result: ReportResult, labels: GridLabels): DocBlock[] {
  const blocks: DocBlock[] = [{ kind: 'title', text: labels.title }, { kind: 'meta', text: `${result.from} – ${result.to}` }];
  const textual = new Set(['key', 'currency', 'status', 'method', 'unit']);
  for (const section of result.sections) {
    if (section.rows.length === 0) continue;
    blocks.push({ kind: 'heading', text: labels.section(section.key) });
    blocks.push({
      kind: 'table',
      head: section.columns.map((c) => labels.column(c)),
      rows: section.rows.map((row) => section.columns.map((c) => labels.cell(section.key, c, row))),
      align: section.columns.map((c) => (textual.has(c) ? 'left' : 'right')),
    });
  }
  return blocks;
}
