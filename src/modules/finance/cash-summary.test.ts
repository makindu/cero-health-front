import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '@/core/billing/invoice';
import { summarizeCash } from './cash-summary';

const e = (id: string, kind: LedgerEntry['kind'], amount: number, over: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, at: '2026-11-14T08:00:00.000Z', invoiceId: 'I1', patientId: 'P', kind, currency: 'USD', amount, cashier: 'c', method: 'cash', ...over });

describe('synthèse de caisse', () => {
  it('nette les paiements, remboursements et contrepassations par mode', () => {
    const all = [e('a', 'payment', 1000), e('b', 'payment', 500, { method: 'mobileMoney' }), e('c', 'refund', 200), e('d', 'reversal', 500, { method: 'mobileMoney', reversalOf: 'b' })];
    const s = summarizeCash(all);
    expect(s.byMethod).toEqual({ cash: 800, mobileMoney: 0, card: 0, transfer: 0 });
    expect(s.patientNet).toBe(800);
  });
  it('ne mélange jamais les règlements d’organismes à la caisse patient', () => {
    const s = summarizeCash([e('a', 'payment', 300), e('s', 'insurerSettlement', 1440, { method: 'transfer', organizationId: 'o' })]);
    expect(s.patientNet).toBe(300);
    expect(s.organizationReceipts).toBe(1440);
  });
  it('une contrepassation de remboursement ré-augmente la caisse', () => {
    const all = [e('p', 'payment', 1000), e('r', 'refund', 400), e('x', 'reversal', 400, { reversalOf: 'r' })];
    expect(summarizeCash(all).patientNet).toBe(1000);
  });
});
