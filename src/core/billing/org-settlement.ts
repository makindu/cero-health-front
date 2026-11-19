import { BillingError, balances, type Invoice, type LedgerEntry } from './invoice';

/** Part restante d'un organisme sur UNE facture (unités mineures). */
export interface OrgDue { invoiceId: string; number: string; createdAt: string; patientId: string; patientName: string; due: number }
/** Un membre (patient couvert) avec ses factures ouvertes chez l'organisme. */
export interface MemberDue { patientId: string; patientName: string; invoices: OrgDue[]; total: number }
/** Montant à régler sur une facture. */
export interface Allocation { invoiceId: string; amount: number }
export type LumpStrategy = 'oldest' | 'member' | 'proportional';

/**
 * Parts restantes d'un organisme, facture par facture (annulées et brouillons exclus), sur une période de dates de facture
 * optionnelle. Seules les factures où il reste quelque chose à encaisser sont retournées.
 */
export function organizationDues(
  items: readonly { invoice: Invoice; ledger: readonly LedgerEntry[] }[],
  organizationId: string,
  period: { from?: string; to?: string } = {},
): OrgDue[] {
  const out: OrgDue[] = [];
  for (const { invoice, ledger } of items) {
    if (invoice.cancellation || invoice.status === 'draft') continue;
    const day = invoice.createdAt.slice(0, 10);
    if ((period.from && day < period.from) || (period.to && day > period.to)) continue;
    const mine = balances(invoice, ledger).organizations.find((o) => o.organizationId === organizationId);
    if (!mine || mine.outstanding <= 0) continue;
    out.push({ invoiceId: invoice.id, number: invoice.number, createdAt: invoice.createdAt, patientId: invoice.patientId, patientName: invoice.patientName, due: mine.outstanding });
  }
  return out.sort(byAge);
}

const byAge = (a: OrgDue, b: OrgDue): number => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number);

/** Regroupe par membre (ordre alphabétique) ; les factures d'un membre vont de la plus ancienne à la plus récente. */
export function groupByMember(dues: readonly OrgDue[]): MemberDue[] {
  const map = new Map<string, MemberDue>();
  for (const d of [...dues].sort(byAge)) {
    const m = map.get(d.patientId) ?? { patientId: d.patientId, patientName: d.patientName, invoices: [], total: 0 };
    m.invoices.push(d);
    m.total += d.due;
    map.set(d.patientId, m);
  }
  return [...map.values()].sort((a, b) => a.patientName.localeCompare(b.patientName) || a.patientId.localeCompare(b.patientId));
}

const totalOf = (dues: readonly { due: number }[]): number => dues.reduce((s, d) => s + d.due, 0);

function checkAmount(amount: number, total: number): void {
  if (total <= 0) throw new BillingError('nothingDue');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new BillingError('amountInvalid');
  if (amount > total) throw new BillingError('overpayment', { due: total });
}

/** Répartit un montant sur des factures, la plus ancienne d'abord (chacune soldée avant la suivante). */
export function spreadOldestFirst(dues: readonly OrgDue[], amount: number): Allocation[] {
  checkAmount(amount, totalOf(dues));
  let left = amount;
  const out: Allocation[] = [];
  for (const d of [...dues].sort(byAge)) {
    if (left <= 0) break;
    const part = Math.min(d.due, left);
    out.push({ invoiceId: d.invoiceId, amount: part });
    left -= part;
  }
  return out;
}

/**
 * Répartit une somme globale reçue de l'organisme entre ses membres :
 *  - `oldest` : les factures les plus anciennes de TOUS les membres d'abord ;
 *  - `member` : membre après membre (ordre alphabétique), chacun soldé avant le suivant ;
 *  - `proportional` : chaque membre reçoit la même fraction de son dû (arrondi au plus fort reste, jamais au-delà de son dû).
 */
export function distributeLump(members: readonly MemberDue[], lump: number, strategy: LumpStrategy): Allocation[] {
  const all = members.flatMap((m) => m.invoices);
  checkAmount(lump, totalOf(all));
  if (strategy === 'oldest') return spreadOldestFirst(all, lump);
  if (strategy === 'member') {
    let left = lump;
    const out: Allocation[] = [];
    for (const m of members) {
      if (left <= 0) break;
      const part = Math.min(m.total, left);
      out.push(...spreadOldestFirst(m.invoices, part));
      left -= part;
    }
    return out;
  }
  const total = totalOf(all);
  const base = members.map((m) => {
    const exact = (lump * m.total) / total;
    return { m, floor: Math.min(m.total, Math.floor(exact)), frac: exact - Math.floor(exact) };
  });
  let rest = lump - base.reduce((s, b) => s + b.floor, 0);
  for (const b of [...base].sort((x, y) => y.frac - x.frac || x.m.patientName.localeCompare(y.m.patientName))) {
    if (rest <= 0) break;
    if (b.floor < b.m.total) { b.floor += 1; rest -= 1; }
  }
  return base.flatMap((b) => (b.floor > 0 ? spreadOldestFirst(b.m.invoices, b.floor) : []));
}

/**
 * Contrôle un lot de montants saisis par facture : entiers positifs, facture connue et unique, jamais au-delà de la part restante.
 * Les montants nuls sont ignorés (membre non réglé). Retourne le lot nettoyé ; refuse un lot vide.
 */
export function validateAllocations(dues: readonly OrgDue[], allocations: readonly Allocation[]): Allocation[] {
  const byId = new Map(dues.map((d) => [d.invoiceId, d]));
  const seen = new Set<string>();
  const out: Allocation[] = [];
  for (const a of allocations) {
    if (a.amount === 0) continue;
    if (!Number.isSafeInteger(a.amount) || a.amount < 0) throw new BillingError('amountInvalid');
    const due = byId.get(a.invoiceId);
    if (!due) throw new BillingError('organizationNotOnInvoice');
    if (seen.has(a.invoiceId)) throw new BillingError('duplicatePayment');
    seen.add(a.invoiceId);
    if (a.amount > due.due) throw new BillingError('settlementExceedsDue', { due: due.due });
    out.push({ invoiceId: a.invoiceId, amount: a.amount });
  }
  if (out.length === 0) throw new BillingError('amountInvalid');
  return out;
}
