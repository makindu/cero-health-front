import type { Unit } from '@/core/local/unit-of-work';
import { PERMISSIONS as P } from '@/core/permissions/permissions';
import { BusinessRuleError } from '../_shared/business-error';
import { catalogRef, invoicesRef } from '../finance/collections';
import type { FinanceDeps, FinanceService, InvoiceView } from '../finance/finance-service';
import { lotsRef, movementsRef } from '../pharmacy/collections';
import { PharmacyError, allocateFefo, available, type StockMovement } from '../pharmacy/pharmacy-rules';
import { admissionsRef } from './collections';
import { isActive, type Admission } from './hospital-rules';
import { consumptionBillingsRef, consumptionsRef, visitsRef } from './visit-collections';
import * as V from './visit-rules';
import { VisitError, type ConsumptionBilling, type ConsumptionEntry, type LedgerRow, type Visit, type VisitType } from './visit-rules';

const CONFLICTS = ['alreadyBilled', 'alreadyReversed', 'notActive', 'insufficientStock'];

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof VisitError) throw new BusinessRuleError(`visit.${e.code}`, e.params, CONFLICTS.includes(e.code) ? 'conflict' : 'validation');
    throw e;
  }
}
const refuse = (code: string, params: Record<string, string | number> = {}, kind: 'validation' | 'conflict' = 'validation'): never => {
  throw new BusinessRuleError(`visit.${code}`, params, kind);
};

export interface LedgerView {
  admission: Admission;
  visits: Visit[];
  rows: LedgerRow[];
  /** Quantités nettes encore à facturer, regroupées par prestation. */
  pending: V.PendingLine[];
  /** Factures actives issues des consommations. */
  invoiceIds: string[];
  maxDiscountBp: number;
}

export type AutoBillResult = { status: 'nothing' } | { status: 'billed'; invoiceId: string } | { status: 'failed'; code: string };

