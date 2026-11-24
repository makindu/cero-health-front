import { describe, expect, it } from 'vitest';
import { cashflowFirst, defaultPeriod, periodError, reportBlocks, reportGrid, tzOffsetMinutes, type ReportResult } from './reports-api';

describe('rapports (API)', () => {
  it('propose les 30 derniers jours', () => {
    expect(defaultPeriod(new Date(2026, 10, 23))).toEqual({ from: '2026-10-25', to: '2026-11-23' });
  });
  it('place la synthèse entrées / sorties / solde en tête sans toucher à l\'ordre des autres sections', () => {
    const s = (key: string) => ({ key, columns: ['key'], rows: [] });
    expect(cashflowFirst([s('invoices'), s('payments'), s('cashflow'), s('expenses')]).map((x) => x.key)).toEqual(['cashflow', 'invoices', 'payments', 'expenses']);
    expect(cashflowFirst([s('invoices')]).map((x) => x.key)).toEqual(['invoices']);
  });
  it('contrôle la période comme le serveur', () => {
    expect(periodError('', '2026-01-01')).toBe('missing');
    expect(periodError('2026-02-01', '2026-01-01')).toBe('order');
    expect(periodError('2024-01-01', '2026-01-01')).toBe('tooLong');
    expect(periodError('2026-01-01', '2026-01-31')).toBeNull();
    expect(periodError('2026-01-01', '2026-01-01')).toBeNull();
  });
  it('donne le décalage horaire en minutes, positif à l\'est de UTC', () => {
    expect(tzOffsetMinutes({ getTimezoneOffset: () => -120 } as Date)).toBe(120);
    expect(tzOffsetMinutes({ getTimezoneOffset: () => 300 } as Date)).toBe(-300);
  });
  it('met chaque section à la suite dans un tableur, comptages en nombres', () => {
    const result: ReportResult = {
      report: 'appointments', from: '2026-11-01', to: '2026-11-30',
      sections: [
        { key: 'summary', columns: ['key', 'count'], rows: [{ key: 'total', count: 3 }, { key: 'avgMinutes', count: 60 }] },
        { key: 'byStatus', columns: ['key', 'count'], rows: [{ key: 'arrived', count: 2 }] },
      ],
    };
    const grid = reportGrid(result, { title: 'T', section: (k) => `S:${k}`, column: (c) => `C:${c}`, cell: (_s, c, r) => `${c}=${String(r[c])}` });
    expect(grid[0]).toEqual(['T']);
    expect(grid[1]).toEqual(['2026-11-01 → 2026-11-30']);
    expect(grid[3]).toEqual(['S:summary']);
    expect(grid[4]).toEqual(['C:key', 'C:count']);
    expect(grid[5]).toEqual(['key=total', 3]);
    expect(grid[6]).toEqual(['key=avgMinutes', 'count=60']);
    expect(grid[8]).toEqual(['S:byStatus']);
    expect(grid[10]).toEqual(['key=arrived', 2]);
  });
  it('prépare le PDF : un tableau par section non vide, chiffres à droite', () => {
    const result: ReportResult = {
      report: 'finance', from: '2026-11-01', to: '2026-11-30',
      sections: [
        { key: 'summary', columns: ['key', 'count'], rows: [{ key: 'total', count: 3 }] },
        { key: 'empty', columns: ['key', 'count'], rows: [] },
        { key: 'byMethod', columns: ['method', 'amount_minor'], rows: [{ method: 'cash', amount_minor: 500 }] },
      ],
    };
    const blocks = reportBlocks(result, { title: 'T', section: (k) => `S:${k}`, column: (c) => `C:${c}`, cell: (_s, c, r) => `${c}=${String(r[c])}` });
    expect(blocks[0]).toEqual({ kind: 'title', text: 'T' });
    expect(blocks[1]).toEqual({ kind: 'meta', text: '2026-11-01 – 2026-11-30' });
    expect(blocks.filter((b) => b.kind === 'heading')).toHaveLength(2);
    expect(blocks[3]).toEqual({ kind: 'table', head: ['C:key', 'C:count'], rows: [['key=total', 'count=3']], align: ['left', 'right'] });
    expect(blocks[5]).toMatchObject({ kind: 'table', align: ['left', 'right'] });
  });
});
