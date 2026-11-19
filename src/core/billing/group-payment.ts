import { BillingError, balances, type Invoice, type LedgerEntry } from './invoice';

/** Reste dû par le patient sur une facture (en unités mineures). */
export interface GroupDue { invoiceId: string; number: string; createdAt: string; due: number }
/** Part d'un règlement groupé affectée à UNE facture : chaque facture reste payée et tracée à part entière. */
export interface GroupShare { invoiceId: string; number: string; due: number; amount: number }

/** Factures encore dues par le patient (ni annulées ni brouillons), de la plus ancienne à la plus récente. */
export function unpaidDues(invoices: readonly Invoice[], ledger: readonly LedgerEntry[]): GroupDue[] {
  return invoices
    .filter((i) => !i.cancellation && i.status !== 'draft')
    .map((i) => ({ invoiceId: i.id, number: i.number, createdAt: i.createdAt, due: balances(i, ledger).patientBalance }))
    .filter((d) => d.due > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number));
}

/**
 * Répartit un règlement unique entre les factures, la plus ancienne d'abord : chacune est soldée avant de passer à la suivante,
 * la dernière touchée peut rester partiellement payée. Le montant ne peut dépasser le total dû.
 */
export function allocateGroupPayment(dues: readonly GroupDue[], amount: number): GroupShare[] {
  const total = dues.reduce((s, d) => s + d.due, 0);
  if (total <= 0) throw new BillingError('nothingDue');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new BillingError('amountInvalid');
  if (amount > total) throw new BillingError('overpayment', { due: total });
  let left = amount;
  const shares: GroupShare[] = [];
  for (const d of dues) {
    if (left <= 0) break;
    const part = Math.min(d.due, left);
    shares.push({ invoiceId: d.invoiceId, number: d.number, due: d.due, amount: part });
    left -= part;
  }
  return shares;
}
