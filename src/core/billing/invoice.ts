import type { AppliedRulesSnapshot, CatalogItem, PricingResult, Reason, ServiceCategory, UsageDelta } from '../pricing/types';

/**
 * Domaine facture / caisse / créances — fonctions PURES (montants en unités mineures entières).
 *
 * Principes (docs/BUSINESS_RULES.md §8-10) :
 *  - facturé ≠ encaissé ≠ pris en charge ; une créance sur un organisme n'est JAMAIS un encaissement ;
 *  - une facture émise n'est jamais modifiée silencieusement : correction par annulation, contrepassation ou remboursement ;
 *  - aucune écriture du grand livre n'est supprimée ; une erreur se corrige par une écriture inverse qui référence l'originale ;
 *  - chaque ligne conserve l'instantané des règles appliquées : un contrat ou un tarif modifié plus tard ne change pas l'ancienne facture.
 */

export type InvoiceStatus = 'draft' | 'awaitingPayment' | 'partiallyPaid' | 'paid' | 'creditAuthorized' | 'cancelled';
export type PaymentMethod = 'cash' | 'mobileMoney' | 'card' | 'transfer';

export interface InvoiceLineShare {
  coverageId: string;
  organizationId: string;
  contractId: string;
  role: 'primary' | 'complementary';
  rateBp: number;
  amount: number;
}

export interface InvoiceLine {
  id: string;
  itemCode: string;
  label: string;
  category: ServiceCategory;
  quantity: number;
  reference: number;
  billable: number;
  discount: number;
  insurerShares: InvoiceLineShare[];
  subscriptionShare: number;
  patientShare: number;
  franchise: number;
  ticketModerator: number;
  basis: PricingResult['basis'];
  outcome: PricingResult['outcome'];
  needsAuthorization: boolean;
  justification: Reason[];
  /** Copie figée des règles appliquées (organisme, contrat, tarif négocié, taux, franchise, plafonds, coordination). */
  rules: AppliedRulesSnapshot;
  /** Origine de la prestation (module et référence) : empêche de facturer deux fois la même source. */
  source?: { module: string; ref: string };
}

export interface Invoice {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  currency: string;
  status: InvoiceStatus;
  createdAt: string;
  createdBy: string;
  lines: InvoiceLine[];
  totals: { reference: number; billable: number; discount: number; insurer: number; subscription: number; patient: number };
  episodeId?: string;
  /** Clés « module:ref » des prestations facturées (anti-doublon). */
  sourceKeys: string[];
  /** Consommations (plafonds, franchise, quotas, gratuités) engendrées par cette facture : alimente la tarification des suivantes dans l'épisode. */
  usage?: UsageDelta;
  credit?: { at: string; by: string; reason: string; amount: number };
  cancellation?: { at: string; by: string; reason: string };
}

export type LedgerKind = 'payment' | 'refund' | 'reversal' | 'insurerSettlement' | 'insurerRejection';

export interface LedgerEntry {
  id: string;
  at: string;
  invoiceId: string;
  patientId: string;
  kind: LedgerKind;
  currency: string;
  /** Toujours positif ; le sens est donné par `kind` (et `reversalOf`). */
  amount: number;
  method?: PaymentMethod;
  reference?: string;
  cashier: string;
  reason?: string;
  reversalOf?: string;
  organizationId?: string;
  /** Règlement groupé : même identifiant sur toutes les écritures d'un paiement réparti entre plusieurs factures. */
  groupId?: string;
  /** Rejet : la somme est reportée sur le patient (sinon elle reste un litige à suivre). */
  transferToPatient?: boolean;
}

export class BillingError extends Error {
  constructor(readonly code: string, readonly params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'BillingError';
  }
}

function fail(code: string, params?: Record<string, string | number>): never {
  throw new BillingError(code, params);
}

export function toInvoiceLine(result: PricingResult, item: CatalogItem, id: string, source?: InvoiceLine['source']): InvoiceLine {
  return {
    id,
    itemCode: item.code,
    label: item.label,
    category: item.category,
    quantity: result.quantity,
    reference: result.reference.minor,
    billable: result.billable.minor,
    discount: result.discount.minor,
    insurerShares: result.insurerShares.map((s) => ({ ...s, amount: s.amount.minor })),
    subscriptionShare: result.subscriptionShare.minor,
    patientShare: result.patientShare.minor,
    franchise: result.franchise.minor,
    ticketModerator: result.ticketModerator.minor,
    basis: result.basis,
    outcome: result.outcome,
    needsAuthorization: result.needsAuthorization,
    justification: result.justification.map((j) => ({ ...j })),
    rules: structuredClone(result.rules),
    source,
  };
}

