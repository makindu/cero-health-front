import { describe, expect, it } from 'vitest';
import { buildInvoice, buildSettlement, deriveStatus, toInvoiceLine, balances, type Invoice, type LedgerEntry } from '@/core/billing/invoice';
import { priceLines } from '@/core/pricing/engine';
import { ITEMS, bundle, contract, coverage, ctx, org } from '@/core/pricing/fixtures';
import { insurerStatement } from './insurer-statement';
import type { FinanceSnapshot } from './types';

const NOW = '2026-11-14T10:00:00.000Z';
const insurer = org('ins');
const other = org('oth');
const k = contract('c1', 'ins', { rules: [{ coverageBp: 8000 }] });
const cov = bundle(coverage('cv1', 'P1', 'ins', 'c1'), insurer, k);

function invoice(id: string, number: string, at: string, coverages = [cov]): Invoice {
  const { results } = priceLines([{ item: ITEMS.consult, quantity: 1 }], ctx({ coverages }));
  const lines = results.map((r, i) => toInvoiceLine(r, ITEMS.consult, `${id}-L${i}`));
  return buildInvoice({ id, number, patientId: 'P1', patientName: 'Amani', currency: 'USD', lines, now: at, actor: 'c', existing: [] });
}
const view = (inv: Invoice, ledger: LedgerEntry[]) => ({ invoice: inv, ledger, status: deriveStatus(inv, ledger), balances: balances(inv, ledger) });

function snapshot(): FinanceSnapshot {
  const a = invoice('A', 'F-1', '2026-11-01T08:00:00.000Z');
  const b = invoice('B', 'F-2', '2026-11-10T08:00:00.000Z');
  const c = invoice('C', 'F-3', '2026-11-12T08:00:00.000Z', []);
  const settle = buildSettlement({ id: 'S1', invoice: a, ledger: [], organizationId: 'ins', amount: 1000, method: 'transfer', reference: 'VIR', cashier: 'c', now: NOW });
  return {
    day: '2026-11-18',
    invoices: [view(a, [settle]), view(b, []), view(c, [])],
    organizations: [insurer, other], contracts: [k],
    coverages: [cov.coverage], ledger: [settle], catalog: [], subscriptions: [], feePayments: [], feeHistory: [], authorizations: [],
  } as unknown as FinanceSnapshot;
}

describe('insurerStatement', () => {
  it('totalise les factures où l\'assureur a une part et ignore les autres', () => {
    const s = insurerStatement(snapshot(), 'ins');
    expect(s.invoices.map((i) => i.number).sort()).toEqual(['F-1', 'F-2']);
    expect(s.totals.settled).toBe(1000);
    expect(s.totals.outstanding).toBe(s.totals.due - 1000);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ kind: 'insurerSettlement', amount: 1000, invoiceNumber: 'F-1' });
  });
  it('filtre par période sur la date de facture', () => {
    const s = insurerStatement(snapshot(), 'ins', { from: '2026-11-05', to: '2026-11-30' });
    expect(s.invoices.map((i) => i.number)).toEqual(['F-2']);
    expect(s.totals.settled).toBe(0);
  });
  it('un autre organisme n\'a rien', () => {
    const s = insurerStatement(snapshot(), 'oth');
    expect(s.invoices).toHaveLength(0);
    expect(s.totals.due).toBe(0);
  });
  it('compte contrats et patients couverts', () => {
    const s = insurerStatement(snapshot(), 'ins');
    expect(s.contracts).toHaveLength(1);
    expect(s.coveredPatients).toBe(1);
    expect(s.activeCoveredPatients).toBe(1);
  });
});
