import { describe, expect, it } from 'vitest';
import { dailyFrom, dailyPeriodError } from './daily-report-api';

describe('rapport journalier (API)', () => {
  it('traduit la réponse du serveur : montants par nature, recettes, sorties, solde, services', () => {
    const line = { date: '2026-11-28', consultation: 100, laboratory: 200, care: 300, medications: 400, hospitalization: 500, receipts_minor: 1500, expenses_minor: 100, balance_minor: 1400, observations: 'Écart de caisse -1.00 USD' };
    const r = dailyFrom({ currency: 'USD', from: '2026-11-28', to: '2026-11-28', days: [line], totals: line, by_unit: [{ ...line, unit: 'Pharmacie' }], warnings: ['x'] });
    expect(r.currency).toBe('USD');
    expect(r.days[0]).toMatchObject({ date: '2026-11-28', receiptsMinor: 1500, expensesMinor: 100, balanceMinor: 1400, observations: 'Écart de caisse -1.00 USD' });
    expect(r.days[0]?.amounts).toEqual({ consultation: 100, laboratory: 200, care: 300, medications: 400, hospitalization: 500 });
    expect(r.byUnit[0]?.unit).toBe('Pharmacie');
    expect(r.warnings).toEqual(['x']);
  });
  it('accepte une réponse vide sans planter', () => {
    const r = dailyFrom(null);
    expect(r.days).toEqual([]);
    expect(r.totals.receiptsMinor).toBe(0);
  });
  it('limite la période à 31 jours, comme le serveur', () => {
    expect(dailyPeriodError('', '2026-11-01')).toBe('missing');
    expect(dailyPeriodError('2026-11-10', '2026-11-01')).toBe('order');
    expect(dailyPeriodError('2026-10-01', '2026-11-01')).toBe('tooLong');   // 32 jours
    expect(dailyPeriodError('2026-10-02', '2026-11-01')).toBeNull();        // 31 jours
    expect(dailyPeriodError('2026-11-28', '2026-11-28')).toBeNull();
  });
});
