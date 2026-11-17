import {
  authorizeCredit, balances, buildInvoice, buildPayment, buildRefund, buildRejection, buildReversal, buildSettlement, BillingError,
  cancelInvoice, deriveStatus, nextInvoiceNumber, toInvoiceLine, type Balances, type Invoice, type InvoiceStatus, type LedgerEntry, type PaymentMethod,
} from '@/core/billing/invoice';
import { buildExemption, buildFeePayment, feeStatus, type FeePayment, type FeeStatus, type ValidityConfig, type ValidityMode, addCalendarMonths } from '@/core/billing/validity';
import type { Unit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { money } from '@/core/money/money';
import { priceLines } from '@/core/pricing/engine';
import { emptyUsage, type CatalogItem, type Contract, type CoverageBundle, type Organization, type PatientCoverage, type PricingContext, type PricingResult, type Subscription, type UsageDelta, type ValidationStatus } from '@/core/pricing/types';
import { applyUsage } from '@/core/pricing/engine';
import { BusinessRuleError } from '../_shared/business-error';
import {
  authorizationsRef, catalogRef, contractsRef, coveragesRef, feeConfigRef, feePaymentsRef, invoicesRef, ledgerRef, organizationsRef, subscriptionsRef,
  type AuthorizationGrant, type FeeConfigDoc,
} from './collections';

/** Codes de prestation dont le paiement ouvre la période de validité des frais de consultation (générale ou spécialisée). */
export const CONSULTATION_FEE_CODES: readonly string[] = ['CONS-GEN', 'CONS-SPE'];

export interface PatientRef { id: string; fullName: string; mergedInto?: string; status?: string }

export interface FinanceDeps {
  run: <R>(fn: (unit: Unit) => Promise<R>) => Promise<R>;
  require: (permission: string) => void;
  patient: (unit: Unit, id: string) => Promise<PatientRef | undefined>;
  newId: (prefix: string) => string;
  /** Jour civil de l'établissement (AAAA-MM-JJ) pour un instant donné. */
  day: (now: Date) => string;
}

export interface PriceRequest {
  patientId: string;
  lines: { itemId: string; quantity: number }[];
  primaryCoverageId?: string;
  secondaryCoverageId?: string;
  episodeId?: string;
  /** Tarif privé imposé (exception) : exige la permission d'autorisation et est tracé dans la justification. */
  forcePrivate?: boolean;
  /** Prestation d'origine de chaque ligne (anti double facturation), même ordre que `lines`. */
  sources?: ({ module: string; ref: string } | undefined)[];
  /**
   * Réduction commerciale en points de base appliquée au tarif PRIVÉ unitaire (arrondi demi vers le haut). Le droit et le motif sont
   * contrôlés par le service appelant ; une tarification négociée par un contrat reste prioritaire sur cette réduction.
   */
  unitDiscountBp?: number;
}

export interface PricePreview {
  date: string;
  items: CatalogItem[];
  results: PricingResult[];
  usage: UsageDelta;
  coverages: CoverageBundle[];
  subscription?: Subscription;
  feeStatus: FeeStatus;
  totals: Invoice['totals'];
  needsAuthorization: boolean;
}

export interface InvoiceView {
  invoice: Invoice;
  status: InvoiceStatus;
  balances: Balances;
  ledger: LedgerEntry[];
}

const MONEY_PARAMS = new Set(['due', 'paid']);

/** Convertit une erreur du domaine de facturation en refus métier traduisible (clé `business.billing.<code>`). */
function wrap<R>(fn: () => R): R {
  try {
    return fn();
  } catch (e) {
    if (e instanceof BillingError) {
      const params = Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, MONEY_PARAMS.has(k) && typeof v === 'number' ? (v / 100).toFixed(2) : v]));
      throw new BusinessRuleError(`billing.${e.code}`, params, ['duplicatePayment', 'alreadyInvoiced', 'alreadyReversed', 'hasPayments', 'hasSettlements'].includes(e.code) ? 'conflict' : 'validation');
    }
    throw e;
  }
}
const refuse = (code: string, params: Record<string, string | number> = {}, kind: 'validation' | 'conflict' = 'validation'): never => {
  throw new BusinessRuleError(`billing.${code}`, params, kind);
};