export function computeTotals(lines: readonly InvoiceLine[]): Invoice['totals'] {
  const total = (pick: (l: InvoiceLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  return {
    reference: total((l) => l.reference),
    billable: total((l) => l.billable),
    discount: total((l) => l.discount),
    insurer: total((l) => l.insurerShares.reduce((s, x) => s + x.amount, 0)),
    subscription: total((l) => l.subscriptionShare),
    patient: total((l) => l.patientShare),
  };
}

export const sourceKey = (source: { module: string; ref: string }): string => `${source.module}:${source.ref}`;

/** Prochain numéro de facture : FAC-AAAA-NNNNNN, continu par établissement et par année. */
export function nextInvoiceNumber(existing: readonly Pick<Invoice, 'number'>[], year: number): string {
  const prefix = `FAC-${year}-`;
  const last = existing.map((i) => i.number).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...last) + 1).padStart(6, '0')}`;
}

export function buildInvoice(input: {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  currency: string;
  lines: InvoiceLine[];
  now: string;
  actor: string;
  episodeId?: string;
  usage?: UsageDelta;
  existing: readonly Invoice[];
}): Invoice {
  if (input.lines.length === 0) fail('invoiceEmpty');
  // Anti-doublon : une prestation (module + référence) ne se facture qu'une fois, sauf facture précédente annulée.
  const alive = new Set(input.existing.filter((i) => i.status !== 'cancelled').flatMap((i) => i.sourceKeys));
  const keys = input.lines.flatMap((l) => (l.source ? [sourceKey(l.source)] : []));
  const dup = keys.find((k) => alive.has(k)) ?? keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) fail('alreadyInvoiced', { source: dup });
  const totals = computeTotals(input.lines);
  const sum = totals.insurer + totals.subscription + totals.patient;
  if (sum !== totals.billable) fail('totalsMismatch');
  return {
    id: input.id, number: input.number, patientId: input.patientId, patientName: input.patientName, currency: input.currency,
    status: 'awaitingPayment', createdAt: input.now, createdBy: input.actor, lines: input.lines, totals, episodeId: input.episodeId, sourceKeys: keys, usage: input.usage,
  };
}

const signed = (e: LedgerEntry, byId: Map<string, LedgerEntry>): number => {
  if (e.kind === 'payment') return e.amount;
  if (e.kind === 'refund') return -e.amount;
  if (e.kind === 'reversal') {
    const original = e.reversalOf ? byId.get(e.reversalOf) : undefined;
    return original?.kind === 'refund' ? e.amount : -e.amount; // contrepassation d'un paiement : −, d'un remboursement : +
  }
  return 0;
};

export interface OrganizationBalance {
  organizationId: string;
  due: number;
  settled: number;
  /** Rejets reportés sur le patient (ne sont plus dus par l'organisme). */
  transferred: number;
  /** Rejets en litige (toujours dus, à suivre). */
  disputed: number;
  outstanding: number;
}

export interface Balances {
  patientDue: number;
  patientPaid: number;
  /** Positif = reste à payer ; négatif = trop-perçu à rembourser. */
  patientBalance: number;
  organizations: OrganizationBalance[];
  organizationsOutstanding: number;
  /** Facturé − part abonnement − encaissé patient − règlements organismes − rejets reportés : 0 = soldée. */
  outstandingTotal: number;
}

export function balances(invoice: Invoice, ledger: readonly LedgerEntry[]): Balances {
  const mine = ledger.filter((e) => e.invoiceId === invoice.id);
  const byId = new Map(mine.map((e) => [e.id, e]));
  // Encaissements du PATIENT uniquement : paiements, remboursements et leurs contrepassations (pas les règlements d'organismes).
  const patientKinds: readonly LedgerKind[] = ['payment', 'refund'];
  const isPatientEntry = (e: LedgerEntry): boolean =>
    patientKinds.includes(e.kind) || (e.kind === 'reversal' && patientKinds.includes(byId.get(e.reversalOf ?? '')?.kind as LedgerKind));
  const patientPaid = mine.filter(isPatientEntry).reduce((s, e) => s + signed(e, byId), 0);
  const orgs = new Map<string, OrganizationBalance>();
  const org = (id: string): OrganizationBalance => {
    let o = orgs.get(id);
    if (!o) { o = { organizationId: id, due: 0, settled: 0, transferred: 0, disputed: 0, outstanding: 0 }; orgs.set(id, o); }
    return o;
  };
  for (const line of invoice.lines) for (const s of line.insurerShares) org(s.organizationId).due += s.amount;
  const reversed = new Set(mine.filter((e) => e.kind === 'reversal' && e.reversalOf).map((e) => e.reversalOf as string));
  for (const e of mine) {
    if (!e.organizationId || reversed.has(e.id)) continue;
    if (e.kind === 'insurerSettlement') org(e.organizationId).settled += e.amount;
    if (e.kind === 'insurerRejection') {
      if (e.transferToPatient) org(e.organizationId).transferred += e.amount;
      else org(e.organizationId).disputed += e.amount;
    }
  }
  const organizations = [...orgs.values()].map((o) => ({ ...o, outstanding: o.due - o.settled - o.transferred }));
  const transferred = organizations.reduce((s, o) => s + o.transferred, 0);
  const patientDue = invoice.totals.patient + transferred;
  const organizationsOutstanding = organizations.reduce((s, o) => s + o.outstanding, 0);
  return {
    patientDue, patientPaid, patientBalance: patientDue - patientPaid, organizations, organizationsOutstanding,
    outstandingTotal: patientDue - patientPaid + organizationsOutstanding,
  };
}

/** Statut dérivé du grand livre (jamais saisi à la main). Une part non encaissée d'un organisme garde la facture « non soldée ». */
export function deriveStatus(invoice: Invoice, ledger: readonly LedgerEntry[]): InvoiceStatus {
  if (invoice.cancellation) return 'cancelled';
  if (invoice.status === 'draft') return 'draft';
  const b = balances(invoice, ledger);
  if (b.patientBalance <= 0 && b.organizationsOutstanding === 0) return 'paid';
  if (invoice.credit) return 'creditAuthorized';
  const received = b.patientPaid > 0 || b.organizations.some((o) => o.settled > 0) || invoice.totals.subscription > 0;
  return received ? 'partiallyPaid' : 'awaitingPayment';
}

const needsReference: readonly PaymentMethod[] = ['mobileMoney', 'card', 'transfer'];

export function buildPayment(input: {
  id: string; invoice: Invoice; ledger: readonly LedgerEntry[]; amount: number; method: PaymentMethod; reference?: string; cashier: string; now: string;
}): LedgerEntry {
  const { invoice } = input;
  if (invoice.cancellation) fail('invoiceCancelled');
  if (invoice.status === 'draft') fail('invoiceDraft');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('amountInvalid');
  if (needsReference.includes(input.method) && !(input.reference ?? '').trim()) fail('referenceRequired');
  // Anti double paiement : un identifiant de soumission déjà enregistré est refusé (le même clic envoyé deux fois).
  if (input.ledger.some((e) => e.id === input.id)) fail('duplicatePayment');
  const due = balances(invoice, input.ledger).patientBalance;
  if (due <= 0) fail('nothingDue');
  if (input.amount > due) fail('overpayment', { due });
  return { id: input.id, at: input.now, invoiceId: invoice.id, patientId: invoice.patientId, kind: 'payment', currency: invoice.currency, amount: input.amount, method: input.method, reference: input.reference?.trim() || undefined, cashier: input.cashier };
}

/** Contrepassation : écriture inverse qui référence l'originale (jamais de suppression). Motif obligatoire, une seule fois. */
export function buildReversal(input: { id: string; original: LedgerEntry; ledger: readonly LedgerEntry[]; reason: string; cashier: string; now: string }): LedgerEntry {
  const { original } = input;
  if (!input.reason.trim()) fail('reasonRequired');
  if (original.kind === 'reversal') fail('cannotReverseReversal');
  if (input.ledger.some((e) => e.reversalOf === original.id)) fail('alreadyReversed');
  return { id: input.id, at: input.now, invoiceId: original.invoiceId, patientId: original.patientId, kind: 'reversal', currency: original.currency, amount: original.amount, method: original.method, cashier: input.cashier, reason: input.reason.trim(), reversalOf: original.id, organizationId: original.organizationId };
}

export function buildRefund(input: { id: string; invoice: Invoice; ledger: readonly LedgerEntry[]; amount: number; method: PaymentMethod; reason: string; cashier: string; now: string }): LedgerEntry {
  if (!input.reason.trim()) fail('reasonRequired');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('amountInvalid');
  if (input.ledger.some((e) => e.id === input.id)) fail('duplicatePayment');
  const b = balances(input.invoice, input.ledger);
  if (input.amount > b.patientPaid) fail('refundExceedsPaid', { paid: b.patientPaid });
  return { id: input.id, at: input.now, invoiceId: input.invoice.id, patientId: input.invoice.patientId, kind: 'refund', currency: input.invoice.currency, amount: input.amount, method: input.method, cashier: input.cashier, reason: input.reason.trim() };
}

export function cancelInvoice(invoice: Invoice, ledger: readonly LedgerEntry[], reason: string, actor: string, now: string): Invoice {
  if (!reason.trim()) fail('reasonRequired');
  if (invoice.cancellation) fail('invoiceCancelled');
  const b = balances(invoice, ledger);
  if (b.patientPaid !== 0) fail('hasPayments');
  if (b.organizations.some((o) => o.settled > 0 || o.transferred > 0 || o.disputed > 0)) fail('hasSettlements');
  return { ...invoice, cancellation: { at: now, by: actor, reason: reason.trim() }, status: 'cancelled' };
}

/** Crédit autorisé (la permission est vérifiée par le service) : motif obligatoire ; ne s'applique qu'au reste dû par le patient. */
export function authorizeCredit(invoice: Invoice, ledger: readonly LedgerEntry[], reason: string, actor: string, now: string): Invoice {
  if (!reason.trim()) fail('reasonRequired');
  if (invoice.cancellation) fail('invoiceCancelled');
  const due = balances(invoice, ledger).patientBalance;
  if (due <= 0) fail('nothingDue');
  return { ...invoice, credit: { at: now, by: actor, reason: reason.trim(), amount: due } };
}

export function buildSettlement(input: { id: string; invoice: Invoice; ledger: readonly LedgerEntry[]; organizationId: string; amount: number; method: PaymentMethod; reference?: string; cashier: string; now: string }): LedgerEntry {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('amountInvalid');
  if (input.ledger.some((e) => e.id === input.id)) fail('duplicatePayment');
  const org = balances(input.invoice, input.ledger).organizations.find((o) => o.organizationId === input.organizationId);
  if (!org) fail('organizationNotOnInvoice');
  if (input.amount > org.outstanding) fail('settlementExceedsDue', { due: org.outstanding });
  return { id: input.id, at: input.now, invoiceId: input.invoice.id, patientId: input.invoice.patientId, kind: 'insurerSettlement', currency: input.invoice.currency, amount: input.amount, method: input.method, reference: input.reference?.trim() || undefined, cashier: input.cashier, organizationId: input.organizationId };
}

export function buildRejection(input: { id: string; invoice: Invoice; ledger: readonly LedgerEntry[]; organizationId: string; amount: number; reason: string; transferToPatient: boolean; cashier: string; now: string }): LedgerEntry {
  if (!input.reason.trim()) fail('reasonRequired');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) fail('amountInvalid');
  if (input.ledger.some((e) => e.id === input.id)) fail('duplicatePayment');
  const org = balances(input.invoice, input.ledger).organizations.find((o) => o.organizationId === input.organizationId);
  if (!org) fail('organizationNotOnInvoice');
  if (input.amount > org.outstanding - org.disputed) fail('rejectionExceedsDue', { due: org.outstanding - org.disputed });
  return { id: input.id, at: input.now, invoiceId: input.invoice.id, patientId: input.invoice.patientId, kind: 'insurerRejection', currency: input.invoice.currency, amount: input.amount, cashier: input.cashier, reason: input.reason.trim(), organizationId: input.organizationId, transferToPatient: input.transferToPatient };
}
