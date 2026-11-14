import type { LedgerEntry, PaymentMethod } from '@/core/billing/invoice';

export interface CashSummary {
  /** Encaissements nets du PATIENT par mode (paiements − remboursements − contrepassations de paiements + contrepassations de remboursements). */
  byMethod: Record<PaymentMethod, number>;
  patientNet: number;
  /** Règlements reçus d'organismes : suivis à part, ne sont JAMAIS mélangés à la caisse du jour des patients. */
  organizationReceipts: number;
  entries: number;
}

const ZERO = (): Record<PaymentMethod, number> => ({ cash: 0, mobileMoney: 0, card: 0, transfer: 0 });

/** Synthèse de caisse sur une liste d'écritures déjà filtrée (jour, caissier…). Fonction pure. */
export function summarizeCash(entries: readonly LedgerEntry[], all: readonly LedgerEntry[] = entries): CashSummary {
  const byId = new Map(all.map((e) => [e.id, e]));
  const byMethod = ZERO();
  let organizationReceipts = 0;
  for (const e of entries) {
    if (e.kind === 'insurerSettlement') { organizationReceipts += e.amount; continue; }
    if (e.kind === 'insurerRejection') continue;
    const method = e.method ?? 'cash';
    if (e.kind === 'payment') byMethod[method] += e.amount;
    else if (e.kind === 'refund') byMethod[method] -= e.amount;
    else if (e.kind === 'reversal') {
      const original = e.reversalOf ? byId.get(e.reversalOf) : undefined;
      if (original?.kind === 'refund') byMethod[method] += e.amount;
      else if (original?.kind === 'payment') byMethod[method] -= e.amount;
      else if (original?.kind === 'insurerSettlement') organizationReceipts -= e.amount;
    }
  }
  return { byMethod, patientNet: Object.values(byMethod).reduce((s, n) => s + n, 0), organizationReceipts, entries: entries.length };
}
