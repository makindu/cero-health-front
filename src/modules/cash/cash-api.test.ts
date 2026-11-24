import { describe, expect, it } from 'vitest';
import { paymentFrom, summaryFrom } from './cash-api';

describe('caisse API', () => {
  it('traduit un encaissement', () => {
    expect(paymentFrom({
      id: 5, link_id: 7, patient_id: 9, patient_name: 'Alpha Test', currency: 'USD', amount_minor: 2000, method: 'cash', group_id: null,
      paid_at: '2026-11-22T09:05:00Z', paid_by_user_id: 3, cashier_name: 'Mme Caissière',
    })).toEqual({
      id: '5', linkId: '7', patientName: 'Alpha Test', currency: 'USD', amountMinor: 2000, method: 'cash', groupId: null,
      paidAt: '2026-11-22T09:05:00Z', cashierId: '3', cashierName: 'Mme Caissière',
    });
  });
  it('donne des noms de repli et garde le groupe d\'un règlement groupé', () => {
    const p = paymentFrom({ id: 1, link_id: 2, patient_id: 4, amount_minor: 100, method: 'card', group_id: 'g-1', paid_by_user_id: 8 });
    expect(p).toMatchObject({ patientName: '#4', cashierName: '#8', groupId: 'g-1', currency: 'USD' });
  });
  it('traduit la synthèse par devise et par mode, avec des zéros pour les modes absents', () => {
    const s = summaryFrom({
      currencies: [{ currency: 'USD', by_method: { cash: 2000, mobile_money: 1500 }, total_minor: 3500 }], cashiers: [{ user_id: 3, name: 'Mme Caissière' }], count: 2,
    });
    expect(s.currencies).toEqual([{ currency: 'USD', byMethod: { cash: 2000, mobile_money: 1500, card: 0, transfer: 0 }, totalMinor: 3500 }]);
    expect(s.cashiers).toEqual([{ id: '3', name: 'Mme Caissière' }]);
    expect(s.count).toBe(2);
  });
  it('accepte une réponse vide ou inattendue sans planter', () => {
    expect(summaryFrom(undefined)).toEqual({ currencies: [], cashiers: [], count: 0 });
    expect(summaryFrom('x')).toEqual({ currencies: [], cashiers: [], count: 0 });
  });
});
