import { describe, expect, it } from 'vitest';
import { applyUsage, priceLine, priceLines } from '../pricing/engine';
import { ITEMS, bundle, contract, coverage, ctx, org, subscription } from '../pricing/fixtures';
import { emptyUsage, type CatalogItem } from '../pricing/types';
import {
  balances, buildInvoice, buildPayment, buildRefund, buildRejection, buildReversal, buildSettlement, cancelInvoice, authorizeCredit, deriveStatus,
  nextInvoiceNumber, toInvoiceLine, type Invoice, type LedgerEntry,
} from './invoice';

const NOW = '2026-11-14T10:00:00.000Z';
const insurer = org('ins');
const k = contract('c1', 'ins', { rules: [{ coverageBp: 8000, negotiatedUnit: 1800, category: 'consultation' }, { coverageBp: 8000 }] });
const cov = bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k);

function make(coverages = [cov], existing: Invoice[] = [], source?: { module: string; ref: string }, items: CatalogItem[] = [ITEMS.consult]): Invoice {
  const { results } = priceLines(items.map((item) => ({ item, quantity: 1 })), ctx({ coverages }));
  const lines = results.map((r, i) => toInvoiceLine(r, items[i]!, `L${i}`, i === 0 ? source : undefined));
  return buildInvoice({ id: 'INV-1', number: 'FAC-2026-000001', patientId: 'P1', patientName: 'Amani Alpha', currency: 'USD', lines, now: NOW, actor: 'Caissier (démo)', existing });
}
const pay = (invoice: Invoice, ledger: LedgerEntry[], amount: number, id = `PAY-${ledger.length + 1}`, method: 'cash' | 'card' = 'cash', reference?: string) =>
  buildPayment({ id, invoice, ledger, amount, method, reference, cashier: 'Caissier (démo)', now: NOW });