export function createFinanceService(deps: FinanceDeps) {
  const today = (u: Unit) => deps.day(u.now);

  async function feeHistory(u: Unit): Promise<ValidityConfig[]> {
    return (await u.get(feeConfigRef, 'config'))?.history ?? [];
  }

  async function bundlesFor(u: Unit, patientId: string): Promise<CoverageBundle[]> {
    const [covs, orgs, ctrs] = await Promise.all([u.list(coveragesRef), u.list(organizationsRef), u.list(contractsRef)]);
    const out: CoverageBundle[] = [];
    for (const coverage of covs) {
      if (coverage.patientId !== patientId && !coverage.beneficiaryIds.includes(patientId)) continue;
      const organization = orgs.find((o) => o.id === coverage.organizationId);
      const contract = ctrs.find((c) => c.id === coverage.contractId);
      if (organization && contract) out.push({ coverage, organization, contract });
    }
    return out;
  }

  async function usageFor(u: Unit, patientId: string, episodeId?: string): Promise<ReturnType<typeof emptyUsage>> {
    let usage = emptyUsage();
    if (!episodeId) return usage;
    for (const inv of await u.list(invoicesRef)) {
      if (inv.patientId !== patientId || inv.episodeId !== episodeId || inv.cancellation || !inv.usage) continue;
      usage = applyUsage(usage, inv.usage);
    }
    return usage;
  }

  async function priceInside(u: Unit, req: PriceRequest): Promise<PricePreview & { patient: PatientRef; currency: string }> {
    const patient = await deps.patient(u, req.patientId);
    if (!patient) refuse('patientNotFound');
    if (patient!.mergedInto) refuse('patientMerged');
    if (req.lines.length === 0) refuse('invoiceEmpty');
    if (req.forcePrivate) deps.require(P.insurance.authorize);
    const catalog = await u.list(catalogRef);
    const items = req.lines.map((l) => {
      const item = catalog.find((c) => c.id === l.itemId);
      if (!item) refuse('itemNotFound', { item: l.itemId });
      if (!item!.active) refuse('itemInactive', { item: item!.label });
      if (!(l.quantity > 0) || !Number.isInteger(l.quantity)) refuse('quantityInvalid');
      const bp = req.unitDiscountBp ?? 0;
      if (!Number.isInteger(bp) || bp < 0 || bp > 10000) refuse('discountInvalid');
      return (bp > 0 ? { ...item!, price: money(Math.floor((item!.price.minor * (10000 - bp) + 5000) / 10000), item!.price.currency) } : item) as CatalogItem;
    });
    const currency = items[0]!.price.currency;
    if (items.some((i) => i.price.currency !== currency)) refuse('currencyMismatch');
    const date = today(u);
    const coverages = await bundlesFor(u, req.patientId);
    for (const id of [req.primaryCoverageId, req.secondaryCoverageId]) {
      if (id && !coverages.some((c) => c.coverage.id === id)) refuse('coverageNotFound');
    }
    if (req.primaryCoverageId && req.primaryCoverageId === req.secondaryCoverageId) refuse('coverageSame');
    const subscription = (await u.list(subscriptionsRef)).find((s) => s.patientIds.includes(req.patientId) && s.status === 'active');
    const grants = (await u.list(authorizationsRef)).filter((g) => g.patientId === req.patientId).map((g) => `${g.coverageId}|${g.itemCode}`);
    const ctx: PricingContext = {
      date, patientId: req.patientId, currency, coverages, primaryCoverageId: req.primaryCoverageId, secondaryCoverageId: req.secondaryCoverageId,
      subscription, usage: await usageFor(u, req.patientId, req.episodeId), grantedAuthorizations: grants, forcePrivate: req.forcePrivate,
    };
    const { results, usage } = priceLines(req.lines.map((l, i) => ({ item: items[i]!, quantity: l.quantity })), ctx);
    const startUsage = ctx.usage;
    const delta: UsageDelta = { coverageSpent: {}, franchiseUsed: {}, quotaUsed: {}, freeConsultationsUsed: {} };
    for (const key of Object.keys(delta) as (keyof UsageDelta)[]) {
      for (const [k, v] of Object.entries(usage[key])) {
        const diff = v - (startUsage[key][k] ?? 0);
        if (diff !== 0) delta[key][k] = diff;
      }
    }
    const totals = results.reduce<Invoice['totals']>((t, r) => ({
      reference: t.reference + r.reference.minor, billable: t.billable + r.billable.minor, discount: t.discount + r.discount.minor,
      insurer: t.insurer + r.insurerShares.reduce((s, x) => s + x.amount.minor, 0), subscription: t.subscription + r.subscriptionShare.minor, patient: t.patient + r.patientShare.minor,
    }), { reference: 0, billable: 0, discount: 0, insurer: 0, subscription: 0, patient: 0 });
    const fees = await u.list(feePaymentsRef);
    return {
      date, items, results, usage: delta, coverages, subscription, feeStatus: feeStatus(fees, req.patientId, date), totals,
      needsAuthorization: results.some((r) => r.needsAuthorization), patient: patient!, currency,
    };
  }

  const isFeeItem = (item: CatalogItem) => item.category === 'consultation' && CONSULTATION_FEE_CODES.includes(item.code);

  /** Accorde ou retire la validité des frais selon le solde patient de la facture (appelé après tout changement du grand livre). */
  async function syncFee(u: Unit, invoice: Invoice, ledger: LedgerEntry[]): Promise<void> {
    if (!invoice.lines.some((l) => CONSULTATION_FEE_CODES.includes(l.itemCode) && l.category === 'consultation')) return;
    const fees = await u.list(feePaymentsRef);
    const mine = fees.find((f) => f.invoiceId === invoice.id && f.source === 'payment');
    const settled = !invoice.cancellation && balances(invoice, ledger).patientBalance <= 0;
    if (settled && !mine) {
      await u.insert(feePaymentsRef, buildFeePayment({ id: `fee-${invoice.id}`, patientId: invoice.patientId, paidDay: today(u), history: await feeHistory(u), invoiceId: invoice.id }), { action: 'fee:grant' });
    } else if (!settled && mine && !mine.voided) {
      await u.update(feePaymentsRef, mine.id, (f) => ({ ...f, voided: true }), { action: 'fee:void' });
    }
  }

  async function loadInvoice(u: Unit, id: string): Promise<{ invoice: Invoice; ledger: LedgerEntry[] }> {
    const invoice = await u.get(invoicesRef, id);
    if (!invoice) refuse('invoiceNotFound');
    const ledger = (await u.list(ledgerRef)).filter((e) => e.invoiceId === id);
    return { invoice: invoice!, ledger };
  }

  const view = (invoice: Invoice, all: LedgerEntry[]): InvoiceView => {
    const ledger = all.filter((e) => e.invoiceId === invoice.id).sort((a, b) => a.at.localeCompare(b.at));
    return { invoice, status: deriveStatus(invoice, ledger), balances: balances(invoice, ledger), ledger };
  };

  /** Création de facture SANS contrôle de permission : réservée aux services qui l'appellent après leur propre contrôle (ex. demande d'examen). */
  async function createInvoiceIn(u: Unit, req: PriceRequest): Promise<InvoiceView> {
    const priced = await priceInside(u, req);
    priced.items.forEach((item) => {
      if (isFeeItem(item) && priced.feeStatus.state === 'valid') refuse('feeStillValid', { until: priced.feeStatus.validUntil ?? '' }, 'conflict');
    });
    const existing = await u.list(invoicesRef);
    const lines = priced.results.map((r, i) => toInvoiceLine(r, priced.items[i]!, deps.newId('line'), req.sources?.[i]));
    const invoice = wrap(() => buildInvoice({
      id: deps.newId('inv'), number: nextInvoiceNumber(existing, Number(priced.date.slice(0, 4))), patientId: req.patientId, patientName: priced.patient.fullName,
      currency: priced.currency, lines, now: u.now.toISOString(), actor: u.ctx.actor.name, episodeId: req.episodeId, usage: priced.usage, existing,
    }));
    await u.insert(invoicesRef, invoice, { action: 'invoice:create' });
    await syncFee(u, invoice, []);
    return view(invoice, []);
  }

  async function cancelIn(u: Unit, input: { invoiceId: string; reason: string }): Promise<InvoiceView> {
    const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
    const next = wrap(() => cancelInvoice(invoice, ledger, input.reason, u.ctx.actor.name, u.now.toISOString()));
    await u.update(invoicesRef, invoice.id, () => next, { action: 'invoice:cancel', reason: input.reason });
    await syncFee(u, next, ledger);
    return view(next, ledger);
  }

  async function stateIn(u: Unit, invoiceId: string): Promise<InvoiceView | undefined> {
    const invoice = await u.get(invoicesRef, invoiceId);
    if (!invoice) return undefined;
    return view(invoice, (await u.list(ledgerRef)).filter((e) => e.invoiceId === invoiceId));
  }

  async function patientInvoicesIn(u: Unit, patientId: string): Promise<InvoiceView[]> {
    const [all, ledger] = await Promise.all([u.list(invoicesRef), u.list(ledgerRef)]);
    return all.filter((i) => i.patientId === patientId).map((i) => view(i, ledger));
  }

  return {
    /** Opérations à l'intérieur d'une unité de travail déjà ouverte (atomicité avec d'autres collections). Pas de contrôle de permission ici. */
    inUnit: { createInvoice: createInvoiceIn, cancelInvoice: cancelIn, invoiceState: stateIn, patientInvoices: patientInvoicesIn },

    /** Aperçu du prix : lecture seule, aucun enregistrement de facture. */
    preview: (req: PriceRequest): Promise<PricePreview> => deps.run(async (u) => {
      const { patient: _p, currency: _c, ...rest } = await priceInside(u, req);
      void _p; void _c;
      return rest;
    }),

    createInvoice: (req: PriceRequest): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.create);
      return createInvoiceIn(u, req);
    }),

    recordPayment: (input: { invoiceId: string; amount: number; method: PaymentMethod; reference?: string; submissionId: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.pay);
      const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
      // Le même identifiant de soumission ne produit qu'UN paiement (double clic, rechargement).
      const all = await u.list(ledgerRef);
      const entry = wrap(() => buildPayment({ id: `pay-${input.submissionId}`, invoice, ledger: all, amount: input.amount, method: input.method, reference: input.reference, cashier: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.insert(ledgerRef, entry, { action: 'payment:record' });
      const next = [...ledger, entry];
      await syncFee(u, invoice, next);
      return view(invoice, next);
    }),

    reversePayment: (input: { entryId: string; reason: string; submissionId: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.reverse);
      const original = await u.get(ledgerRef, input.entryId);
      if (!original) refuse('entryNotFound');
      const { invoice, ledger } = await loadInvoice(u, original!.invoiceId);
      const entry = wrap(() => buildReversal({ id: `rev-${input.submissionId}`, original: original!, ledger, reason: input.reason, cashier: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.insert(ledgerRef, entry, { action: 'payment:reverse', reason: input.reason });
      const next = [...ledger, entry];
      await syncFee(u, invoice, next);
      return view(invoice, next);
    }),

    refund: (input: { invoiceId: string; amount: number; method: PaymentMethod; reason: string; submissionId: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.refund);
      const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
      const entry = wrap(() => buildRefund({ id: `ref-${input.submissionId}`, invoice, ledger, amount: input.amount, method: input.method, reason: input.reason, cashier: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.insert(ledgerRef, entry, { action: 'payment:refund', reason: input.reason });
      const next = [...ledger, entry];
      await syncFee(u, invoice, next);
      return view(invoice, next);
    }),

    cancelInvoice: (input: { invoiceId: string; reason: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.cancel);
      return cancelIn(u, input);
    }),

    authorizeCredit: (input: { invoiceId: string; reason: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.credit);
      const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
      const next = wrap(() => authorizeCredit(invoice, ledger, input.reason, u.ctx.actor.name, u.now.toISOString()));
      await u.update(invoicesRef, invoice.id, () => next, { action: 'invoice:credit', reason: input.reason });
      return view(next, ledger);
    }),

    settleOrganization: (input: { invoiceId: string; organizationId: string; amount: number; method: PaymentMethod; reference?: string; submissionId: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.settle);
      const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
      const entry = wrap(() => buildSettlement({ id: `set-${input.submissionId}`, invoice, ledger, organizationId: input.organizationId, amount: input.amount, method: input.method, reference: input.reference, cashier: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.insert(ledgerRef, entry, { action: 'settlement:record' });
      return view(invoice, [...ledger, entry]);
    }),

    rejectOrganization: (input: { invoiceId: string; organizationId: string; amount: number; reason: string; transferToPatient: boolean; submissionId: string }): Promise<InvoiceView> => deps.run(async (u) => {
      deps.require(P.billing.settle);
      const { invoice, ledger } = await loadInvoice(u, input.invoiceId);
      const entry = wrap(() => buildRejection({ id: `rej-${input.submissionId}`, invoice, ledger, organizationId: input.organizationId, amount: input.amount, reason: input.reason, transferToPatient: input.transferToPatient, cashier: u.ctx.actor.name, now: u.now.toISOString() }));
      await u.insert(ledgerRef, entry, { action: 'rejection:record', reason: input.reason });
      return view(invoice, [...ledger, entry]);
    }),

    /** Exemption de frais de consultation : permission dédiée, motif obligatoire, tracée. */
    exemptFee: (input: { patientId: string; reason: string }): Promise<FeePayment> => deps.run(async (u) => {
      deps.require(P.billing.exempt);
      const patient = await deps.patient(u, input.patientId);
      if (!patient) refuse('patientNotFound');
      if (!input.reason.trim()) refuse('reasonRequired');
      const day = today(u);
      const fees = await u.list(feePaymentsRef);
      const current = feeStatus(fees, input.patientId, day);
      if (current.state === 'valid') refuse('feeStillValid', { until: current.validUntil ?? '' }, 'conflict');
      const exemption = buildExemption({ id: deps.newId('fee'), patientId: input.patientId, day, history: await feeHistory(u), reason: input.reason, by: u.ctx.actor.name });
      await u.insert(feePaymentsRef, exemption, { action: 'fee:exempt', reason: input.reason });
      return exemption;
    }),

    /** Nouvelle durée de validité : NON rétroactive (date d'effet ≥ aujourd'hui), historique conservé. */
    setFeeConfig: (input: { effectiveFrom: string; months: number; mode: ValidityMode; reason: string }): Promise<FeeConfigDoc> => deps.run(async (u) => {
      deps.require(P.billing.configure);
      if (!input.reason.trim()) refuse('reasonRequired');
      if (input.effectiveFrom < today(u)) refuse('configRetroactive');
      try { addCalendarMonths(input.effectiveFrom, input.months, input.mode); } catch { refuse('validityInvalid'); }
      const history = await feeHistory(u);
      if (history.some((h) => h.effectiveFrom === input.effectiveFrom)) refuse('configDateTaken', {}, 'conflict');
      const doc: FeeConfigDoc = { id: 'config', history: [...history, { effectiveFrom: input.effectiveFrom, months: input.months, mode: input.mode, changedBy: u.ctx.actor.name, reason: input.reason.trim() }] };
      await u.put(feeConfigRef, doc, { action: 'fee:config', reason: input.reason });
      return doc;
    }),

    /** Validation tracée d'une couverture : seule une couverture « validée » ouvre des droits. */
    validateCoverage: (input: { coverageId: string; status: ValidationStatus; note?: string }): Promise<PatientCoverage> => deps.run(async (u) => {
      deps.require(P.insurance.validate);
      if (input.status === 'rejected' && !(input.note ?? '').trim()) refuse('reasonRequired');
      return u.update(coveragesRef, input.coverageId, (c) => ({ ...c, status: input.status, history: [...c.history, { at: u.now.toISOString(), by: u.ctx.actor.name, status: input.status, note: input.note?.trim() || undefined }] }), { action: `coverage:${input.status}`, reason: input.note });
    }),

    grantAuthorization: (input: { coverageId: string; itemCode: string; patientId: string; reference?: string; note?: string }): Promise<AuthorizationGrant> => deps.run(async (u) => {
      deps.require(P.insurance.authorize);
      const cov = await u.get(coveragesRef, input.coverageId);
      if (!cov) refuse('coverageNotFound');
      const grant: AuthorizationGrant = { id: deps.newId('auth'), ...input, grantedBy: u.ctx.actor.name, at: u.now.toISOString() };
      await u.insert(authorizationsRef, grant, { action: 'authorization:grant' });
      return grant;
    }),

    /** Création d'une couverture : toujours « en attente », sans validation (jamais confirmée d'office). */
    createCoverage: (input: Omit<PatientCoverage, 'id' | 'status' | 'history'>): Promise<PatientCoverage> => deps.run(async (u) => {
      deps.require(P.insurance.manage);
      if (input.validTo < input.validFrom) refuse('periodInvalid');
      if (!(await deps.patient(u, input.patientId))) refuse('patientNotFound');
      const row: PatientCoverage = { ...input, id: deps.newId('cov'), status: 'pending', history: [] };
      await u.insert(coveragesRef, row, { action: 'coverage:create' });
      return row;
    }),

    saveOrganization: (row: Organization): Promise<Organization> => deps.run(async (u) => { deps.require(P.insurance.manage); return u.put(organizationsRef, row, { action: 'organization:save' }); }),
    saveContract: (row: Contract): Promise<Contract> => deps.run(async (u) => {
      deps.require(P.insurance.manage);
      if (row.validTo < row.validFrom) refuse('periodInvalid');
      if (row.rules.some((r) => r.coverageBp < 0 || r.coverageBp > 10000)) refuse('rateInvalid');
      return u.put(contractsRef, row, { action: 'contract:save' });
    }),
    saveSubscription: (row: Subscription): Promise<Subscription> => deps.run(async (u) => { deps.require(P.insurance.manage); return u.put(subscriptionsRef, row, { action: 'subscription:save' }); }),
    saveCatalogItem: (row: CatalogItem): Promise<CatalogItem> => deps.run(async (u) => {
      deps.require(P.billing.configure);
      if (!(row.price.minor >= 0)) refuse('amountInvalid');
      return u.put(catalogRef, row, { action: 'catalog:save' });
    }),

    /** Tout ce dont les écrans ont besoin, en une seule lecture cohérente. */
    snapshot: (): Promise<{
      day: string; invoices: InvoiceView[]; ledger: LedgerEntry[]; catalog: CatalogItem[]; organizations: Organization[]; contracts: Contract[];
      coverages: PatientCoverage[]; subscriptions: Subscription[]; feePayments: FeePayment[]; feeHistory: ValidityConfig[]; authorizations: AuthorizationGrant[];
    }> => deps.run(async (u) => {
      const [invoices, ledger] = await Promise.all([u.list(invoicesRef), u.list(ledgerRef)]);
      return {
        day: today(u),
        invoices: invoices.map((i) => view(i, ledger)).sort((a, b) => b.invoice.createdAt.localeCompare(a.invoice.createdAt)),
        ledger: [...ledger].sort((a, b) => b.at.localeCompare(a.at)),
        catalog: await u.list(catalogRef), organizations: await u.list(organizationsRef), contracts: await u.list(contractsRef),
        coverages: await u.list(coveragesRef), subscriptions: await u.list(subscriptionsRef), feePayments: await u.list(feePaymentsRef),
        feeHistory: await feeHistory(u), authorizations: await u.list(authorizationsRef),
      };
    }),

    /** Droits de consultation d'un patient à la date du jour (accueil, caisse, médecin). */
    feeStatusFor: (patientId: string): Promise<FeeStatus> => deps.run(async (u) => feeStatus(await u.list(feePaymentsRef), patientId, today(u))),
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
