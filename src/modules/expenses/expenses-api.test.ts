import { describe, expect, it } from 'vitest';
import { checkExpense, currencyFrom, defaultCurrency, expenseFrom, flowOf, summaryFrom } from './expenses-api';

describe('dépenses API', () => {
  it('traduit une dépense du serveur', () => {
    expect(expenseFrom({
      id: 4, account_id: 501, account_name: 'Fournitures médicales', care_unit_id: 2, currency: 'USD', amount_minor: 12050, motif: 'Gants', done_on: '2026-11-23',
      state: 'validated', validated_at: '2026-11-23T10:00:00Z', cancel_reason: null, created_by: 'Mme Caissière', created_at: '2026-11-23T09:00:00Z',
    })).toEqual({
      id: '4', accountId: '501', accountName: 'Fournitures médicales', careUnitId: '2', currency: 'USD', amountMinor: 12050, motif: 'Gants', doneOn: '2026-11-23',
      state: 'validated', validatedAt: '2026-11-23T10:00:00Z', cancelReason: '', createdBy: 'Mme Caissière', createdAt: '2026-11-23T09:00:00Z',
    });
  });
  it('considère « à valider » tout état inconnu et accepte l\'absence de service', () => {
    const e = expenseFrom({ id: 1, state: 'bizarre', care_unit_id: null });
    expect(e.state).toBe('pending');
    expect(e.careUnitId).toBeNull();
    expect(e.currency).toBe('USD');
  });
  it('traduit le résumé par devise et supporte une réponse vide', () => {
    const s = summaryFrom({ from: '2026-11-23', to: '2026-11-23', count: 3, currencies: [{ currency: 'USD', pending_minor: 1000, validated_minor: 2500, total_minor: 3500 }] });
    expect(s.currencies).toEqual([{ currency: 'USD', pendingMinor: 1000, validatedMinor: 2500, totalMinor: 3500 }]);
    expect(summaryFrom(undefined)).toEqual({ from: '', to: '', count: 0, currencies: [] });
  });
  it('calcule entrées, sorties validées, en attente et solde par devise (le solde ignore les dépenses en attente)', () => {
    expect(flowOf(
      [{ currency: 'USD', totalMinor: 10000 }],
      [{ currency: 'USD', pendingMinor: 1000, validatedMinor: 2500, totalMinor: 3500 }, { currency: 'CDF', pendingMinor: 0, validatedMinor: 500000, totalMinor: 500000 }],
    )).toEqual([
      { currency: 'CDF', incomeMinor: 0, validatedMinor: 500000, pendingMinor: 0, balanceMinor: -500000 },
      { currency: 'USD', incomeMinor: 10000, validatedMinor: 2500, pendingMinor: 1000, balanceMinor: 7500 },
    ]);
    expect(flowOf([], [])).toEqual([]);
  });
  it('traduit les devises de la comptabilité et propose la principale d\'office', () => {
    const list = [currencyFrom({ code: 'cdf', is_default: false }), currencyFrom({ code: 'USD', is_default: true })];
    expect(list).toEqual([{ code: 'CDF', isDefault: false }, { code: 'USD', isDefault: true }]);
    expect(defaultCurrency(list)).toBe('USD');
    expect(defaultCurrency([{ code: 'CDF', isDefault: false }])).toBe('CDF');
    expect(defaultCurrency([])).toBe('');
  });
  it('vérifie la saisie avant envoi', () => {
    const ok = { accountId: '501', amount: '120,5', currency: 'USD', motif: 'Gants' };
    expect(checkExpense(ok)).toEqual({ ok: true, minor: 12050 });
    expect(checkExpense({ ...ok, accountId: '' })).toEqual({ ok: false, reason: 'account' });
    expect(checkExpense({ ...ok, amount: '' })).toEqual({ ok: false, reason: 'amount' });
    expect(checkExpense({ ...ok, amount: '0' })).toEqual({ ok: false, reason: 'amount' });
    expect(checkExpense({ ...ok, amount: 'abc' })).toEqual({ ok: false, reason: 'amountUnreadable' });
    expect(checkExpense({ ...ok, amount: '1,234' })).toEqual({ ok: false, reason: 'amountUnreadable' });
    expect(checkExpense({ ...ok, motif: '   ' })).toEqual({ ok: false, reason: 'motif' });
  });
});
