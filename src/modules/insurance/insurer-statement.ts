import { balances, type LedgerEntry } from '@/core/billing/invoice';
import type { Contract } from '@/core/pricing/types';
import type { FinanceSnapshot } from './types';

export interface StatementInvoice {
  invoiceId: string; number: string; date: string; patientId: string; patientName: string;
  billable: number; due: number; settled: number; transferred: number; disputed: number; outstanding: number;
}
export interface StatementEntry { id: string; at: string; invoiceNumber: string; patientName: string; kind: 'insurerSettlement' | 'insurerRejection'; amount: number; method?: string; reference?: string; reason?: string; transferToPatient?: boolean; reversed: boolean }
export interface InsurerStatement {
  organizationId: string;
  totals: { invoices: number; billable: number; due: number; settled: number; transferred: number; disputed: number; outstanding: number };
  invoices: StatementInvoice[];
  entries: StatementEntry[];
  contracts: Contract[];
  coveredPatients: number;
  activeCoveredPatients: number;
}

const dayOf = (iso: string): string => iso.slice(0, 10);

/**
 * Situation complète d'un organisme (assureur, mutuelle, entreprise…) sur une période : factures où il a une part,
 * règlements et rejets, restant à recouvrer, contrats et patients couverts. Calculée sur les écritures réelles (jamais saisie).
 * La période filtre sur la DATE DE LA FACTURE ; les règlements d'une facture retenue sont tous listés, même postérieurs.
 */
export function insurerStatement(data: FinanceSnapshot, organizationId: string, period: { from?: string; to?: string } = {}): InsurerStatement {
  const rows: StatementInvoice[] = [];
  const entries: StatementEntry[] = [];
  for (const { invoice, ledger, status } of data.invoices) {
    if (status === 'cancelled' || status === 'draft') continue;
    const day = dayOf(invoice.createdAt);
    if ((period.from && day < period.from) || (period.to && day > period.to)) continue;
    const mine = balances(invoice, ledger).organizations.find((o) => o.organizationId === organizationId);
    if (!mine || (mine.due === 0 && mine.settled === 0 && mine.transferred === 0 && mine.disputed === 0)) continue;
    rows.push({
      invoiceId: invoice.id, number: invoice.number, date: invoice.createdAt, patientId: invoice.patientId, patientName: invoice.patientName,
      billable: invoice.totals.billable, due: mine.due, settled: mine.settled, transferred: mine.transferred, disputed: mine.disputed, outstanding: mine.outstanding,
    });
    const reversed = new Set(ledger.filter((e: LedgerEntry) => e.kind === 'reversal' && e.reversalOf).map((e) => e.reversalOf as string));
    for (const e of ledger) {
      if (e.organizationId !== organizationId || (e.kind !== 'insurerSettlement' && e.kind !== 'insurerRejection')) continue;
      entries.push({
        id: e.id, at: e.at, invoiceNumber: invoice.number, patientName: invoice.patientName, kind: e.kind, amount: e.amount,
        ...(e.method ? { method: e.method } : {}), ...(e.reference ? { reference: e.reference } : {}), ...(e.reason ? { reason: e.reason } : {}),
        ...(e.transferToPatient !== undefined ? { transferToPatient: e.transferToPatient } : {}), reversed: reversed.has(e.id),
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const sum = (k: keyof StatementInvoice): number => rows.reduce((s, r) => s + (r[k] as number), 0);
  const covs = data.coverages.filter((c) => c.organizationId === organizationId);
  const active = covs.filter((c) => c.status === 'validated' && c.validFrom <= data.day && data.day <= c.validTo);
  return {
    organizationId,
    totals: { invoices: rows.length, billable: sum('billable'), due: sum('due'), settled: sum('settled'), transferred: sum('transferred'), disputed: sum('disputed'), outstanding: sum('outstanding') },
    invoices: rows, entries,
    contracts: data.contracts.filter((c) => c.organizationId === organizationId),
    coveredPatients: new Set(covs.map((c) => c.patientId)).size,
    activeCoveredPatients: new Set(active.map((c) => c.patientId)).size,
  };
}