export function createVisitService(deps: FinanceDeps, finance: FinanceService, options: { maxDiscountBp?: number } = {}) {
  const maxDiscountBp = options.maxDiscountBp ?? V.DEFAULT_MAX_DISCOUNT_BP;
  const can = (permission: string): boolean => {
    try { deps.require(permission); return true; } catch { return false; }
  };

  async function load(u: Unit, admissionId: string): Promise<{ admission: Admission; rows: LedgerRow[]; visits: Visit[]; billings: ConsumptionBilling[] }> {
    const admission = await u.get(admissionsRef, admissionId);
    if (!admission) return refuse('admissionNotFound');
    const [entries, billings, invoices, visits] = await Promise.all([u.list(consumptionsRef), u.list(consumptionBillingsRef), u.list(invoicesRef), u.list(visitsRef)]);
    const mine = entries.filter((e) => e.admissionId === admissionId);
    const myBillings = billings.filter((b) => b.admissionId === admissionId);
    const active = new Set(invoices.filter((i) => !i.cancellation).map((i) => i.id));
    return { admission, rows: V.buildLedger(mine, myBillings, active), visits: visits.filter((v) => v.admissionId === admissionId).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)), billings: myBillings };
  }

  const view = (l: Awaited<ReturnType<typeof load>>): LedgerView => ({
    admission: l.admission, visits: l.visits, rows: l.rows, pending: V.pendingLines(l.rows),
    invoiceIds: [...new Set(l.rows.flatMap((r) => (r.billing ? [r.billing.invoiceId] : [])))], maxDiscountBp,
  });

  /**
   * Facture TOUTES les consommations nettes en attente, en une facture, et sort du stock les produits qui n'ont pas
   * déjà été sortis (jamais deux fois pour la même consommation). Les vérifications (stock, prix, couverture) se font
   * AVANT toute écriture : un refus ne laisse rien derrière lui.
   */
  async function billIn(u: Unit, admissionId: string, input: { discountBp: number; discountReason?: string; discountBy?: string }): Promise<InvoiceView> {
    const l = await load(u, admissionId);
    if (!isActive(l.admission) && l.admission.status !== 'discharged') return refuse('notActive', {}, 'conflict');
    const lines = V.pendingLines(l.rows);
    if (lines.length === 0) return refuse('nothingToBill');

    // Stock : seules les consommations dont le stock n'a jamais été sorti en demandent (lot FEFO, périmés exclus).
    const everWithdrawn = new Set((await u.list(consumptionBillingsRef)).filter((b) => b.stockWithdrawn).map((b) => b.consumptionId));
    const day = deps.day(u.now);
    const working = (await u.list(lotsRef)).map((x) => ({ ...x }));
    const moves: StockMovement[] = [];
    const flags = new Map<string, boolean>();
    for (const line of lines) {
      const toWithdraw = V.isProduct(line.category)
        ? l.rows.filter((r) => line.consumptionIds.includes(r.entry.id) && !everWithdrawn.has(r.entry.id)).reduce((s, r) => s + r.net, 0)
        : 0;
      for (const id of line.consumptionIds) flags.set(id, everWithdrawn.has(id) || V.isProduct(line.category));
      if (toWithdraw <= 0) continue;
      let alloc: ReturnType<typeof allocateFefo>;
      try {
        alloc = allocateFefo(working, line.itemId, toWithdraw, day);
      } catch (e) {
        if (e instanceof PharmacyError && e.code === 'insufficientStock') return refuse('insufficientStock', { item: line.itemLabel, available: available(working, line.itemId, day) }, 'conflict');
        throw e;
      }
      for (const a of alloc) {
        const lot = working.find((x) => x.id === a.lotId)!;
        lot.quantity = Math.round((lot.quantity - a.quantity + Number.EPSILON) * 100) / 100;
        moves.push({ id: deps.newId('mov'), at: u.now.toISOString(), by: u.ctx.actor.name, itemId: line.itemId, lotId: a.lotId, delta: -a.quantity, kind: 'dispense', ref: l.admission.number });
      }
    }

    const invoice = await finance.inUnit.createInvoice(u, {
      patientId: l.admission.patientId, episodeId: l.admission.id, unitDiscountBp: input.discountBp || undefined,
      lines: lines.map((x) => ({ itemId: x.itemId, quantity: x.quantity })),
      sources: lines.map((x) => ({ module: 'consumption', ref: `${l.admission.id}:${x.itemId}:${x.consumptionIds.join('+')}` })),
    });

    const before = await u.list(lotsRef);
    for (const lot of working) {
      const prev = before.find((x) => x.id === lot.id)!;
      if (prev.quantity !== lot.quantity) await u.update(lotsRef, lot.id, () => lot, { action: 'stock:consumption' });
    }
    for (const m of moves) await u.insert(movementsRef, m, { action: 'stock:movement' });
    for (const line of lines) {
      for (const id of line.consumptionIds) {
        const row = l.rows.find((r) => r.entry.id === id)!;
        await u.insert(consumptionBillingsRef, {
          id: deps.newId('cbl'), admissionId, consumptionId: id, invoiceId: invoice.invoice.id, quantity: row.net, discountBp: input.discountBp,
          discountReason: input.discountBp ? input.discountReason?.trim() : undefined, discountBy: input.discountBp ? input.discountBy : undefined,
          stockWithdrawn: Boolean(flags.get(id)), at: u.now.toISOString(),
        }, { action: 'consumption:bill', reason: input.discountBp ? input.discountReason : undefined });
      }
    }
    return invoice;
  }

  /** Facturation automatique : ne lève JAMAIS d'erreur et n'écrit rien en cas de refus (la sortie du patient n'est pas bloquée). */
  async function autoBillIn(u: Unit, admission: Admission): Promise<AutoBillResult> {
    const l = await load(u, admission.id);
    if (V.pendingLines(l.rows).length === 0) return { status: 'nothing' };
    try {
      const invoice = await billIn(u, admission.id, { discountBp: 0 });
      return { status: 'billed', invoiceId: invoice.invoice.id };
    } catch (e) {
      return { status: 'failed', code: e instanceof BusinessRuleError ? e.message : 'unexpected' };
    }
  }

  return {
    /** Appelés par les services d'hospitalisation, dans leur propre unité (aucun contrôle de permission ici). */
    inUnit: {
      autoBill: autoBillIn,
      /** Une admission ayant des consommations nettes ne s'annule pas : on les contre-passe d'abord. */
      assertCanCancel: async (u: Unit, admission: Admission): Promise<void> => {
        const l = await load(u, admission.id);
        if (V.hasNetConsumption(l.rows)) refuse('hasConsumptions', {}, 'conflict');
      },
      pendingCount: async (u: Unit, admissionId: string): Promise<number> => V.pendingLines((await load(u, admissionId)).rows).length,
    },

    /** Facturation automatique d'une admission à la demande de sortie / à la sortie : unité de travail à part, jamais bloquante. */
    autoBill: (admissionId: string): Promise<AutoBillResult> => deps.run(async (u) => {
      const adm = await u.get(admissionsRef, admissionId);
      if (!adm || (!isActive(adm) && adm.status !== 'discharged')) return { status: 'nothing' } as AutoBillResult;
      return autoBillIn(u, adm);
    }).catch((): AutoBillResult => ({ status: 'failed', code: 'unexpected' })),

    ledger: (admissionId: string): Promise<LedgerView> => deps.run(async (u) => {
      deps.require(P.hospitalization.visitView);
      return view(await load(u, admissionId));
    }),

    /** Saisie d'une visite : aucun prix, aucun stock, aucune facture. Réservée aux soignants (permission dédiée). */
    recordVisit: (input: { admissionId: string; type: VisitType; lines: V.LineInput[]; clinical?: V.VisitClinicalInput }): Promise<LedgerView> => deps.run(async (u) => {
      deps.require(P.hospitalization.visitRecord);
      const l = await load(u, input.admissionId);
      if (!isActive(l.admission)) return refuse('notActive', {}, 'conflict');
      if (!V.VISIT_TYPES.includes(input.type)) return refuse('typeInvalid');
      const catalog = await u.list(catalogRef);
      const items = wrap(() => V.checkLines(input.lines, catalog));
      const clinical = wrap(() => V.checkClinical(input.clinical, can(P.hospitalization.visitClinical)));
      const at = u.now.toISOString();
      const visit: Visit = { id: deps.newId('vis'), admissionId: input.admissionId, type: input.type, visitedAt: at, by: u.ctx.actor.name, ...(clinical ? { clinical } : {}) };
      await u.insert(visitsRef, visit, { action: 'visit:record' });
      for (let i = 0; i < input.lines.length; i++) {
        const item = items[i]!;
        const entry: ConsumptionEntry = {
          id: deps.newId('con'), admissionId: input.admissionId, visitId: visit.id, kind: 'consumption', itemId: item.id, itemLabel: item.label,
          category: item.category, quantity: input.lines[i]!.quantity, line: i, at, by: u.ctx.actor.name,
        };
        await u.insert(consumptionsRef, entry, { action: 'consumption:record' });
      }
      return view(await load(u, input.admissionId));
    }),

    /** Contre-écriture motivée : la ligne d'origine n'est jamais modifiée. Impossible sur du facturé (annuler d'abord la facture). */
    reverse: (input: { admissionId: string; consumptionId: string; reason: string; quantity?: number }): Promise<LedgerView> => deps.run(async (u) => {
      deps.require(P.hospitalization.consumptionReverse);
      const l = await load(u, input.admissionId);
      if (!isActive(l.admission)) return refuse('notActive', {}, 'conflict');
      const row = l.rows.find((r) => r.entry.id === input.consumptionId);
      const qty = wrap(() => V.checkReverse(row, input));
      const origin = row!.entry;
      await u.insert(consumptionsRef, {
        id: deps.newId('con'), admissionId: input.admissionId, visitId: origin.visitId, kind: 'reversal', reversesId: origin.id, itemId: origin.itemId,
        itemLabel: origin.itemLabel, category: origin.category, quantity: qty, reason: input.reason.trim(), at: u.now.toISOString(), by: u.ctx.actor.name,
      }, { action: 'consumption:reverse', reason: input.reason });
      return view(await load(u, input.admissionId));
    }),

    /** Facturation manuelle (rattrapage d'une facturation automatique refusée, ou avec réduction). */
    bill: (input: { admissionId: string; discountBp?: number; discountReason?: string }): Promise<{ ledger: LedgerView; invoice: InvoiceView }> => deps.run(async (u) => {
      deps.require(P.hospitalization.discharge);
      const bp = wrap(() => V.checkDiscount({ bp: input.discountBp, reason: input.discountReason }, can(P.billing.discount), maxDiscountBp));
      const invoice = await billIn(u, input.admissionId, { discountBp: bp, discountReason: input.discountReason, discountBy: u.ctx.actor.name });
      return { ledger: view(await load(u, input.admissionId)), invoice };
    }),
  };
}
export type VisitService = ReturnType<typeof createVisitService>;
