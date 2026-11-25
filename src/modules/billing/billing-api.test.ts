import { describe, expect, it } from 'vitest';
import { balanceFrom, depositPayload, linkFrom, receiptFrom, settingsFrom, stateOf } from './billing-api';

describe('facturation API', () => {
  it('traduit une facture avec ses paiements', () => {
    const l = linkFrom({
      id: 7, source_type: 'consultation', source_id: 3, patient_id: 9, patient_name: 'Alpha Test', currency: 'USD', status: 'active',
      total_minor: 5000, paid_minor: 2000, remaining_minor: 3000, created_at: '2026-11-22T09:00:00Z', cancel_reason: null,
      payments: [{ id: 1, amount_minor: 2000, method: 'cash', paid_at: '2026-11-22T09:05:00Z', group_id: null }],
    });
    expect(l).toMatchObject({ id: '7', sourceType: 'consultation', patientName: 'Alpha Test', totalMinor: 5000, remainingMinor: 3000 });
    expect(l.payments).toEqual([{ id: '1', amountMinor: 2000, method: 'cash', paidAt: '2026-11-22T09:05:00Z', groupId: null }]);
  });

  it('donne un nom de repli sans nom de patient et accepte l\'absence de paiements', () => {
    const l = linkFrom({ id: 1, patient_id: 4, status: 'active', total_minor: 100, paid_minor: 0, remaining_minor: 100 });
    expect(l.patientName).toBe('#4');
    expect(l.payments).toEqual([]);
  });

  it('déduit l\'état depuis les montants', () => {
    const base = { totalMinor: 5000 };
    expect(stateOf({ ...base, status: 'active', paidMinor: 0, remainingMinor: 5000 })).toBe('awaiting');
    expect(stateOf({ ...base, status: 'active', paidMinor: 2000, remainingMinor: 3000 })).toBe('partial');
    expect(stateOf({ ...base, status: 'active', paidMinor: 5000, remainingMinor: 0 })).toBe('paid');
    expect(stateOf({ ...base, status: 'cancelled', paidMinor: 0, remainingMinor: 0 })).toBe('cancelled');
  });

  it('lit le solde par devise et ignore les soldes nuls', () => {
    expect(balanceFrom({ patient_id: 9, balances: [{ currency: 'USD', outstanding_minor: 3000 }, { currency: 'CDF', outstanding_minor: 0 }] }))
      .toEqual([{ currency: 'USD', outstandingMinor: 3000 }]);
    expect(balanceFrom({})).toEqual([]);
  });

  it('lit le reçu d\'un règlement groupé', () => {
    const r = receiptFrom({ group_id: 'grp-1', currency: 'USD', total_minor: 4000, shares: [
      { link_id: 1, source_type: 'consultation', amount_minor: 3000, remaining_minor: 0 }, { link_id: 2, source_type: 'lab_order', amount_minor: 1000, remaining_minor: 500 }] });
    expect(r).toMatchObject({ groupId: 'grp-1', totalMinor: 4000 });
    expect(r.shares).toEqual([{ linkId: '1', sourceType: 'consultation', amountMinor: 3000, remainingMinor: 0 }, { linkId: '2', sourceType: 'lab_order', amountMinor: 1000, remainingMinor: 500 }]);
    expect(receiptFrom({}).shares).toEqual([]);
  });

  it('lit les réglages de facturation et prépare le dépôt par défaut', () => {
    expect(settingsFrom({ default_deposit_id: 12, currency: 'USD' })).toEqual({ defaultDepositId: '12', currency: 'USD' });
    expect(settingsFrom({ default_deposit_id: null })).toEqual({ defaultDepositId: null, currency: '' });
    expect(settingsFrom(null)).toEqual({ defaultDepositId: null, currency: '' });
    expect(depositPayload('12')).toEqual({ default_deposit_id: 12 });
    expect(depositPayload('')).toEqual({ default_deposit_id: null });
    expect(depositPayload('abc')).toEqual({ default_deposit_id: null });
    expect(depositPayload('0')).toEqual({ default_deposit_id: null });
  });
});