describe('facture — répartition et instantané', () => {
  it('assuré 80 % : patient 3,60, créance assureur 14,40 ; la créance n’est pas un encaissement', () => {
    const inv = make();
    expect(inv.totals).toMatchObject({ billable: 1800, insurer: 1440, patient: 360, subscription: 0, discount: 200 });
    const b = balances(inv, []);
    expect(b).toMatchObject({ patientDue: 360, patientPaid: 0, patientBalance: 360, organizationsOutstanding: 1440, outstandingTotal: 1800 });
    expect(deriveStatus(inv, [])).toBe('awaitingPayment');
  });

  it('facture partiellement couverte : jamais « payée » tant que l’assureur n’a pas réglé', () => {
    const inv = make();
    const ledger = [pay(inv, [], 360)];
    expect(balances(inv, ledger)).toMatchObject({ patientBalance: 0, organizationsOutstanding: 1440 });
    expect(deriveStatus(inv, ledger)).toBe('partiallyPaid');
  });

  it("assureur qui règle ultérieurement : règlement partiel puis total → payée", () => {
    const inv = make();
    let ledger: LedgerEntry[] = [pay(inv, [], 360)];
    ledger = [...ledger, buildSettlement({ id: 'S1', invoice: inv, ledger, organizationId: 'ins', amount: 1000, method: 'transfer', reference: 'VIR-1', cashier: 'c', now: NOW })];
    expect(balances(inv, ledger).organizations[0]).toMatchObject({ settled: 1000, outstanding: 440 });
    expect(deriveStatus(inv, ledger)).toBe('partiallyPaid');
    expect(() => buildSettlement({ id: 'S2', invoice: inv, ledger, organizationId: 'ins', amount: 441, method: 'transfer', cashier: 'c', now: NOW })).toThrow(/settlementExceedsDue/);
    ledger = [...ledger, buildSettlement({ id: 'S2', invoice: inv, ledger, organizationId: 'ins', amount: 440, method: 'transfer', cashier: 'c', now: NOW })];
    expect(deriveStatus(inv, ledger)).toBe('paid');
  });

  it('rejet : reporté sur le patient (dû patient augmente) ou conservé en litige', () => {
    const inv = make();
    let ledger: LedgerEntry[] = [pay(inv, [], 360)];
    const dispute = buildRejection({ id: 'R1', invoice: inv, ledger, organizationId: 'ins', amount: 400, reason: 'Pièce manquante', transferToPatient: false, cashier: 'c', now: NOW });
    ledger = [...ledger, dispute];
    expect(balances(inv, ledger).organizations[0]).toMatchObject({ disputed: 400, outstanding: 1440 });
    const transfer = buildRejection({ id: 'R2', invoice: inv, ledger, organizationId: 'ins', amount: 1000, reason: 'Exclu du contrat', transferToPatient: true, cashier: 'c', now: NOW });
    ledger = [...ledger, transfer];
    expect(balances(inv, ledger)).toMatchObject({ patientDue: 1360, patientBalance: 1000 });
    expect(() => buildRejection({ id: 'R3', invoice: inv, ledger, organizationId: 'ins', amount: 100, reason: '', transferToPatient: true, cashier: 'c', now: NOW })).toThrow(/reasonRequired/);
  });

  it('un snapshot ne change pas quand le contrat change ensuite', () => {
    const inv = make();
    const frozen = JSON.stringify(inv.lines[0]?.rules);
    k.rules[0]!.coverageBp = 1;
    expect(JSON.stringify(inv.lines[0]?.rules)).toBe(frozen);
    expect(inv.lines[0]?.rules.primary?.rule.coverageBp).toBe(8000);
    k.rules[0]!.coverageBp = 8000;
  });

  it("anti-doublon de facturation d'une même prestation", () => {
    const first = make([cov], [], { module: 'consultation', ref: 'C-1' });
    expect(() => make([cov], [first], { module: 'consultation', ref: 'C-1' })).toThrow(/alreadyInvoiced/);
    const cancelled = cancelInvoice(first, [], 'Erreur de saisie', 'u', NOW);
    expect(make([cov], [cancelled], { module: 'consultation', ref: 'C-1' }).sourceKeys).toEqual(['consultation:C-1']);
  });

  it('numérotation continue par année', () => {
    expect(nextInvoiceNumber([], 2026)).toBe('FAC-2026-000001');
    expect(nextInvoiceNumber([{ number: 'FAC-2026-000007' }, { number: 'FAC-2025-000099' }], 2026)).toBe('FAC-2026-000008');
  });
});

