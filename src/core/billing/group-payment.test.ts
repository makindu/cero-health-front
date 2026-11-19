import { describe, expect, it } from 'vitest';
import { allocateGroupPayment, type GroupDue } from './group-payment';

const dues: GroupDue[] = [
  { invoiceId: 'a', number: 'F-1', createdAt: '2026-11-01', due: 5000 },
  { invoiceId: 'b', number: 'F-2', createdAt: '2026-11-05', due: 3000 },
  { invoiceId: 'c', number: 'F-3', createdAt: '2026-11-09', due: 2000 },
];

describe('allocateGroupPayment', () => {
  it("solde la plus ancienne d'abord puis passe à la suivante", () => {
    const shares = allocateGroupPayment(dues, 6000);
    expect(shares.map((s) => [s.invoiceId, s.amount])).toEqual([['a', 5000], ['b', 1000]]);
  });
  it('solde tout quand le montant égale le total', () => {
    expect(allocateGroupPayment(dues, 10000).map((s) => s.amount)).toEqual([5000, 3000, 2000]);
  });
  it('refuse un trop-perçu, un montant nul et rien à payer', () => {
    expect(() => allocateGroupPayment(dues, 10001)).toThrow();
    expect(() => allocateGroupPayment(dues, 0)).toThrow();
    expect(() => allocateGroupPayment([], 100)).toThrow();
  });
  it('la somme des parts est exactement le montant payé', () => {
    const shares = allocateGroupPayment(dues, 7777);
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(7777);
  });
});