describe('caisse — paiements, contrepassations, remboursements', () => {
  const inv = make([], [], undefined, [ITEMS.consult, ITEMS.lab]); // privé : 35,00

  it('paiements partiels multi-méthodes, jamais de trop-perçu, jamais deux fois le même envoi', () => {
    let ledger: LedgerEntry[] = [];
    ledger = [...ledger, pay(inv, ledger, 1000, 'P-A')];
    expect(deriveStatus(inv, ledger)).toBe('partiallyPaid');
    expect(() => pay(inv, ledger, 1000, 'P-A')).toThrow(/duplicatePayment/);
    expect(() => pay(inv, ledger, 3000, 'P-B')).toThrow(/overpayment/);
    expect(() => pay(inv, ledger, 500, 'P-C', 'card')).toThrow(/referenceRequired/);
    ledger = [...ledger, pay(inv, ledger, 500, 'P-C', 'card', 'TX-77')];
    ledger = [...ledger, pay(inv, ledger, 2000, 'P-D')];
    expect(balances(inv, ledger).patientBalance).toBe(0);
    expect(deriveStatus(inv, ledger)).toBe('paid');
    expect(() => pay(inv, ledger, 100, 'P-E')).toThrow(/nothingDue/);
  });

  it('contrepassation : écriture inverse, motif obligatoire, une seule fois, jamais de suppression', () => {
    let ledger: LedgerEntry[] = [pay(inv, [], 3500, 'P-1')];
    expect(deriveStatus(inv, ledger)).toBe('paid');
    expect(() => buildReversal({ id: 'X1', original: ledger[0]!, ledger, reason: ' ', cashier: 'c', now: NOW })).toThrow(/reasonRequired/);
    const rev = buildReversal({ id: 'X1', original: ledger[0]!, ledger, reason: 'Erreur de montant', cashier: 'c', now: NOW });
    ledger = [...ledger, rev];
    expect(ledger).toHaveLength(2);
    expect(balances(inv, ledger)).toMatchObject({ patientPaid: 0, patientBalance: 3500 });
    expect(deriveStatus(inv, ledger)).toBe('awaitingPayment');
    expect(() => buildReversal({ id: 'X2', original: ledger[0]!, ledger, reason: 'encore', cashier: 'c', now: NOW })).toThrow(/alreadyReversed/);
    expect(() => buildReversal({ id: 'X3', original: rev, ledger, reason: 'x', cashier: 'c', now: NOW })).toThrow(/cannotReverseReversal/);
  });

  it('remboursement borné par ce qui a été payé ; annulation refusée tant que des paiements existent', () => {
    let ledger: LedgerEntry[] = [pay(inv, [], 1000, 'P-1')];
    expect(() => buildRefund({ id: 'RF1', invoice: inv, ledger, amount: 1500, method: 'cash', reason: 'x', cashier: 'c', now: NOW })).toThrow(/refundExceedsPaid/);
    expect(() => cancelInvoice(inv, ledger, 'x', 'u', NOW)).toThrow(/hasPayments/);
    ledger = [...ledger, buildRefund({ id: 'RF1', invoice: inv, ledger, amount: 1000, method: 'cash', reason: 'Patient parti', cashier: 'c', now: NOW })];
    expect(balances(inv, ledger).patientPaid).toBe(0);
    const cancelled = cancelInvoice(inv, ledger, 'Annulation autorisée', 'Resp', NOW);
    expect(deriveStatus(cancelled, ledger)).toBe('cancelled');
    expect(() => pay(cancelled, ledger, 100, 'P-9')).toThrow(/invoiceCancelled/);
    // La contrepassation d'un remboursement rétablit l'encaissement.
    const back = buildReversal({ id: 'X9', original: ledger[1]!, ledger, reason: 'Remboursement saisi par erreur', cashier: 'c', now: NOW });
    expect(balances(inv, [...ledger, back]).patientPaid).toBe(1000);
  });

  it('crédit autorisé : motif obligatoire, statut dédié, ne remplace jamais l’encaissement', () => {
    const credit = authorizeCredit(inv, [], 'Garantie familiale', 'Resp', NOW);
    expect(() => authorizeCredit(inv, [], '', 'Resp', NOW)).toThrow(/reasonRequired/);
    expect(credit.credit).toMatchObject({ amount: 3500, by: 'Resp' });
    expect(deriveStatus(credit, [])).toBe('creditAuthorized');
    expect(balances(credit, []).patientBalance).toBe(3500);
  });

  it('abonné avec gratuité : la part abonnement n’est ni créance ni encaissement', () => {
    const { results } = priceLines([{ item: ITEMS.consult, quantity: 1 }], ctx({ subscription: subscription({ freeConsultations: 1 }), usage: applyUsage(emptyUsage(), { coverageSpent: {}, franchiseUsed: {}, quotaUsed: {}, freeConsultationsUsed: {} }) }));
    const free = buildInvoice({ id: 'I2', number: 'FAC-2026-000002', patientId: 'P1', patientName: 'A', currency: 'USD', lines: [toInvoiceLine(results[0]!, ITEMS.consult, 'L1')], now: NOW, actor: 'u', existing: [] });
    expect(free.totals).toMatchObject({ billable: 2000, subscription: 2000, patient: 0, insurer: 0 });
    expect(balances(free, []).outstandingTotal).toBe(0);
    expect(deriveStatus(free, [])).toBe('paid');
    expect(priceLine(ITEMS.consult, 1, ctx()).patientShare.minor).toBe(2000);
  });
});
